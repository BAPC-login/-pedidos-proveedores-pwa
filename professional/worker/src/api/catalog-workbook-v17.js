import {HttpError,ROLES,assertMinimumRole,nowIso,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {importCatalogWorkbookV16} from './catalog-workbook-v16.js';

const rows=result=>result?.results||[];
const text=value=>String(value??'').trim();
const key=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
const sheet=(book,names)=>{for(const name of names){const found=Object.entries(book||{}).find(([candidate])=>key(candidate)===key(name));if(found)return Array.isArray(found[1])?found[1]:[]}return[]};
const field=(row,...names)=>{for(const name of names){const found=Object.entries(row||{}).find(([candidate])=>key(candidate)===key(name));if(found&&text(found[1]))return found[1]}return''};
async function batches(db,statements,size=30){for(let index=0;index<statements.length;index+=size)await db.batch(statements.slice(index,index+size))}

async function parsePreview(body,env,actor){
  const book=body.sheets&&typeof body.sheets==='object'?body.sheets:{},centers=sheet(book,['Centros de costo','Centros','cost_centers']),suppliers=sheet(book,['Proveedores','suppliers']),categories=sheet(book,['Categorías','Categorias','categories']),products=sheet(book,['Productos','products']),errors=[];
  if(!centers.length)errors.push('La hoja Centros de costo no contiene filas');
  if(!suppliers.length)errors.push('La hoja Proveedores no contiene filas');
  if(!categories.length)errors.push('La hoja Categorías no contiene filas');
  if(!products.length)errors.push('La hoja Productos no contiene filas');
  if(products.length>5000)errors.push('La hoja Productos supera 5.000 filas');
  const [existingCenters,existingSuppliers,existingCategories,existingProducts]=await Promise.all([
    env.DB.prepare('SELECT name,code FROM cost_centers WHERE org_id=?').bind(actor.orgId).all(),
    env.DB.prepare('SELECT name FROM suppliers WHERE org_id=?').bind(actor.orgId).all(),
    env.DB.prepare('SELECT name FROM categories WHERE org_id=?').bind(actor.orgId).all(),
    env.DB.prepare('SELECT name,content_value,content_unit,barcode FROM products WHERE org_id=?').bind(actor.orgId).all()
  ]);
  const centerKeys=new Set(rows(existingCenters).flatMap(item=>[key(item.name),key(item.code)])),supplierKeys=new Set(rows(existingSuppliers).map(item=>key(item.name))),categoryKeys=new Set(rows(existingCategories).map(item=>key(item.name))),productKeys=new Set(rows(existingProducts).map(item=>key(`${item.name}|${item.content_value}|${item.content_unit}`))),barcodeKeys=new Set(rows(existingProducts).map(item=>key(item.barcode)).filter(Boolean));
  const duplicateRows=[],seen={centers:new Set(),suppliers:new Set(),categories:new Set(),products:new Set()};
  function summarize(source,type,resolver,existing){let add=0,update=0,duplicate=0;source.forEach((row,index)=>{const value=resolver(row),normalized=key(value);if(!normalized){errors.push(`${type}, fila ${index+2}: falta identificador principal`);return}if(seen[type].has(normalized)){duplicate++;duplicateRows.push({sheet:type,row:index+2,value});return}seen[type].add(normalized);if(existing.has(normalized))update++;else add++});return{rows:source.length,add,update,duplicate}}
  const summary={
    centers:summarize(centers,'centers',row=>field(row,'Código centro','Codigo centro','Centro de costo','Nombre'),centerKeys),
    suppliers:summarize(suppliers,'suppliers',row=>field(row,'Proveedor','Nombre'),supplierKeys),
    categories:summarize(categories,'categories',row=>field(row,'Categoría','Categoria','Nombre'),categoryKeys),
    products:summarize(products,'products',row=>{const barcode=field(row,'Código de barras','Codigo de barras');return barcode&&barcodeKeys.has(key(barcode))?barcode:`${field(row,'Producto','Nombre')}|${field(row,'Contenido')}|${field(row,'Unidad contenido','Unidad de contenido')}`},productKeys)
  };
  const totalRows=centers.length+suppliers.length+categories.length+products.length,totalAdd=Object.values(summary).reduce((sum,item)=>sum+item.add,0),totalUpdate=Object.values(summary).reduce((sum,item)=>sum+item.update,0),totalDuplicate=Object.values(summary).reduce((sum,item)=>sum+item.duplicate,0);
  return{mode:body.mode==='replace'?'replace':'merge',sourceName:text(body.sourceName),sheets:{centers:centers.length,suppliers:suppliers.length,categories:categories.length,products:products.length},summary,totalRows,totalAdd,totalUpdate,totalDuplicate,duplicateRows:duplicateRows.slice(0,100),errors,valid:errors.length===0};
}

async function snapshotCatalog(env,actor,mode,sourceName,preview){
  const tables=['cost_centers','categories','suppliers','products','supplier_products','product_cost_centers'],snapshot={version:17,createdAt:nowIso(),tables:{}};
  for(const table of tables){const result=await env.DB.prepare(`SELECT * FROM ${table} WHERE org_id=?`).bind(actor.orgId).all();snapshot.tables[table]=rows(result)}
  const id=uuid();await env.DB.prepare(`INSERT INTO catalog_import_snapshots(id,org_id,import_mode,source_name,snapshot_json,preview_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,actor.orgId,mode,sourceName||'',JSON.stringify(snapshot),JSON.stringify(preview),actor.userId,snapshot.createdAt).run();return{id,createdAt:snapshot.createdAt,rowCount:Object.values(snapshot.tables).reduce((sum,list)=>sum+list.length,0)};
}

export async function previewCatalogWorkbookV17(request,env,actor){assertMinimumRole(actor.role,ROLES.PURCHASER);const body=await readJson(request),preview=await parsePreview(body,env,actor),organization=await env.DB.prepare('SELECT settings_json FROM organizations WHERE id=?').bind(actor.orgId).first(),settings=(()=>{try{return JSON.parse(organization?.settings_json||'{}')}catch{return{}}})(),timestamp=nowIso();settings.commercial={...(settings.commercial||{}),lastImportPreviewAt:timestamp,lastImportPreview:preview};await env.DB.prepare('UPDATE organizations SET settings_json=?,updated_at=? WHERE id=?').bind(JSON.stringify(settings),timestamp,actor.orgId).run();await writeAudit(env,actor,request,'catalog.workbook_preview','catalog',actor.orgId,{valid:preview.valid,mode:preview.mode,totalRows:preview.totalRows,errors:preview.errors.length});return preview}

export async function commitCatalogWorkbookV17(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);const body=await readJson(request),preview=await parsePreview(body,env,actor);if(!preview.valid)throw new HttpError(400,'La importación contiene errores','invalid_workbook_preview',preview);const snapshot=await snapshotCatalog(env,actor,preview.mode,preview.sourceName,preview),synthetic=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});try{const result=await importCatalogWorkbookV16(synthetic,env,actor);await writeAudit(env,actor,request,'catalog.workbook_commit','catalog',actor.orgId,{snapshotId:snapshot.id,...result});return{...result,snapshotId:snapshot.id,preview}}catch(error){throw new HttpError(error.status||500,`${error.message}. Se creó el punto de recuperación ${snapshot.id}.`,error.code||'workbook_commit_failed',{snapshotId:snapshot.id,preview})}}

export async function listCatalogSnapshotsV17(env,actor){assertMinimumRole(actor.role,ROLES.PURCHASER);const result=await env.DB.prepare('SELECT id,import_mode,source_name,preview_json,created_at,restored_at FROM catalog_import_snapshots WHERE org_id=? ORDER BY created_at DESC LIMIT 50').bind(actor.orgId).all();return rows(result).map(row=>({id:row.id,mode:row.import_mode,sourceName:row.source_name,preview:JSON.parse(row.preview_json||'{}'),createdAt:row.created_at,restoredAt:row.restored_at}))}

export async function restoreCatalogSnapshotV17(request,env,actor,snapshotId){
  assertMinimumRole(actor.role,ROLES.ADMIN);const record=await env.DB.prepare('SELECT * FROM catalog_import_snapshots WHERE id=? AND org_id=?').bind(snapshotId,actor.orgId).first();if(!record)throw new HttpError(404,'Punto de recuperación no encontrado','not_found');const snapshot=JSON.parse(record.snapshot_json||'{}'),tables=snapshot.tables||{},timestamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE supplier_products SET active=0,updated_at=? WHERE org_id=?').bind(timestamp,actor.orgId),
    env.DB.prepare('UPDATE products SET active=0,updated_at=? WHERE org_id=?').bind(timestamp,actor.orgId),
    env.DB.prepare('UPDATE suppliers SET active=0,updated_at=? WHERE org_id=?').bind(timestamp,actor.orgId),
    env.DB.prepare("UPDATE categories SET active=0,updated_at=? WHERE org_id=? AND source='user'").bind(timestamp,actor.orgId),
    env.DB.prepare('DELETE FROM product_cost_centers WHERE org_id=?').bind(actor.orgId)
  ]);
  const statements=[];
  for(const row of tables.cost_centers||[])statements.push(env.DB.prepare(`INSERT INTO cost_centers(id,org_id,location_id,name,code,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET location_id=excluded.location_id,name=excluded.name,code=excluded.code,active=excluded.active,updated_at=excluded.updated_at`).bind(row.id,actor.orgId,row.location_id,row.name,row.code,row.active,row.created_at||timestamp,timestamp));
  for(const row of tables.categories||[])statements.push(env.DB.prepare(`INSERT INTO categories(id,org_id,name,sort_order,active,created_at,updated_at,source,cost_center_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at,source=excluded.source,cost_center_id=excluded.cost_center_id`).bind(row.id,actor.orgId,row.name,row.sort_order,row.active,row.created_at||timestamp,timestamp,row.source||'user',row.cost_center_id||null));
  for(const row of tables.suppliers||[])statements.push(env.DB.prepare(`INSERT INTO suppliers(id,org_id,name,legal_name,rut,email,phone,contact_name,lead_days,cutoff_time,minimum_order,payment_terms,settings_json,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,legal_name=excluded.legal_name,rut=excluded.rut,email=excluded.email,phone=excluded.phone,contact_name=excluded.contact_name,lead_days=excluded.lead_days,cutoff_time=excluded.cutoff_time,minimum_order=excluded.minimum_order,payment_terms=excluded.payment_terms,settings_json=excluded.settings_json,active=excluded.active,updated_at=excluded.updated_at`).bind(row.id,actor.orgId,row.name,row.legal_name,row.rut,row.email,row.phone,row.contact_name,row.lead_days,row.cutoff_time,row.minimum_order,row.payment_terms,row.settings_json,row.active,row.created_at||timestamp,timestamp));
  for(const row of tables.products||[])statements.push(env.DB.prepare(`INSERT INTO products(id,org_id,category_id,name,brand,variant,content_value,content_unit,base_unit,barcode,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,brand=excluded.brand,variant=excluded.variant,content_value=excluded.content_value,content_unit=excluded.content_unit,base_unit=excluded.base_unit,barcode=excluded.barcode,active=excluded.active,updated_at=excluded.updated_at`).bind(row.id,actor.orgId,row.category_id,row.name,row.brand,row.variant,row.content_value,row.content_unit,row.base_unit,row.barcode,row.active,row.created_at||timestamp,timestamp));
  await batches(env.DB,statements);const relationStatements=[];
  for(const row of tables.supplier_products||[])relationStatements.push(env.DB.prepare(`INSERT INTO supplier_products(id,org_id,supplier_id,product_id,supplier_sku,supplier_name,order_unit,units_per_order_unit,minimum_quantity,quantity_multiple,last_gross_unit_price,last_purchased_at,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET supplier_id=excluded.supplier_id,product_id=excluded.product_id,supplier_sku=excluded.supplier_sku,supplier_name=excluded.supplier_name,order_unit=excluded.order_unit,units_per_order_unit=excluded.units_per_order_unit,minimum_quantity=excluded.minimum_quantity,quantity_multiple=excluded.quantity_multiple,last_gross_unit_price=excluded.last_gross_unit_price,last_purchased_at=excluded.last_purchased_at,active=excluded.active,updated_at=excluded.updated_at`).bind(row.id,actor.orgId,row.supplier_id,row.product_id,row.supplier_sku,row.supplier_name,row.order_unit,row.units_per_order_unit,row.minimum_quantity,row.quantity_multiple,row.last_gross_unit_price,row.last_purchased_at,row.active,row.created_at||timestamp,timestamp));
  for(const row of tables.product_cost_centers||[])relationStatements.push(env.DB.prepare('INSERT OR IGNORE INTO product_cost_centers(org_id,product_id,cost_center_id,created_at) VALUES(?,?,?,?)').bind(actor.orgId,row.product_id,row.cost_center_id,row.created_at||timestamp));
  await batches(env.DB,relationStatements);await env.DB.prepare('UPDATE catalog_import_snapshots SET restored_by=?,restored_at=? WHERE id=? AND org_id=?').bind(actor.userId,timestamp,snapshotId,actor.orgId).run();await writeAudit(env,actor,request,'catalog.snapshot_restore','catalog_import_snapshot',snapshotId,{sourceName:record.source_name});return{restored:true,snapshotId,restoredAt:timestamp};
}
