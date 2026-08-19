import {monthKey,nowIso} from '../core.js';
import {analyzeInvoiceV39} from './invoice-analysis-v39.js';

async function incrementAttempt(env,actor){
  try{await env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=usage_counters.quantity+1,updated_at=excluded.updated_at`).bind(actor.orgId,monthKey(),'ai_document_attempts',1,nowIso()).run();return true}catch(error){console.warn('invoice_attempt_usage_v91_failed',error?.message||error);return false}
}
async function undoDegradedDocumentCharge(env,actor){
  try{await env.DB.prepare(`UPDATE usage_counters SET quantity=MAX(quantity-1,0),updated_at=? WHERE org_id=? AND month_key=? AND metric='ai_documents'`).bind(nowIso(),actor.orgId,monthKey()).run();return true}catch(error){console.warn('invoice_degraded_usage_v91_failed',error?.message||error);return false}
}

export async function analyzeInvoiceV91(request,env,actor){
  const attemptTracked=await incrementAttempt(env,actor);
  const analysis=await analyzeInvoiceV39(request,env,actor);
  let degradedChargeReverted=false;
  if(analysis?.degraded===true)degradedChargeReverted=await undoDegradedDocumentCharge(env,actor);
  return{...analysis,flowVersion:91,resilienceV91:true,usagePolicyV91:'verified-documents-only',attemptTrackedV91:attemptTracked,degradedChargeRevertedV91:analysis?.degraded===true?degradedChargeReverted:undefined};
}
