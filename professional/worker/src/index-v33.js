import platformWorker from './index-v32.js';
import {authenticate,writeAudit} from './auth.js';
import {
  HttpError,corsHeaders,errorResponse,nowIso,ok,readJson,securityHeaders
} from './core.js';
import {ensureSchema} from './schema.js';
import {listOrdersV2} from './api/orders-list-v2.js';

const VERSION='33';
const RELEASE_VERSION='2.0.0-alpha.33';
const rows=result=>result?.results||[];
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const routeId=(pathname,pattern)=>{const match=pathname.match(pattern);return match?decodeURIComponent(match[1]):''};
const isAdmin=actor=>['owner','admin'].includes(String(actor.role||''));
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Reliability','history-documents-v33');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
  return decorate(ok({...payload,version:RELEASE_VERSION,historyReliabilityVersion:33,documentCenterVersion:33,legacyOrdersFallback:true,archiveRenameDelete:true,mobilePolishVersion:33},request,env),request,env);
}

async function orderTags(env,actor){
  try{
    const result=await env.DB.prepare(`SELECT oi.order_id,p.brand,c.id AS category_id,c.name AS category_name
      FROM order_items oi
      JOIN orders o ON o.id=oi.order_id
      LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE o.org_id=?`).bind(actor.orgId).all(),map=new Map();
    for(const row of rows(result)){
      if(!map.has(row.order_id))map.set(row.order_id,{brands:new Set(),categories:new Map()});
      const current=map.get(row.order_id);
      if(row.brand)current.brands.add(row.brand);
      if(row.category_id)current.categories.set(row.category_id,row.category_name||'Sin categoría');
    }
    return map;
  }catch(error){console.warn('v33_order_tags_failed',error?.message||error);return new Map()}
}

