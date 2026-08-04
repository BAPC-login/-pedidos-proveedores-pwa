import {$,esc,state,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const cache=new Map(),inflight=new Map();
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let initialized=false;

async function currentOrderDocument(key,name='pedido.pdf'){
  if(!/\.pdf$/i.test(name))return{key,name};
  let orders=state.cache.orders||[];
  let order=orders.find(item=>item?.pdfKey===key||(item?.folio&&String(name).toUpperCase().includes(String(item.folio).toUpperCase())));
  if(!order){
    try{
      const response=await fetch('/api/orders',{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'});
      if(response.ok){const payload=await response.json();orders=payload.orders||[];state.cache.orders=orders;order=orders.find(item=>item?.pdfKey===key||(item?.folio&&String(name).toUpperCase().includes(String(item.folio).toUpperCase())))}
    }catch(error){console.warn('order_document_lookup_failed',error)}
  }
  if(!order?.id)return{key,name};
  try{
    const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}/pdf`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'}),payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo actualizar el PDF');
    const document=payload.document||{};
    const next={key:document.key||key,name:document.name||name};
    order.pdfKey=next.key;order.pdfName=next.name;
    if(key&&key!==next.key)cache.delete(key);
    return next;
  }catch(error){
    console.warn('order_document_refresh_failed',error);
    return{key,name};
  }
}

async function fetchDocument(key,name='documento.pdf'){
  if(cache.has(key))return cache.get(key);
  if(inflight.has(key))return inflight.get(key);
  const request=fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'}).then(async response=>{
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el archivo')}
    const blob=await response.blob(),value={blob,file:new File([blob],name,{type:blob.type||'application/pdf'})};cache.set(key,value);inflight.delete(key);return value;
  }).catch(error=>{inflight.delete(key);throw error});
  inflight.set(key,request);return request;
}

export function warmDocuments(documents=[]){
  const work=()=>documents.filter(item=>item?.key).slice(0,20).forEach(item=>fetchDocument(item.key,item.name||'pedido.pdf').catch(()=>{}));
  if('requestIdleCallback'in window)requestIdleCallback(work,{timeout:900});else setTimeout(work,120);
}

function previewShell(name){return `<div class="document-preview-shell"><div id="documentPreviewFrame" class="document-preview-loading"><span class="spinner"></span><strong>Abriendo ${esc(name)}</strong><small>La vista aparecerá en cuanto el PDF esté listo.</small></div><div class="document-preview-actions"><button class="btn primary" type="button" data-preview-download disabled>Descargar PDF</button><button class="btn" type="button" data-preview-share disabled>Compartir</button></div></div>`}

export async function previewDocument(key,name='pedido.pdf'){
  openModal({eyebrow:'DOCUMENTO',title:name,subtitle:'Vista previa dentro de la plataforma.',size:'large',hideSubmit:true,body:previewShell(name)});
  let url='';
  try{
    const current=await currentOrderDocument(key,name),{blob}=await fetchDocument(current.key,current.name);url=URL.createObjectURL(blob);
    const frame=$('#documentPreviewFrame');if(!frame)return;
    frame.className='document-preview-frame';frame.innerHTML=`<iframe title="${esc(current.name)}" src="${url}#view=FitH&toolbar=0&navpanes=0"></iframe>`;
    const download=$('[data-preview-download]'),share=$('[data-preview-share]');download.disabled=false;share.disabled=false;
    download.onclick=()=>downloadDocument(current.key,current.name).catch(error=>toast(error.message,'error'));
    share.onclick=()=>shareDocument(current.key,current.name).catch(error=>toast(error.message,'error'));
    $('#modal')?.addEventListener('close',()=>{if(url)setTimeout(()=>URL.revokeObjectURL(url),800)},{once:true});
  }catch(error){
    const frame=$('#documentPreviewFrame');if(frame){frame.className='document-preview-error';frame.innerHTML=`<strong>No se pudo abrir</strong><small>${esc(error.message)}</small><button class="btn" type="button" data-preview-retry>Reintentar</button>`;frame.querySelector('[data-preview-retry]').onclick=()=>previewDocument(key,name)}
    throw error;
  }
}

function anchorDownload(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
async function nativeShare(file,name){if(!navigator.share)return false;if(navigator.canShare&&!navigator.canShare({files:[file]}))return false;await navigator.share({title:name,files:[file]});return true}

export async function downloadDocument(key,name='pedido.pdf'){
  const current=await currentOrderDocument(key,name),prepared=cache.get(current.key);
  if(prepared&&isIOS&&navigator.share){try{if(await nativeShare(prepared.file,current.name))return}catch(error){if(error?.name==='AbortError')return}}
  const {blob,file}=prepared||await fetchDocument(current.key,current.name);
  if(isIOS&&navigator.share){openShareReady(file,current.name,'Guardar en Archivos o compartir');return}
  anchorDownload(blob,current.name);toast('Archivo descargado');
}

function openShareReady(file,name,title='Compartir archivo'){
  openModal({eyebrow:'ARCHIVO LISTO',title,subtitle:name,hideSubmit:true,body:`<div class="share-ready"><p>Presiona el botón para abrir el menú nativo del iPhone.</p><button class="btn primary wide" type="button" id="shareReadyButton">Compartir ahora</button></div>`});
  $('#shareReadyButton').onclick=async()=>{try{await nativeShare(file,name)}catch(error){if(error?.name!=='AbortError')toast(error.message,'error')}};
}

export async function shareDocument(key,name='pedido.pdf'){
  const current=await currentOrderDocument(key,name),prepared=cache.get(current.key);
  if(prepared){try{if(await nativeShare(prepared.file,current.name))return}catch(error){if(error?.name==='AbortError')return;if(error?.name!=='NotAllowedError')throw error}return openShareReady(prepared.file,current.name)}
  openModal({eyebrow:'COMPARTIR',title:'Preparando archivo',subtitle:current.name,hideSubmit:true,body:'<div class="document-preview-loading"><span class="spinner"></span><strong>Preparando PDF…</strong><small>Cuando termine aparecerá el botón para compartir.</small></div>'});
  const {file}=await fetchDocument(current.key,current.name);openShareReady(file,current.name);
}

export async function ensureOrderDocument(order){
  const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}/pdf`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'}),payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo generar el PDF');
  const document=payload.document||{};const previousKey=order.pdfKey;order.pdfKey=document.key||order.pdfKey||'';order.pdfName=document.name||order.pdfName||`${order.folio}.pdf`;if(previousKey&&previousKey!==order.pdfKey)cache.delete(previousKey);return {key:order.pdfKey,name:order.pdfName};
}

export function initializeFileActions(){
  if(initialized)return;initialized=true;
  document.addEventListener('click',event=>{
    const orderButton=event.target.closest?.('[data-document-key]'),invoiceButton=event.target.closest?.('[data-invoice-file]'),button=orderButton||invoiceButton;if(!button)return;
    const key=orderButton?button.dataset.documentKey:button.dataset.invoiceFile,name=orderButton?(button.dataset.documentName||'pedido.pdf'):(button.dataset.invoiceName||'factura.pdf'),mode=orderButton?(button.dataset.documentMode||'preview'):'preview';
    event.preventDefault();event.stopImmediatePropagation();
    const action=mode==='share'?shareDocument:mode==='download'?downloadDocument:previewDocument;action(key,name).catch(error=>toast(error.message,'error'));
  },true);
}
