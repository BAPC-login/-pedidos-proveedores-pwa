import {HttpError,ROLES,assertMinimumRole,nowIso,number,optionalText,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);

export async function createReceptionV13(request,env,actor,orderId){
  assertMinimumRole(actor.role,ROLES.RECEIVER);
  const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order||!locationAllowed(actor,order.location_id))throw new HttpError(404,'Pedido no encontrado','not_found');
  if(order.status==='draft')throw new HttpError(409,'Primero debes emitir el archivo','not_emitted');
  if(['received','reconciled','closed','cancelled'].includes(order.status))throw new HttpError(409,'El pedido ya no admite otra recepción','invalid_state');
  const body=await readJson(request),items=Array.isArray(body.items)?body.items:[];
  if(!items.length)throw new HttpError(400,'Agrega cantidades recibidas','empty_reception');
  const orderItems=rows(await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(orderId).all()),orderMap=new Map(orderItems.map(item=>[item.id,item])),receptionId=uuid(),timestamp=nowIso();
  let complete=true;const statements=[env.DB.prepare(`INSERT INTO receptions(id,org_id,order_id,location_id,supplier_id,status,received_by,received_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,'completed',?,?,?,?,?)`).bind(receptionId,actor.orgId,orderId,order.location_id,order.supplier_id,actor.userId,body.receivedAt||timestamp,optionalText(body.notes,{max:1500}),timestamp,timestamp)];
  for(const raw of items){
    const orderItem=orderMap.get(String(raw.orderItemId||''));if(!orderItem)throw new HttpError(400,'Línea de pedido inválida','invalid_order_item');
    const accepted=number(raw.quantityAccepted,{min:0,max:100000}),rejected=number(raw.quantityRejected,{min:0,max:100000}),nextReceived=Number(orderItem.quantity_received||0)+accepted;
    if(nextReceived<Number(orderItem.quantity_ordered||0))complete=false;
    statements.push(env.DB.prepare(`INSERT INTO reception_items(id,reception_id,order_item_id,quantity_delivered,quantity_accepted,quantity_rejected,rejection_reason,lot_number,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),receptionId,orderItem.id,accepted+rejected,accepted,rejected,optionalText(raw.rejectionReason,{max:500}),optionalText(raw.lotNumber,{max:100}),raw.expiresAt||null,timestamp));
    statements.push(env.DB.prepare('UPDATE order_items SET quantity_received=quantity_received+?,quantity_rejected=quantity_rejected+?,updated_at=? WHERE id=?').bind(accepted,rejected,timestamp,orderItem.id));
  }
  const nextStatus=complete?'received':'partially_received';
  statements.push(env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND org_id=?').bind(nextStatus,timestamp,orderId,actor.orgId));
  statements.push(env.DB.prepare('INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),actor.orgId,orderId,actor.userId,order.status,nextStatus,'Recepción registrada',timestamp));
  await env.DB.batch(statements);await writeAudit(env,actor,request,'reception.create','reception',receptionId,{orderId,status:nextStatus});
  const received=await getOrder(env,actor,orderId),pdfDocument=await archiveOrderPdf(env,actor,received);
  return {id:receptionId,orderId,status:'completed',orderStatus:nextStatus,pdfDocument};
}
