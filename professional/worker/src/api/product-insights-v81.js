import {HttpError,ROLES,assertMinimumRole,nowIso,number,optionalText,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
const num=value=>Number(value||0);
const cleanPrice=value=>Math.max(0,Math.round(num(value)));

async function productRecord(env,actor,productId){
  const product=await env.DB.prepare(`SELECT p.id,p.name,p.brand,p.variant,p.base_unit,p.content_value,p.content_unit,p.active,c.name category_name
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.org_id=?`).bind(productId,actor.orgId).first();
  if(!product)throw new HttpError(404,'Producto no encontrado','not_found');
  return product;
}

async function invoiceEvidence(env,actor,productId,supplierId,relationId=''){
  return env.DB.prepare(`SELECT COUNT(DISTINCT i.id) invoice_count,MAX(i.invoice_date) last_invoice_date
    FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
    WHERE i.org_id=? AND i.status!='void' AND i.supplier_id=?
      AND (il.product_id=? OR (?<>'' AND il.supplier_product_id=?))`).bind(actor.orgId,supplierId,productId,relationId,relationId).first();
}

async function latestInvoicePrice(env,actor,productId,supplierId,relationId=''){
  return env.DB.prepare(`SELECT il.gross_unit_price,i.invoice_date,i.invoice_number
    FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
    WHERE i.org_id=? AND i.status!='void' AND i.supplier_id=?
      AND (il.product_id=? OR (?<>'' AND il.supplier_product_id=?)) AND il.gross_unit_price>0
    ORDER BY date(i.invoice_date) DESC,il.updated_at DESC LIMIT 1`).bind(actor.orgId,supplierId,productId,relationId,relationId).first();
}

export async function getProductInsightsV81(env,actor,url,productId){
  const product=await productRecord(env,actor,productId),months=Math.max(3,Math.min(24,Math.round(num(url.searchParams.get('months'))||12)));
  const relations=rows(await env.DB.prepare(`SELECT sp.id,sp.supplier_id,sp.supplier_sku,sp.order_unit,sp.units_per_order_unit,sp.last_gross_unit_price,s.name supplier_name
    FROM supplier_products sp JOIN suppliers s ON s.id=sp.supplier_id AND s.org_id=sp.org_id
    WHERE sp.org_id=? AND sp.product_id=? AND sp.active=1 ORDER BY s.name COLLATE NOCASE`).bind(actor.orgId,productId).all());
  const suppliers=[];
  for(const relation of relations){
    const evidence=await invoiceEvidence(env,actor,productId,relation.supplier_id,relation.id),latest=await latestInvoicePrice(env,actor,productId,relation.supplier_id,relation.id),invoiceCount=num(evidence?.invoice_count),invoicePrice=cleanPrice(latest?.gross_unit_price),stored=cleanPrice(relation.last_gross_unit_price),effective=invoicePrice||stored;
    suppliers.push({relationId:relation.id,supplierId:relation.supplier_id,supplierName:relation.supplier_name,supplierSku:relation.supplier_sku,orderUnit:relation.order_unit,unitsPerOrderUnit:num(relation.units_per_order_unit)||1,lastGrossUnitPrice:effective,storedLastGrossUnitPrice:stored,invoiceCount,lastInvoiceDate:evidence?.last_invoice_date||null,lastInvoiceNumber:latest?.invoice_number||'',manualPriceAllowed:invoiceCount===0,priceSource:invoiceCount>0?'invoice':stored>0?'manual':'none'});
  }
  const monthly=rows(await env.DB.prepare(`SELECT substr(i.invoice_date,1,7) month,
      COALESCE(SUM(CASE WHEN COALESCE(il.total_units,0)>0 THEN il.total_units ELSE COALESCE(il.package_quantity,0)*COALESCE(il.units_per_package,1) END),0) units,
      COALESCE(SUM(il.gross_line_total),0) spend,COUNT(DISTINCT i.id) documents
    FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
    WHERE i.org_id=? AND i.status!='void'
      AND (il.product_id=? OR il.supplier_product_id IN (SELECT id FROM supplier_products WHERE org_id=? AND product_id=?))
      AND date(i.invoice_date)>=date('now',?)
    GROUP BY month ORDER BY month`).bind(actor.orgId,productId,actor.orgId,productId,`-${months-1} months`).all()).map(item=>({month:item.month,units:num(item.units),spend:num(item.spend),documents:num(item.documents)}));
  const history=rows(await env.DB.prepare(`SELECT ph.id,ph.supplier_id,s.name supplier_name,ph.invoice_id,i.invoice_number,ph.gross_unit_price,ph.currency,ph.observed_at
    FROM price_history ph JOIN suppliers s ON s.id=ph.supplier_id AND s.org_id=ph.org_id
    LEFT JOIN invoices i ON i.id=ph.invoice_id AND i.org_id=ph.org_id
    WHERE ph.org_id=? AND ph.product_id=? ORDER BY datetime(ph.observed_at) DESC LIMIT 80`).bind(actor.orgId,productId).all()).map(item=>({id:item.id,supplierId:item.supplier_id,supplierName:item.supplier_name,invoiceId:item.invoice_id||'',invoiceNumber:item.invoice_number||'',grossUnitPrice:cleanPrice(item.gross_unit_price),currency:item.currency||'CLP',observedAt:item.observed_at,source:item.invoice_id?'invoice':'manual'}));
  const prices=history.map(item=>item.grossUnitPrice).filter(value=>value>0),latest=prices[0]||Math.max(0,...suppliers.map(item=>item.lastGrossUnitPrice)),previous=prices[1]||0,totalUnits=monthly.reduce((sum,item)=>sum+item.units,0),totalSpend=monthly.reduce((sum,item)=>sum+item.spend,0);
  const centers=rows(await env.DB.prepare(`SELECT cc.id,cc.name,l.name location_name FROM product_cost_centers pcc JOIN cost_centers cc ON cc.id=pcc.cost_center_id JOIN locations l ON l.id=cc.location_id WHERE pcc.org_id=? AND pcc.product_id=? ORDER BY l.name,cc.name`).bind(actor.orgId,productId).all()).map(item=>({id:item.id,name:item.name,locationName:item.location_name}));
  return{product:{id:product.id,name:product.name,brand:product.brand,variant:product.variant,categoryName:product.category_name||'Sin categoría',baseUnit:product.base_unit,contentValue:num(product.content_value),contentUnit:product.content_unit,active:Boolean(product.active),centers},suppliers,monthlyConsumption:monthly,priceHistory:history,summary:{months,totalUnits,totalSpend,averageMonthlyUnits:months?totalUnits/months:0,latestPrice:latest,previousPrice:previous,priceChangePct:previous?latest/previous-1:0,minPrice:prices.length?Math.min(...prices):0,maxPrice:prices.length?Math.max(...prices):0,observations:history.length}};
}

export async function setManualProductPriceV81(request,env,actor,productId,supplierId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);await productRecord(env,actor,productId);
  const relation=await env.DB.prepare(`SELECT sp.id,sp.last_gross_unit_price,s.name supplier_name FROM supplier_products sp JOIN suppliers s ON s.id=sp.supplier_id AND s.org_id=sp.org_id WHERE sp.org_id=? AND sp.product_id=? AND sp.supplier_id=? AND sp.active=1`).bind(actor.orgId,productId,supplierId).first();
  if(!relation)throw new HttpError(404,'Proveedor no vinculado al producto','relation_not_found');
  const evidence=await invoiceEvidence(env,actor,productId,supplierId,relation.id);
  if(num(evidence?.invoice_count)>0)throw new HttpError(409,'El último precio proviene de facturas y ya no puede editarse manualmente.','manual_price_locked_by_invoice',{invoiceCount:num(evidence.invoice_count),lastInvoiceDate:evidence.last_invoice_date||null});
  const body=await readJson(request),price=cleanPrice(number(body.grossUnitPrice,{min:0,max:999999999,fallback:0}));
  if(price<=0)throw new HttpError(400,'Ingresa un precio mayor a cero','invalid_manual_price');
  const stamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE supplier_products SET last_gross_unit_price=?,updated_at=? WHERE id=? AND org_id=?').bind(price,stamp,relation.id,actor.orgId),
    env.DB.prepare('INSERT INTO price_history(id,org_id,supplier_id,product_id,invoice_id,gross_unit_price,currency,observed_at,created_at) VALUES(?,?,?,?,NULL,?,?,?,?)').bind(uuid(),actor.orgId,supplierId,productId,price,'CLP',stamp,stamp)
  ]);
  await writeAudit(env,actor,request,'product.manual_price','product',productId,{supplierId,price,source:'manual-no-invoice'});
  return{productId,supplierId,supplierName:relation.supplier_name,grossUnitPrice:price,source:'manual',manualPriceAllowed:true,updatedAt:stamp};
}

