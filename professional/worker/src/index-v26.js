import platformWorker from './index-v22.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,HttpError,ok,ROLES,assertMinimumRole,securityHeaders} from './core.js';
import {normalizeInvoiceAnalysis} from './invoice-normalizer-v26.js';

function addHeaders(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version','26');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function contextFromRequest(request){
  try{
    const form=await request.clone().formData();
    return JSON.parse(String(form.get('context')||'{}'));
  }catch{return{}}
}

async function normalizeAnalyzeResponse(request,env,ctx){
  const contextPromise=contextFromRequest(request);
  const response=await platformWorker.fetch(request,env,ctx);
  if(!response.ok)return addHeaders(response,request,env);
  const contentType=response.headers.get('Content-Type')||'';
  if(!contentType.includes('application/json'))return addHeaders(response,request,env);
  const payload=await response.json().catch(()=>null);
  if(!payload?.analysis)return addHeaders(new Response(JSON.stringify(payload),{status:response.status,headers:response.headers}),request,env);
  const context=await contextPromise;
  const normalized=normalizeInvoiceAnalysis(payload.analysis,context);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');
  return addHeaders(new Response(JSON.stringify({...payload,analysis:normalized}),{status:response.status,headers}),request,env);
}

async function storageSummary(env,actor){
  const result=await env.DB.prepare(`SELECT CASE WHEN storage_key LIKE 'd1/%' THEN 'd1' ELSE 'r2' END AS backend,purpose,COUNT(*) AS total,COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE org_id=? GROUP BY backend,purpose ORDER BY backend,purpose`).bind(actor.orgId).all();
  const rows=result.results||[];
  return{
    configured:Boolean(env.FILES),
    required:String(env.REQUIRE_R2||'').toLowerCase()==='true',
    bucket:'nuvasto-files',
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
  const response=await platformWorker.fetch(request,env,ctx);
  const payload=await response.clone().json().catch(()=>({}));
  return addHeaders(ok({...payload,version:'2.0.0-alpha.26',r2Configured:Boolean(env.FILES),r2Required:String(env.REQUIRE_R2||'').toLowerCase()==='true',r2Bucket:'nuvasto-files',invoiceNormalizationVersion:26,keyboardNavigationVersion:26},request,env),request,env);
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url),method=request.method.toUpperCase();
  try{
    if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
    if(method==='POST'&&url.pathname==='/api/invoices/analyze')return normalizeAnalyzeResponse(request,env,ctx);
    if(url.pathname==='/api/storage/r2/status'&&method==='GET'){
      const actor=await authenticate(request,env);assertMinimumRole(actor.role,ROLES.ADMIN);return addHeaders(ok(await storageSummary(env,actor),request,env),request,env);
    }
    if(url.pathname==='/api/storage/r2/verify'&&method==='POST'){
      const actor=await authenticate(request,env);return addHeaders(ok(await verifyStorage(request,env,actor),request,env),request,env);
    }
    return addHeaders(await platformWorker.fetch(request,env,ctx),request,env);
  }catch(error){return addHeaders(errorResponse(error,request,env),request,env)}
}};