async function listAdvancedOrdersV33(env,actor){
  const [stableOrders,tags,suppliersResult,locationsResult,centersResult,categoriesResult]=await Promise.all([
    listOrdersV2(env,actor,new URL('https://nuvasto.local/api/orders')),
    orderTags(env,actor),
    env.DB.prepare('SELECT id,name FROM suppliers WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all(),
    env.DB.prepare('SELECT id,name FROM locations WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all(),
    env.DB.prepare('SELECT id,name,location_id FROM cost_centers WHERE org_id=? AND active=1 ORDER BY name COLLATE NOCASE').bind(actor.orgId).all(),
    env.DB.prepare("SELECT id,name,cost_center_id FROM categories WHERE org_id=? AND active=1 AND source='user' ORDER BY name COLLATE NOCASE").bind(actor.orgId).all()
  ]);
  const orders=stableOrders.map(order=>{
    const current=tags.get(order.id)||{brands:new Set(),categories:new Map()};
    return{...order,productBrands:[...current.brands],categories:[...current.categories].map(([id,name])=>({id,name}))};
  });
  return{orders,meta:{
    suppliers:rows(suppliersResult).map(item=>({id:item.id,name:item.name})),
    locations:rows(locationsResult).filter(item=>locationAllowed(actor,item.id)).map(item=>({id:item.id,name:item.name})),
    costCenters:rows(centersResult).filter(item=>locationAllowed(actor,item.location_id)).map(item=>({id:item.id,name:item.name,locationId:item.location_id})),
    categories:rows(categoriesResult).map(item=>({id:item.id,name:item.name,costCenterId:item.cost_center_id||''})),
    brands:[...new Set(orders.flatMap(item=>item.productBrands||[]))].sort((a,b)=>a.localeCompare(b,'es'))
  }};
}

function kindLabel(kind){return({order_pdf:'PDF de pedido',invoice_original:'Factura original',product_photo:'Foto de producto',supplier_logo:'Logo de proveedor',organization_logo:'Logo de empresa',backup:'Respaldo'}[kind]||String(kind||'Documento').replaceAll('_',' '))}
function entityLabel(row){
  if(row.entity_type==='order')return row.folio?`Pedido ${row.folio}`:'Pedido';
  if(row.entity_type==='invoice')return row.invoice_number?`Factura ${row.invoice_number}`:'Factura';
  if(row.entity_type==='product')return row.product_name||'Producto';
  if(row.entity_type==='supplier')return row.linked_supplier_name||'Proveedor';
  if(row.entity_type==='location')return row.location_name||'Local';
  if(row.entity_type==='organization')return'Empresa';
  return row.entity_type||'Documento';
}
function documentManageable(actor,row){
  if(isAdmin(actor))return true;
  if(row.document_kind==='order_pdf')return['purchaser','approver'].includes(String(actor.role||''));
  if(row.document_kind==='invoice_original')return['receiver','finance'].includes(String(actor.role||''));
  if(row.document_kind==='product_photo')return String(actor.role||'')==='purchaser';
  return false;
}
function documentDeletable(actor,row){
  if(!documentManageable(actor,row))return false;
  if(row.entity_type==='invoice')return isAdmin(actor)&&['review','rejected','void'].includes(String(row.invoice_status||''));
  return['order_pdf','product_photo'].includes(String(row.document_kind||''));
}

async function documentRows(env,actor){
  const [result,invoiceLocationsResult]=await Promise.all([
    env.DB.prepare(`SELECT dl.id,dl.file_id,dl.entity_type,dl.entity_id,dl.document_kind,dl.revision,dl.metadata_json,dl.created_at,
      f.storage_key,f.file_name,f.content_type,f.size_bytes,f.sha256,f.purpose,
      o.folio,o.status AS order_status,o.location_id AS order_location_id,os.name AS order_supplier_name,
      i.invoice_number,i.status AS invoice_status,isup.name AS invoice_supplier_name,
      p.name AS product_name,ls.name AS linked_supplier_name,l.name AS location_name
      FROM document_links dl
      JOIN files f ON f.id=dl.file_id
      LEFT JOIN orders o ON dl.entity_type='order' AND o.id=dl.entity_id
      LEFT JOIN suppliers os ON os.id=o.supplier_id
      LEFT JOIN invoices i ON dl.entity_type='invoice' AND i.id=dl.entity_id
      LEFT JOIN suppliers isup ON isup.id=i.supplier_id
      LEFT JOIN products p ON dl.entity_type='product' AND p.id=dl.entity_id
      LEFT JOIN suppliers ls ON dl.entity_type='supplier' AND ls.id=dl.entity_id
      LEFT JOIN locations l ON dl.entity_type='location' AND l.id=dl.entity_id
      WHERE dl.org_id=? ORDER BY dl.created_at DESC LIMIT 1000`).bind(actor.orgId).all(),
    env.DB.prepare(`SELECT ill.invoice_id,GROUP_CONCAT(DISTINCT ill.location_id) AS location_ids
      FROM invoice_location_links ill JOIN invoices i ON i.id=ill.invoice_id
      WHERE i.org_id=? GROUP BY ill.invoice_id`).bind(actor.orgId).all()
  ]);
  const invoiceLocations=new Map(rows(invoiceLocationsResult).map(item=>[item.invoice_id,String(item.location_ids||'').split(',').filter(Boolean)]));
  return rows(result).filter(row=>{
    if(actor.locationScope?.includes?.('*'))return true;
    if(row.entity_type==='order')return locationAllowed(actor,row.order_location_id);
    if(row.entity_type==='invoice')return(invoiceLocations.get(row.entity_id)||[]).some(id=>locationAllowed(actor,id));
    return isAdmin(actor);
  });
}

async function listDocumentArchiveV33(env,actor){
  const source=await documentRows(env,actor),documents=source.map(row=>({
    id:row.id,fileId:row.file_id,key:row.storage_key,name:row.file_name,contentType:row.content_type,size:Number(row.size_bytes||0),sha256:row.sha256,purpose:row.purpose,
    entityType:row.entity_type,entityId:row.entity_id,entityLabel:entityLabel(row),kind:row.document_kind,kindLabel:kindLabel(row.document_kind),revision:Number(row.revision||1),metadata:safeJson(row.metadata_json,{}),
    supplierName:row.order_supplier_name||row.invoice_supplier_name||'',status:row.order_status||row.invoice_status||'',createdAt:row.created_at,
    canRename:documentManageable(actor,row),canDelete:documentDeletable(actor,row),deleteHint:row.entity_type==='invoice'&&!documentDeletable(actor,row)?'Las facturas aprobadas o pagadas deben anularse antes de eliminar su archivo.':''
  }));
  const kinds=[...new Map(documents.map(item=>[item.kind,{id:item.kind,name:item.kindLabel}])).values()];
  const entities=[...new Map(documents.map(item=>[item.entityType,{id:item.entityType,name:({order:'Pedidos',invoice:'Facturas',product:'Productos',supplier:'Proveedores',organization:'Empresa',location:'Locales'}[item.entityType]||item.entityType)}])).values()];
  return{documents,meta:{kinds,entities,total:documents.length}};
}

async function requireDocument(env,actor,id){
  const source=await documentRows(env,actor),row=source.find(item=>item.id===id);
  if(!row)throw new HttpError(404,'Documento no encontrado','not_found');
  return row;
}

function cleanDocumentName(value,currentName){
  let name=String(value||'').trim().replace(/[\\/\0<>:"|?*]+/g,'-').replace(/\s+/g,' ').slice(0,180);
  if(!name)throw new HttpError(400,'El nombre del documento es obligatorio','validation_error',{field:'name'});
  const extension=String(currentName||'').match(/\.[a-z0-9]{1,10}$/i)?.[0]||'';
  if(extension&&!name.toLowerCase().endsWith(extension.toLowerCase()))name+=extension;
  return name;
}

async function renameDocumentV33(request,env,actor,id){
  const current=await requireDocument(env,actor,id);
  if(!documentManageable(actor,current))throw new HttpError(403,'Tu rol no puede editar este documento','forbidden');
  const body=await readJson(request),name=cleanDocumentName(body.name,current.file_name),timestamp=nowIso();
  await env.DB.prepare('UPDATE files SET file_name=? WHERE id=? AND org_id=?').bind(name,current.file_id,actor.orgId).run();
  await writeAudit(env,actor,request,'document.rename','document',id,{fileId:current.file_id,from:current.file_name,to:name,updatedAt:timestamp});
  return{id,fileId:current.file_id,name,updatedAt:timestamp};
}

async function deleteDocumentV33(request,env,actor,id){
  const current=await requireDocument(env,actor,id);
  if(!documentDeletable(actor,current))throw new HttpError(409,current.entity_type==='invoice'?'Anula o rechaza la factura antes de eliminar su archivo':'Este documento debe gestionarse desde su módulo de origen','document_locked');
  const otherLinks=await env.DB.prepare('SELECT COUNT(*) AS total FROM document_links WHERE file_id=? AND id<>?').bind(current.file_id,id).first(),deleteFile=Number(otherLinks?.total||0)===0;
  if(deleteFile&&current.storage_key.startsWith('r2/')){
    if(!env.FILES)throw new HttpError(503,'R2 no está disponible para eliminar el archivo','storage_unavailable');
    await env.FILES.delete(current.storage_key);
  }
  const statements=[env.DB.prepare('DELETE FROM document_links WHERE id=? AND org_id=?').bind(id,actor.orgId)];
  if(current.entity_type==='invoice')statements.push(env.DB.prepare('UPDATE invoices SET pdf_file_id=CASE WHEN pdf_file_id=? THEN NULL ELSE pdf_file_id END,updated_at=? WHERE id=? AND org_id=?').bind(current.file_id,nowIso(),current.entity_id,actor.orgId));
  if(current.entity_type==='product')statements.push(env.DB.prepare("UPDATE products SET image_file_id='',image_key='',updated_at=? WHERE id=? AND org_id=? AND image_file_id=?").bind(nowIso(),current.entity_id,actor.orgId,current.file_id));
  if(deleteFile)statements.push(env.DB.prepare('DELETE FROM files WHERE id=? AND org_id=?').bind(current.file_id,actor.orgId));
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'document.delete','document',id,{fileId:current.file_id,key:current.storage_key,kind:current.document_kind,entityType:current.entity_type,entityId:current.entity_id,physicalFileDeleted:deleteFile});
  return{deleted:true,id,fileId:current.file_id,physicalFileDeleted:deleteFile};
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase(),documentId=routeId(url.pathname,/^\/api\/documents\/archive\/([^/]+)$/);
    try{
      if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
      if(url.pathname.startsWith('/api/'))await ensureSchema(env);
      if(method==='GET'&&url.pathname==='/api/orders/advanced'){
        const actor=await authenticate(request,env);return decorate(ok(await listAdvancedOrdersV33(env,actor),request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/documents/archive'){
        const actor=await authenticate(request,env);return decorate(ok(await listDocumentArchiveV33(env,actor),request,env),request,env);
      }
      if(documentId&&method==='PATCH'){
        const actor=await authenticate(request,env);return decorate(ok({document:await renameDocumentV33(request,env,actor,documentId)},request,env),request,env);
      }
      if(documentId&&method==='DELETE'){
        const actor=await authenticate(request,env);return decorate(ok(await deleteDocumentV33(request,env,actor,documentId),request,env),request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
