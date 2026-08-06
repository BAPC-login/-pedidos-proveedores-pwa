import {HttpError} from '../core.js';
import {analyzeInvoiceV30} from './invoice-analysis-v30.js';

const rows=result=>result?.results||[];
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function similarity(a,b){
  const left=new Set(normalize(a).split(' ').filter(Boolean)),right=new Set(normalize(b).split(' ').filter(Boolean));
  if(!left.size||!right.size)return 0;let hit=0;for(const token of left)if(right.has(token))hit++;
  return hit/Math.max(left.size,right.size);
}

async function policy(env,actor){
  const current=await env.DB.prepare('SELECT * FROM procurement_policies WHERE org_id=?').bind(actor.orgId).first();
  return current?{
    extraItemsMode:current.extra_items_mode,
    requireInvoicePreview:Boolean(current.require_invoice_preview),
    learnFromCorrections:Boolean(current.learn_from_corrections),
    priceVarianceWarningPct:Number(current.price_variance_warning_pct||12),
    updatedAt:current.updated_at
  }:{extraItemsMode:'review',requireInvoicePreview:true,learnFromCorrections:true,priceVarianceWarningPct:12,updatedAt:null};
}

async function supplierForContext(env,actor,context){
  if(context.supplierId)return String(context.supplierId);
  const name=String(context.providerName||'').trim();if(!name)return'';
  const row=await env.DB.prepare('SELECT id FROM suppliers WHERE org_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(actor.orgId,name).first();
  return row?.id||'';
}

async function rulesForSupplier(env,actor,supplierId){
  if(!supplierId)return[];
  const result=await env.DB.prepare(`SELECT * FROM invoice_learning_rules WHERE org_id=? AND supplier_id=?
    ORDER BY correction_count DESC,updated_at DESC LIMIT 500`).bind(actor.orgId,supplierId).all();
  return rows(result).map(row=>({
    id:row.id,productId:row.product_id,normalizedDescription:row.normalized_description,sourceDescription:row.source_description,
    supplierSku:row.supplier_sku,learnedPackSize:Number(row.learned_pack_size||1),lastConfirmedUnitPrice:Number(row.last_confirmed_unit_price||0),
    minConfirmedUnitPrice:Number(row.min_confirmed_unit_price||0),maxConfirmedUnitPrice:Number(row.max_confirmed_unit_price||0),
    correctionCount:Number(row.correction_count||1),confidence:Number(row.confidence||.85)
  }));
}

function applyLearning(analysis,context,rules,policyConfig){
  const invoice=analysis.invoice||{},lines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[],orderedIds=new Set((context.products||[]).map(item=>String(item.productId||'')));
  let applied=0;
  const enhanced=lines.map(line=>{
    const source=line.sourceLine||line.sourceDescription||line.descriptionOriginal||line.description||'',normalized=normalize(source);let best=null,bestScore=0;
    for(const rule of rules){const score=normalized===rule.normalizedDescription?1:similarity(normalized,rule.normalizedDescription);if(score>bestScore){best=rule;bestScore=score}}
    let next={...line};
    if(best&&bestScore>=.78&&orderedIds.has(String(best.productId))){
      const qty=Number(next.packageQty??next.invoiceQuantity??0),pack=Math.max(.001,Number(best.learnedPackSize||next.packSize||1)),total=Number(next.grossLineTotal||0);
      next={...next,productId:best.productId,suggestedProductId:best.productId,packSize:pack,units:qty*pack,totalUnits:qty*pack,
        grossUnitPrice:total&&qty*pack?Math.round(total/(qty*pack)):Number(next.grossUnitPrice||0),
        confidence:Math.max(Number(next.confidence||0),Math.min(.99,best.confidence+Math.min(.12,best.correctionCount*.01))),
        matchMethod:'nuvasto_learned_correction',matchReason:`Regla aprendida de ${best.correctionCount} corrección${best.correctionCount===1?'':'es'}`,
        learnedRuleId:best.id,expectedUnitPrice:best.lastConfirmedUnitPrice};applied++;
    }
    const extra=!next.productId||!orderedIds.has(String(next.productId));return{...next,isExtraFromOrder:extra,policySuggestion:extra?policyConfig.extraItemsMode:'allow'};
  });
  analysis.invoice={...invoice,lines:enhanced,items:enhanced};analysis.learning={rulesAvailable:rules.length,rulesApplied:applied};analysis.policy=policyConfig;
  analysis.flowVersion=34;analysis.multipartBoundaryFixed=true;
  if(applied)analysis.warnings=[...(analysis.warnings||[]),`Nuvasto aplicó ${applied} regla${applied===1?'':'s'} aprendida${applied===1?'':'s'} de correcciones anteriores.`];
  return analysis;
}

function safeMultipartRequest(request,original,enriched){
  const form=new FormData();
  for(const[key,value]of original.entries()){
    if(key==='context')continue;
    if(value instanceof File)form.append(key,value,value.name||'documento');else form.append(key,value);
  }
  form.append('context',JSON.stringify(enriched));
  const headers=new Headers(request.headers);
  // A new FormData instance needs a new browser-generated multipart boundary.
  // Reusing the original Content-Type leaves the old boundary and makes
  // request.formData() fail before the protected fallback can run.
  headers.delete('content-type');headers.delete('content-length');
  return new Request(request.url,{method:'POST',headers,body:form});
}

export async function analyzeInvoiceV34(request,env,actor){
  const original=await request.formData(),contextRaw=String(original.get('context')||'{}');let context={};
  try{context=JSON.parse(contextRaw)}catch{throw new HttpError(400,'El contexto del pedido no es válido','invalid_context')}
  const supplierId=await supplierForContext(env,actor,context).catch(error=>{console.warn('v34_invoice_supplier_context_failed',error?.message||error);return''});
  const [rules,policyConfig]=await Promise.all([
    rulesForSupplier(env,actor,supplierId).catch(error=>{console.warn('v34_invoice_rules_failed',error?.message||error);return[]}),
    policy(env,actor).catch(error=>{console.warn('v34_invoice_policy_failed',error?.message||error);return{extraItemsMode:'review',requireInvoicePreview:true,learnFromCorrections:true,priceVarianceWarningPct:12,updatedAt:null}})
  ]);
  const enriched={...context,supplierId,flowVersion:34,
    learnedCorrections:rules.map(rule=>({productId:rule.productId,sourceDescription:rule.sourceDescription,packSize:rule.learnedPackSize,expectedUnitPrice:rule.lastConfirmedUnitPrice,confidence:rule.confidence,correctionCount:rule.correctionCount})),
    extraItemsMode:policyConfig.extraItemsMode,priceVarianceWarningPct:policyConfig.priceVarianceWarningPct};
  const analysis=await analyzeInvoiceV30(safeMultipartRequest(request,original,enriched),env,actor);
  try{return applyLearning(analysis,enriched,rules,policyConfig)}catch(error){
    console.warn('v34_invoice_learning_apply_failed',error?.message||error);
    return{...analysis,flowVersion:34,multipartBoundaryFixed:true,warnings:[...(analysis.warnings||[]),'El documento fue leído; el aprendizaje histórico no pudo aplicarse en esta ocasión.']};
  }
}
