import {HttpError,ROLES,assertMinimumRole,monthKey,nowIso,planFor} from '../core.js';
import {writeAudit} from '../auth.js';
import {storeFile} from '../storage.js';
import {normalizeInvoiceAnalysis} from '../invoice-normalizer-v26.js';

const AI_TIMEOUT_MS=84000;

async function usageValue(env,orgId,metric){
  const row=await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id=? AND month_key=? AND metric=?').bind(orgId,monthKey(),metric).first();
  return Number(row?.quantity||0);
}
async function incrementUsage(env,orgId,metric,amount=1){
  await env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=usage_counters.quantity+excluded.quantity,updated_at=excluded.updated_at`).bind(orgId,monthKey(),metric,amount,nowIso()).run();
}

async function callInvoiceAi(env,{file,orderFile,context}){
  const endpoint=String(env.AI_ENDPOINT||'https://pedidos-pro-ai.botreservasmultilocal.workers.dev').replace(/\/$/,'');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
  try{
    const upstream=new FormData();
    upstream.append('file',file,file.name||'factura');
    if(orderFile instanceof File&&orderFile.size)upstream.append('orderFile',orderFile,orderFile.name||'pedido.pdf');
    upstream.append('context',JSON.stringify(context));
    const response=await fetch(`${endpoint}/v1/invoices/analyze`,{method:'POST',signal:controller.signal,headers:{'X-Pedidos-Client':'nuvasto-v29'},body:upstream});
    const payload=await response.json().catch(()=>({}));
    if(response.ok&&payload.ok)return payload;
    throw new HttpError(response.status||502,payload.error||'Gemini no pudo leer el documento',payload.code||'ai_failed',payload.attempts||[]);
  }catch(error){
    if(error?.name==='AbortError')throw new HttpError(504,'La lectura tardó demasiado. Intenta con una foto completa, nítida y tomada de frente.','ai_timeout');
    throw error;
  }finally{clearTimeout(timer)}
}

export async function analyzeInvoiceV29(request,env,actor){
  assertMinimumRole(actor.role,ROLES.RECEIVER);
  if(!env.FILES)throw new HttpError(503,'R2 no está disponible. Revisa el binding FILES.','r2_unavailable');
  const limits=planFor(actor.organization.plan),used=await usageValue(env,actor.orgId,'ai_documents');
  if(used>=limits.aiDocumentsPerMonth)throw new HttpError(402,'Límite mensual de documentos con IA alcanzado','plan_limit');
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.size)throw new HttpError(400,'Adjunta una factura, guía, boleta o nota de crédito','missing_file');
  if(file.size>12*1024*1024)throw new HttpError(413,'El documento supera 12 MB','file_too_large');
  const orderFile=form.get('orderFile');
  let context={};
  try{context=JSON.parse(String(form.get('context')||'{}'))}catch{throw new HttpError(400,'Contexto de cotejo inválido','invalid_context')}
  context={...context,organizationId:actor.orgId,requestedBy:actor.userId,normalizationVersion:26,flowVersion:29};

  const sourceFile=await storeFile(env,actor,file,{purpose:'invoice-source',entityType:'invoice-analysis',entityId:crypto.randomUUID(),documentKind:'invoice_original_pending',metadata:{providerName:String(context.providerName||''),folio:String(context.folio||''),locationId:String(context.locationId||''),flowVersion:29}});
  await incrementUsage(env,actor.orgId,'file_bytes',file.size);
  const raw=await callInvoiceAi(env,{file,orderFile,context});
  const normalized=normalizeInvoiceAnalysis({...raw,sourceFile},context);
  const lines=normalized?.invoice?.lines||normalized?.invoice?.items||[];
  if(!lines.length)throw new HttpError(422,'No se detectaron productos en el documento. Usa una imagen completa, sin recortes y con buena iluminación.','invoice_lines_not_detected',{sourceFileId:sourceFile.id});
  await incrementUsage(env,actor.orgId,'ai_documents',1);
  await writeAudit(env,actor,request,'invoice.analyze','invoice','',{model:normalized.model||raw.model||'',fileName:file.name,sourceFileId:sourceFile.id,normalizationVersion:26,flowVersion:29,folio:String(context.folio||''),lineCount:lines.length,attempts:1,attemptTimeoutMs:AI_TIMEOUT_MS});
  return normalized;
}
