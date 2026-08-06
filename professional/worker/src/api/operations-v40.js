import {HttpError,ROLES,assertMinimumRole,nowIso,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';
import {createOrderFileV4} from './order-core-v4.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);
const draftFolio=(batchId,index)=>`BORRADOR-${String(batchId||uuid()).replace(/[^A-Z0-9]/gi,'').slice(0,8).toUpperCase()}-${String(index+1).padStart(3,'0')}`;

export async function prepareDraftFoliosV40(env,orgId){
  const drafts=rows(await env.DB.prepare("SELECT id,batch_id,folio,created_at FROM orders WHERE org_id=? AND status='draft' AND folio NOT LIKE 'BORRADOR-%' ORDER BY created_at,id").bind(orgId).all());
  if(!drafts.length)return{updated:0};
  const groups=new Map();for(const item of drafts){const key=item.batch_id||item.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  const timestamp=nowIso(),statements=[];for(const[batchId,items]of groups)items.forEach((item,index)=>statements.push(env.DB.prepare("UPDATE orders SET folio=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(draftFolio(batchId,index),timestamp,item.id,orgId)));
  await env.DB.batch(statements);return{updated:drafts.length};
}

export async function createOrderFileV40(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  await prepareDraftFoliosV40(env,actor.orgId);
  const response=await createOrderFileV4(request,env,actor),timestamp=nowIso(),orders=response.orders||[];
  if(!orders.length)return response;
  const statements=orders.map((order,index)=>env.DB.prepare("UPDATE orders SET folio=?,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(draftFolio(response.batchId,index),timestamp,order.id,actor.orgId));
  await env.DB.batch(statements);
  const updated=orders.map((order,index)=>({...order,folio:draftFolio(response.batchId,index),folioPending:true}));
  await writeAudit(env,actor,request,'order_file.draft_folio','order_batch',response.batchId,{orders:updated.map(order=>order.id)});
  return{...response,orders:updated,foliosAssignedOnEmission:true};
}

function folioBase(location,date){const y=String(date.getUTCFullYear()).slice(-2),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0'),prefix=String(location.code||'PED').replace(/[^A-Z0-9]/g,'').slice(0,8)||'PED';return`${prefix}-${y}${m}${d}-`}
async function nextFolios(env,orgId,location,count,date){
  const base=folioBase(location,date),existing=rows(await env.DB.prepare("SELECT folio FROM orders WHERE org_id=? AND status!='draft' AND folio LIKE ?").bind(orgId,`${base}%`).all()),used=existing.map(item=>Number(String(item.folio||'').slice(base.length))).filter(Number.isFinite),start=(used.length?Math.max(...used):0)+1;
  return Array.from({length:count},(_,index)=>`${base}${String(start+index).padStart(3,'0')}`);
}

export async function emitOrderBatchV40(request,env,actor,batchId,ctx){
  assertMinimumRole(actor.role,ROLES.PURCHASER);await prepareDraftFoliosV40(env,actor.orgId);
  const result=await env.DB.prepare(`SELECT o.id,o.status,o.location_id,o.folio,o.created_at,l.code,l.name FROM orders o JOIN locations l ON l.id=o.location_id WHERE o.org_id=? AND o.batch_id=? ORDER BY o.created_at,o.id`).bind(actor.orgId,batchId).all(),orders=rows(result);
  if(!orders.length)throw new HttpError(404,'Archivo de pedidos no encontrado','not_found');
  if(orders.some(order=>!locationAllowed(actor,order.location_id)))throw new HttpError(403,'No tienes acceso a todos los pedidos del archivo','forbidden');
  const editable=orders.filter(order=>order.status==='draft');
  if(!editable.length)return{batchId,emitted:true,alreadyEmitted:true,orderIds:orders.map(order=>order.id),orders:orders.map(order=>({id:order.id,folio:order.folio}))};
  const date=new Date(),timestamp=nowIso(),groups=new Map();for(const order of editable){if(!groups.has(order.location_id))groups.set(order.location_id,[]);groups.get(order.location_id).push(order)}
  const assignments=[];for(const items of groups.values()){const location={code:items[0].code,name:items[0].name},folios=await nextFolios(env,actor.orgId,location,items.length,date);items.forEach((order,index)=>assignments.push({order,folio:folios[index]}))}
  const statements=[];for(const item of assignments){statements.push(env.DB.prepare("UPDATE orders SET folio=?,status='requested',emitted_at=?,sent_at=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(item.folio,timestamp,timestamp,timestamp,item.order.id,actor.orgId));statements.push(env.DB.prepare("INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?, 'draft','requested','Archivo emitido con folio correlativo',?)").bind(uuid(),actor.orgId,item.order.id,actor.userId,timestamp))}
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'order_batch.emit_v40','order_batch',batchId,{orders:assignments.map(item=>({id:item.order.id,from:item.order.folio,to:item.folio})),emittedAt:timestamp});
  const task=Promise.allSettled(assignments.map(async item=>archiveOrderPdf(env,actor,await getOrder(env,actor,item.order.id))));if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
  return{batchId,emitted:true,emittedAt:timestamp,orderIds:assignments.map(item=>item.order.id),orders:assignments.map(item=>({id:item.order.id,folio:item.folio}))};
}