export async function setProductSupplierLinksV81(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);const product=await productRecord(env,actor,productId),body=await readJson(request),links=Array.isArray(body.links)?body.links:[];
  if(links.length>500)throw new HttpError(400,'Demasiados proveedores para un producto','too_many_supplier_links');
  const existing=rows(await env.DB.prepare('SELECT * FROM supplier_products WHERE org_id=? AND product_id=?').bind(actor.orgId,productId).all()),bySupplier=new Map(existing.map(item=>[String(item.supplier_id),item])),requested=new Set(),stamp=nowIso();
  for(const input of links){
    const supplierId=String(input.supplierId||'').trim();if(!supplierId||requested.has(supplierId))continue;requested.add(supplierId);
    const supplier=await env.DB.prepare('SELECT id,name FROM suppliers WHERE id=? AND org_id=? AND active=1').bind(supplierId,actor.orgId).first();if(!supplier)throw new HttpError(400,'Proveedor inválido','invalid_supplier');
    const old=bySupplier.get(supplierId),relationId=old?.id||uuid(),evidence=await invoiceEvidence(env,actor,productId,supplierId,relationId),invoiceCount=num(evidence?.invoice_count),latest=invoiceCount?await latestInvoicePrice(env,actor,productId,supplierId,relationId):null,requestedPrice=cleanPrice(input.lastGrossUnitPrice),currentPrice=cleanPrice(old?.last_gross_unit_price),lockedPrice=cleanPrice(latest?.gross_unit_price)||currentPrice,price=invoiceCount?lockedPrice:requestedPrice||currentPrice;
    const values={supplierSku:optionalText(input.supplierSku,{max:100}),supplierName:optionalText(input.supplierProductName||product.name,{max:220}),orderUnit:optionalText(input.orderUnit||'unidad',{max:60}),units:number(input.unitsPerOrderUnit,{min:.001,max:100000,fallback:1}),minimum:number(input.minimumQuantity,{min:0,max:100000,fallback:0}),multiple:number(input.quantityMultiple,{min:.001,max:100000,fallback:1})};
    await env.DB.prepare(`INSERT INTO supplier_products(id,org_id,supplier_id,product_id,supplier_sku,supplier_name,order_unit,units_per_order_unit,minimum_quantity,quantity_multiple,last_gross_unit_price,active,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(supplier_id,product_id) DO UPDATE SET supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,order_unit=excluded.order_unit,units_per_order_unit=excluded.units_per_order_unit,minimum_quantity=excluded.minimum_quantity,quantity_multiple=excluded.quantity_multiple,last_gross_unit_price=excluded.last_gross_unit_price,active=1,updated_at=excluded.updated_at`).bind(relationId,actor.orgId,supplierId,productId,values.supplierSku,values.supplierName,values.orderUnit,values.units,values.minimum,values.multiple,price,old?.created_at||stamp,stamp).run();
    if(!invoiceCount&&requestedPrice>0&&requestedPrice!==currentPrice)await env.DB.prepare('INSERT INTO price_history(id,org_id,supplier_id,product_id,invoice_id,gross_unit_price,currency,observed_at,created_at) VALUES(?,?,?,?,NULL,?,?,?,?)').bind(uuid(),actor.orgId,supplierId,productId,requestedPrice,'CLP',stamp,stamp).run();
  }
  for(const old of existing)if(!requested.has(String(old.supplier_id)))await env.DB.prepare('UPDATE supplier_products SET active=0,updated_at=? WHERE id=? AND org_id=?').bind(stamp,old.id,actor.orgId).run();
  await writeAudit(env,actor,request,'product.suppliers.replace','product',productId,{supplierIds:[...requested],priceIntegrityV81:true});
  return{productId,supplierIds:[...requested],links:requested.size,priceIntegrityV81:true};
}
