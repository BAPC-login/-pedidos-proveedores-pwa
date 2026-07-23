import {$,esc,state,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const cache=new Map();
const inflight=new Map();
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

async function fetchDocument(key,name='documento.pdf'){
  if(cache.has(key))return cache.get(key);
  if(inflight.has(key))return inflight.get(key);
  const request=fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'})
    .then(async response=>{
      if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el archivo')}
      const blob=await response.blob();
      const value={blob,file:new File([blob],name,{type:blob.type||'application/pdf'})};
      cache.set(key,value);inflight.delete(key);return value;
    }).catch(error=>{inflight.delete(key);throw error});
  inflight.set(key,request);return request;
}

export function warmDocuments(documents=[]){
  const work=()=>documents.filter(item=>item?.key).slice(0,12).forEach(item=>fetchDocument(item.key,item.name||'pedido.pdf').catch(()=>{}));
  if('requestIdleCallback'in window)requestIdleCallback(work,{timeout:1800});else setTimeout(work,350);
}

export async function previewDocument(key,name='pedido.pdf'){
  const {blob}=await fetchDocument(key,name);const url=URL.createObjectURL(blob);
  openModal({eyebrow:'DOCUMENTO',title:name,subtitle:'Vista previa dentro de Pedidos Pro.',size:'large',hideSubmit:true,body:`<div class="document-preview-shell"><iframe title="${esc(name)}" src="${url}"></iframe><div class="document-preview-actions"><button class="btn primary" type="button" data-preview-download>Guardar archivo</button><button class="btn" type="button" data-preview-share>Compartir</button></div></div>`});
  $('[data-preview-download]').onclick=()=>downloadDocument(key,name).catch(error=>toast(error.message,'error'));
  $('[data-preview-share]').onclick=()=>shareDocument(key,name).catch(error=>toast(error.message,'error'));
  $('#modal')?.addEventListener('close',()=>setTimeout(()=>URL.revokeObjectURL(url),1000),{once:true});
}

function anchorDownload(blob,name){
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}

async function nativeShare(file,name){
  if(!navigator.share)return false;
  if(navigator.canShare&&!navigator.canShare({files:[file]}))return false;
  await navigator.share({title:name,files:[file]});return true;
}

export async function downloadDocument(key,name='pedido.pdf'){
  const {blob,file}=await fetchDocument(key,name);
  if(isIOS&&navigator.share){
    try{if(await nativeShare(file,name))return}catch(error){if(error?.name==='AbortError')return}
  }
  anchorDownload(blob,name);
  toast('Archivo preparado para guardar');
}

function openShareReady(file,name){
  openModal({eyebrow:'COMPARTIR',title:name,subtitle:'El archivo ya está preparado. Presiona una vez para abrir el menú nativo.',hideSubmit:true,body:`<button class="btn primary wide" type="button" id="shareReadyButton">Compartir ahora</button>`});
  $('#shareReadyButton').onclick=async()=>{try{await nativeShare(file,name)}catch(error){if(error?.name!=='AbortError')toast(error.message,'error')}};
}

export async function shareDocument(key,name='pedido.pdf'){
  const prepared=cache.get(key);
  if(prepared){
    try{if(await nativeShare(prepared.file,name))return}catch(error){if(error?.name==='AbortError')return;if(error?.name!=='NotAllowedError')throw error}
    return openShareReady(prepared.file,name);
  }
  toast('Preparando archivo para compartir…');
  const {file}=await fetchDocument(key,name);
  try{if(await nativeShare(file,name))return}catch(error){if(error?.name==='AbortError')return}
  openShareReady(file,name);
}

export async function ensureOrderDocument(order){
  if(order.pdfKey)return {key:order.pdfKey,name:order.pdfName||`${order.folio}.pdf`};
  const response=await fetch(`/api/orders/${encodeURIComponent(order.id)}/pdf`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:'{}'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo generar el PDF');
  const document=payload.document||{};order.pdfKey=document.key||'';order.pdfName=document.name||`${order.folio}.pdf`;return {key:order.pdfKey,name:order.pdfName};
}
