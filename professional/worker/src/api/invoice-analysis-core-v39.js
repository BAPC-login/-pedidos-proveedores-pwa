import aiWorker from '../../../../worker/src/index.js';
import {HttpError,ROLES,assertMinimumRole,monthKey,nowIso,planFor} from '../core.js';
import {writeAudit} from '../auth.js';
import {storeFile} from '../storage.js';
import {normalizeInvoiceAnalysis} from '../invoice-normalizer-v26.js';

const ANALYSIS_TIMEOUT_MS=112000;
export const MAX_INVOICE_FILE_BYTES_V39=20*1024*1024;
const rows=result=>result?.results||[];

async function usageValue(env,orgId,metric){
  try{return Number((await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id=? AND month_key=? AND metric=?').bind(orgId,monthKey(),metric).first())?.quantity||0)}
  catch(error){console.warn('invoice_usage_read_failed',error?.message||error);return 0}
}
async function incrementUsage(env,orgId,metric,amount=1){
  try{await env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=usage_counters.quantity+excluded.quantity,updated_at=excluded.updated_at`)
    .bind(orgId,monthKey(),metric,amount,nowIso()).run()}
  catch(error){console.warn('invoice_usage_write_failed',metric,error?.message||error)}
}
async function recordClientEvent(env,actor,eventType,message,metadata={}){
  try{await env.DB.prepare(`INSERT INTO client_events(id,org_id,user_id,event_type,message,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),actor.orgId,actor.userId,eventType,message,JSON.stringify(metadata),nowIso()).run()}
  catch(error){console.warn('invoice_analysis_event_failed',error?.message||error)}
}
function timeoutPromise(){return new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Nuvasto agotó el tiempo de lectura del documento.'),{code:'analysis_timeout'})),ANALYSIS_TIMEOUT_MS))}
async function callInternalAnalysis(env,{file,orderFile,context}){
  const form=new FormData();form.append('file',file,file.name||'documento');
  if(orderFile instanceof File&&orderFile.size)form.append('orderFile',orderFile,orderFile.name||'pedido.pdf');
  form.append('context',JSON.stringify(context));
  const response=await Promise.race([aiWorker.fetch(new Request('https://nuvasto.internal/v1/invoices/analyze',{method:'POST',body:form}),env),timeoutPromise()]);
  const payload=await response.json().catch(()=>({}));if(response.ok&&payload.ok)return payload;
  const error=new Error(payload.error||'Nuvasto no pudo interpretar el documento');error.code=payload.code||'analysis_failed';error.status=response.status||502;error.details={attempts:payload.attempts||[]};throw error;
}
function manualReviewLines(context){return (context.products||[]).map((product,index)=>{const pack=Math.max(1,Number(product.unitsPerOrderUnit||product.pack||1));return{id:`manual-${index+1}`,code:'',sourceLine:String(product.description||`Producto ${index+1}`),descriptionOriginal:String(product.description||`Producto ${index+1}`),description:String(product.description||`Producto ${index+1}`),productId:String(product.productId||''),suggestedProductId:String(product.productId||''),invoiceQuantity:0,packageQty:0,packSize:pack,units:0,totalUnits:0,orderPackSize:pack,receivedOrderQty:0,grossLineTotal:0,grossUnitPrice:0,grossPackPrice:0,confidence:.25,matchMethod:'nuvasto_manual_review',matchReason:'Producto precargado desde el pedido para revisión manual',quantityStatus:'review',conversionSummary:`Pedido: ${Number(product.orderedQty||0)} ${String(product.unit||'UNIDAD')}. Completa lo leído en el documento.`,notes:'La lectura automática no entregó una línea confiable.',isFree:false,freeReason:'',engine:'nuvasto-manual'}})}
function degradedAnalysis(context,sourceFile,error,elapsedMs){
  const lines=manualReviewLines(context);return{model:'nuvasto-review-fallback',sourceFile,degraded:true,providerErrorCode:error?.code||'analysis_failed',elapsedMs,warnings:['Nuvasto guardó el documento, pero la lectura automática no entregó datos confiables.','Los productos del pedido fueron precargados para que puedas completar cantidades y precios sin volver a subir el archivo.'],invoice:{supplierName:String(context.providerName||''),supplierRut:'',invoiceNumber:'',invoiceDate:'',currency:'CLP',documentType:'',documentTypeCode:'33',totals:{net:0,freight:0,additionalTax:0,vat:0,other:0,total:0},lines,items:lines,matchSummary:{matched:lines.length,unmatched:0,totalInvoiceLines:lines.length,freeLines:0},warnings:['Lectura automática incompleta. Revisa manualmente los valores antes de guardar.']}}
}
const analysisLines=analysis=>analysis?.invoice?.lines||analysis?.invoice?.items||[];

export async function analyzeInvoiceCoreV39(request,env,actor){
  assertMinimumRole(actor.role,ROLES.RECEIVER);
  if(!env.FILES)throw new HttpError(503,'Nuvasto no puede almacenar el documento porque R2 no está disponible.','r2_unavailable');
  const limits=planFor(actor.organization.plan),used=await usageValue(env,actor.orgId,'ai_documents');if(used>=limits.aiDocumentsPerMonth)throw new HttpError(402,'Se alcanzó el límite mensual de documentos del plan.','plan_limit');
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.size)throw new HttpError(400,'Adjunta una factura, guía, boleta o nota de crédito.','missing_file');
  if(file.size>MAX_INVOICE_FILE_BYTES_V39)throw new HttpError(413,'El documento supera 20 MB.','file_too_large');
  const orderFile=form.get('orderFile');let context={};try{context=JSON.parse(String(form.get('context')||'{}'))}catch{throw new HttpError(400,'El contexto del pedido no es válido.','invalid_context')}
  context={...context,organizationId:actor.orgId,requestedBy:actor.userId,normalizationVersion:26,flowVersion:39,brand:'Nuvasto'};
  const analysisId=crypto.randomUUID(),sourceFile=await storeFile(env,actor,file,{purpose:'invoice-source'});await incrementUsage(env,actor.orgId,'file_bytes',file.size);const started=Date.now();
  try{
    const raw=await callInternalAnalysis(env,{file,orderFile,context}),normalized=normalizeInvoiceAnalysis({...raw,sourceFile},context),lines=analysisLines(normalized);if(!lines.length)throw Object.assign(new Error('Nuvasto no detectó líneas de productos en el documento.'),{code:'invoice_lines_not_detected'});
    const elapsedMs=Date.now()-started;Object.assign(normalized,{elapsedMs,degraded:false,flowVersion:39,maxFileBytes:MAX_INVOICE_FILE_BYTES_V39});await incrementUsage(env,actor.orgId,'ai_documents',1);
    await recordClientEvent(env,actor,'invoice.analysis.success','Documento leído y cotejado',{analysisId,folio:String(context.folio||''),fileName:file.name,fileSize:file.size,lineCount:lines.length,matched:lines.filter(line=>line.productId).length,elapsedMs,model:normalized.model||raw.model||'',sourceFileId:sourceFile.id,flowVersion:39});
    await writeAudit(env,actor,request,'invoice.analyze','invoice-analysis',analysisId,{status:'success',fileName:file.name,fileSize:file.size,sourceFileId:sourceFile.id,flowVersion:39,folio:String(context.folio||''),lineCount:lines.length,elapsedMs,model:normalized.model||raw.model||''});return normalized;
  }catch(error){
    const elapsedMs=Date.now()-started,fallback=degradedAnalysis(context,sourceFile,error,elapsedMs);fallback.flowVersion=39;fallback.maxFileBytes=MAX_INVOICE_FILE_BYTES_V39;await incrementUsage(env,actor.orgId,'ai_documents',1);
    await recordClientEvent(env,actor,'invoice.analysis.degraded','Lectura automática derivada a revisión manual',{analysisId,folio:String(context.folio||''),fileName:file.name,fileSize:file.size,elapsedMs,errorCode:error?.code||'analysis_failed',errorMessage:String(error?.message||error),attempts:error?.details?.attempts||[],sourceFileId:sourceFile.id,flowVersion:39});
    await writeAudit(env,actor,request,'invoice.analyze','invoice-analysis',analysisId,{status:'degraded',fileName:file.name,fileSize:file.size,sourceFileId:sourceFile.id,flowVersion:39,folio:String(context.folio||''),elapsedMs,errorCode:error?.code||'analysis_failed'});return fallback;
  }
}

export async function invoiceAnalysisMetricsV39(env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);const result=await env.DB.prepare(`SELECT event_type,metadata_json,created_at FROM client_events WHERE org_id=? AND event_type IN ('invoice.analysis.success','invoice.analysis.degraded') ORDER BY created_at DESC LIMIT 500`).bind(actor.orgId).all();
  const events=rows(result).map(row=>{let metadata={};try{metadata=JSON.parse(row.metadata_json||'{}')}catch{}return{type:row.event_type,metadata,createdAt:row.created_at}}),total=events.length,success=events.filter(item=>item.type.endsWith('.success')).length,elapsed=events.map(item=>Number(item.metadata.elapsedMs||0)).filter(Boolean);
  return{total,success,degraded:total-success,successRate:total?Number((success/total*100).toFixed(1)):0,averageMs:elapsed.length?Math.round(elapsed.reduce((sum,value)=>sum+value,0)/elapsed.length):0,recent:events.slice(0,50)};
}
