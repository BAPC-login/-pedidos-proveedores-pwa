import {nowIso,uuid} from '../core.js';
const rows=result=>result?.results||[];
const EPS=.0001;
export async function autoReconcileOrder(env,actor,orderId){
  const order=await env.DB.prepare('SELECT id,folio,status FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order)return{ready:false,matched:false,reason:'not_found',issues:[]};
  if(['draft','cancelled','closed'].includes(order.status))return{ready:false,matched:order.status==='closed',reason:'terminal',issues:[]};
  const invoiceRow=await env.DB.prepare('SELECT COUNT(*) total FROM invoice_order_links WHERE org_id=? AND order_id=?').bind(actor.orgId,orderId).first();
  if(!Number(invoiceRow?.total||0))return{ready:false,matched:false,reason:'invoice_pending',issues:[]};
  const items=rows(await env.DB.prepare('SELECT id,product_id,description_snapshot,quantity_ordered,quantity_received,units_per_order_unit FROM order_items WHERE order_id=? ORDER BY sort_order').bind(orderId).all());
  if(!items.length)return{ready:false,matched:false,reason:'empty_order',issues:[]};
  const lines=rows(await env.DB.prepare(`SELECT il.product_id,SUM(il.total_units) invoiced_units,COUNT(*) line_count FROM invoice_order_links iol JOIN invoice_lines il ON il.invoice_id=iol.invoice_id WHERE iol.org_id=? AND iol.order_id=? GROUP BY il.product_id`).bind(actor.orgId,orderId).all());
  const lineMap=new Map(lines.filter(item=>item.product_id).map(item=>[item.product_id,Number(item.invoiced_units||0)])),unmatched=Number(lines.find(item=>!item.product_id)?.line_count||0),issues=[];
  for(const item of items){const ordered=Number(item.quantity_ordered||0),received=Number(item.quantity_received||0),orderedUnits=ordered*Number(item.units_per_order_unit||1),invoicedUnits=Number(lineMap.get(item.product_id)||0);if(received+EPS<ordered)issues.push({type:'reception_short',productId:item.product_id,product:item.description_snapshot,expected:ordered,actual:received});else if(received>ordered+EPS)issues.push({type:'reception_over',productId:item.product_id,product:item.description_snapshot,expected:ordered,actual:received});if(invoicedUnits+EPS<orderedUnits)issues.push({type:invoicedUnits?'invoice_short':'not_invoiced',productId:item.product_id,product:item.description_snapshot,expected:orderedUnits,actual:invoicedUnits});else if(invoicedUnits>orderedUnits+EPS)issues.push({type:'invoice_over',productId:item.product_id,product:item.description_snapshot,expected:orderedUnits,actual:invoicedUnits})}
  if(unmatched)issues.push({type:'unmatched_invoice_lines',count:unmatched});
  if(issues.length)return{ready:true,matched:false,reason:'differences',issues};
  if(order.status!=='reconciled'){const stamp=nowIso();await env.DB.batch([env.DB.prepare("UPDATE orders SET status='reconciled',revision=revision+1,internal_revision=internal_revision+1,updated_at=? WHERE id=? AND org_id=? AND status NOT IN ('draft','cancelled','closed','reconciled')").bind(stamp,orderId,actor.orgId),env.DB.prepare("INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?,?,'reconciled','Validación automática de pedido, recepción y factura',?)").bind(uuid(),actor.orgId,orderId,actor.userId,order.status,stamp)])}
  return{ready:true,matched:true,reason:'automatic_match',issues:[]};
}
