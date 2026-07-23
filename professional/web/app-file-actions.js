import {$,esc,state,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const cache=new Map(),inflight=new Map();
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let initialized=false;

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

function previewShell(name){return `<div class="document-preview-shell"><div id="documentPreviewFrame" class="document-preview-loading"><span class="spinner"></span><strong>Abriendo ${esc(name)}</strong><small>La vista aparecerá en cuanto el PDF esté listo.</small></div><div class="document-preview-actions"><button class="btn primary" type="button" data-preview-download disabled>Guardar archivo</button><button class="btn" type="button" data-preview-share disabled>Compartir</button></div></div>`}

export async function previewDocument(key,name='pedido.pdf'){
  openModal({eyebrow:'DOCUMENTO',title:name,subtitle:'Vista previa dentro de Pedidos Pro.',size:'large',hideSubmit:true,body:previewShell(name)});
  let url='';
  try{
    const {blob}=await fetchDocument(key,name);url=URL.createObjectURL(blob);
    const frame=$('#documentPreviewFrame');if(!frame)return;
    frame.className='document-preview-frame';frame.innerHTML=`<iframe title="${esc(name)}" src="${url}#view=FitH"></iframe>`;
    const download=$('[data-preview-download]'),share=$('[data-preview-share]');download.disabled=false;share.disabled=false;
    download.onclick=()=>downloadDocument(key,name).catch(error=>toast(error.message,'error'));
    share.onclick=()=>shareDocument(key,name).catch(error=>toast(error.message,'error'));
    $('#modal')?.addEventListener('close',()=>{if(url)setTimeout(()=>URL.revokeObjectURL(url),800)},{once:true});
  }catch(error){
    const frame=$('#documentPreviewFrame');if(frame){frame.className='document-preview-error';frame.innerHTML=`<strong>No se pudo abrir</strong><small>${esc(error.message)}</small><button class="btn" type="button" data-preview-retry>Reintentar</button>`;frame.querySelector('[data-preview-retry]').onclick=()=>previewDocument(key,name)}
    throw error;
  }
}

function anchorDownload(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
async function nativeShare(file,name){if(!navigator.share)return false;if(navigator.canShare&&!navigator.canShare({files:[file]}))return false;await navigator.share({title:name,files:[file]});return true}

export async function downloadDocument(key,name='pedido.pdf'){
  const prepared=cache.get(key);
  if(prepared&&isIOS&&navigator.share){try{if(await nativeShare(prepared.file,name))return}catch(error){if(error?.name==='AbortError')return}}
  const {blob,file}=prepared||await fetchDocument(key,name);
  if(isIOS&&navigator.share){openShareReady(file,name,'Guardar en Archivos o compartir');return}
  anchorDownload(blob,name);toast('Archivo descargado');
}

function openShareReady(file,name,title='Compartir archivo'){
  openModal({eyebrow:'ARCHIVO LISTO',title,subtitle:name,hideSubmit:true,body:`<div class="share-ready"><p>Presiona el botón para abrir el menú nativo del iPhone.</p><button class="btn primary wide" type="button" id="shareReadyButton">Compartir ahora</button></div>`});
  $('#shareReadyButton').onclick=async()=>{try{await nativeShare(file,name)}catch(error){if(error?.name!=='AbortError')toast(error.message,'error')}};
}

export async function shareDocument(key,name='pedido.pdf'){
  const prepared=cache.get(key);
  if(prepared){try{if(await nativeShare(prepared.file,name))return}catch(error){if(error?.name==='AbortError')return;if(error?.name!=='NotAllowedError')throw error}return openShareReady(prepared.file,name)}
  openModal({eyebrow:'COMPARTIR',title:'Preparando archivo',subtitle:name,hideSubmit:true,body:'<div class="document-preview-loading"><span class="spinner"></span><strong>Preparando PDF…</strong><small>Cuando termine aparecerá el botón para compartir.</small></div>'});
  const {file}=await fetchDocument(key,name);openShareReady(file,name);
}

export async function ensureOrderDocument(order){
  if(order.pdfKey)return {key:order.pdfKey,name:order.pdfName||`${order.folio}.pdf`};
  const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}/pdf`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:'{}'}),payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo generar el PDF');
  const document=payload.document||{};order.pdfKey=document.key||'';order.pdfName=document.name||`${order.folio}.pdf`;return {key:order.pdfKey,name:order.pdfName};
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
