import {listDocuments,archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';

function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
async function pdfIdentity(env,actor,order){const[supplier,organization]=await Promise.all([env.DB.prepare('SELECT settings_json FROM suppliers WHERE id=? AND org_id=?').bind(order.supplierId,actor.orgId).first(),env.DB.prepare('SELECT settings_json FROM organizations WHERE id=?').bind(actor.orgId).first()]),supplierIdentity=safeJson(supplier?.settings_json,{}).identity||{},branding=safeJson(organization?.settings_json,{}).branding||{};return{supplierLogoKey:String(supplierIdentity.logoKey||''),brandLogoKey:String(branding.logoKey||'')}}
async function storedPdfAvailable(env,document){
  const key=String(document?.key||'');
  if(!key)return false;
  if(!key.startsWith('r2/'))return true;
  if(!env.FILES)return false;
  try{return Boolean(await env.FILES.head(key))}catch(error){console.warn('order_pdf_r2_head_failed',key,error?.message||error);return false}
}
export async function ensureOrderPdfV19(request,env,actor,orderId){
  const existing=await listDocuments(env,actor,{entityType:'order',entityId:orderId,kind:'order_pdf'}),order=await getOrder(env,actor,orderId),latest=existing.sort((a,b)=>Number(b.revision||0)-Number(a.revision||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0],identity=await pdfIdentity(env,actor,order),metadata=latest?.metadata||{},metadataValid=latest&&Number(latest.revision||0)>=Number(order.revision||0)&&Number(metadata.pdfVersion||0)>=24&&String(metadata.status||'')===String(order.status||'')&&String(metadata.deliveryDate||'')===String(order.deliveryDate||'')&&String(metadata.supplierLogoKey||'')===identity.supplierLogoKey&&String(metadata.brandLogoKey||'')===identity.brandLogoKey&&String(metadata.costCenterName||'')===String(order.costCenterName||'');
  if(metadataValid&&await storedPdfAvailable(env,latest))return latest;
  if(metadataValid&&latest?.key)console.warn('order_pdf_missing_regenerated_v91',orderId,latest.key);
  return archiveOrderPdf(env,actor,order)
}
