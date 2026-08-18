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
  const body=await readJson(request),items=Array.isArray(body.items)?body.items:[],extraItems=Array.isArray(body.extraItems)?body.extraItems:[];
  if(!items.length&&!extraItems.length)throw new HttpError(400,'Agrega cantidades recibidas','empty_reception');
  const orderItems=rows(await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(orderId).all()),orderMap=new Map(orderItems.map(item=>[item.id,item])),receivedDelta=new Map(),receptionId=uuid(),timestamp=nowIso();
  const statements=[env.DB.prepare(`INSERT INTO receptions(id,org_id,order_id,location_id,supplier_id,status,received_by,received_at,notes,created_at,updated_at) VALUES(?,?,?,?,?,'completed',?,?,?,?,?)`).bind(receptionId,actor.orgId,orderId,order.location_id,order.supplier_id,actor.userId,body.receivedAt||timestamp,optionalText(body.notes,{max:1500}),timestamp,timestamp)];
  for(const raw of items){
    const orderItem=orderMap.get(String(raw.orderItemId||''));if(!orderItem)throw new HttpError(400,'Línea de pedido inválida','invalid_order_item');
    const accepted=number(raw.quantityAccepted,{min:0,max:100000}),rejected=number(raw.quantityRejected,{min:0,max:100000});
    receivedDelta.set(orderItem.id,Number(receivedDelta.get(orderItem.id)||0)+accepted);
    statements.push(env.DB.prepare(`INSERT INTO reception_items(id,reception_id,order_item_id,quantity_delivered,quantity_accepted,quantity_rejected,rejection_reason,lot_number,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),receptionId,orderItem.id,accepted+rejected,accepted,rejected,optionalText(raw.rejectionReason,{max:500}),optionalText(raw.lotNumber,{max:100}),raw.expiresAt||null,timestamp));
    statements.push(env.DB.prepare('UPDATE order_items SET quantity_received=quantity_received+?,quantity_rejected=quantity_rejected+?,updated_at=? WHERE id=?').bind(accepted,rejected,timestamp,orderItem.id));
  }
  for(const raw of extraItems){
    const productId=String(raw.productId||'').trim();if(!productId)throw new HttpError(400,'Selecciona un producto del catálogo para el extra','extra_product_required');
    const relation=await env.DB.prepare(`SELECT sp.id,sp.order_unit FROM supplier_products sp JOIN products p ON p.id=sp.product_id AND p.org_id=sp.org_id WHERE sp.org_id=? AND sp.supplier_id=? AND sp.product_id=? AND sp.active=1 AND p.active=1`).bind(actor.orgId,order.supplier_id,productId).first();
    if(!relation)throw new HttpError(400,'El producto extra no pertenece al catálogo activo del proveedor','extra_product_not_in_supplier_catalog');
    const accepted=number(raw.quantityAccepted,{min:0,max:1000000}),rejected=number(raw.quantityRejected,{min:0,max:1000000});if(accepted+rejected<=0)continue;
    let sourceInvoiceId=null;if(raw.sourceInvoiceId){const invoice=await env.DB.prepare('SELECT id FROM invoices WHERE id=? AND org_id=? AND supplier_id=?').bind(String(raw.sourceInvoiceId),actor.orgId,order.supplier_id).first();sourceInvoiceId=invoice?.id||null}
    statements.push(env.DB.prepare(`INSERT INTO reception_extra_items(id,reception_id,order_id,org_id,product_id,supplier_product_id,source_invoice_id,source_description,quantity_delivered,quantity_accepted,quantity_rejected,unit,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),receptionId,orderId,actor.orgId,productId,relation.id,sourceInvoiceId,optionalText(raw.sourceDescription,{max:500}),accepted+rejected,accepted,rejected,optionalText(raw.unit||relation.order_unit||'UNIDAD',{max:80}),optionalText(raw.notes||'Producto aceptado fuera del pedido original',{max:500}),timestamp));
  }
  const complete=items.length>0&&orderItems.every(item=>Number(item.quantity_received||0)+Number(receivedDelta.get(item.id)||0)>=Number(item.quantity_ordered||0));
  const nextStatus=items.length?(complete?'received':'partially_received'):order.status;
  if(nextStatus!==order.status)statements.push(env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND org_id=?').bind(nextStatus,timestamp,orderId,actor.orgId));
  statements.push(env.DB.prepare('INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),actor.orgId,orderId,actor.userId,order.status,nextStatus,extraItems.length?(items.length?'Recepción registrada con productos extra aceptados':'Recepción de productos extra aceptados'): 'Recepción registrada',timestamp));
  await env.DB.batch(statements);await writeAudit(env,actor,request,'reception.create','reception',receptionId,{orderId,status:nextStatus,orderedItemCount:items.length,extraItemCount:extraItems.length});
  const received=await getOrder(env,actor,orderId),pdfDocument=await archiveOrderPdf(env,actor,received);
  return{id:receptionId,orderId,status:'completed',orderStatus:nextStatus,extraItemCount:extraItems.length,pdfDocument};
}
