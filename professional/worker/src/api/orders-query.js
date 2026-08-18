const rows=result=>result?.results||[];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
const publicState=status=>status==='draft'?'editing':status==='cancelled'?'cancelled':status==='closed'?'closed':['received','reconciled'].includes(status)?'received':'emitted';
const cursorValue=value=>{const [stamp='',id='']=String(value||'').split('~');return stamp&&id?{stamp,id}:null};
const cursorToken=row=>`${String(row.sort_at||row.created_at||'')}~${String(row.id||'')}`;
const placeholders=items=>items.map(()=>'?').join(',');

function allowedLocations(actor){const scope=Array.isArray(actor.locationScope)?actor.locationScope:[];return scope.includes('*')?null:scope.filter(Boolean)}
function addIn(conditions,params,column,values){if(!values?.length)return;conditions.push(`${column} IN (${placeholders(values)})`);params.push(...values)}
function filters(actor,url){
  const conditions=['o.org_id=?'],params=[actor.orgId],scope=allowedLocations(actor),view=String(url.searchParams.get('view')||'active');
  if(scope)addIn(conditions,params,'o.location_id',scope.length?scope:['__none__']);
  if(view==='history')conditions.push("o.status IN ('closed','cancelled')");else if(view==='all'){}else conditions.push("o.status NOT IN ('closed','cancelled')");
  const supplier=String(url.searchParams.get('supplier')||''),location=String(url.searchParams.get('location')||''),center=String(url.searchParams.get('center')||''),status=String(url.searchParams.get('status')||''),invoice=String(url.searchParams.get('invoice')||''),reception=String(url.searchParams.get('reception')||''),brand=String(url.searchParams.get('brand')||''),category=String(url.searchParams.get('category')||''),from=String(url.searchParams.get('from')||''),to=String(url.searchParams.get('to')||''),q=String(url.searchParams.get('q')||'').trim();
  if(supplier){conditions.push('o.supplier_id=?');params.push(supplier)}if(location){conditions.push('o.location_id=?');params.push(location)}if(center){conditions.push('occ.cost_center_id=?');params.push(center)}if(status){conditions.push('o.status=?');params.push(status)}
  if(from){conditions.push("substr(COALESCE(o.emitted_at,o.sent_at,o.created_at),1,10)>=?");params.push(from)}if(to){conditions.push("substr(COALESCE(o.emitted_at,o.sent_at,o.created_at),1,10)<=?");params.push(to)}
  if(invoice==='pending')conditions.push('NOT EXISTS(SELECT 1 FROM invoice_order_links x WHERE x.order_id=o.id)');else if(invoice==='linked')conditions.push('EXISTS(SELECT 1 FROM invoice_order_links x WHERE x.order_id=o.id)');
  if(reception==='pending')conditions.push("NOT EXISTS(SELECT 1 FROM receptions rx WHERE rx.order_id=o.id AND rx.status='completed')");else if(reception==='received')conditions.push("EXISTS(SELECT 1 FROM receptions rx WHERE rx.order_id=o.id AND rx.status='completed')");
  if(brand){conditions.push('EXISTS(SELECT 1 FROM order_items obi JOIN products pb ON pb.id=obi.product_id WHERE obi.order_id=o.id AND pb.brand=? COLLATE NOCASE)');params.push(brand)}
  if(category){conditions.push('EXISTS(SELECT 1 FROM order_items oci JOIN products pc ON pc.id=oci.product_id WHERE oci.order_id=o.id AND pc.category_id=?)');params.push(category)}
  if(q){const like=`%${q}%`;conditions.push('(o.folio LIKE ? COLLATE NOCASE OR fa.legacy_folio LIKE ? COLLATE NOCASE OR s.name LIKE ? COLLATE NOCASE OR l.name LIKE ? COLLATE NOCASE OR cc.name LIKE ? COLLATE NOCASE)');params.push(like,like,like,like,like)}
  const cursor=cursorValue(url.searchParams.get('cursor'));if(cursor){conditions.push('(COALESCE(o.emitted_at,o.sent_at,o.created_at)<? OR (COALESCE(o.emitted_at,o.sent_at,o.created_at)=? AND o.id<?))');params.push(cursor.stamp,cursor.stamp,cursor.id)}
  return{conditions,params,view,scope};
}

