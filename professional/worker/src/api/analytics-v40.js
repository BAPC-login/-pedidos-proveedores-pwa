import {nowIso} from '../core.js';

const rows=result=>result?.results||[];
const number=value=>Number(value||0);
const round=(value,digits=0)=>{const factor=10**digits;return Math.round(number(value)*factor)/factor};
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
function median(values){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2}
function deviation(values){if(values.length<2)return 0;const average=mean(values);return Math.sqrt(values.reduce((sum,value)=>sum+(value-average)**2,0)/values.length)}
const dateOnly=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
function startForMonths(months){const date=new Date();date.setUTCDate(1);date.setUTCHours(0,0,0,0);date.setUTCMonth(date.getUTCMonth()-months+1);return date.toISOString().slice(0,10)}
function monthsBetween(from,to){const start=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`),result=[];start.setUTCDate(1);end.setUTCDate(1);for(let cursor=new Date(start);cursor<=end&&result.length<24;cursor.setUTCMonth(cursor.getUTCMonth()+1))result.push(cursor.toISOString().slice(0,7));return result}
function recommendations(analytics){const list=[],m=analytics.metrics;if(!m.invoiceCount)list.push({priority:'high',title:'Faltan facturas',detail:'El gasto real necesita documentos cotejados.'});if(m.pendingRate>=.3)list.push({priority:'high',title:'Pedidos pendientes',detail:`${round(m.pendingRate*100)}% de los pedidos sigue pendiente.`});if(analytics.topSuppliers[0]?.share>=.55)list.push({priority:'medium',title:'Concentración de proveedor',detail:`${analytics.topSuppliers[0].name} representa ${round(analytics.topSuppliers[0].share*100)}% del gasto filtrado.`});if(analytics.dataQuality.productsWithoutPrice)list.push({priority:'medium',title:'Completar precios faltantes',detail:`${analytics.dataQuality.productsWithoutPrice} relaciones producto–proveedor no tienen precio histórico.`});return list.length?list:[{priority:'low',title:'Operación estable',detail:'No se detectaron alertas relevantes para los filtros aplicados.'}]}

export async function getDashboardAnalyticsV40(env,actor,url){
  const months=Math.max(1,Math.min(24,Math.round(number(url.searchParams.get('months'))||6)));
  const today=new Date().toISOString().slice(0,10),fromDate=dateOnly(url.searchParams.get('from'))||startForMonths(months),toDate=dateOnly(url.searchParams.get('to'))||today;
  const locationId=String(url.searchParams.get('locationId')||''),supplierId=String(url.searchParams.get('supplierId')||''),costCenterId=String(url.searchParams.get('costCenterId')||''),categoryId=String(url.searchParams.get('categoryId')||'');

  const orderSql=`SELECT DISTINCT o.id,o.status,COALESCE(o.emitted_at,o.created_at) AS activity_date,o.gross_total,o.location_id,o.supplier_id,s.name AS supplier_name,cc.id AS cost_center_id,cc.name AS cost_center_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id
    WHERE o.org_id=? AND date(COALESCE(o.emitted_at,o.created_at)) BETWEEN date(?) AND date(?)
      AND (?='' OR o.location_id=?) AND (?='' OR o.supplier_id=?) AND (?='' OR occ.cost_center_id=?)
      AND (?='' OR EXISTS(SELECT 1 FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=o.id AND p.category_id=?))
    ORDER BY activity_date`;
  const invoiceSql=`SELECT DISTINCT i.id,i.invoice_date AS activity_date,i.gross_total,i.supplier_id,s.name AS supplier_name
    FROM invoices i JOIN suppliers s ON s.id=i.supplier_id
    WHERE i.org_id=? AND i.status!='void' AND date(i.invoice_date) BETWEEN date(?) AND date(?)
      AND (?='' OR i.supplier_id=?)
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_order_links iol_location JOIN orders o_location ON o_location.id=iol_location.order_id WHERE iol_location.invoice_id=i.id AND o_location.location_id=?))
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_order_links iol JOIN order_cost_centers occ ON occ.order_id=iol.order_id WHERE iol.invoice_id=i.id AND occ.cost_center_id=?))
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_lines il JOIN products p ON p.id=il.product_id WHERE il.invoice_id=i.id AND p.category_id=?))
    ORDER BY i.invoice_date`;
  const categorySql=`SELECT COALESCE(c.name,'Sin categoría') AS name,COALESCE(SUM(il.gross_line_total),0) AS spend
    FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id LEFT JOIN products p ON p.id=il.product_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE i.org_id=? AND i.status!='void' AND date(i.invoice_date) BETWEEN date(?) AND date(?) AND (?='' OR i.supplier_id=?)
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_order_links iol_location JOIN orders o_location ON o_location.id=iol_location.order_id WHERE iol_location.invoice_id=i.id AND o_location.location_id=?))
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_order_links iol JOIN order_cost_centers occ ON occ.order_id=iol.order_id WHERE iol.invoice_id=i.id AND occ.cost_center_id=?))
      AND (?='' OR p.category_id=?) GROUP BY COALESCE(c.name,'Sin categoría') ORDER BY spend DESC LIMIT 12`;
  const centerSql=`SELECT COALESCE(cc.name,'Sin centro') AS name,COALESCE(SUM(i.gross_total),0) AS spend,COUNT(DISTINCT i.id) AS documents
    FROM invoices i JOIN invoice_order_links iol ON iol.invoice_id=i.id JOIN order_cost_centers occ ON occ.order_id=iol.order_id JOIN cost_centers cc ON cc.id=occ.cost_center_id
    WHERE i.org_id=? AND i.status!='void' AND date(i.invoice_date) BETWEEN date(?) AND date(?) AND (?='' OR i.supplier_id=?)
      AND (?='' OR EXISTS(SELECT 1 FROM invoice_order_links iol_location JOIN orders o_location ON o_location.id=iol_location.order_id WHERE iol_location.invoice_id=i.id AND o_location.location_id=?))
      AND (?='' OR cc.id=?) AND (?='' OR EXISTS(SELECT 1 FROM invoice_lines il JOIN products p ON p.id=il.product_id WHERE il.invoice_id=i.id AND p.category_id=?))
    GROUP BY cc.id,cc.name ORDER BY spend DESC LIMIT 12`;

  const [orderResult,invoiceResult,categoryResult,centerResult,priceResult]=await Promise.all([
    env.DB.prepare(orderSql).bind(actor.orgId,fromDate,toDate,locationId,locationId,supplierId,supplierId,costCenterId,costCenterId,categoryId,categoryId).all(),
    env.DB.prepare(invoiceSql).bind(actor.orgId,fromDate,toDate,supplierId,supplierId,locationId,locationId,costCenterId,costCenterId,categoryId,categoryId).all(),
    env.DB.prepare(categorySql).bind(actor.orgId,fromDate,toDate,supplierId,supplierId,locationId,locationId,costCenterId,costCenterId,categoryId,categoryId).all(),
    env.DB.prepare(centerSql).bind(actor.orgId,fromDate,toDate,supplierId,supplierId,locationId,locationId,costCenterId,costCenterId,categoryId,categoryId).all(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM supplier_products WHERE org_id=? AND active=1 AND last_gross_unit_price<=0').bind(actor.orgId).first()
  ]);

  const orders=rows(orderResult),invoices=rows(invoiceResult),invoiceValues=invoices.map(item=>number(item.gross_total)).filter(value=>value>0),orderValues=orders.map(item=>number(item.gross_total)).filter(value=>value>0);
  const pendingStates=new Set(['requested','approved','sent','confirmed','partially_received']),pending=orders.filter(item=>pendingStates.has(item.status)).length,received=orders.filter(item=>['received','reconciled','closed'].includes(item.status)).length,cancelled=orders.filter(item=>item.status==='cancelled').length;
  const statusMap=new Map();for(const order of orders)statusMap.set(order.status,(statusMap.get(order.status)||0)+1);
  const supplierMap=new Map();for(const item of(invoices.length?invoices:orders)){const current=supplierMap.get(item.supplier_id)||{id:item.supplier_id,name:item.supplier_name,spend:0,documents:0};current.spend+=number(item.gross_total);current.documents++;supplierMap.set(item.supplier_id,current)}
  const supplierTotal=[...supplierMap.values()].reduce((sum,item)=>sum+item.spend,0),topSuppliers=[...supplierMap.values()].sort((a,b)=>b.spend-a.spend).slice(0,10).map(item=>({...item,share:supplierTotal?item.spend/supplierTotal:0}));
  const series=monthsBetween(fromDate,toDate),monthMap=new Map(series.map(month=>[month,{month,orders:0,spend:0,estimatedSpend:0}]));for(const order of orders){const month=String(order.activity_date||'').slice(0,7),item=monthMap.get(month);if(item){item.orders++;item.estimatedSpend+=number(order.gross_total)}}for(const invoice of invoices){const item=monthMap.get(String(invoice.activity_date||'').slice(0,7));if(item)item.spend+=number(invoice.gross_total)}
  const spend=invoiceValues.reduce((sum,value)=>sum+value,0),estimatedSpend=orderValues.reduce((sum,value)=>sum+value,0),average=mean(invoiceValues),std=deviation(invoiceValues),monthly=[...monthMap.values()];
  const previous=monthly.at(-2)?.spend||0,current=monthly.at(-1)?.spend||0;
  const analytics={generatedAt:nowIso(),filters:{months,fromDate,toDate,locationId,supplierId,costCenterId,categoryId},metrics:{orders:orders.length,pending,received,cancelled,invoiceCount:invoices.length,spend,estimatedSpend,averageOrder:round(mean(orderValues)),averageInvoice:round(average),pendingRate:orders.length?pending/orders.length:0,cancelledRate:orders.length?cancelled/orders.length:0,completionRate:orders.length?received/orders.length:0,suppliersUsed:supplierMap.size,monthDeltaPct:previous?round((current/previous-1)*100,1):0},descriptive:{count:invoiceValues.length,mean:round(average),median:round(median(invoiceValues)),minimum:invoiceValues.length?Math.min(...invoiceValues):0,maximum:invoiceValues.length?Math.max(...invoiceValues):0,standardDeviation:round(std),coefficientOfVariation:average?round(std/average,3):0},statusBreakdown:[...statusMap].map(([status,total])=>({status,total})),monthly,topSuppliers,categorySpend:rows(categoryResult).map(item=>({category:item.name,spend:number(item.spend)})),costCenterSpend:rows(centerResult).map(item=>({name:item.name,spend:number(item.spend),documents:number(item.documents)})),dataQuality:{productsWithoutPrice:number(priceResult?.total)}};
  analytics.recommendations=recommendations(analytics);return analytics;
}
