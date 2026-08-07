import {HttpError} from '../core.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,id)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function latestDocument(env,actor,orderId){
  return env.DB.prepare(`SELECT f.id,f.storage_key,f.file_name,f.size_bytes,dl.revision
    FROM document_links dl JOIN files f ON f.id=dl.file_id
    WHERE dl.org_id=? AND dl.entity_type='order' AND dl.entity_id=? AND dl.document_kind='order_pdf'
    ORDER BY dl.revision DESC,dl.created_at DESC LIMIT 1`).bind(actor.orgId,orderId).first();
}

export async function ensureBatchDocumentsV42(env,actor,batchId,{attempts=2}={}){
  const result=await env.DB.prepare(`SELECT id,folio,status,location_id,supplier_id FROM orders
    WHERE org_id=? AND batch_id=? AND status!='cancelled' ORDER BY created_at,id`).bind(actor.orgId,batchId).all(),orders=rows(result);
  if(!orders.length)throw new HttpError(404,'Archivo de pedidos no encontrado','not_found');
  if(orders.some(order=>!locationAllowed(actor,order.location_id)))throw new HttpError(403,'No tienes acceso a todos los pedidos del archivo','forbidden');
  const documents=[],errors=[];
  for(const order of orders){
    let document=await latestDocument(env,actor,order.id);
    if(document){documents.push({orderId:order.id,folio:order.folio,key:document.storage_key,name:document.file_name,size:Number(document.size_bytes||0),revision:Number(document.revision||1),generated:false});continue}
    let lastError=null;
    for(let attempt=1;attempt<=attempts;attempt++){
      try{
        const full=await getOrder(env,actor,order.id),file=await archiveOrderPdf(env,actor,full);
        document={storage_key:file.key,file_name:file.name,size_bytes:file.size,revision:file.revision};
        documents.push({orderId:order.id,folio:order.folio,key:file.key,name:file.name,size:Number(file.size||0),revision:Number(file.revision||1),generated:true});lastError=null;break;
      }catch(error){lastError=error;if(attempt<attempts)await sleep(120*attempt)}
    }
    if(lastError)errors.push({orderId:order.id,folio:order.folio,error:String(lastError?.message||lastError)});
  }
  if(errors.length)throw new HttpError(503,'Los pedidos se emitieron, pero no se pudieron generar todos los PDF. Presiona Emitir nuevamente para reintentar los documentos.','order_pdf_generation_failed',{documents,errors,retryable:true});
  return{batchId,documentCount:documents.length,documents,verified:true};
}
