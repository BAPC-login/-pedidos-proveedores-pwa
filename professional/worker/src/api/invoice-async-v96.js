import {HttpError,ROLES,assertMinimumRole,nowIso} from '../core.js';
import {getOrder} from './orders.js';
import {storeFile,storeBytes,readStoredBytes} from '../storage.js';
import {analyzeInvoiceV91} from './invoice-analysis-v91.js';
import {buildInternalInvoiceXml,parseOriginalDteXml,verifyPhotoAgainstDte} from '../invoice-xml-evidence-v96.js';

const MAX_SOURCE=20*1024*1024,MAX_XML=5*1024*1024;
const now=()=>nowIso();
async function prepare(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS invoice_analysis_jobs_v96(
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL,user_id TEXT NOT NULL,order_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,source_key TEXT NOT NULL,xml_key TEXT NOT NULL DEFAULT '',
    context_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,error_message TEXT NOT NULL DEFAULT '',
    result_json TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    available_at TEXT NOT NULL,started_at TEXT,completed_at TEXT,
    UNIQUE(org_id,user_id,idempotency_key)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_invoice_analysis_jobs_status_v96 ON invoice_analysis_jobs_v96(status,available_at,created_at)').run();
}
function publicJob(row,{includeResult=false}={}){
  return {id:row.id,orderId:row.order_id,status:row.status,attempts:Number(row.attempts||0),errorMessage:row.error_message||'',
    createdAt:row.created_at,completedAt:row.completed_at||null,
    ...(includeResult&&row.result_json?{result:JSON.parse(row.result_json)}:{})};
}
async function membershipActor(env,job){
  const membership=await env.DB.prepare('SELECT role,location_scope,active FROM memberships WHERE org_id=? AND user_id=?').bind(job.org_id,job.user_id).first();
  if(!membership||!Number(membership.active))throw new Error('Usuario sin acceso activo a esta organización');
  const organization=await env.DB.prepare('SELECT id,plan,name FROM organizations WHERE id=?').bind(job.org_id).first();
  if(!organization)throw new Error('Organización no encontrada');
  let locationScope=[];try{locationScope=JSON.parse(membership.location_scope||'[]')}catch{}
  return {orgId:job.org_id,userId:job.user_id,role:membership.role,locationScope,organization};
}
async function runOne(env,job){
  const timestamp=now(),claimed=await env.DB.prepare(`UPDATE invoice_analysis_jobs_v96 SET status='processing',attempts=attempts+1,
    started_at=?,updated_at=? WHERE id=? AND status IN ('queued','retry')`).bind(timestamp,timestamp,job.id).run();
  if(!Number(claimed.meta?.changes||0))return false;
  try{
    const actor=await membershipActor(env,job);
    assertMinimumRole(actor.role,ROLES.RECEIVER);
    await getOrder(env,actor,job.order_id);
    const original=await readStoredBytes(env,actor,job.source_key);
    const file=new File([original.bytes],original.name,{type:original.contentType}),form=new FormData();
    form.set('file',file,file.name);form.set('context',job.context_json);
    const req=new Request('https://internal.local/api/invoices/analyze',{method:'POST',body:form});
    const analysis=await analyzeInvoiceV91(req,env,actor);
    let originalDteCheck=null;
    if(job.xml_key){
      try{
        const originalXml=await readStoredBytes(env,actor,job.xml_key);
        const dte=parseOriginalDteXml(new TextDecoder().decode(originalXml.bytes));
        originalDteCheck=verifyPhotoAgainstDte(analysis,dte);
        if(!originalDteCheck.verified){
          analysis.degraded=true;analysis.documentMathVerified=false;
          analysis.warnings=[...(analysis.warnings||[]),'La fotografía y el XML DTE presentan datos diferentes o no verificables. Revisión manual obligatoria.'];
        }
      }catch(error){
        analysis.degraded=true;analysis.documentMathVerified=false;
        analysis.warnings=[...(analysis.warnings||[]),'XML DTE inválido o no comprobable: '+String(error.message||error)];
      }
    }
    const xml=buildInternalInvoiceXml(analysis);
    const structured=await storeBytes(env,actor,{bytes:new TextEncoder().encode(xml),
      fileName:'factura-estructurada-'+job.id+'.xml',contentType:'application/xml',
      purpose:'invoice-internal-xml',entityType:'order',entityId:job.order_id,documentKind:'invoice_extraction_v96'});
    const result={analysis:{...analysis,structuredXml:{id:structured.id,key:structured.key,origin:'photo-derived-not-sii-dte'},
      originalDteCheck:originalDteCheck?{verified:originalDteCheck.verified,discrepancies:originalDteCheck.discrepancies,
        folio:originalDteCheck.originalDte.folio,total:originalDteCheck.originalDte.total}:null}};
    const state=analysis.degraded?'needs_review':'completed',ended=now();
    await env.DB.prepare(`UPDATE invoice_analysis_jobs_v96 SET status=?,result_json=?,error_message='',updated_at=?,completed_at=?
      WHERE id=? AND status='processing'`).bind(state,JSON.stringify(result),ended,ended,job.id).run();
  }catch(error){
    const next=Number(job.attempts||0)+1>=3?'failed':'retry';
    await env.DB.prepare(`UPDATE invoice_analysis_jobs_v96 SET status=?,error_message=?,updated_at=?,available_at=datetime('now','+2 minutes')
      WHERE id=? AND status='processing'`).bind(next,String(error.message||error).slice(0,500),now(),job.id).run();
    console.error('invoice_async_processing_failed',job.id,String(error.message||error));
  }
  return true;
}
export async function processInvoiceAnalysisJobs(env,{limit=2}={}){
  await prepare(env);
  // Reclaim abandoned leases (worker interruption), then process pending work.
  await env.DB.prepare(`UPDATE invoice_analysis_jobs_v96 SET status='retry',available_at=?,updated_at=?
    WHERE status='processing' AND started_at<datetime('now','-4 minutes') AND attempts<3`).bind(now(),now()).run();
  await env.DB.prepare(`UPDATE invoice_analysis_jobs_v96 SET status='failed',error_message='Se agotaron los intentos'
    WHERE status='processing' AND started_at<datetime('now','-4 minutes') AND attempts>=3`).run();
  const pending=(await env.DB.prepare(`SELECT * FROM invoice_analysis_jobs_v96
    WHERE status IN ('queued','retry') AND available_at<=?
    ORDER BY created_at LIMIT ?`).bind(now(),Math.max(1,Math.min(3,limit))).all()).results||[];
  for(const job of pending)await runOne(env,job);
  return{processed:pending.length};
}
export async function enqueueInvoiceAnalysis(request,env,actor,ctx){
  assertMinimumRole(actor.role,ROLES.RECEIVER);
  if(!env.FILES)throw new HttpError(503,'R2 no está configurado','storage_unavailable');
  await prepare(env);
  const form=await request.formData(),file=form.get('file'),xml=form.get('xml');
  if(!(file instanceof File)||file.size<=0)throw new HttpError(400,'Adjunta una fotografía o PDF','missing_file');
  if(file.size>MAX_SOURCE)throw new HttpError(413,'Documento de más de 20 MB','file_too_large');
  if(!file.type.startsWith('image/')&&file.type!=='application/pdf')throw new HttpError(415,'Solo imágenes o PDF','unsupported_file');
  if(xml&&( !(xml instanceof File)||xml.size>MAX_XML||!(/\.xml$/i.test(xml.name)||/xml/i.test(xml.type))))throw new HttpError(400,'El DTE debe ser un archivo XML de hasta 5 MB','invalid_dte');
  let context;try{context=JSON.parse(String(form.get('context')||'{}'))}catch{throw new HttpError(400,'Contexto inválido','invalid_context')}
  const orderId=String(context?.orderId||'').trim();
  if(!orderId)throw new HttpError(400,'Indica el pedido vinculado','missing_order');
  await getOrder(env,actor,orderId);
  const token=String(form.get('idempotencyKey')||'').trim();
  if(!/^[a-zA-Z0-9_-]{12,100}$/.test(token))throw new HttpError(400,'Clave de envío inválida','idempotency_required');
  const existing=await env.DB.prepare('SELECT * FROM invoice_analysis_jobs_v96 WHERE org_id=? AND user_id=? AND idempotency_key=?').bind(actor.orgId,actor.userId,token).first();
  if(existing)return publicJob(existing,{includeResult:true});
  const source=await storeFile(env,actor,file,{purpose:'invoice-queued-source'});
  const xmlFile=xml?await storeFile(env,actor,xml,{purpose:'invoice-original-dte'}):null;
  const id=crypto.randomUUID(),timestamp=now();
  try{
    await env.DB.prepare(`INSERT INTO invoice_analysis_jobs_v96(id,org_id,user_id,order_id,idempotency_key,source_key,xml_key,context_json,status,created_at,updated_at,available_at)
      VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?)`).bind(id,actor.orgId,actor.userId,orderId,token,source.key,xmlFile?.key||'',JSON.stringify(context),timestamp,timestamp,timestamp).run();
  }catch(error){
    const duplicate=await env.DB.prepare('SELECT * FROM invoice_analysis_jobs_v96 WHERE org_id=? AND user_id=? AND idempotency_key=?').bind(actor.orgId,actor.userId,token).first();
    if(duplicate)return publicJob(duplicate,{includeResult:true});
    throw error;
  }
  // Fast path only: cron is the durable fallback if this execution is interrupted.
  ctx?.waitUntil?.(processInvoiceAnalysisJobs(env,{limit:1}).catch(error=>console.error('invoice_job_fast_path_failed',String(error))));
  return{id,orderId,status:'queued',createdAt:timestamp};
}
export async function getInvoiceAnalysisJob(env,actor,id){
  await prepare(env);
  const job=await env.DB.prepare('SELECT * FROM invoice_analysis_jobs_v96 WHERE id=? AND org_id=? AND user_id=?').bind(id,actor.orgId,actor.userId).first();
  if(!job)throw new HttpError(404,'Lectura no encontrada','not_found');
  return publicJob(job,{includeResult:true});
}
export async function listInvoiceAnalysisJobs(env,actor,url){
  await prepare(env);const orderId=String(url.searchParams.get('orderId')||'');
  if(!orderId)throw new HttpError(400,'Indica el pedido','missing_order');
  await getOrder(env,actor,orderId);
  const jobs=(await env.DB.prepare(`SELECT * FROM invoice_analysis_jobs_v96 WHERE org_id=? AND user_id=? AND order_id=?
    ORDER BY created_at DESC LIMIT 20`).bind(actor.orgId,actor.userId,orderId).all()).results||[];
  return jobs.map(job=>publicJob(job,{includeResult:true}));
}
