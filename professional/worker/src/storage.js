import {Buffer} from 'node:buffer';
import {HttpError, nowIso, sanitizeFileName, sha256, uuid} from './core.js';

const encoder=new TextEncoder();
const CHUNK_BYTES=192*1024;
const CHUNK_BATCH=20;

function ascii(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

function minimalPdf(lines){
  const content=['BT','/F1 10 Tf','42 800 Td'];
  lines.slice(0,52).forEach((line,index)=>{if(index)content.push('0 -14 Td');content.push(`(${ascii(line).slice(0,105)}) Tj`)});
  content.push('ET');
  const stream=content.join('\n');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}\nendstream`];
  let output='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(encoder.encode(output).byteLength);output+=`${index+1} 0 obj\n${object}\nendobj\n`});
  const xref=encoder.encode(output).byteLength;output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset=>{output+=`${String(offset).padStart(10,'0')} 00000 n \n`});
  output+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(output);
}

async function storeD1Chunks(env,fileId,data,createdAt){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  const pending=[];
  for(let offset=0,index=0;offset<bytes.length;offset+=CHUNK_BYTES,index++){
    const encoded=Buffer.from(bytes.subarray(offset,Math.min(offset+CHUNK_BYTES,bytes.length))).toString('base64');
    pending.push(env.DB.prepare('INSERT INTO file_chunks (file_id, chunk_index, data_base64, created_at) VALUES (?, ?, ?, ?)').bind(fileId,index,encoded,createdAt));
    if(pending.length===CHUNK_BATCH)await env.DB.batch(pending.splice(0));
  }
  if(pending.length)await env.DB.batch(pending);
}

export async function storeBytes(env,actor,{bytes,fileName,contentType='application/octet-stream',purpose='general',entityType='',entityId='',documentKind='',revision=1,metadata={}}){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const fileId=uuid();
  const safeName=sanitizeFileName(fileName||'archivo');
  const backend=env.FILES?'r2':'d1';
  const key=`${backend}/${actor.orgId}/${purpose}/${new Date().toISOString().slice(0,10)}/${fileId}-${safeName}`;
  const digest=await sha256(data);
  const createdAt=nowIso();

  if(env.FILES){
    await env.FILES.put(key,data,{httpMetadata:{contentType},customMetadata:{orgId:actor.orgId,uploadedBy:actor.userId,sha256:digest,purpose,entityType,entityId}});
  }

  try{
    const statements=[env.DB.prepare(`INSERT INTO files (id, org_id, storage_key, file_name, content_type, size_bytes, sha256, purpose, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(fileId,actor.orgId,key,fileName||safeName,contentType,data.byteLength,digest,purpose,actor.userId,createdAt)];
    if(entityType&&entityId&&documentKind)statements.push(env.DB.prepare(`INSERT INTO document_links (id, org_id, file_id, entity_type, entity_id, document_kind, revision, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(),actor.orgId,fileId,entityType,entityId,documentKind,Number(revision||1),JSON.stringify(metadata||{}),createdAt));
    await env.DB.batch(statements);
    if(!env.FILES)await storeD1Chunks(env,fileId,data,createdAt);
  }catch(error){
    if(env.FILES)await env.FILES.delete(key).catch(()=>{});
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run().catch(()=>{});
    throw error;
  }

  return {id:fileId,key,name:fileName||safeName,size:data.byteLength,contentType,sha256:digest,purpose,documentKind,revision:Number(revision||1),backend,createdAt};
}

export async function storeFile(env,actor,file,options={}){
  if(!(file instanceof File))throw new HttpError(400,'Adjunta un archivo','missing_file');
  return storeBytes(env,actor,{...options,bytes:await file.arrayBuffer(),fileName:file.name||options.fileName||'archivo',contentType:file.type||options.contentType||'application/octet-stream'});
}

export async function linkExistingFile(env,actor,{fileId,entityType,entityId,documentKind,revision=1,metadata={}}){
  const file=await env.DB.prepare('SELECT id FROM files WHERE id = ? AND org_id = ?').bind(fileId,actor.orgId).first();
  if(!file)throw new HttpError(404,'Archivo no encontrado','not_found');
  await env.DB.prepare(`INSERT OR IGNORE INTO document_links (id, org_id, file_id, entity_type, entity_id, document_kind, revision, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(),actor.orgId,fileId,entityType,entityId,documentKind,Number(revision||1),JSON.stringify(metadata||{}),nowIso()).run();
  return {linked:true};
}

export async function listDocuments(env,actor,{entityType='',entityId='',kind=''}={}){
  const result=await env.DB.prepare(`SELECT dl.id,dl.entity_type,dl.entity_id,dl.document_kind,dl.revision,dl.metadata_json,dl.created_at,f.id AS file_id,f.storage_key,f.file_name,f.content_type,f.size_bytes,f.sha256 FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=? AND (?='' OR dl.entity_type=?) AND (?='' OR dl.entity_id=?) AND (?='' OR dl.document_kind=?) ORDER BY dl.created_at DESC LIMIT 1000`).bind(actor.orgId,entityType,entityType,entityId,entityId,kind,kind).all();
  return (result.results||[]).map(row=>({id:row.id,fileId:row.file_id,key:row.storage_key,name:row.file_name,contentType:row.content_type,size:Number(row.size_bytes||0),sha256:row.sha256,entityType:row.entity_type,entityId:row.entity_id,kind:row.document_kind,revision:Number(row.revision||1),metadata:JSON.parse(row.metadata_json||'{}'),createdAt:row.created_at}));
}

export async function getStoredFile(env,actor,key){
  const record=await env.DB.prepare('SELECT id, storage_key, file_name, content_type, size_bytes FROM files WHERE org_id = ? AND storage_key = ?').bind(actor.orgId,key).first();
  if(!record)throw new HttpError(404,'Archivo no encontrado','not_found');
  if(record.storage_key.startsWith('d1/')){
    const result=await env.DB.prepare('SELECT data_base64 FROM file_chunks WHERE file_id = ? ORDER BY chunk_index').bind(record.id).all();
    const chunks=(result.results||[]).map(row=>Buffer.from(String(row.data_base64||''),'base64'));
    if(!chunks.length&&Number(record.size_bytes||0)>0)throw new HttpError(404,'Contenido de archivo no encontrado','not_found');
    const body=Buffer.concat(chunks);
    return new Response(body,{headers:{'Content-Type':record.content_type||'application/octet-stream','Content-Length':String(body.byteLength),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(record.file_name||'archivo')}`,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  }
  if(!env.FILES)throw new HttpError(503,'R2 no está habilitado para este archivo','storage_unavailable');
  const object=await env.FILES.get(record.storage_key);
  if(!object)throw new HttpError(404,'Contenido de archivo no encontrado','not_found');
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(record.file_name||'archivo')}`);headers.set('Cache-Control','private, max-age=60');headers.set('X-Content-Type-Options','nosniff');
  return new Response(object.body,{headers});
}

export async function recordSnapshot(env,actor,{entityType,entityId,locationId=null,revision=1,snapshot}){
  await env.DB.prepare('INSERT INTO entity_snapshots (id, org_id, location_id, entity_type, entity_id, revision, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(uuid(),actor.orgId,locationId,entityType,entityId,Number(revision||1),JSON.stringify(snapshot),nowIso()).run();
}

export async function archiveOrderPdf(env,actor,order){
  const lines=['PEDIDOS PRO',`Folio: ${order.folio}`,`Marca: ${actor.organization?.name||''}`,`Local: ${order.locationName||''}`,`Proveedor: ${order.supplierName||''}`,`Estado: ${order.status}`,`Revision: ${order.revision}`,`Entrega: ${order.deliveryDate||'-'}`,`Total: CLP ${Number(order.grossTotal||0).toLocaleString('es-CL')}`,'','Productos:'];
  (order.items||[]).forEach((item,index)=>lines.push(`${index+1}. ${item.description} | ${item.quantityOrdered} ${item.orderUnit} | CLP ${Number(item.expectedGrossTotal||0).toLocaleString('es-CL')}`));
  if(order.notes)lines.push('',`Notas: ${order.notes}`);lines.push('',`Generado: ${new Date().toISOString()}`);
  const file=await storeBytes(env,actor,{bytes:minimalPdf(lines),fileName:`${order.folio}-r${order.revision}-${order.status}.pdf`,contentType:'application/pdf',purpose:'order-pdf',entityType:'order',entityId:order.id,documentKind:'order_pdf',revision:order.revision,metadata:{folio:order.folio,status:order.status,locationId:order.locationId}});
  await recordSnapshot(env,actor,{entityType:'order',entityId:order.id,locationId:order.locationId,revision:order.revision,snapshot:order});
  return file;
}
