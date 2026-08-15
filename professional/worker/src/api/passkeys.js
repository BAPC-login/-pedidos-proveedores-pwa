import {HttpError,normalizeEmail,nowIso,randomToken,readJson,sha256,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const CHALLENGE_TTL_MS=5*60*1000;
let schemaPromise=null;
const decoder=new TextDecoder();
const encoder=new TextEncoder();

function bytesToBase64Url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function base64UrlToBytes(value){const input=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=input+'='.repeat((4-input.length%4)%4);let binary;try{binary=atob(padded)}catch{throw new HttpError(400,'Credencial biométrica inválida','invalid_passkey_payload')}const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function concatBytes(...parts){const length=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out}
function equalBytes(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0}
function safeJson(value,fallback){try{return JSON.parse(value||'')}catch{return fallback}}
function originFor(request){return String(request.headers.get('Origin')||new URL(request.url).origin).replace(/\/$/,'')}
function rpIdFor(request,env){return String(env.PASSKEY_RP_ID||new URL(request.url).hostname).trim().toLowerCase()}
function displayNameFor(actor){return String(actor.displayName||actor.email||'Usuario Nuvasto').slice(0,120)}
function futureIso(ms){return new Date(Date.now()+ms).toISOString()}

async function ensurePasskeySchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS passkey_credentials(
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key_jwk TEXT NOT NULL,
        sign_count INTEGER NOT NULL DEFAULT 0,
        transports_json TEXT NOT NULL DEFAULT '[]',
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_passkeys_user_active ON passkey_credentials(org_id,user_id,revoked_at,created_at DESC)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS webauthn_challenges(
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge_hash TEXT NOT NULL,
        ceremony TEXT NOT NULL CHECK(ceremony IN ('register','login')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_webauthn_challenge_user ON webauthn_challenges(user_id,ceremony,expires_at)')
    ]);
    return true;
  })().catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}

function readCborLength(bytes,state,additional){
  if(additional<24)return additional;
  const need=additional===24?1:additional===25?2:additional===26?4:additional===27?8:0;
  if(!need||state.i+need>bytes.length)throw new HttpError(400,'Respuesta biométrica CBOR inválida','invalid_passkey_payload');
  let value=0n;for(let j=0;j<need;j++)value=(value<<8n)|BigInt(bytes[state.i++]);
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new HttpError(400,'Respuesta biométrica demasiado grande','invalid_passkey_payload');
  return Number(value);
}
function decodeCborValue(bytes,state={i:0}){
  const initial=bytes[state.i++],major=initial>>5,additional=initial&31;
  if(additional===31)throw new HttpError(400,'CBOR indefinido no soportado','invalid_passkey_payload');
  if(major===0)return readCborLength(bytes,state,additional);
  if(major===1)return -1-readCborLength(bytes,state,additional);
  if(major===2){const length=readCborLength(bytes,state,additional),end=state.i+length;if(end>bytes.length)throw new HttpError(400,'CBOR truncado','invalid_passkey_payload');const value=bytes.slice(state.i,end);state.i=end;return value}
  if(major===3){const length=readCborLength(bytes,state,additional),end=state.i+length;if(end>bytes.length)throw new HttpError(400,'CBOR truncado','invalid_passkey_payload');const value=decoder.decode(bytes.slice(state.i,end));state.i=end;return value}
  if(major===4){const length=readCborLength(bytes,state,additional),items=[];for(let i=0;i<length;i++)items.push(decodeCborValue(bytes,state));return items}
  if(major===5){const length=readCborLength(bytes,state,additional),map=new Map();for(let i=0;i<length;i++)map.set(decodeCborValue(bytes,state),decodeCborValue(bytes,state));return map}
  if(major===6){readCborLength(bytes,state,additional);return decodeCborValue(bytes,state)}
  if(major===7){if(additional===20)return false;if(additional===21)return true;if(additional===22||additional===23)return null;throw new HttpError(400,'Tipo CBOR no soportado','invalid_passkey_payload')}
  throw new HttpError(400,'Respuesta biométrica CBOR inválida','invalid_passkey_payload');
}

