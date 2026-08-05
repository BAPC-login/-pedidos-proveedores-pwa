import {HttpError,ROLES,assertMinimumRole,nowIso,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {storeFile} from '../storage.js';
import {analyzeInvoiceV30} from './invoice-analysis-v30.js';

const rows=result=>result?.results||[];
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const publicState=status=>status==='draft'?'editing':status==='cancelled'?'cancelled':['received','reconciled','closed'].includes(status)?'received':'emitted';

async function policy(env,actor){
  const current=await env.DB.prepare('SELECT * FROM procurement_policies WHERE org_id=?').bind(actor.orgId).first();
  return current?{
    extraItemsMode:current.extra_items_mode,
    requireInvoicePreview:Boolean(current.require_invoice_preview),
    learnFromCorrections:Boolean(current.learn_from_corrections),
    priceVarianceWarningPct:Number(current.price_variance_warning_pct||12),
    updatedAt:current.updated_at
  }:{extraItemsMode:'review',requireInvoicePreview:true,learnFromCorrections:true,priceVarianceWarningPct:12,updatedAt:null};
}

export async function getProcurementPolicyV32(env,actor){return policy(env,actor)}

export async function saveProcurementPolicyV32(request,env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  const body=await readJson(request),mode=['allow','review','reject'].includes(body.extraItemsMode)?body.extraItemsMode:'review',timestamp=nowIso();
  const preview=body.requireInvoicePreview===false?0:1,learn=body.learnFromCorrections===false?0:1,variance=Math.max(1,Math.min(200,Number(body.priceVarianceWarningPct||12)));
  await env.DB.prepare(`INSERT INTO procurement_policies(org_id,extra_items_mode,require_invoice_preview,learn_from_corrections,price_variance_warning_pct,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET extra_items_mode=excluded.extra_items_mode,require_invoice_preview=excluded.require_invoice_preview,learn_from_corrections=excluded.learn_from_corrections,price_variance_warning_pct=excluded.price_variance_warning_pct,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(actor.orgId,mode,preview,learn,variance,actor.userId,timestamp,timestamp).run();
  await writeAudit(env,actor,request,'procurement.policy.update','organization',actor.orgId,{extraItemsMode:mode,requireInvoicePreview:Boolean(preview),learnFromCorrections:Boolean(learn),priceVarianceWarningPct:variance});
  return policy(env,actor);
}

export async function listCatalogMatrixV32(env,actor){
  const [productsResult,linksResult,suppliersResult,categoriesResult,centersResult]=await Promise.all([
    env.DB.prepare(`SELECT p.id,p.name,p.brand,p.variant,p.content_value,p.content_unit,p.base_unit,p.barcode,p.active,p.category_id,p.image_key,p.image_file_id,
      c.name AS category_name,c.cost_center_id,cc.name AS cost_center_name,cc.location_id,l.name AS location_name
      FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN cost_centers cc ON cc.id=c.cost_center_id LEFT JOIN locations l ON l.id=cc.location_id
      WHERE p.org_id=? AND p.active=1 ORDER BY COALESCE(cc.name,''),COALESCE(c.name,''),p.name COLLATE NOCASE`).bind(actor.orgId).all(),
    env.DB.prepare(`SELECT sp.id,sp.product_id,sp.supplier_id,sp.supplier_sku,sp.supplier_name,sp.order_unit,sp.units_per_order_unit,sp.minimum_quantity,sp.quantity_multiple,sp.last_gross_unit_price,sp.last_purchased_at,sp.active,s.name AS supplier_name_real
      FROM supplier_products sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.org_id=? AND s.active=1 ORDER BY s.name COLLATE NOCASE`).bind(actor.orgId).all(),
    env.DB.prepare('SELECT id,name,legal_name,rut,email,phone,contact_name,lead_days,cutoff_time,minimum_order,payment_terms,active FROM suppliers WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all(),
    env.DB.prepare("SELECT id,name,cost_center_id FROM categories WHERE org_id=? AND active=1 AND source='user' ORDER BY name COLLATE NOCASE").bind(actor.orgId).all(),
    env.DB.prepare('SELECT id,name,location_id FROM cost_centers WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all()
  ]);
  const linksByProduct=new Map();
  for(const link of rows(linksResult)){
    const item={id:link.id,supplierId:link.supplier_id,supplierName:link.supplier_name_real||link.supplier_name,supplierSku:link.supplier_sku,orderUnit:link.order_unit,unitsPerOrderUnit:Number(link.units_per_order_unit||1),minimumQuantity:Number(link.minimum_quantity||0),quantityMultiple:Number(link.quantity_multiple||1),lastGrossUnitPrice:Number(link.last_gross_unit_price||0),lastPurchasedAt:link.last_purchased_at,active:Boolean(link.active)};
    if(!linksByProduct.has(link.product_id))linksByProduct.set(link.product_id,[]);linksByProduct.get(link.product_id).push(item);
  }
  const products=rows(productsResult).map(row=>({id:row.id,name:row.name,brand:row.brand||'',variant:row.variant||'',contentValue:Number(row.content_value||0),contentUnit:row.content_unit,baseUnit:row.base_unit,barcode:row.barcode||'',categoryId:row.category_id||'',categoryName:row.category_name||'Sin categoría',costCenterId:row.cost_center_id||'',costCenterName:row.cost_center_name||'Sin centro',locationId:row.location_id||'',locationName:row.location_name||'',imageKey:row.image_key||'',imageFileId:row.image_file_id||'',suppliers:(linksByProduct.get(row.id)||[]).filter(link=>link.active)}));
  return{products,suppliers:rows(suppliersResult).map(item=>({id:item.id,name:item.name,legalName:item.legal_name,rut:item.rut,email:item.email,phone:item.phone,contactName:item.contact_name,leadDays:Number(item.lead_days||0),cutoffTime:item.cutoff_time,minimumOrder:Number(item.minimum_order||0),paymentTerms:item.payment_terms})),categories:rows(categoriesResult).map(item=>({id:item.id,name:item.name,costCenterId:item.cost_center_id||''})),costCenters:rows(centersResult).map(item=>({id:item.id,name:item.name,locationId:item.location_id}))};
}

async function requireProduct(env,actor,productId){const product=await env.DB.prepare('SELECT id,name,image_key,image_file_id FROM products WHERE id=? AND org_id=? AND active=1').bind(productId,actor.orgId).first();if(!product)throw new HttpError(404,'Producto no encontrado','not_found');return product}

export async function updateProductSuppliersV32(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);await requireProduct(env,actor,productId);
  const body=await readJson(request),links=Array.isArray(body.links)?body.links:[],timestamp=nowIso(),selected=[...new Set(links.map(item=>String(item.supplierId||'')).filter(Boolean))];
  if(selected.length){const placeholders=selected.map(()=>'?').join(','),result=await env.DB.prepare(`SELECT id FROM suppliers WHERE org_id=? AND active=1 AND id IN (${placeholders})`).bind(actor.orgId,...selected).all();if(rows(result).length!==selected.length)throw new HttpError(400,'Uno o más proveedores no son válidos','invalid_supplier')}
  const statements=[];if(body.replace!==false)statements.push(env.DB.prepare('UPDATE supplier_products SET active=0,updated_at=? WHERE org_id=? AND product_id=?').bind(timestamp,actor.orgId,productId));
  for(const raw of links){const supplierId=String(raw.supplierId||'');if(!supplierId)continue;statements.push(env.DB.prepare(`INSERT INTO supplier_products(id,org_id,supplier_id,product_id,supplier_sku,supplier_name,order_unit,units_per_order_unit,minimum_quantity,quantity_multiple,last_gross_unit_price,last_purchased_at,active,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(supplier_id,product_id) DO UPDATE SET supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,order_unit=excluded.order_unit,units_per_order_unit=excluded.units_per_order_unit,minimum_quantity=excluded.minimum_quantity,quantity_multiple=excluded.quantity_multiple,last_gross_unit_price=CASE WHEN excluded.last_gross_unit_price>0 THEN excluded.last_gross_unit_price ELSE supplier_products.last_gross_unit_price END,active=1,updated_at=excluded.updated_at`)
    .bind(uuid(),actor.orgId,supplierId,productId,String(raw.supplierSku||''),String(raw.supplierName||''),String(raw.orderUnit||'unidad'),Math.max(.001,Number(raw.unitsPerOrderUnit||1)),Math.max(0,Number(raw.minimumQuantity||0)),Math.max(.001,Number(raw.quantityMultiple||1)),Math.max(0,Math.round(Number(raw.lastGrossUnitPrice||0))),raw.lastPurchasedAt||null,timestamp,timestamp))}
  if(statements.length)await env.DB.batch(statements);await writeAudit(env,actor,request,'product.suppliers.update','product',productId,{supplierIds:selected,replace:body.replace!==false});return{updated:true,productId,supplierIds:selected};
}

export async function uploadProductPhotoV32(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);const product=await requireProduct(env,actor,productId),form=await request.formData(),file=form.get('file');
  if(!(file instanceof File)||!file.size)throw new HttpError(400,'Selecciona una fotografía','missing_file');if(!String(file.type||'').startsWith('image/'))throw new HttpError(400,'El archivo debe ser una imagen','invalid_file_type');if(file.size>6*1024*1024)throw new HttpError(413,'La fotografía supera 6 MB','file_too_large');
  const revision=Number((await env.DB.prepare("SELECT COALESCE(MAX(revision),0)+1 AS value FROM document_links WHERE org_id=? AND entity_type='product' AND entity_id=? AND document_kind='product_photo'").bind(actor.orgId,productId).first())?.value||1);
  const stored=await storeFile(env,actor,file,{purpose:'product-photo',entityType:'product',entityId:productId,documentKind:'product_photo',revision,metadata:{productName:product.name}});
  await env.DB.prepare('UPDATE products SET image_file_id=?,image_key=?,updated_at=? WHERE id=? AND org_id=?').bind(stored.id,stored.key,nowIso(),productId,actor.orgId).run();await writeAudit(env,actor,request,'product.photo.upload','product',productId,{fileId:stored.id,key:stored.key,size:stored.size});return{productId,imageFileId:stored.id,imageKey:stored.key,name:stored.name};
}

export async function deleteProductPhotoV32(request,env,actor,productId){assertMinimumRole(actor.role,ROLES.PURCHASER);await requireProduct(env,actor,productId);await env.DB.prepare("UPDATE products SET image_file_id='',image_key='',updated_at=? WHERE id=? AND org_id=?").bind(nowIso(),productId,actor.orgId).run();await writeAudit(env,actor,request,'product.photo.delete','product',productId,{});return{deleted:true,productId}}

export async function listAdvancedOrdersV32(env,actor){
  const result=await env.DB.prepare(`SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.updated_at,o.sent_at,o.emitted_at,o.gross_total,o.cost_center_id,o.supplier_id,o.location_id,
    s.name AS supplier_name,l.name AS location_name,cc.name AS cost_center_name,u.display_name AS requested_by,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS item_count,
    (SELECT COUNT(*) FROM invoice_order_links iol WHERE iol.order_id=o.id) AS invoice_count,
    (SELECT COALESCE(SUM(i.gross_total),0) FROM invoice_order_links iol JOIN invoices i ON i.id=iol.invoice_id WHERE iol.order_id=o.id) AS invoiced_total,
    (SELECT MAX(r.received_at) FROM receptions r WHERE r.order_id=o.id AND r.status='completed') AS last_received_at
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id LEFT JOIN cost_centers cc ON cc.id=o.cost_center_id LEFT JOIN users u ON u.id=o.requested_by
    WHERE o.org_id=? ORDER BY COALESCE(o.emitted_at,o.created_at) DESC LIMIT 2500`).bind(actor.orgId).all();
  const tagResult=await env.DB.prepare(`SELECT oi.order_id,p.brand,c.id AS category_id,c.name AS category_name FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id JOIN orders o ON o.id=oi.order_id WHERE o.org_id=?`).bind(actor.orgId).all(),tags=new Map();
  for(const row of rows(tagResult)){if(!tags.has(row.order_id))tags.set(row.order_id,{brands:new Set(),categories:new Map()});const current=tags.get(row.order_id);if(row.brand)current.brands.add(row.brand);if(row.category_id)current.categories.set(row.category_id,row.category_name)}
  const orders=rows(result).map(row=>{const current=tags.get(row.id)||{brands:new Set(),categories:new Map()};return{id:row.id,folio:row.folio,status:row.status,publicState:publicState(row.status),deliveryDate:row.delivery_date,createdAt:row.created_at,updatedAt:row.updated_at,sentAt:row.sent_at,emittedAt:row.emitted_at,grossTotal:Number(row.gross_total||0),costCenterId:row.cost_center_id||'',costCenterName:row.cost_center_name||'Sin centro',supplierId:row.supplier_id,supplierName:row.supplier_name,locationId:row.location_id,locationName:row.location_name,requestedBy:row.requested_by||'Usuario',itemCount:Number(row.item_count||0),invoiceCount:Number(row.invoice_count||0),invoicedGrossTotal:Number(row.invoiced_total||0),lastReceivedAt:row.last_received_at||null,productBrands:[...current.brands],categories:[...current.categories].map(([id,name])=>({id,name}))}});
  const meta={suppliers:[...new Map(orders.map(item=>[item.supplierId,{id:item.supplierId,name:item.supplierName}])).values()],locations:[...new Map(orders.map(item=>[item.locationId,{id:item.locationId,name:item.locationName}])).values()],costCenters:[...new Map(orders.filter(item=>item.costCenterId).map(item=>[item.costCenterId,{id:item.costCenterId,name:item.costCenterName}])).values()],brands:[...new Set(orders.flatMap(item=>item.productBrands))].sort((a,b)=>a.localeCompare(b,'es')),categories:[...new Map(orders.flatMap(item=>item.categories).map(item=>[item.id,item])).values()]};return{orders,meta};
}

function similarity(a,b){const left=new Set(normalize(a).split(' ').filter(Boolean)),right=new Set(normalize(b).split(' ').filter(Boolean));if(!left.size||!right.size)return 0;let hit=0;for(const token of left)if(right.has(token))hit++;return hit/Math.max(left.size,right.size)}

async function supplierForContext(env,actor,context){if(context.supplierId)return String(context.supplierId);const name=String(context.providerName||'').trim();if(!name)return'';const row=await env.DB.prepare('SELECT id FROM suppliers WHERE org_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(actor.orgId,name).first();return row?.id||''}

async function rulesForSupplier(env,actor,supplierId){if(!supplierId)return[];const result=await env.DB.prepare('SELECT * FROM invoice_learning_rules WHERE org_id=? AND supplier_id=? ORDER BY correction_count DESC,updated_at DESC LIMIT 500').bind(actor.orgId,supplierId).all();return rows(result).map(row=>({id:row.id,productId:row.product_id,normalizedDescription:row.normalized_description,sourceDescription:row.source_description,supplierSku:row.supplier_sku,learnedPackSize:Number(row.learned_pack_size||1),lastConfirmedUnitPrice:Number(row.last_confirmed_unit_price||0),minConfirmedUnitPrice:Number(row.min_confirmed_unit_price||0),maxConfirmedUnitPrice:Number(row.max_confirmed_unit_price||0),correctionCount:Number(row.correction_count||1),confidence:Number(row.confidence||.85)}))}

function applyLearning(analysis,context,rules,policyConfig){
  const invoice=analysis.invoice||{},lines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[],orderedIds=new Set((context.products||[]).map(item=>String(item.productId||'')));
  let applied=0;const enhanced=lines.map(line=>{const source=line.sourceLine||line.sourceDescription||line.descriptionOriginal||line.description||'',normalized=normalize(source);let best=null,bestScore=0;for(const rule of rules){const score=normalized===rule.normalizedDescription?1:similarity(normalized,rule.normalizedDescription);if(score>bestScore){best=rule;bestScore=score}}let next={...line};if(best&&bestScore>=.78&&orderedIds.has(String(best.productId))){const qty=Number(next.packageQty??next.invoiceQuantity??0),pack=Math.max(.001,Number(best.learnedPackSize||next.packSize||1)),total=Number(next.grossLineTotal||0);next={...next,productId:best.productId,suggestedProductId:best.productId,packSize:pack,units:qty*pack,totalUnits:qty*pack,grossUnitPrice:total&&qty*pack?Math.round(total/(qty*pack)):Number(next.grossUnitPrice||0),confidence:Math.max(Number(next.confidence||0),Math.min(.99,best.confidence+Math.min(.12,best.correctionCount*.01))),matchMethod:'nuvasto_learned_correction',matchReason:`Regla aprendida de ${best.correctionCount} corrección${best.correctionCount===1?'':'es'}`,learnedRuleId:best.id,expectedUnitPrice:best.lastConfirmedUnitPrice};applied++}const extra=!next.productId||!orderedIds.has(String(next.productId));return{...next,isExtraFromOrder:extra,policySuggestion:extra?policyConfig.extraItemsMode:'allow'}});
  analysis.invoice={...invoice,lines:enhanced,items:enhanced};analysis.learning={rulesAvailable:rules.length,rulesApplied:applied};analysis.policy=policyConfig;if(applied)analysis.warnings=[...(analysis.warnings||[]),`Nuvasto aplicó ${applied} regla${applied===1?'':'s'} aprendida${applied===1?'':'s'} de correcciones anteriores.`];return analysis;
}

export async function analyzeInvoiceV32(request,env,actor){
  const original=await request.formData(),contextRaw=String(original.get('context')||'{}');let context={};try{context=JSON.parse(contextRaw)}catch{throw new HttpError(400,'El contexto del pedido no es válido','invalid_context')}
  const supplierId=await supplierForContext(env,actor,context),rules=await rulesForSupplier(env,actor,supplierId),policyConfig=await policy(env,actor),enriched={...context,supplierId,learnedCorrections:rules.map(rule=>({productId:rule.productId,sourceDescription:rule.sourceDescription,packSize:rule.learnedPackSize,expectedUnitPrice:rule.lastConfirmedUnitPrice,confidence:rule.confidence,correctionCount:rule.correctionCount})),extraItemsMode:policyConfig.extraItemsMode,priceVarianceWarningPct:policyConfig.priceVarianceWarningPct};
  const form=new FormData();for(const[key,value]of original.entries())if(key!=='context')form.append(key,value);form.append('context',JSON.stringify(enriched));const internal=new Request(request.url,{method:'POST',headers:request.headers,body:form});const analysis=await analyzeInvoiceV30(internal,env,actor);return applyLearning(analysis,enriched,rules,policyConfig);
}

export async function prepareInvoicePayloadV32(env,actor,body){
  const config=await policy(env,actor),orderIds=[...new Set((Array.isArray(body.orderIds)?body.orderIds:[]).map(String).filter(Boolean))],orderedIds=new Set();
  for(const orderId of orderIds){const result=await env.DB.prepare('SELECT product_id FROM order_items WHERE order_id=?').bind(orderId).all();for(const row of rows(result))if(row.product_id)orderedIds.add(String(row.product_id))}
  const lines=Array.isArray(body.lines)?body.lines:[],extras=lines.filter(line=>!line.productId||(orderedIds.size&&!orderedIds.has(String(line.productId))));
  if(extras.length&&config.extraItemsMode==='reject'&&body.extraItemsDecision!=='allow')throw new HttpError(409,`El documento contiene ${extras.length} línea${extras.length===1?'':'s'} que no corresponde${extras.length===1?'':'n'} al pedido. La política está configurada para rechazarlas. Revisa o cambia la política antes de guardar.`,'extra_items_rejected',{extraCount:extras.length,lines:extras.map(line=>line.sourceDescription||line.sourceLine||line.description||'Línea sin nombre')});
  const rejected=lines.filter(line=>line.policyAction==='reject'||line.rejectedByPolicy===true),kept=lines.filter(line=>!rejected.includes(line));return{body:{...body,lines:kept,extraItemsMeta:{mode:config.extraItemsMode,extraCount:extras.length,rejectedCount:rejected.length}},config,extras,rejected};
}

export async function learnFromInvoiceV32(env,actor,{requestBody,invoiceId='',extras=[],rejected=[]}){
  const config=await policy(env,actor);if(!config.learnFromCorrections)return{learned:0};const supplierId=String(requestBody.supplierId||'');if(!supplierId)return{learned:0};const timestamp=nowIso(),statements=[];let learned=0;
  for(const line of requestBody.lines||[]){const productId=String(line.productId||''),source=String(line.sourceDescription||line.sourceLine||line.descriptionOriginal||line.description||'').trim(),normalized=normalize(source);if(!productId||!normalized)continue;const pack=Math.max(.001,Number(line.packSize||line.unitsPerPackage||1)),price=Math.max(0,Math.round(Number(line.grossUnitPrice||0)));learned++;statements.push(env.DB.prepare(`INSERT INTO invoice_learning_rules(id,org_id,supplier_id,product_id,normalized_description,source_description,supplier_sku,learned_pack_size,last_confirmed_unit_price,min_confirmed_unit_price,max_confirmed_unit_price,correction_count,confidence,last_corrected_by,last_used_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(org_id,supplier_id,product_id,normalized_description) DO UPDATE SET source_description=excluded.source_description,supplier_sku=CASE WHEN excluded.supplier_sku<>'' THEN excluded.supplier_sku ELSE invoice_learning_rules.supplier_sku END,learned_pack_size=excluded.learned_pack_size,last_confirmed_unit_price=CASE WHEN excluded.last_confirmed_unit_price>0 THEN excluded.last_confirmed_unit_price ELSE invoice_learning_rules.last_confirmed_unit_price END,min_confirmed_unit_price=CASE WHEN invoice_learning_rules.min_confirmed_unit_price=0 THEN excluded.last_confirmed_unit_price WHEN excluded.last_confirmed_unit_price=0 THEN invoice_learning_rules.min_confirmed_unit_price ELSE MIN(invoice_learning_rules.min_confirmed_unit_price,excluded.last_confirmed_unit_price) END,max_confirmed_unit_price=MAX(invoice_learning_rules.max_confirmed_unit_price,excluded.last_confirmed_unit_price),correction_count=invoice_learning_rules.correction_count+1,confidence=MIN(.99,invoice_learning_rules.confidence+.015),last_corrected_by=excluded.last_corrected_by,last_used_at=excluded.last_used_at,updated_at=excluded.updated_at`)
      .bind(uuid(),actor.orgId,supplierId,productId,normalized,source,String(line.supplierSku||line.code||''),pack,price,price,price,1,.86,actor.userId,timestamp,timestamp,timestamp))}
  for(const line of [...extras,...rejected])statements.push(env.DB.prepare(`INSERT INTO invoice_policy_events(id,org_id,invoice_id,order_id,supplier_id,product_id,source_description,action,reason,actor_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),actor.orgId,invoiceId||null,(requestBody.orderIds||[])[0]||null,supplierId,line.productId||null,String(line.sourceDescription||line.sourceLine||line.description||''),rejected.includes(line)?'rejected':'reviewed',rejected.includes(line)?'Excluido durante la revisión':'Ítem adicional detectado',actor.userId,timestamp));
  if(statements.length)await env.DB.batch(statements);return{learned};
}

export async function listLearningSummaryV32(env,actor){const result=await env.DB.prepare(`SELECT ilr.id,ilr.supplier_id,s.name AS supplier_name,ilr.product_id,p.name AS product_name,ilr.source_description,ilr.learned_pack_size,ilr.last_confirmed_unit_price,ilr.correction_count,ilr.confidence,ilr.updated_at FROM invoice_learning_rules ilr JOIN suppliers s ON s.id=ilr.supplier_id JOIN products p ON p.id=ilr.product_id WHERE ilr.org_id=? ORDER BY ilr.updated_at DESC LIMIT 1000`).bind(actor.orgId).all();return rows(result).map(row=>({id:row.id,supplierId:row.supplier_id,supplierName:row.supplier_name,productId:row.product_id,productName:row.product_name,sourceDescription:row.source_description,learnedPackSize:Number(row.learned_pack_size||1),lastConfirmedUnitPrice:Number(row.last_confirmed_unit_price||0),correctionCount:Number(row.correction_count||0),confidence:Number(row.confidence||0),updatedAt:row.updated_at}))}
