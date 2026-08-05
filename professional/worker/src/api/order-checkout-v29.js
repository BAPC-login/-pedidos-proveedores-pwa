import {HttpError,ROLES,assertMinimumRole,nowIso,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);

function folioParts(value){
  const match=String(value||'').match(/^(.*-)(\d{3,})$/);
  return match?{prefix:match[1],number:Number(match[2]),width:match[2].length}:null;
}

export async function renumberDraftBatchV29(request,env,actor,batchId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request,{required:false});
  const result=await env.DB.prepare(`SELECT id,folio,status,location_id,created_at FROM orders WHERE org_id=? AND batch_id=? ORDER BY created_at,folio`).bind(actor.orgId,batchId).all();
  const orders=rows(result);
  if(!orders.length)return{batchId,renumbered:[]};
  if(orders.some(order=>!locationAllowed(actor,order.location_id)))throw new HttpError(403,'No tienes acceso a todos los pedidos del archivo','forbidden');
  if(orders.some(order=>order.status!=='draft'))throw new HttpError(409,'Solo se pueden reajustar folios antes de emitir','batch_already_emitted');

  const parsed=orders.map(order=>({order,parts:folioParts(order.folio)}));
  if(parsed.some(item=>!item.parts))throw new HttpError(409,'El formato actual de folio no permite reajuste automático','invalid_folio_format');
  const prefix=parsed[0].parts.prefix,width=parsed[0].parts.width;
  if(parsed.some(item=>item.parts.prefix!==prefix))throw new HttpError(409,'El archivo contiene folios de series distintas','mixed_folio_series');
  const deleted=folioParts(body?.deletedFolio);
  const start=Math.min(...parsed.map(item=>item.parts.number),deleted?.prefix===prefix?deleted.number:Number.POSITIVE_INFINITY);
  const targets=parsed.map((item,index)=>({id:item.order.id,from:item.order.folio,to:`${prefix}${String(start+index).padStart(width,'0')}`}));
  if(targets.every(item=>item.from===item.to))return{batchId,renumbered:targets};

  const placeholders=targets.map(()=>'?').join(',');
  const conflicts=rows(await env.DB.prepare(`SELECT id,folio FROM orders WHERE org_id=? AND batch_id<>? AND folio IN (${placeholders})`).bind(actor.orgId,batchId,...targets.map(item=>item.to)).all());
  if(conflicts.length)throw new HttpError(409,'No fue posible reajustar porque uno de los folios ya está ocupado','folio_conflict',{folios:conflicts.map(item=>item.folio)});

  const timestamp=nowIso();
  await env.DB.batch(targets.map(item=>env.DB.prepare('UPDATE orders SET folio=?,updated_at=? WHERE id=? AND org_id=?').bind(`TMP-${uuid()}`,timestamp,item.id,actor.orgId)));
  await env.DB.batch(targets.map(item=>env.DB.prepare('UPDATE orders SET folio=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=?').bind(item.to,timestamp,item.id,actor.orgId)));
  await writeAudit(env,actor,request,'order_batch.renumber','order_batch',batchId,{deletedFolio:String(body?.deletedFolio||''),folios:targets});
  return{batchId,renumbered:targets};
}
