import {HttpError,ROLES,assertMinimumRole,monthKey,nowIso,number,optionalText,planFor,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {listDocuments,archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';
import {deliveryDateForSupplier} from '../workflow-rules.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

async function requireContext(env,actor,locationId,costCenterId){
  const [location,center]=await Promise.all([
    env.DB.prepare('SELECT id,name,code FROM locations WHERE id=? AND org_id=? AND active=1').bind(locationId,actor.orgId).first(),
    env.DB.prepare('SELECT id,name,code,location_id FROM cost_centers WHERE id=? AND org_id=? AND active=1').bind(costCenterId,actor.orgId).first()
  ]);
  if(!location||!locationAllowed(actor,location.id))throw new HttpError(404,'Local no encontrado','not_found');
  if(!center||center.location_id!==location.id)throw new HttpError(400,'Centro de costo inválido para este local','invalid_cost_center');
  return {location,center};
}

async function usageValue(env,orgId,metric){const row=await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id=? AND month_key=? AND metric=?').bind(orgId,monthKey(),metric).first();return Number(row?.quantity||0)}

async function allocateFolios(env,actor,location,count,date=new Date()){
  const y=String(date.getUTCFullYear()).slice(-2),m=String(date.getUTCMonth()+1).padStart(2,'0'),d=String(date.getUTCDate()).padStart(2,'0');
  const prefix=String(location.code||'PED').replace(/[^A-Z0-9]/g,'').slice(0,8)||'PED',base=`${prefix}-${y}${m}${d}-`;
  const existing=rows(await env.DB.prepare('SELECT folio FROM orders WHERE org_id=? AND folio LIKE ?').bind(actor.orgId,`${base}%`).all());
  const used=new Set(existing.map(item=>Number(String(item.folio||'').slice(base.length))).filter(Number.isFinite));
  const folios=[];let next=1;
  while(folios.length<count){while(used.has(next))next++;folios.push(`${base}${String(next).padStart(3,'0')}`);used.add(next);next++}
  return folios;
}

async function loadRelations(env,actor,costCenterId,rawItems){
  const ids=[...new Set(rawItems.map(item=>String(item.supplierProductId||'')).filter(Boolean))];
  if(!ids.length)throw new HttpError(400,'La lista no contiene formatos de proveedor','missing_supplier_relation');
  const placeholders=ids.map(()=>'?').join(',');
  const result=await env.DB.prepare(`
    SELECT sp.id,sp.supplier_id,sp.product_id,sp.order_unit,sp.units_per_order_unit,sp.last_gross_unit_price,
      p.name AS product_name,p.active AS product_active,s.name AS supplier_name,s.active AS supplier_active,s.settings_json,
      EXISTS(SELECT 1 FROM product_cost_centers pcc WHERE pcc.org_id=sp.org_id AND pcc.product_id=sp.product_id AND pcc.cost_center_id=?) AS assigned_to_center
    FROM supplier_products sp JOIN products p ON p.id=sp.product_id AND p.org_id=sp.org_id
    JOIN suppliers s ON s.id=sp.supplier_id AND s.org_id=sp.org_id
    WHERE sp.org_id=? AND sp.active=1 AND sp.id IN (${placeholders})
  `).bind(costCenterId,actor.orgId,...ids).all();
  return new Map(rows(result).map(row=>[row.id,row]));
}

function validateItems(rawItems,relations){
  return rawItems.map((raw,index)=>{
    const relation=relations.get(String(raw.supplierProductId||''));
    if(!relation||!relation.product_active||!relation.supplier_active)throw new HttpError(400,`Producto o proveedor inválido en la línea ${index+1}`,'invalid_supplier_relation');
    if(!relation.assigned_to_center)throw new HttpError(400,`${relation.product_name} no pertenece al centro seleccionado`,'product_outside_cost_center');
    const identity=safeJson(relation.settings_json,{}).identity||{};
    return {supplierProductId:relation.id,supplierId:relation.supplier_id,supplierName:relation.supplier_name,supplierLogoKey:String(identity.logoKey||''),productId:relation.product_id,description:relation.product_name,quantity:number(raw.quantity,{min:.001,max:100000}),orderUnit:optionalText(raw.orderUnit||relation.order_unit||'UNIDAD',{max:60}).toUpperCase()||'UNIDAD',unitsPerOrderUnit:number(raw.unitsPerOrderUnit,{min:.001,max:100000,fallback:Number(relation.units_per_order_unit||1)}),expectedGrossUnitPrice:Number(relation.last_gross_unit_price||0),persistFormat:Boolean(raw.persistFormat)};
  });
}

export async function createOrderFileV4(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const key=String(request.headers.get('Idempotency-Key')||'').trim().slice(0,120);
  if(key){const previous=await env.DB.prepare('SELECT response_json FROM idempotency_keys WHERE org_id=? AND idempotency_key=?').bind(actor.orgId,key).first();if(previous?.response_json)return JSON.parse(previous.response_json)}
  const body=await readJson(request),rawItems=Array.isArray(body.items)?body.items:[];
  if(!rawItems.length)throw new HttpError(400,'Ingresa una cantidad en al menos un producto','empty_order_batch');
  if(rawItems.length>1000)throw new HttpError(400,'La lista supera 1.000 productos','too_many_items');
  const {location,center}=await requireContext(env,actor,String(body.locationId||''),String(body.costCenterId||''));
  const items=validateItems(rawItems,await loadRelations(env,actor,center.id,rawItems));
  const groups=new Map();
  for(const item of items){if(!groups.has(item.supplierId))groups.set(item.supplierId,{supplierId:item.supplierId,supplierName:item.supplierName,supplierLogoKey:item.supplierLogoKey,items:[]});groups.get(item.supplierId).items.push(item)}
  const limits=planFor(actor.organization.plan),used=await usageValue(env,actor.orgId,'orders_created');
  if(used+groups.size>limits.ordersPerMonth)throw new HttpError(402,`El archivo crearía ${groups.size} pedidos y supera el límite mensual`,'plan_limit');
  const date=new Date(),folios=await allocateFolios(env,actor,location,groups.size,date),batchId=uuid(),timestamp=nowIso(),statements=[],summaries=[];
  let groupIndex=0;
  for(const group of groups.values()){
    const orderId=uuid(),folio=folios[groupIndex++],deliveryDate=deliveryDateForSupplier(body,group.supplierId);
    const grossTotal=group.items.reduce((sum,item)=>sum+Math.round(item.quantity*item.unitsPerOrderUnit*item.expectedGrossUnitPrice),0);
    summaries.push({id:orderId,batchId,folio,status:'draft',publicState:'editing',supplierId:group.supplierId,supplierName:group.supplierName,supplierLogoKey:group.supplierLogoKey,itemCount:group.items.length,locationId:location.id,costCenterId:center.id,deliveryDate,pdfPending:true});
    statements.push(env.DB.prepare(`INSERT INTO orders(id,org_id,location_id,supplier_id,folio,status,requested_by,delivery_date,notes,currency,gross_total,revision,batch_id,created_at,updated_at) VALUES(?,?,?,?,?,'draft',?,?,?,'CLP',?,1,?,?,?)`).bind(orderId,actor.orgId,location.id,group.supplierId,folio,actor.userId,deliveryDate,optionalText(body.notes,{max:2000}),grossTotal,batchId,timestamp,timestamp));
    statements.push(env.DB.prepare(`INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?, '', 'draft','Archivo guardado para edición',?)`).bind(uuid(),actor.orgId,orderId,actor.userId,timestamp));
    statements.push(env.DB.prepare('INSERT INTO order_cost_centers(order_id,org_id,cost_center_id,created_at) VALUES(?,?,?,?)').bind(orderId,actor.orgId,center.id,timestamp));
    group.items.forEach((item,sortOrder)=>{
      statements.push(env.DB.prepare(`INSERT INTO order_items(id,order_id,supplier_product_id,product_id,description_snapshot,quantity_ordered,order_unit_snapshot,units_per_order_unit,expected_gross_unit_price,expected_gross_total,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),orderId,item.supplierProductId,item.productId,item.description,item.quantity,item.orderUnit,item.unitsPerOrderUnit,item.expectedGrossUnitPrice,Math.round(item.quantity*item.unitsPerOrderUnit*item.expectedGrossUnitPrice),sortOrder,timestamp,timestamp));
      if(item.persistFormat)statements.push(env.DB.prepare('UPDATE supplier_products SET order_unit=?,units_per_order_unit=?,updated_at=? WHERE id=? AND org_id=?').bind(item.orderUnit,item.unitsPerOrderUnit,timestamp,item.supplierProductId,actor.orgId));
    });
  }
  statements.push(env.DB.prepare(`INSERT INTO usage_counters(org_id,month_key,metric,quantity,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(org_id,month_key,metric) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=excluded.updated_at`).bind(actor.orgId,monthKey(),'orders_created',summaries.length,timestamp));
  const response={batchId,status:'draft',publicState:'editing',supplierCount:summaries.length,itemCount:items.length,orders:summaries};
  if(key)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO idempotency_keys(org_id,idempotency_key,request_hash,status_code,response_json,created_at) VALUES(?,?,'',200,?,?)`).bind(actor.orgId,key,JSON.stringify(response),timestamp));
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'order_file.create','order_batch',batchId,{locationId:location.id,costCenterId:center.id,orders:summaries.map(order=>order.id),deliveryDates:summaries.map(order=>[order.supplierId,order.deliveryDate])});
  return response;
}

export async function ensureOrderPdfV4(request,env,actor,orderId){
  const existing=await listDocuments(env,actor,{entityType:'order',entityId:orderId,kind:'order_pdf'});
  const order=await getOrder(env,actor,orderId);
  const latest=existing.sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0];
  if(latest&&Number(latest.revision||0)>=Number(order.revision||0))return latest;
  return archiveOrderPdf(env,actor,order);
}
