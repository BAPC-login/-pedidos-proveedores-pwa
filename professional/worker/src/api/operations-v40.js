import {HttpError,ROLES,assertMinimumRole,nowIso,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';
import {createOrderFileV4} from './order-core-v4.js';
import {allocateScopedFoliosV66} from './folio-integrity-v34.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);
const draftFolio=(batchId,index)=>`BORRADOR-${String(batchId||uuid()).replace(/[^A-Z0-9]/gi,'').slice(0,32).toUpperCase()}-${String(index+1).padStart(3,'0')}`;

export async function prepareDraftFoliosV40(env,orgId){
  const drafts=rows(await env.DB.prepare("SELECT id,batch_id,folio,created_at FROM orders WHERE org_id=? AND status='draft' AND folio NOT LIKE 'BORRADOR-%' ORDER BY created_at,id").bind(orgId).all());
  if(!drafts.length)return{updated:0};
  const groups=new Map();for(const item of drafts){const key=item.batch_id||item.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
  const timestamp=nowIso(),statements=[];for(const[batchId,items]of groups)items.forEach((item,index)=>statements.push(env.DB.prepare("UPDATE orders SET folio=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(draftFolio(batchId,index),timestamp,item.id,orgId)));
  await env.DB.batch(statements);return{updated:drafts.length};
}

export async function createOrderFileV40(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const response=await createOrderFileV4(request,env,actor);
  return{...response,orders:(response.orders||[]).map(order=>({...order,folioPending:true})),foliosAssignedOnEmission:true,folioStrategy:'local-cost-center-sequence'};
}

export async function emitOrderBatchV40(request,env,actor,batchId,ctx){
  assertMinimumRole(actor.role,ROLES.PURCHASER);await prepareDraftFoliosV40(env,actor.orgId);
  const result=await env.DB.prepare(`SELECT o.id,o.status,o.location_id,o.folio,o.created_at,l.code,l.name,
    cc.id AS cost_center_id,cc.code AS cost_center_code,cc.name AS cost_center_name
    FROM orders o
    JOIN locations l ON l.id=o.location_id
    JOIN order_cost_centers occ ON occ.order_id=o.id AND occ.org_id=o.org_id
    JOIN cost_centers cc ON cc.id=occ.cost_center_id AND cc.org_id=o.org_id
    WHERE o.org_id=? AND o.batch_id=? ORDER BY o.created_at,o.folio,o.id`).bind(actor.orgId,batchId).all(),orders=rows(result);
  if(!orders.length)throw new HttpError(404,'Archivo de pedidos no encontrado','not_found');
  if(orders.some(order=>!locationAllowed(actor,order.location_id)))throw new HttpError(403,'No tienes acceso a todos los pedidos del archivo','forbidden');
  const editable=orders.filter(order=>order.status==='draft');
  if(!editable.length)return{batchId,emitted:true,alreadyEmitted:true,orderIds:orders.map(order=>order.id),orders:orders.map(order=>({id:order.id,folio:order.folio}))};
  const timestamp=nowIso(),groups=new Map();
  for(const order of editable){const key=`${order.location_id}:${order.cost_center_id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(order)}
  const assignments=[];
  for(const items of groups.values()){
    const first=items[0],folios=await allocateScopedFoliosV66(env,actor.orgId,{
      locationId:first.location_id,locationCode:first.code,costCenterId:first.cost_center_id,costCenterCode:first.cost_center_code,costCenterName:first.cost_center_name
    },items.length);
    items.forEach((order,index)=>assignments.push({order,folio:folios[index]}));
  }
  const statements=[];
  for(const item of assignments){
    statements.push(env.DB.prepare("UPDATE orders SET folio=?,status='requested',emitted_at=?,sent_at=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(item.folio,timestamp,timestamp,timestamp,item.order.id,actor.orgId));
    statements.push(env.DB.prepare("INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?, 'draft','requested','Archivo emitido con folio correlativo por local y centro de costo',?)").bind(uuid(),actor.orgId,item.order.id,actor.userId,timestamp));
  }
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'order_batch.emit_v40','order_batch',batchId,{folioStrategy:'local-cost-center-sequence',orders:assignments.map(item=>({id:item.order.id,from:item.order.folio,to:item.folio,costCenterId:item.order.cost_center_id})),emittedAt:timestamp});
  const task=Promise.allSettled(assignments.map(async item=>archiveOrderPdf(env,actor,await getOrder(env,actor,item.order.id))));if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
  return{batchId,emitted:true,emittedAt:timestamp,folioStrategy:'local-cost-center-sequence',orderIds:assignments.map(item=>item.order.id),orders:assignments.map(item=>({id:item.order.id,folio:item.folio}))};
}
