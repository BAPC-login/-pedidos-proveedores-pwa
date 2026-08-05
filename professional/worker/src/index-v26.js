import platformWorker from './index-v22.js';
import {authenticate,writeAudit} from './auth.js';
import {corsHeaders,errorResponse,HttpError,monthKey,nowIso,ok,planFor,ROLES,assertMinimumRole,securityHeaders} from './core.js';
import {storeFile} from './storage.js';
import {normalizeInvoiceAnalysis} from './invoice-normalizer-v26.js';

const AI_TIMEOUT_MS=85000;
const AI_ATTEMPTS=2;

function addHeaders(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version','26');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function usageValue(env,orgId,metric){
  const row=await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id=? AND month_key=? AND metric=?').bind(orgId,monthKey(),metric).first();
  return Number(row?.quantity||0);
}
async function incrementUsage(env,orgId,metric,amount=1){
  await env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=usage_counters.quantity+excluded.quantity,updated_at=excluded.updated_at`).bind(orgId,monthKey(),metric,amount,nowIso()).run();
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

async function callInvoiceAi(env,{file,orderFile,context}){
  const endpoint=String(env.AI_ENDPOINT||'https://pedidos-pro-ai.botreservasmultilocal.workers.dev').replace(/\/$/,'');
  const attempts=[];
  for(let attempt=1;attempt<=AI_ATTEMPTS;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
    try{
      const upstream=new FormData();
      upstream.append('file',file,file.name||'factura');
      if(orderFile instanceof File)upstream.append('orderFile',orderFile,orderFile.name||'pedido.pdf');
      upstream.append('context',JSON.stringify(context));
      const response=await fetch(`${endpoint}/v1/invoices/analyze`,{method:'POST',signal:controller.signal,headers:{'X-Pedidos-Client':'professional-v26'},body:upstream});
      const payload=await response.json().catch(()=>({}));
      if(response.ok&&payload.ok)return payload;
      attempts.push({attempt,status:response.status,error:payload.error||`HTTP ${response.status}`,models:payload.attempts||[]});
    }catch(error){attempts.push({attempt,status:0,error:error?.name==='AbortError'?'Tiempo de espera agotado':String(error?.message||error)})}
    finally{clearTimeout(timer)}
    if(attempt<AI_ATTEMPTS)await wait(450);
  }
  throw new HttpError(502,'La IA no pudo leer el documento después de dos intentos','ai_failed',attempts);
}

async function analyzeInvoiceV26(request,env,actor){
  assertMinimumRole(actor.role,ROLES.RECEIVER);
  if(!env.FILES)throw new HttpError(503,'R2 no está disponible. Revisa el binding FILES.','r2_unavailable');
  const limits=planFor(actor.organization.plan),used=await usageValue(env,actor.orgId,'ai_documents');
  if(used>=limits.aiDocumentsPerMonth)throw new HttpError(402,'Límite mensual de documentos con IA alcanzado','plan_limit');
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.size)throw new HttpError(400,'Adjunta una factura, guía, boleta o nota de crédito','missing_file');
  if(file.size>12*1024*1024)throw new HttpError(413,'El documento supera 12 MB','file_too_large');
  const orderFile=form.get('orderFile');
  let context={};try{context=JSON.parse(String(form.get('context')||'{}'))}catch{throw new HttpError(400,'Contexto de cotejo inválido','invalid_context')}
  context={...context,organizationId:actor.orgId,requestedBy:actor.userId,normalizationVersion:26};
  const sourceFile=await storeFile(env,actor,file,{purpose:'invoice-source'});
  await incrementUsage(env,actor.orgId,'file_bytes',file.size);
  const raw=await callInvoiceAi(env,{file,orderFile,context});
  const normalized=normalizeInvoiceAnalysis({...raw,sourceFile},context);
  await incrementUsage(env,actor.orgId,'ai_documents',1);
  await writeAudit(env,actor,request,'invoice.analyze','invoice','',{model:normalized.model||raw.model||'',fileName:file.name,sourceFileId:sourceFile.id,normalizationVersion:26,folio:String(context.folio||''),attempts:AI_ATTEMPTS});
  return normalized;
}

async function storageSummary(env,actor){
  const result=await env.DB.prepare(`SELECT CASE WHEN storage_key LIKE 'd1/%' THEN 'd1' ELSE 'r2' END AS backend,purpose,COUNT(*) AS total,COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE org_id=? GROUP BY backend,purpose ORDER BY backend,purpose`).bind(actor.orgId).all();
  const rows=result.results||[];
  return{
    configured:Boolean(env.FILES),required:String(env.REQUIRE_R2||'').toLowerCase()==='true',bucket:'nuvasto-files',
    files:rows.map(row=>({backend:row.backend,purpose:row.purpose,total:Number(row.total||0),bytes:Number(row.bytes||0)})),
    r2Files:rows.filter(row=>row.backend==='r2').reduce((sum,row)=>sum+Number(row.total||0),0),
    d1Files:rows.filter(row=>row.backend==='d1').reduce((sum,row)=>sum+Number(row.total||0),0)
  };
}

async function verifyStorage(request,env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  if(!env.FILES)throw new HttpError(503,'El binding FILES no está disponible','r2_unavailable');
  const stamp=new Date().toISOString(),key=`system/health/${actor.orgId}/${crypto.randomUUID()}.json`,body=new TextEncoder().encode(JSON.stringify({service:'Nuvasto',orgId:actor.orgId,createdAt:stamp}));
  await env.FILES.put(key,body,{httpMetadata:{contentType:'application/json'},customMetadata:{purpose:'storage-health',orgId:actor.orgId}});
  const object=await env.FILES.get(key);
  if(!object){await env.FILES.delete(key).catch(()=>{});throw new HttpError(502,'R2 escribió el archivo, pero no pudo volver a leerlo','r2_read_failed')}
  const received=new Uint8Array(await object.arrayBuffer());
  const valid=received.byteLength===body.byteLength&&received.every((value,index)=>value===body[index]);
  await env.FILES.delete(key);
  if(!valid)throw new HttpError(502,'La verificación de integridad de R2 falló','r2_integrity_failed');
  return{verified:true,bucket:'nuvasto-files',binding:'FILES',bytes:body.byteLength,write:true,read:true,delete:true,verifiedAt:stamp,summary:await storageSummary(env,actor)};
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
  return addHeaders(ok({...payload,version:'2.0.0-alpha.26',r2Configured:Boolean(env.FILES),r2Required:String(env.REQUIRE_R2||'').toLowerCase()==='true',r2Bucket:'nuvasto-files',invoiceNormalizationVersion:26,invoiceRetryAttempts:AI_ATTEMPTS,keyboardNavigationVersion:26},request,env),request,env);
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url),method=request.method.toUpperCase();
  try{
    if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
    if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
      const actor=await authenticate(request,env);return addHeaders(ok({analysis:await analyzeInvoiceV26(request,env,actor)},request,env),request,env);
    }
    if(url.pathname==='/api/storage/r2/status'&&method==='GET'){
      const actor=await authenticate(request,env);assertMinimumRole(actor.role,ROLES.ADMIN);return addHeaders(ok(await storageSummary(env,actor),request,env),request,env);
    }
    if(url.pathname==='/api/storage/r2/verify'&&method==='POST'){
      const actor=await authenticate(request,env);return addHeaders(ok(await verifyStorage(request,env,actor),request,env),request,env);
    }
    return addHeaders(await platformWorker.fetch(request,env,ctx),request,env);
  }catch(error){return addHeaders(errorResponse(error,request,env),request,env)}
}};