async function metadata(env,actor,scope){
  const scoped=scope&&scope.length?scope:['__none__'],locationWhere=scope?` AND id IN (${placeholders(scoped)})`:'',centerWhere=scope?` AND location_id IN (${placeholders(scoped)})`:'';
  const locationParams=[actor.orgId,...(scope?scoped:[])],centerParams=[actor.orgId,...(scope?scoped:[])];
  const[suppliersResult,locationsResult,centersResult,categoriesResult,brandsResult]=await Promise.all([
    env.DB.prepare('SELECT id,name FROM suppliers WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all(),
    env.DB.prepare(`SELECT id,name FROM locations WHERE org_id=? AND active=1${locationWhere} ORDER BY name COLLATE NOCASE`).bind(...locationParams).all(),
    env.DB.prepare(`SELECT id,name FROM cost_centers WHERE org_id=? AND active=1${centerWhere} ORDER BY name COLLATE NOCASE`).bind(...centerParams).all(),
    env.DB.prepare("SELECT id,name FROM categories WHERE org_id=? AND active=1 AND source='user' ORDER BY name COLLATE NOCASE").bind(actor.orgId).all(),
    env.DB.prepare("SELECT DISTINCT brand FROM products WHERE org_id=? AND active=1 AND trim(brand)<>'' ORDER BY brand COLLATE NOCASE").bind(actor.orgId).all()
  ]);
  return{suppliers:rows(suppliersResult),locations:rows(locationsResult),costCenters:rows(centersResult),categories:rows(categoriesResult),brands:rows(brandsResult).map(item=>item.brand)};
}

export async function listOrdersCanonical(env,actor,url){
  const limit=clamp(url.searchParams.get('limit')||60,20,150),{conditions,params,view,scope}=filters(actor,url),result=await env.DB.prepare(`SELECT o.id,o.batch_id,o.folio,o.status,o.delivery_date,o.created_at,o.updated_at,o.sent_at,o.emitted_at,o.gross_total,o.supplier_id,o.location_id,
      occ.cost_center_id AS cost_center_id,s.name AS supplier_name,l.name AS location_name,cc.name AS cost_center_name,u.display_name AS requested_by,
      fa.legacy_folio,COALESCE(o.emitted_at,o.sent_at,o.created_at) AS sort_at,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS item_count,
      (SELECT COUNT(*) FROM invoice_order_links iol WHERE iol.order_id=o.id) AS invoice_count,
      (SELECT COALESCE(SUM(i.gross_total),0) FROM invoice_order_links iol JOIN invoices i ON i.id=iol.invoice_id WHERE iol.order_id=o.id) AS invoiced_total,
      (SELECT COUNT(*) FROM invoice_order_links iol JOIN invoices i ON i.id=iol.invoice_id WHERE iol.order_id=o.id AND (i.payment_status='paid' OR i.status='paid')) AS paid_invoice_count,
      (SELECT COUNT(*) FROM invoice_order_links iol JOIN payment_schedules ps ON ps.invoice_id=iol.invoice_id AND ps.org_id=o.org_id WHERE iol.order_id=o.id AND ps.status!='paid' AND ps.due_date<date('now')) AS overdue_invoice_count,
      (SELECT MAX(r.received_at) FROM receptions r WHERE r.order_id=o.id AND r.status='completed') AS last_received_at,
      (SELECT e.reason FROM order_events e WHERE e.order_id=o.id AND e.to_status='cancelled' ORDER BY e.created_at DESC LIMIT 1) AS terminal_reason
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id AND s.org_id=o.org_id JOIN locations l ON l.id=o.location_id AND l.org_id=o.org_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id AND occ.org_id=o.org_id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id AND cc.org_id=o.org_id
    LEFT JOIN users u ON u.id=o.requested_by
    LEFT JOIN order_folio_aliases fa ON fa.org_id=o.org_id AND fa.order_id=o.id
    WHERE ${conditions.join(' AND ')} ORDER BY sort_at DESC,o.id DESC LIMIT ?`).bind(...params,limit+1).all(),items=rows(result),hasMore=items.length>limit,pageRows=items.slice(0,limit),ids=pageRows.map(item=>item.id),tags=new Map();
  if(ids.length){const tagResult=await env.DB.prepare(`SELECT oi.order_id,p.brand,c.id AS category_id,c.name AS category_name FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE oi.order_id IN (${placeholders(ids)})`).bind(...ids).all();for(const row of rows(tagResult)){if(!tags.has(row.order_id))tags.set(row.order_id,{brands:new Set(),categories:new Map()});const current=tags.get(row.order_id);if(row.brand)current.brands.add(row.brand);if(row.category_id)current.categories.set(row.category_id,row.category_name)}}
  const orders=pageRows.map(row=>{const current=tags.get(row.id)||{brands:new Set(),categories:new Map()},invoiceCount=Number(row.invoice_count||0),paidInvoiceCount=Number(row.paid_invoice_count||0),overdueInvoiceCount=Number(row.overdue_invoice_count||0),terminalReason=String(row.terminal_reason||''),deliveryOutcome=row.status==='cancelled'&&terminalReason.startsWith('Proveedor no presentado')?'not_presented':'';return{id:row.id,batchId:row.batch_id||'',folio:row.folio,legacyFolio:row.legacy_folio||'',status:row.status,publicState:publicState(row.status),deliveryOutcome,terminalReason,deliveryDate:row.delivery_date,createdAt:row.created_at,updatedAt:row.updated_at,sentAt:row.sent_at,emittedAt:row.emitted_at,grossTotal:Number(row.gross_total||0),costCenterId:row.cost_center_id||'',costCenterName:row.cost_center_name||'Sin centro',supplierId:row.supplier_id,supplierName:row.supplier_name,locationId:row.location_id,locationName:row.location_name,requestedBy:row.requested_by||'Usuario',itemCount:Number(row.item_count||0),invoiceCount,invoicedGrossTotal:Number(row.invoiced_total||0),paidInvoiceCount,overdueInvoiceCount,paymentState:invoiceCount&&paidInvoiceCount>=invoiceCount?'paid':overdueInvoiceCount?'overdue':invoiceCount?'pending':'none',lastReceivedAt:row.last_received_at||null,productBrands:[...current.brands],categories:[...current.categories].map(([id,name])=>({id,name}))}});
  const meta=await metadata(env,actor,scope);
  return{orders,meta,page:{view,limit,hasMore,nextCursor:hasMore?cursorToken(pageRows[pageRows.length-1]):''}};
}