async function expectedRpHash(rpId){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(rpId)))}
function parseClientData(encoded,expectedType){
  const raw=base64UrlToBytes(encoded),text=decoder.decode(raw);let json;try{json=JSON.parse(text)}catch{throw new HttpError(400,'clientDataJSON inválido','invalid_passkey_payload')}
  if(json.type!==expectedType)throw new HttpError(400,'Ceremonia WebAuthn inválida','invalid_passkey_type');
  if(!json.challenge||!json.origin)throw new HttpError(400,'Respuesta WebAuthn incompleta','invalid_passkey_payload');
  return{raw,json};
}
async function validateChallenge(env,{challengeId,userId,orgId,ceremony,challenge}){
  const row=await env.DB.prepare('SELECT id,challenge_hash,expires_at FROM webauthn_challenges WHERE id=? AND user_id=? AND org_id=? AND ceremony=?').bind(challengeId,userId,orgId,ceremony).first();
  if(!row)throw new HttpError(400,'El desafío biométrico ya no es válido','passkey_challenge_invalid');
  await env.DB.prepare('DELETE FROM webauthn_challenges WHERE id=?').bind(challengeId).run();
  if(Date.parse(row.expires_at)<=Date.now())throw new HttpError(400,'El desafío biométrico expiró','passkey_challenge_expired');
  const actualHash=await sha256(challenge);if(actualHash!==row.challenge_hash)throw new HttpError(400,'El desafío biométrico no coincide','passkey_challenge_invalid');
}
async function createChallenge(env,{actor,ceremony}){
  await ensurePasskeySchema(env);const id=uuid(),challenge=randomToken(32),createdAt=nowIso(),expiresAt=futureIso(CHALLENGE_TTL_MS);
  await env.DB.prepare('INSERT INTO webauthn_challenges(id,org_id,user_id,challenge_hash,ceremony,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,actor.orgId,actor.userId,await sha256(challenge),ceremony,createdAt,expiresAt).run();
  return{id,challenge,expiresAt};
}
async function activeIdentityByEmail(env,email){
  const row=await env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name,m.org_id,m.role,m.location_scope,o.name AS org_name,o.slug AS org_slug,o.plan
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.org_id
    WHERE u.email=? AND u.active=1 AND m.active=1 AND o.status='active'
    ORDER BY o.created_at ASC,CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1`).bind(email).first();
  if(!row)throw new HttpError(404,'Esta cuenta no tiene acceso activo a Nuvasto','user_not_found');
  return{userId:row.user_id,orgId:row.org_id,email:row.email,displayName:row.display_name,role:row.role,locationScope:safeJson(row.location_scope,[]),organization:{id:row.org_id,name:row.org_name,slug:row.org_slug,plan:row.plan}};
}
async function createPasskeySession(env,request,identity){
  const token=randomToken(36),tokenHash=await sha256(token),ip=request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'',ipHash=ip?await sha256(`${env.IP_HASH_SALT||'pedidos-pro'}:${ip}`):'',createdAt=nowIso(),sessionId=uuid();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,org_id,token_hash,user_agent,ip_hash,created_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)').bind(sessionId,identity.userId,identity.orgId,tokenHash,String(request.headers.get('User-Agent')||'').slice(0,300),ipHash,createdAt,createdAt).run();
  return{token,sessionId};
}
function parseRegistrationAuthData(attestationBytes){
  const object=decodeCborValue(attestationBytes),fmt=object instanceof Map?object.get('fmt'):null,authData=object instanceof Map?object.get('authData'):null;
  if(fmt!=='none'||!(authData instanceof Uint8Array))throw new HttpError(400,'La credencial no usa el formato de registro esperado','passkey_attestation_invalid');
  if(authData.length<55)throw new HttpError(400,'Datos de autenticador incompletos','invalid_passkey_payload');
  const flags=authData[32];if(!(flags&0x01)||!(flags&0x04)||!(flags&0x40))throw new HttpError(400,'La verificación biométrica del dispositivo es obligatoria','passkey_user_verification_required');
  const credentialLength=(authData[53]<<8)|authData[54],credentialStart=55,credentialEnd=credentialStart+credentialLength;
  if(credentialEnd>=authData.length)throw new HttpError(400,'Credencial biométrica truncada','invalid_passkey_payload');
  const credentialId=authData.slice(credentialStart,credentialEnd),state={i:credentialEnd},cose=decodeCborValue(authData,state);
  if(!(cose instanceof Map)||cose.get(1)!==2||cose.get(3)!==-7||cose.get(-1)!==1)throw new HttpError(400,'El dispositivo no entregó una clave biométrica P-256 compatible','passkey_algorithm_unsupported');
  const x=cose.get(-2),y=cose.get(-3);if(!(x instanceof Uint8Array)||!(y instanceof Uint8Array)||x.length!==32||y.length!==32)throw new HttpError(400,'Clave biométrica inválida','invalid_passkey_public_key');
  return{rpHash:authData.slice(0,32),credentialId,signCount:readUint32(authData,33),jwk:{kty:'EC',crv:'P-256',x:bytesToBase64Url(x),y:bytesToBase64Url(y),ext:true,key_ops:['verify']}};
}
function readUint32(bytes,offset){return ((bytes[offset]*0x1000000)+(bytes[offset+1]<<16)+(bytes[offset+2]<<8)+bytes[offset+3])>>>0}
function derLength(bytes,state){let length=bytes[state.i++];if(length<0x80)return length;const count=length&0x7f;if(!count||count>2||state.i+count>bytes.length)throw new HttpError(400,'Firma biométrica DER inválida','invalid_passkey_signature');length=0;for(let i=0;i<count;i++)length=(length<<8)|bytes[state.i++];return length}
function derInteger(bytes,state){if(bytes[state.i++]!==0x02)throw new HttpError(400,'Firma biométrica DER inválida','invalid_passkey_signature');const length=derLength(bytes,state),end=state.i+length;if(end>bytes.length)throw new HttpError(400,'Firma biométrica DER truncada','invalid_passkey_signature');let value=bytes.slice(state.i,end);state.i=end;while(value.length>32&&value[0]===0)value=value.slice(1);if(value.length>32)throw new HttpError(400,'Firma biométrica fuera de rango','invalid_passkey_signature');const out=new Uint8Array(32);out.set(value,32-value.length);return out}
function derToRawEcdsa(bytes){const state={i:0};if(bytes[state.i++]!==0x30)throw new HttpError(400,'Firma biométrica inválida','invalid_passkey_signature');const length=derLength(bytes,state),end=state.i+length;if(end!==bytes.length)throw new HttpError(400,'Firma biométrica inválida','invalid_passkey_signature');return concatBytes(derInteger(bytes,state),derInteger(bytes,state))}
async function verifyAuthenticationSignature(jwk,authenticatorData,clientDataRaw,signature){
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']),clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',clientDataRaw)),signed=concatBytes(authenticatorData,clientHash),rawSignature=derToRawEcdsa(signature);
  return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,rawSignature,signed);
}

export async function listPasskeys(env,actor){await ensurePasskeySchema(env);const result=await env.DB.prepare('SELECT id,label,transports_json,created_at,last_used_at FROM passkey_credentials WHERE org_id=? AND user_id=? AND revoked_at IS NULL ORDER BY created_at DESC').bind(actor.orgId,actor.userId).all();return(result.results||[]).map(row=>({id:row.id,label:row.label||'Dispositivo biométrico',transports:safeJson(row.transports_json,[]),createdAt:row.created_at,lastUsedAt:row.last_used_at||null}))}
export async function beginPasskeyRegistration(request,env,actor){
  await ensurePasskeySchema(env);const existing=await env.DB.prepare('SELECT credential_id,transports_json FROM passkey_credentials WHERE org_id=? AND user_id=? AND revoked_at IS NULL').bind(actor.orgId,actor.userId).all(),challenge=await createChallenge(env,{actor,ceremony:'register'}),rpId=rpIdFor(request,env);
  return{challengeId:challenge.id,expiresAt:challenge.expiresAt,publicKey:{challenge:challenge.challenge,rp:{name:'Nuvasto',id:rpId},user:{id:bytesToBase64Url(encoder.encode(actor.userId)),name:actor.email,displayName:displayNameFor(actor)},pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:60000,attestation:'none',excludeCredentials:(existing.results||[]).map(row=>({type:'public-key',id:row.credential_id,transports:safeJson(row.transports_json,[])})),authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'}}};
}
export async function finishPasskeyRegistration(request,env,actor){
  await ensurePasskeySchema(env);const body=await readJson(request),credential=body.credential||{},response=credential.response||{},client=parseClientData(response.clientDataJSON,'webauthn.create');
  if(client.json.origin!==originFor(request))throw new HttpError(400,'El origen de la credencial biométrica no coincide','passkey_origin_mismatch');
  await validateChallenge(env,{challengeId:String(body.challengeId||''),userId:actor.userId,orgId:actor.orgId,ceremony:'register',challenge:client.json.challenge});
  const parsed=parseRegistrationAuthData(base64UrlToBytes(response.attestationObject)),expectedHash=await expectedRpHash(rpIdFor(request,env));if(!equalBytes(parsed.rpHash,expectedHash))throw new HttpError(400,'La credencial pertenece a otro dominio','passkey_rp_mismatch');
  const rawId=base64UrlToBytes(credential.rawId||credential.id),credentialId=bytesToBase64Url(rawId);if(!equalBytes(parsed.credentialId,rawId))throw new HttpError(400,'El identificador de credencial no coincide','passkey_credential_mismatch');
  const id=uuid(),createdAt=nowIso(),label=String(body.label||'Dispositivo biométrico').trim().slice(0,120)||'Dispositivo biométrico',transports=Array.isArray(response.transports)?response.transports.map(String).slice(0,8):[];
  try{await env.DB.prepare('INSERT INTO passkey_credentials(id,org_id,user_id,credential_id,public_key_jwk,sign_count,transports_json,label,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,actor.orgId,actor.userId,credentialId,JSON.stringify(parsed.jwk),Number(parsed.signCount||0),JSON.stringify(transports),label,createdAt).run()}catch(error){if(String(error?.message||'').toLowerCase().includes('unique'))throw new HttpError(409,'Esta credencial biométrica ya está registrada','passkey_already_registered');throw error}
  await writeAudit(env,actor,request,'auth.passkey_registered','passkey',id,{label,transports});return{id,label,createdAt};
}
export async function beginPasskeyLogin(request,env){
  await ensurePasskeySchema(env);const body=await readJson(request),email=normalizeEmail(body.email);let identity;try{identity=await activeIdentityByEmail(env,email)}catch{throw new HttpError(404,'No hay acceso biométrico disponible para esta cuenta','passkey_not_configured')}const credentials=await env.DB.prepare('SELECT credential_id,transports_json FROM passkey_credentials WHERE org_id=? AND user_id=? AND revoked_at IS NULL ORDER BY created_at DESC').bind(identity.orgId,identity.userId).all();
  if(!(credentials.results||[]).length)throw new HttpError(404,'No hay acceso biométrico disponible para esta cuenta','passkey_not_configured');
  const challenge=await createChallenge(env,{actor:identity,ceremony:'login'});return{challengeId:challenge.id,expiresAt:challenge.expiresAt,publicKey:{challenge:challenge.challenge,rpId:rpIdFor(request,env),timeout:60000,userVerification:'required',allowCredentials:(credentials.results||[]).map(row=>({type:'public-key',id:row.credential_id,transports:safeJson(row.transports_json,[])}))}};
}
export async function finishPasskeyLogin(request,env){
  await ensurePasskeySchema(env);const body=await readJson(request),email=normalizeEmail(body.email);let identity;try{identity=await activeIdentityByEmail(env,email)}catch{throw new HttpError(401,'No fue posible validar el acceso biométrico','passkey_login_failed')}const credential=body.credential||{},response=credential.response||{},client=parseClientData(response.clientDataJSON,'webauthn.get');
  if(client.json.origin!==originFor(request))throw new HttpError(400,'El origen del acceso biométrico no coincide','passkey_origin_mismatch');
  await validateChallenge(env,{challengeId:String(body.challengeId||''),userId:identity.userId,orgId:identity.orgId,ceremony:'login',challenge:client.json.challenge});
  const credentialId=bytesToBase64Url(base64UrlToBytes(credential.rawId||credential.id)),stored=await env.DB.prepare('SELECT id,public_key_jwk,sign_count FROM passkey_credentials WHERE credential_id=? AND org_id=? AND user_id=? AND revoked_at IS NULL').bind(credentialId,identity.orgId,identity.userId).first();
  if(!stored)throw new HttpError(401,'La credencial biométrica no está registrada','passkey_not_registered');
  const authenticatorData=base64UrlToBytes(response.authenticatorData);if(authenticatorData.length<37)throw new HttpError(400,'Datos de autenticador incompletos','invalid_passkey_payload');
  const expectedHash=await expectedRpHash(rpIdFor(request,env));if(!equalBytes(authenticatorData.slice(0,32),expectedHash))throw new HttpError(400,'La credencial pertenece a otro dominio','passkey_rp_mismatch');const flags=authenticatorData[32];if(!(flags&0x01)||!(flags&0x04))throw new HttpError(401,'El dispositivo no confirmó la verificación biométrica','passkey_user_verification_required');
  const valid=await verifyAuthenticationSignature(safeJson(stored.public_key_jwk,{}),authenticatorData,client.raw,base64UrlToBytes(response.signature));if(!valid)throw new HttpError(401,'No fue posible validar la credencial biométrica','passkey_signature_invalid');
  const newCount=readUint32(authenticatorData,33),oldCount=Number(stored.sign_count||0);if(oldCount>0&&newCount>0&&newCount<=oldCount)throw new HttpError(401,'La credencial biométrica presentó un contador inválido','passkey_counter_invalid');
  await env.DB.prepare('UPDATE passkey_credentials SET sign_count=?,last_used_at=? WHERE id=?').bind(Math.max(oldCount,newCount),nowIso(),stored.id).run();const session=await createPasskeySession(env,request,identity);await writeAudit(env,{...identity,sessionId:session.sessionId},request,'auth.login_passkey','session',session.sessionId,{passkeyId:stored.id});return session;
}
export async function revokePasskey(request,env,actor,id){await ensurePasskeySchema(env);const row=await env.DB.prepare('SELECT id FROM passkey_credentials WHERE id=? AND org_id=? AND user_id=? AND revoked_at IS NULL').bind(id,actor.orgId,actor.userId).first();if(!row)throw new HttpError(404,'Credencial biométrica no encontrada','passkey_not_found');await env.DB.prepare('UPDATE passkey_credentials SET revoked_at=? WHERE id=?').bind(nowIso(),id).run();await writeAudit(env,actor,request,'auth.passkey_revoked','passkey',id);return{revoked:true,id}}
