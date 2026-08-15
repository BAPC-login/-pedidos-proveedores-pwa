import {$,state,api,toast,setBusy,esc} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';

const REMEMBER_KEY='nuvasto:remember-device';
const EPHEMERAL_TOKEN_KEY='nuvasto:ephemeral-token';
const EPHEMERAL_SESSION_KEY='nuvasto:ephemeral-session';
const LAST_EMAIL_KEY='nuvasto:last-email';
let initialized=false,platformAuthenticatorAvailable=false;

function b64ToBytes(value){const input=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=input+'='.repeat((4-input.length%4)%4),binary=atob(padded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function bytesToB64(value){const bytes=value instanceof Uint8Array?value:new Uint8Array(value||new ArrayBuffer(0));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function rememberChoice(){const input=$('#rememberDevice');if(input)return Boolean(input.checked);return localStorage.getItem(REMEMBER_KEY)!=='0'}
export function rememberedLoginEmail(){return localStorage.getItem(LAST_EMAIL_KEY)||sessionStorage.getItem(LAST_EMAIL_KEY)||''}
export function persistLoginSession(token,email,remember=rememberChoice()){
  state.token=String(token||'');
  localStorage.setItem('pp:token',state.token);
  localStorage.setItem(REMEMBER_KEY,remember?'1':'0');
  if(remember){
    localStorage.removeItem(EPHEMERAL_TOKEN_KEY);sessionStorage.removeItem(EPHEMERAL_SESSION_KEY);sessionStorage.removeItem(LAST_EMAIL_KEY);
    if(email)localStorage.setItem(LAST_EMAIL_KEY,String(email).trim().toLowerCase());
  }else{
    localStorage.setItem(EPHEMERAL_TOKEN_KEY,'1');sessionStorage.setItem(EPHEMERAL_SESSION_KEY,'1');localStorage.removeItem(LAST_EMAIL_KEY);
    if(email)sessionStorage.setItem(LAST_EMAIL_KEY,String(email).trim().toLowerCase());
  }
}
export function clearLoginPersistence(){localStorage.removeItem(EPHEMERAL_TOKEN_KEY);sessionStorage.removeItem(EPHEMERAL_SESSION_KEY);sessionStorage.removeItem(LAST_EMAIL_KEY)}

function creationOptions(options){return{...options,challenge:b64ToBytes(options.challenge),user:{...options.user,id:b64ToBytes(options.user.id)},excludeCredentials:(options.excludeCredentials||[]).map(item=>({...item,id:b64ToBytes(item.id)}))}}
function requestOptions(options){return{...options,challenge:b64ToBytes(options.challenge),allowCredentials:(options.allowCredentials||[]).map(item=>({...item,id:b64ToBytes(item.id)}))}}
function serializeRegistration(credential){return{id:credential.id,rawId:bytesToB64(credential.rawId),type:credential.type,response:{clientDataJSON:bytesToB64(credential.response.clientDataJSON),attestationObject:bytesToB64(credential.response.attestationObject),transports:typeof credential.response.getTransports==='function'?credential.response.getTransports():[]},clientExtensionResults:credential.getClientExtensionResults?.()||{}}}
function serializeAuthentication(credential){return{id:credential.id,rawId:bytesToB64(credential.rawId),type:credential.type,response:{clientDataJSON:bytesToB64(credential.response.clientDataJSON),authenticatorData:bytesToB64(credential.response.authenticatorData),signature:bytesToB64(credential.response.signature),userHandle:credential.response.userHandle?bytesToB64(credential.response.userHandle):null},clientExtensionResults:credential.getClientExtensionResults?.()||{}}}
function deviceLabel(){const ua=navigator.userAgent||'';if(/iPhone/i.test(ua))return 'iPhone · Face ID / Touch ID';if(/iPad/i.test(ua))return 'iPad · Face ID / Touch ID';if(/Macintosh|Mac OS/i.test(ua))return 'Mac · Touch ID';if(/Windows/i.test(ua))return 'Windows · Windows Hello';if(/Android/i.test(ua))return 'Android · biometría';return 'Dispositivo con biometría'}
async function detectPlatformAuthenticator(){if(!window.isSecureContext||!window.PublicKeyCredential||!navigator.credentials)return false;try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()}catch{return false}}
function friendlyPasskeyError(error){if(error?.code==='passkey_not_configured')return 'Face ID/biometría está disponible, pero aún no está vinculada a esta cuenta. Inicia con contraseña una vez y Nuvasto te permitirá activarla.';if(error?.name==='NotAllowedError')return 'Operación biométrica cancelada.';if(error?.name==='InvalidStateError')return 'Esta biometría ya está registrada en Nuvasto.';if(error?.name==='NotSupportedError')return 'Este dispositivo no permite configurar biometría para esta PWA.';return error?.message||'No se pudo completar la operación biométrica.'}

function injectStyles(){if($('#authExperienceStyles'))return;const style=document.createElement('style');style.id='authExperienceStyles';style.textContent=`
.auth-device-options{display:grid;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.auth-remember{display:flex;align-items:flex-start;gap:9px;color:var(--muted);font-size:9px;line-height:1.45}.auth-remember input{margin-top:2px;accent-color:var(--primary)}
.biometric-login{min-height:48px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);font-weight:850}.biometric-login strong{display:inline-flex;align-items:center;justify-content:center;min-width:28px;margin-right:6px}
.auth-device-note{margin:0;color:var(--muted);font-size:8px;line-height:1.45;text-align:center}
.auth-security-card{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card);display:grid;gap:14px}.auth-security-card header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.auth-security-card h3{margin:2px 0 4px;font-size:15px}.auth-security-card p{margin:0;color:var(--muted);font-size:10px;line-height:1.55}.passkey-list{display:grid;gap:8px}.passkey-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}.passkey-row strong{display:block;font-size:10px}.passkey-row small{display:block;margin-top:3px;color:var(--muted);font-size:8px}.passkey-empty{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:9px}.passkey-actions{display:flex;flex-wrap:wrap;gap:8px}
`;document.head.append(style)}
function mountLoginControls(){const form=$('#loginForm');if(!form||$('#authDeviceOptions'))return;const wrapper=document.createElement('section');wrapper.id='authDeviceOptions';wrapper.className='auth-device-options';wrapper.innerHTML=`<label class="auth-remember"><input id="rememberDevice" type="checkbox"><span><strong>Mantener sesión iniciada en este dispositivo</strong><br>Si lo desactivas, Nuvasto cerrará la sesión local al cerrar completamente la PWA o el navegador.</span></label><button class="biometric-login hidden" id="biometricLoginButton" type="button"><strong>◉</strong>Ingresar con biometría</button><p class="auth-device-note" id="authDeviceNote">La biometría se valida en tu dispositivo. Nuvasto nunca recibe tu rostro ni huella.</p>`;form.insertAdjacentElement('afterend',wrapper);$('#rememberDevice').checked=localStorage.getItem(REMEMBER_KEY)!=='0';$('#biometricLoginButton').onclick=()=>loginWithPasskey($('#biometricLoginButton'))}
async function refreshLoginControls(){mountLoginControls();platformAuthenticatorAvailable=await detectPlatformAuthenticator();$('#biometricLoginButton')?.classList.toggle('hidden',!platformAuthenticatorAvailable);if($('#authDeviceNote'))$('#authDeviceNote').textContent=platformAuthenticatorAvailable?'Face ID, Touch ID, Windows Hello o la biometría integrada se procesa únicamente en este dispositivo.':'Este dispositivo o navegador no informa una biometría integrada compatible con WebAuthn.'}

async function loginWithPasskey(button){
  if(!navigator.onLine){toast('Necesitas conexión para iniciar una sesión biométrica nueva.','error');return}
  const email=String($('#loginEmail')?.value||rememberedLoginEmail()).trim().toLowerCase();if(!email){toast('Ingresa tu correo para identificar la cuenta biométrica.','error');$('#loginEmail')?.focus();return}
  setBusy(button,true,'Abriendo biometría…');
  try{
    const options=await api('/api/auth/passkeys/login/options',{method:'POST',timeout:12000,json:{email}}),credential=await navigator.credentials.get({publicKey:requestOptions(options.publicKey)});if(!credential)throw new Error('No se recibió una credencial biométrica');
    const verified=await api('/api/auth/passkeys/login/verify',{method:'POST',timeout:15000,json:{email,challengeId:options.challengeId,credential:serializeAuthentication(credential)}});persistLoginSession(verified.token,email,rememberChoice());toast('Acceso biométrico validado');location.reload();
  }catch(error){toast(friendlyPasskeyError(error),'error')}finally{setBusy(button,false)}
}
async function registerPasskey(button){
  if(!platformAuthenticatorAvailable){toast('Este dispositivo no tiene biometría integrada compatible.','error');return}
  setBusy(button,true,'Preparando biometría…');
  try{
    const options=await api('/api/auth/passkeys/register/options',{method:'POST',timeout:12000,json:{}}),credential=await navigator.credentials.create({publicKey:creationOptions(options.publicKey)});if(!credential)throw new Error('No se recibió una credencial biométrica');
    await api('/api/auth/passkeys/register/verify',{method:'POST',timeout:15000,json:{challengeId:options.challengeId,label:deviceLabel(),credential:serializeRegistration(credential)}});localStorage.setItem('nuvasto:passkey-configured','1');localStorage.removeItem(PASSKEY_DISMISS_KEY);toast('Acceso biométrico activado');closeModal('passkey-registered');await renderSecurityPanel(true);
  }catch(error){toast(friendlyPasskeyError(error),'error')}finally{setBusy(button,false)}
}
async function revokePasskey(id,button){setBusy(button,true,'Quitando…');try{await api(`/api/auth/passkeys/${encodeURIComponent(id)}`,{method:'DELETE',json:{}});toast('Acceso biométrico eliminado');await renderSecurityPanel(true)}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}}
function formatDate(value){if(!value)return 'Nunca usado';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'})}
async function renderSecurityPanel(force=false){
  if(!state.token||state.view!=='settings')return;const root=$('#mainContent');if(!root)return;if(force)$('#authSecurityCard')?.remove();if($('#authSecurityCard'))return;
  const card=document.createElement('section');card.id='authSecurityCard';card.className='auth-security-card';card.innerHTML=`<header><div><span class="eyebrow">SEGURIDAD DE ACCESO</span><h3>Sesión y biometría</h3><p>Configura un acceso rápido con la biometría integrada de este dispositivo. La contraseña seguirá disponible como respaldo.</p></div></header><div id="passkeyList" class="passkey-list"><div class="passkey-empty">Cargando credenciales…</div></div><div class="passkey-actions"><button class="btn primary" id="registerPasskeyButton" type="button">Activar biometría en este dispositivo</button></div><p id="passkeySupportNote"></p>`;root.append(card);const register=$('#registerPasskeyButton');register.disabled=!platformAuthenticatorAvailable;register.onclick=()=>registerPasskey(register);$('#passkeySupportNote').textContent=platformAuthenticatorAvailable?'Compatible: el sistema solicitará Face ID, Touch ID, Windows Hello o el método biométrico configurado localmente.':'No se detectó un autenticador biométrico integrado compatible en este dispositivo.';
  try{const payload=await api('/api/auth/passkeys',{fresh:true,ttl:0,timeout:10000}),items=payload.passkeys||[];$('#passkeyList').innerHTML=items.length?items.map(item=>`<div class="passkey-row"><div><strong>${esc(item.label||'Dispositivo biométrico')}</strong><small>Registrado ${formatDate(item.createdAt)} · Último uso: ${formatDate(item.lastUsedAt)}</small></div><button class="btn danger" type="button" data-revoke-passkey="${item.id}">Eliminar</button></div>`).join(''):'<div class="passkey-empty">Aún no has activado acceso biométrico para esta cuenta.</div>';card.querySelectorAll('[data-revoke-passkey]').forEach(button=>button.onclick=()=>revokePasskey(button.dataset.revokePasskey,button))}catch(error){$('#passkeyList').innerHTML=`<div class="passkey-empty">${esc(error.message)}</div>`}
}
const PASSKEY_DISMISS_KEY='nuvasto:passkey-enrollment-dismissed';
export async function offerPasskeyEnrollmentAfterPassword(){if(!state.token||localStorage.getItem(PASSKEY_DISMISS_KEY)==='1')return;platformAuthenticatorAvailable=await detectPlatformAuthenticator();if(!platformAuthenticatorAvailable)return;try{const payload=await api('/api/auth/passkeys',{fresh:true,ttl:0,timeout:10000}),items=payload.passkeys||[];if(items.length){localStorage.setItem('nuvasto:passkey-configured','1');return}}catch{return}if($('#quickPasskeyEnrollment'))return;openModal({eyebrow:'ACCESO RÁPIDO',title:'Activar Face ID / biometría',subtitle:'Este dispositivo puede iniciar Nuvasto sin volver a escribir tu contraseña.',hideSubmit:true,body:`<section id="quickPasskeyEnrollment" class="auth-security-card" style="margin:0"><div><strong>${esc(deviceLabel())}</strong><p>La huella o rostro nunca sale del dispositivo. Nuvasto registra únicamente una credencial criptográfica.</p></div><button class="btn primary" id="quickPasskeyEnable" type="button">Activar biometría ahora</button><button class="btn" id="quickPasskeyLater" type="button">Ahora no</button></section>`});$('#quickPasskeyEnable')?.addEventListener('click',()=>registerPasskey($('#quickPasskeyEnable')));$('#quickPasskeyLater')?.addEventListener('click',()=>{localStorage.setItem(PASSKEY_DISMISS_KEY,'1');closeModal('passkey-later')})}

export function initializeAuthExperience(){if(initialized)return;initialized=true;injectStyles();mountLoginControls();refreshLoginControls();window.addEventListener('pageshow',refreshLoginControls);window.addEventListener('pedidos:view-rendered',()=>requestAnimationFrame(()=>renderSecurityPanel()));window.addEventListener('nuvasto:view-rendered',()=>requestAnimationFrame(()=>renderSecurityPanel()));document.addEventListener('click',event=>{if(event.target.closest?.('[data-view="settings"]'))setTimeout(()=>renderSecurityPanel(),120)})}
