import {
  HttpError,
  ROLES,
  assertMinimumRole,
  monthKey,
  nowIso,
  number,
  optionalText,
  planFor,
  readJson,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf,listDocuments} from '../storage.js';
import {getOrder} from './orders.js';

function rows(result){return result?.results||[]}
function locationAllowed(actor,locationId){return actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId)}

async function requireContext(env,actor,locationId,costCenterId){
  const [location,center]=await Promise.all([
    env.DB.prepare('SELECT id,name,code FROM locations WHERE id=? AND org_id=? AND active=1').bind(locationId,actor.orgId).first(),
    env.DB.prepare('SELECT id,name,code,location_id FROM cost_centers WHERE id=? AND org_id=? AND active=1').bind(costCenterId,actor.orgId).first()
  ]);
  if(!location||!locationAllowed(actor,location.id))throw new HttpError(404,'Local no encontrado','not_found');
  if(!center||center.location_id!==location.id)throw new HttpError(400,'Centro de costo inválido para este local','invalid_cost_center');
  return {location,center};
}

async function usageValue(env,orgId,metric){
  const row=await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id=? AND month_key=? AND metric=?').bind(orgId,monthKey(),metric).first();
  return Number(row?.quantity||0);
}

function foliosFromLast(location,lastFolio,count,date=new Date()){
  const y=String(date.getUTCFullYear()).slice(-2),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0');
  const prefix=String(location.code||'PED').replace(/[^A-Z0-9]/g,'').slice(0,8)||'PED';
  const base=`${prefix}-${y}${m}${d}-`;
  const first=lastFolio?.startsWith(base)?Number(lastFolio.slice(base.length))+1:1;
  return Array.from({length:count},(_,index)=>`${base}${String(first+index).padStart(3,'0')}`);
}

async function loadRelations(env,actor,costCenterId,rawItems){
  const ids=[...new Set(rawItems.map(item=>String(item.supplierProductId||'')).filter(Boolean))];
  if(!ids.length)throw new HttpError(400,'La lista no contiene formatos de proveedor','missing_supplier_relation');
  const placeholders=ids.map(()=>'?').join(',');
  const result=await env.DB.prepare(`
    SELECT sp.id,sp.supplier_id,sp.product_id,sp.order_unit,sp.units_per_order_unit,sp.last_gross_unit_price,
      p.name AS product_name,p.active AS product_active,s.name AS supplier_name,s.active AS supplier_active,
      EXISTS(SELECT 1 FROM product_cost_centers pcc WHERE pcc.org_id=sp.org_id AND pcc.product_id=sp.product_id AND pcc.cost_center_id=?) AS assigned_to_center
    FROM supplier_products sp
    JOIN products p ON p.id=sp.product_id AND p.org_id=sp.org_id
    JOIN suppliers s ON s.id=sp.supplier_id AND s.org_id=sp.org_id
    WHERE sp.org_id=? AND sp.active=1 AND sp.id IN (${placeholders})
  `).bind(costCenterId,actor.orgId,...ids).all();
  return new Map(rows(result).map(row=>[row.id,row]));
}

function validateItems(rawItems,relationMap){
  return rawItems.map((raw,index)=>{
    const relation=relationMap.get(String(raw.supplierProductId||''));
    if(!relation||!relation.product_active||!relation.supplier_active)throw new HttpError(400,`Producto o proveedor inválido en la línea ${index+1}`,'invalid_supplier_relation');
    if(!relation.assigned_to_center)throw new HttpError(400,`${relation.product_name} no pertenece al centro seleccionado`,'product_outside_cost_center');
    if(raw.productId&&String(raw.productId)!==String(relation.product_id))throw new HttpError(400,`Relación de producto inválida en la línea ${index+1}`,'invalid_product_relation');
    return {
      supplierProductId:relation.id,
      supplierId:relation.supplier_id,
      supplierName:relation.supplier_name,
      productId:relation.product_id,
      description:relation.product_name,
      quantity:number(raw.quantity,{min:.001,max:100000}),
      orderUnit:optionalText(raw.orderUnit||relation.order_unit||'UNIDAD',{max:60}).toUpperCase()||'UNIDAD',
      unitsPerOrderUnit:number(raw.unitsPerOrderUnit,{min:.001,max:100000,fallback:Number(relation.units_per_order_unit||1)}),
      expectedGrossUnitPrice:Number(relation.last_gross_unit_price||0),
      persistFormat:Boolean(raw.persistFormat)
    };
  });
}

