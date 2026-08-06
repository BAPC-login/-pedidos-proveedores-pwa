import {nowIso} from '../core.js';
import {ensureEnterpriseSchemaV41} from './schema-v41.js';

const rows=result=>result?.results||[];
const num=value=>Number(value||0);
const day=value=>String(value||'').slice(0,10);
const month=value=>String(value||'').slice(0,7);
const round=(value,digits=0)=>{const factor=10**digits;return Math.round(num(value)*factor)/factor};
function dateRange(url){const months=Math.max(1,Math.min(24,Number(url.searchParams.get('months')||6))),to=url.searchParams.get('to')||new Date().toISOString().slice(0,10),date=new Date(`${to}T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-months+1);date.setUTCDate(1);return{months,from:url.searchParams.get('from')||date.toISOString().slice(0,10),to}}
function filters(url){const range=dateRange(url);return{...range,locationId:String(url.searchParams.get('locationId')||''),costCenterId:String(url.searchParams.get('costCenterId')||''),supplierId:String(url.searchParams.get('supplierId')||''),categoryId:String(url.searchParams.get('categoryId')||'')}}
function series(from,to){const output=[],cursor=new Date(`${from.slice(0,7)}-01T12:00:00Z`),end=new Date(`${to.slice(0,7)}-01T12:00:00Z`);while(cursor<=end){output.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1)}return output}
function top(map,key='spend'){const total=[...map.values()].reduce((sum,item)=>sum+num(item[key]),0);return[...map.values()].sort((a,b)=>num(b[key])-num(a[key])).slice(0,12).map(item=>({...item,share:total?num(item[key])/total:0}))}

export async function getDashboardAnalyticsV41(env,actor,url){
  await ensureEnterpriseSchemaV41(env);
  const f=filters(url),scope=actor.locationScope?.includes?.('*')?null:actor.locationScope||[];
  const receptionResult=await env.DB.prepare(`
    SELECT r.id reception_id,r.order_id,substr(r.received_at,1,10) received_date,r.historical_entry,
      o.folio,o.status,o.location_id,o.supplier_id,o.gross_total,o.delivery_date,o.promised_date,
      s.name supplier_name,l.name location_name,cc.id cost_center_id,cc.name cost_center_name,
      ri.order_item_id,ri.quantity_accepted,ri.quantity_rejected,oi.product_id,oi.quantity_ordered,
      oi.expected_gross_unit_price,oi.units_per_order_unit,p.category_id,COALESCE(c.name,'Sin categoría') category_name
    FROM receptions r
    JOIN orders o ON o.id=r.order_id
    JOIN suppliers s ON s.id=o.supplier_id
    JOIN locations l ON l.id=o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id
    JOIN reception_items ri ON ri.reception_id=r.id
    JOIN order_items oi ON oi.id=ri.order_item_id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN categories c ON c.id=p.category_id
    WHERE r.org_id=? AND r.status='completed' AND date(r.received_at) BETWEEN date(?) AND date(?)
      AND (?='' OR o.location_id=?) AND (?='' OR occ.cost_center_id=?)
      AND (?='' OR o.supplier_id=?) AND (?='' OR p.category_id=?)
    ORDER BY r.received_at
  `).bind(actor.orgId,f.from,f.to,f.locationId,f.locationId,f.costCenterId,f.costCenterId,f.supplierId,f.supplierId,f.categoryId,f.categoryId).all();
  const receptions=rows(receptionResult).filter(item=>!scope||scope.includes(item.location_id));
  const receptionIds=[...new Set(receptions.map(item=>item.reception_id))],orderIds=[...new Set(receptions.map(item=>item.order_id))];
  let invoices=[];
  if(orderIds.length){const placeholders=orderIds.map(()=>'?').join(',');invoices=rows(await env.DB.prepare(`SELECT DISTINCT i.id,i.invoice_number,i.invoice_date,i.reporting_date,i.gross_total,i.document_type,i.payment_status,i.due_date,i.supplier_id,l.order_id FROM invoices i JOIN invoice_order_links l ON l.invoice_id=i.id WHERE i.org_id=? AND i.status!='void' AND l.order_id IN (${placeholders})`).bind(actor.orgId,...orderIds).all())}
  const invoiceByOrder=new Map();for(const invoice of invoices){if(!invoiceByOrder.has(invoice.order_id))invoiceByOrder.set(invoice.order_id,[]);invoiceByOrder.get(invoice.order_id).push(invoice)}
  const orderAccepted=new Map();for(const line of receptions)orderAccepted.set(line.order_id,(orderAccepted.get(line.order_id)||0)+num(line.quantity_accepted)*Math.max(1,num(line.units_per_order_unit)));
  const monthly=new Map(series(f.from,f.to).map(key=>[key,{month:key,spend:0,estimatedSpend:0,receptions:0,orders:new Set(),rejected:0}]));
  const supplierMap=new Map(),categoryMap=new Map(),centerMap=new Map(),locationMap=new Map(),documents=new Map();let spend=0,estimatedSpend=0,rejected=0,historical=0;
  for(const line of receptions){const key=month(line.received_date),bucket=monthly.get(key);if(bucket){bucket.orders.add(line.order_id);bucket.receptions+=1;bucket.rejected+=num(line.quantity_rejected)}const unitEstimate=num(line.expected_gross_unit_price)*Math.max(1,num(line.units_per_order_unit)),lineEstimate=num(line.quantity_accepted)*unitEstimate;estimatedSpend+=lineEstimate;if(bucket)bucket.estimatedSpend+=lineEstimate;rejected+=num(line.quantity_rejected);if(line.historical_entry)historical++;
    const linked=invoiceByOrder.get(line.order_id)||[],acceptedTotal=Math.max(1,orderAccepted.get(line.order_id)||1),invoiceAmount=linked.reduce((sum,item)=>sum+(String(item.document_type)==='61'?-1:1)*num(item.gross_total),0),allocated=invoiceAmount*(num(line.quantity_accepted)*Math.max(1,num(line.units_per_order_unit))/acceptedTotal);spend+=allocated;if(bucket)bucket.spend+=allocated;
    for(const [map,id,name] of [[supplierMap,line.supplier_id,line.supplier_name],[categoryMap,line.category_id||'none',line.category_name],[centerMap,line.cost_center_id||'none',line.cost_center_name||'Sin centro'],[locationMap,line.location_id,line.location_name]]){const item=map.get(id)||{id,name,spend:0,estimatedSpend:0,receptions:new Set(),orders:new Set(),orderIds:[],invoiceIds:[]};item.spend+=allocated;item.estimatedSpend+=lineEstimate;item.receptions.add(line.reception_id);item.orders.add(line.order_id);if(!item.orderIds.includes(line.order_id))item.orderIds.push(line.order_id);for(const invoice of linked)if(!item.invoiceIds.includes(invoice.id))item.invoiceIds.push(invoice.id);map.set(id,item)}
  }
  for(const invoice of invoices)documents.set(invoice.id,invoice);
  const paymentResult=await env.DB.prepare(`SELECT status,COUNT(*) total,COALESCE(SUM(amount),0) amount FROM payment_schedules WHERE org_id=? AND date(due_date) BETWEEN date(?) AND date(?) GROUP BY status`).bind(actor.orgId,f.from,f.to).all(),payments=rows(paymentResult).map(item=>({status:item.status,total:num(item.total),amount:num(item.amount)})),overdue=await env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(amount),0) amount FROM payment_schedules WHERE org_id=? AND status='pending' AND due_date<date('now')").bind(actor.orgId).first(),approvals=await env.DB.prepare("SELECT COUNT(*) total FROM order_approvals WHERE org_id=? AND status='pending'").bind(actor.orgId).first(),issues=await env.DB.prepare("SELECT COUNT(*) total FROM reconciliation_issues WHERE org_id=? AND status='open'").bind(actor.orgId).first();
  const statusMap=new Map();for(const orderId of orderIds){const line=receptions.find(item=>item.order_id===orderId),status=line?.status||'received';statusMap.set(status,(statusMap.get(status)||0)+1)}
  const budgetResult=await env.DB.prepare(`SELECT b.cost_center_id,cc.name,b.amount,b.warning_pct,b.hard_limit,COALESCE(SUM(CASE WHEN date(r.received_at) BETWEEN date(?) AND date(?) THEN ri.quantity_accepted*oi.units_per_order_unit*oi.expected_gross_unit_price ELSE 0 END),0) actual FROM cost_center_budgets b JOIN cost_centers cc ON cc.id=b.cost_center_id LEFT JOIN order_cost_centers occ ON occ.cost_center_id=b.cost_center_id LEFT JOIN receptions r ON r.order_id=occ.order_id LEFT JOIN reception_items ri ON ri.reception_id=r.id LEFT JOIN order_items oi ON oi.id=ri.order_item_id WHERE b.org_id=? AND b.month_key BETWEEN substr(?,1,7) AND substr(?,1,7) GROUP BY b.cost_center_id,b.month_key ORDER BY cc.name`).bind(f.from,f.to,actor.orgId,f.from,f.to).all();
  const cash=rows(await env.DB.prepare(`SELECT due_date,COALESCE(SUM(amount),0) amount FROM payment_schedules WHERE org_id=? AND status IN ('pending','scheduled') AND date(due_date) BETWEEN date(?) AND date(?) GROUP BY due_date ORDER BY due_date`).bind(actor.orgId,f.from,f.to).all()).map(item=>({date:item.due_date,amount:num(item.amount)}));
  const monthlyList=[...monthly.values()].map(item=>({month:item.month,spend:round(item.spend),estimatedSpend:round(item.estimatedSpend),orders:item.orders.size,receptions:item.receptions,rejected:round(item.rejected,2)}));
  const previousEnd=new Date(`${f.from}T12:00:00Z`);previousEnd.setUTCDate(previousEnd.getUTCDate()-1);const previousStart=new Date(previousEnd);previousStart.setUTCDate(previousStart.getUTCDate()-(new Date(`${f.to}T12:00:00Z`)-new Date(`${f.from}T12:00:00Z`))/86400000);const previous=await env.DB.prepare(`SELECT COALESCE(SUM(ri.quantity_accepted*oi.units_per_order_unit*oi.expected_gross_unit_price),0) estimated FROM receptions r JOIN reception_items ri ON ri.reception_id=r.id JOIN order_items oi ON oi.id=ri.order_item_id WHERE r.org_id=? AND r.status='completed' AND date(r.received_at) BETWEEN date(?) AND date(?)`).bind(actor.orgId,previousStart.toISOString().slice(0,10),previousEnd.toISOString().slice(0,10)).first();
  const estimatedPrevious=num(previous?.estimated),variation=estimatedPrevious?(estimatedSpend/estimatedPrevious-1):0;
  return{generatedAt:nowIso(),periodBasis:'reception_date',filters:f,metrics:{spend:round(spend),estimatedSpend:round(estimatedSpend),orders:orderIds.length,receptions:receptionIds.length,invoices:documents.size,suppliers:supplierMap.size,rejectedQuantity:round(rejected,2),historicalEntries:historical,pendingApprovals:num(approvals?.total),openIssues:num(issues?.total),overduePayments:num(overdue?.total),overdueAmount:num(overdue?.amount),variationVsPrevious:round(variation,3)},monthly:monthlyList,statusBreakdown:[...statusMap].map(([status,total])=>({status,total})),topSuppliers:top(supplierMap),categorySpend:top(categoryMap),costCenterSpend:top(centerMap),locationSpend:top(locationMap),payments,cashForecast:cash,budgets:rows(budgetResult).map(item=>({costCenterId:item.cost_center_id,costCenterName:item.name,amount:num(item.amount),actual:num(item.actual),usagePct:num(item.amount)?num(item.actual)/num(item.amount):0,warningPct:num(item.warning_pct),hardLimit:Boolean(item.hard_limit)})),documents:[...documents.values()],definitions:{period:'La fecha de recepción define el período de informes y gráficos.',actualSpend:'Monto de facturas vinculado y distribuido según lo recibido.',estimatedSpend:'Cantidad recibida valorizada al precio esperado cuando falta factura.',paymentDue:'Vencimiento calculado desde la condición de pago del proveedor.'}}
}