export async function createOrderBatchV3(request,env,actor,ctx){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const idempotencyKey=String(request.headers.get('Idempotency-Key')||'').trim().slice(0,120);
  if(idempotencyKey){
    const previous=await env.DB.prepare('SELECT response_json FROM idempotency_keys WHERE org_id=? AND idempotency_key=?').bind(actor.orgId,idempotencyKey).first();
    if(previous?.response_json)return JSON.parse(previous.response_json);
  }
  const body=await readJson(request);
  const locationId=String(body.locationId||''),costCenterId=String(body.costCenterId||'');
  const rawItems=Array.isArray(body.items)?body.items:[];
  if(!rawItems.length)throw new HttpError(400,'Ingresa una cantidad en al menos un producto','empty_order_batch');
  if(rawItems.length>1000)throw new HttpError(400,'La lista supera 1.000 productos','too_many_items');
  const {location,center}=await requireContext(env,actor,locationId,costCenterId);
  const items=validateItems(rawItems,await loadRelations(env,actor,center.id,rawItems));
  const groups=new Map();
  for(const item of items){
    if(!groups.has(item.supplierId))groups.set(item.supplierId,{supplierId:item.supplierId,supplierName:item.supplierName,items:[]});
    groups.get(item.supplierId).items.push(item);
  }
  const limits=planFor(actor.organization.plan),used=await usageValue(env,actor.orgId,'orders_created');
  if(used+groups.size>limits.ordersPerMonth)throw new HttpError(402,`La operación crearía ${groups.size} pedidos y supera el límite mensual`,'plan_limit');

  const date=new Date();
  const y=String(date.getUTCFullYear()).slice(-2),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0');
  const prefix=String(location.code||'PED').replace(/[^A-Z0-9]/g,'').slice(0,8)||'PED',base=`${prefix}-${y}${m}${d}-`;
  const current=await env.DB.prepare('SELECT folio FROM orders WHERE org_id=? AND folio LIKE ? ORDER BY folio DESC LIMIT 1').bind(actor.orgId,`${base}%`).first();
  const folios=foliosFromLast(location,current?.folio||'',groups.size,date);
  const timestamp=nowIso(),status=body.saveAsDraft?'draft':'requested',batchId=uuid(),statements=[],summaries=[];
  const deliveryDates=body.deliveryDates&&typeof body.deliveryDates==='object'?body.deliveryDates:{};
  let groupIndex=0;
  for(const group of groups.values()){
    const orderId=uuid(),folio=folios[groupIndex++],deliveryDate=String(deliveryDates[group.supplierId]||body.deliveryDate||'').slice(0,10)||null;
    const grossTotal=group.items.reduce((sum,item)=>sum+Math.round(item.quantity*item.unitsPerOrderUnit*item.expectedGrossUnitPrice),0);
    summaries.push({id:orderId,folio,status,supplierId:group.supplierId,supplierName:group.supplierName,itemCount:group.items.length,locationId:location.id,costCenterId:center.id,deliveryDate,pdfPending:true});
    statements.push(env.DB.prepare(`INSERT INTO orders(id,org_id,location_id,supplier_id,folio,status,requested_by,delivery_date,notes,currency,gross_total,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'CLP',?,1,?,?)`).bind(orderId,actor.orgId,location.id,group.supplierId,folio,status,actor.userId,deliveryDate,optionalText(body.notes,{max:2000}),grossTotal,timestamp,timestamp));
    statements.push(env.DB.prepare(`INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?, '',?,?,?)`).bind(uuid(),actor.orgId,orderId,actor.userId,status,status==='requested'?'Pedido emitido desde lista maestra':'Borrador creado desde lista maestra',timestamp));
    statements.push(env.DB.prepare('INSERT INTO order_cost_centers(order_id,org_id,cost_center_id,created_at) VALUES(?,?,?,?)').bind(orderId,actor.orgId,center.id,timestamp));
    group.items.forEach((item,sortOrder)=>{
      statements.push(env.DB.prepare(`INSERT INTO order_items(id,order_id,supplier_product_id,product_id,description_snapshot,quantity_ordered,order_unit_snapshot,units_per_order_unit,expected_gross_unit_price,expected_gross_total,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),orderId,item.supplierProductId,item.productId,item.description,item.quantity,item.orderUnit,item.unitsPerOrderUnit,item.expectedGrossUnitPrice,Math.round(item.quantity*item.unitsPerOrderUnit*item.expectedGrossUnitPrice),sortOrder,timestamp,timestamp));
      if(item.persistFormat)statements.push(env.DB.prepare('UPDATE supplier_products SET order_unit=?,units_per_order_unit=?,updated_at=? WHERE id=? AND org_id=?').bind(item.orderUnit,item.unitsPerOrderUnit,timestamp,item.supplierProductId,actor.orgId));
    });
  }
  statements.push(env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).bind(actor.orgId,monthKey(),'orders_created',summaries.length,timestamp));
  const response={batchId,status,supplierCount:summaries.length,itemCount:items.length,orders:summaries};
  if(idempotencyKey)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO idempotency_keys(org_id,idempotency_key,request_hash,status_code,response_json,created_at) VALUES(?,?,'',200,?,?)`).bind(actor.orgId,idempotencyKey,JSON.stringify(response),timestamp));
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'order.batch_v3_create','order_batch',batchId,{locationId:location.id,costCenterId:center.id,orders:summaries.map(order=>order.id),status,individualDeliveryDates:Object.keys(deliveryDates).length});
  const pdfTask=Promise.allSettled(summaries.map(async summary=>archiveOrderPdf(env,actor,await getOrder(env,actor,summary.id))));
  if(ctx?.waitUntil)ctx.waitUntil(pdfTask);else await pdfTask;
  return response;
}

export async function ensureOrderPdfV3(request,env,actor,orderId){
  const existing=await listDocuments(env,actor,{entityType:'order',entityId:orderId,kind:'order_pdf'});
  if(existing.length)return existing.sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0];
  return archiveOrderPdf(env,actor,await getOrder(env,actor,orderId));
}

export async function listOrderInvoicesV3(env,actor,orderId){
  const order=await env.DB.prepare('SELECT id,location_id FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order||!locationAllowed(actor,order.location_id))throw new HttpError(404,'Pedido no encontrado','not_found');
  const result=await env.DB.prepare(`SELECT i.id,i.invoice_number,i.document_type,i.invoice_date,i.status,i.gross_total,i.net_total,i.tax_total,i.created_at,f.storage_key AS pdf_key,f.file_name AS pdf_name FROM invoice_order_links l JOIN invoices i ON i.id=l.invoice_id AND i.org_id=l.org_id LEFT JOIN files f ON f.id=i.pdf_file_id WHERE l.org_id=? AND l.order_id=? ORDER BY i.invoice_date DESC,i.created_at DESC`).bind(actor.orgId,orderId).all();
  return rows(result).map(invoice=>({id:invoice.id,invoiceNumber:invoice.invoice_number,documentType:invoice.document_type,invoiceDate:invoice.invoice_date,status:invoice.status,grossTotal:Number(invoice.gross_total||0),netTotal:Number(invoice.net_total||0),taxTotal:Number(invoice.tax_total||0),pdfKey:invoice.pdf_key||'',pdfName:invoice.pdf_name||'',createdAt:invoice.created_at}));
}
