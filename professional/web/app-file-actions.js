import {$,esc,state,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const FILE_CACHE_LIMIT=12;
const cache=new Map(),inflight=new Map(),documentInflight=new Map(),orderDocuments=new Map(),orderPreparation=new Map(),preparedOrders=new Map();
const observedShareButtons=new WeakSet();
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let initialized=false,shareObserver=null,shareMutationObserver=null,activeContextOrderId='',scanQueued=false;

function remember(map,key,value,limit=FILE_CACHE_LIMIT){
  if(map.has(key))map.delete(key);map.set(key,value);
  while(map.size>limit){const oldest=map.keys().next().value;if(oldest===undefined)break;map.delete(oldest)}
  return value;
}
function orderFingerprint(order={}){return String(order.revision??order.updatedAt??order.updated_at??order.status??'')}
function knownDocument(order={}){
  if(!order?.id)return null;
  const current=orderDocuments.get(order.id),fingerprint=orderFingerprint(order);
  if(current&&((fingerprint&&current.fingerprint===fingerprint)||(!fingerprint&&Date.now()-current.at<15000)))return current;
  if(order.pdfKey){const document={key:order.pdfKey,name:order.pdfName||`${order.folio||'pedido'}.pdf`,at:Date.now(),fingerprint};orderDocuments.set(order.id,document);return document}
  return null;
}
async function currentOrderDocument(key,name='pedido.pdf'){
  if(key)return{key,name};
  let orders=state.cache.orders||[],order=orders.find(item=>item?.folio&&String(name).toUpperCase().includes(String(item.folio).toUpperCase()));
  if(!order){
    try{
      const response=await fetch('/api/orders',{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'});
      if(response.ok){const payload=await response.json();orders=payload.orders||[];state.cache.orders=orders;order=orders.find(item=>item?.folio&&String(name).toUpperCase().includes(String(item.folio).toUpperCase()))}
    }catch(error){console.warn('order_document_lookup_failed',error)}
  }
  if(!order?.id)throw new Error('No se encontró el PDF del pedido');
  return ensureOrderDocument(order);
}

async function fetchDocument(key,name='documento.pdf'){
  if(!key)throw new Error('El documento aún no está disponible');
  if(cache.has(key))return cache.get(key);
  if(inflight.has(key))return inflight.get(key);
  const request=fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'}).then(async response=>{
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el archivo')}
    const blob=await response.blob(),value={blob,file:new File([blob],name,{type:blob.type||'application/pdf'})};remember(cache,key,value);inflight.delete(key);return value;
  }).catch(error=>{inflight.delete(key);throw error});
  inflight.set(key,request);return request;
}

export function warmDocuments(documents=[]){
  const work=()=>documents.filter(item=>item?.key).slice(0,FILE_CACHE_LIMIT).forEach(item=>fetchDocument(item.key,item.name||'pedido.pdf').catch(()=>{}));
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
function canNativeShareFiles(files){return Boolean(navigator.share&&(!navigator.canShare||navigator.canShare({files})))}
function nativeShareFiles(files,title){if(!canNativeShareFiles(files))throw Object.assign(new Error('Este dispositivo no permite compartir este archivo directamente'),{code:'native_share_unavailable'});return navigator.share({title,files})}
async function nativeShare(file,name){await nativeShareFiles([file],name);return true}

export async function downloadDocument(key,name='pedido.pdf'){
  const current=await currentOrderDocument(key,name),prepared=cache.get(current.key),value=prepared||await fetchDocument(current.key,current.name);
  if(isIOS&&navigator.share){try{await nativeShare(value.file,current.name);return}catch(error){if(error?.name==='AbortError')return;if(error?.name!=='NotAllowedError')console.warn('native_download_share_failed',error)}}
  anchorDownload(value.blob,current.name);toast('Archivo descargado');
}

export async function shareDocument(key,name='pedido.pdf'){
  if(!key)throw new Error('El PDF aún no está disponible');
  const prepared=cache.get(key);
  if(prepared){try{await nativeShare(prepared.file,name);return}catch(error){if(error?.name==='AbortError')return;throw error}}
  const {blob,file}=await fetchDocument(key,name);
  if(!navigator.share){anchorDownload(blob,name);toast('PDF descargado');return}
  try{await nativeShare(file,name)}catch(error){
    if(error?.name==='AbortError')return;
    if(error?.name==='NotAllowedError')throw Object.assign(new Error('El PDF ya está listo. Toca Compartir nuevamente.'),{code:'share_requires_gesture'});
    throw error;
  }
}

export async function ensureOrderDocument(order,{force=false}={}){
  if(!order?.id)throw new Error('Pedido no disponible');
  const known=!force&&knownDocument(order);if(known){order.pdfKey=known.key;order.pdfName=known.name;return{key:known.key,name:known.name}}
  if(documentInflight.has(order.id))return documentInflight.get(order.id);
  const request=fetch(`/api/orders/${encodeURIComponent(order.id)}/pdf`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'}).then(async response=>{
    const payload=await response.json().catch(()=>({}));if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo generar el PDF');
    const document=payload.document||{},previousKey=order.pdfKey,next={key:document.key||order.pdfKey||'',name:document.name||order.pdfName||`${order.folio||'pedido'}.pdf`,at:Date.now(),fingerprint:orderFingerprint(order)};
    if(!next.key)throw new Error('El PDF no quedó disponible');order.pdfKey=next.key;order.pdfName=next.name;orderDocuments.set(order.id,next);if(previousKey&&previousKey!==next.key)cache.delete(previousKey);return{key:next.key,name:next.name};
  }).finally(()=>documentInflight.delete(order.id));
  documentInflight.set(order.id,request);return request;
}

export function prepareOrderShare(orderOrId){
  const order=typeof orderOrId==='string'?{id:orderOrId}:orderOrId||{},id=String(order.id||'');if(!id)return Promise.reject(new Error('Pedido no disponible'));
  const ready=preparedOrders.get(id);if(ready&&Date.now()-ready.at<120000)return Promise.resolve(ready);
  if(orderPreparation.has(id))return orderPreparation.get(id);
  const request=(async()=>{const document=await ensureOrderDocument(order),prepared=await fetchDocument(document.key,document.name),value={id,document,...prepared,at:Date.now()};remember(preparedOrders,id,value);return value})().finally(()=>orderPreparation.delete(id));
  orderPreparation.set(id,request);return request;
}

function preparedOrder(id){const value=preparedOrders.get(String(id||''));return value&&Date.now()-value.at<120000?value:null}
function directSharePrepared(value,title){
  if(!value?.file)return false;
  try{nativeShareFiles([value.file],title||value.document?.name||value.file.name).catch(error=>{if(error?.name!=='AbortError')toast(error.message||'No se pudo compartir','error')});return true}catch(error){toast(error.message||'No se pudo compartir','error');return true}
}
function directSharePreparedMany(values,title){
  const files=values.map(value=>value?.file).filter(Boolean);if(!files.length)return false;
  try{nativeShareFiles(files,title).catch(error=>{if(error?.name!=='AbortError')toast(error.message||'No se pudo compartir','error')});return true}catch(error){toast(error.message||'No se pudo compartir','error');return true}
}
function stopEvent(event){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()}
function shareButtonOrderId(button){return button?.dataset?.v32OrderShare||button?.dataset?.v29Share||button?.dataset?.v19ShareOne||button?.dataset?.nuvastoShareOrder||''}
function markPreparing(button,id){
  if(!button||!id||button.dataset.nativeShareState==='ready'||button.dataset.nativeShareState==='preparing')return;
  button.dataset.nativeShareState='preparing';button.dataset.nuvastoShareOrder=id;button.disabled=true;button.classList.add('native-share-preparing');
  prepareOrderShare(id).then(()=>{if(!button.isConnected)return;button.dataset.nativeShareState='ready';button.disabled=false;button.classList.remove('native-share-preparing');updateBatchShareButtons()}).catch(error=>{if(!button.isConnected)return;button.dataset.nativeShareState='error';button.disabled=false;button.classList.remove('native-share-preparing');console.warn('share_prepare_failed',id,error)});
}
function observeHistoryShareButton(button){
  if(observedShareButtons.has(button))return;observedShareButtons.add(button);button.disabled=true;button.classList.add('native-share-preparing');
  if(!shareObserver){shareObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){shareObserver.unobserve(entry.target);const id=shareButtonOrderId(entry.target);entry.target.dataset.nativeShareState='';markPreparing(entry.target,id)}},{rootMargin:'180px 0px'})}
  shareObserver.observe(button);
}
function warmFileButton(button){
  if(observedShareButtons.has(button))return;const key=button.dataset.documentKey;if(!key)return;observedShareButtons.add(button);button.disabled=true;button.classList.add('native-share-preparing');fetchDocument(key,button.dataset.documentName||'pedido.pdf').then(()=>{if(button.isConnected){button.disabled=false;button.classList.remove('native-share-preparing');button.dataset.nativeShareState='ready'}}).catch(()=>{if(button.isConnected){button.disabled=false;button.classList.remove('native-share-preparing')}})
}
function selectedIds(selector){return[...document.querySelectorAll(selector)].filter(input=>input.checked).map(input=>input.dataset.v29Select||input.dataset.v19Select).filter(Boolean)}
function updateBatchButton(button,ids){
  if(!button)return;if(!ids.length){button.disabled=true;return}
  ids.forEach(id=>{if(!preparedOrder(id))prepareOrderShare(id).then(updateBatchShareButtons).catch(()=>updateBatchShareButtons())});
  button.disabled=!ids.every(id=>Boolean(preparedOrder(id)));button.classList.toggle('native-share-preparing',button.disabled);
}
function updateBatchShareButtons(){updateBatchButton($('#v29ShareSelected'),selectedIds('[data-v29-select]'));updateBatchButton($('#v19ShareSelected'),selectedIds('[data-v19-select]'))}
function setupContextShare(){
  const button=document.querySelector('.v43-context-action[data-v43-context="share"]');if(!button||button.dataset.nativeShareBound||!activeContextOrderId)return;button.dataset.nativeShareBound='1';button.dataset.nuvastoShareOrder=activeContextOrderId;markPreparing(button,activeContextOrderId)
}
function scanShareTargets(root=document){
  root.querySelectorAll?.('[data-v32-order-share]').forEach(observeHistoryShareButton);
  root.querySelectorAll?.('[data-v29-share],[data-v19-share-one]').forEach(button=>markPreparing(button,shareButtonOrderId(button)));
  root.querySelectorAll?.('[data-document-key][data-document-mode="share"]').forEach(warmFileButton);
  setupContextShare();updateBatchShareButtons();
}
function queueScan(){if(scanQueued)return;scanQueued=true;queueMicrotask(()=>{scanQueued=false;scanShareTargets()})}
function shareSelectedNow(button,selector,label){
  const ids=selectedIds(selector),values=ids.map(preparedOrder);if(!ids.length||values.some(value=>!value))return false;return directSharePreparedMany(values,`${ids.length} pedido${ids.length===1?'':'s'} · ${label}`)
}
function handleDirectShareCapture(event){
  const context=event.target.closest?.('.v43-context-action[data-v43-context="share"]');
  if(context){const value=preparedOrder(context.dataset.nuvastoShareOrder||activeContextOrderId);if(!value){stopEvent(event);markPreparing(context,context.dataset.nuvastoShareOrder||activeContextOrderId);return}stopEvent(event);document.querySelector('.v43-context-backdrop')?.remove();document.querySelector('.v43-context-menu')?.remove();directSharePrepared(value,value.document?.name);return}
  const orderButton=event.target.closest?.('[data-v32-order-share],[data-v29-share],[data-v19-share-one]');
  if(orderButton){const id=shareButtonOrderId(orderButton),value=preparedOrder(id);if(!value){stopEvent(event);markPreparing(orderButton,id);return}stopEvent(event);directSharePrepared(value,value.document?.name);return}
  const v29Selected=event.target.closest?.('#v29ShareSelected');if(v29Selected){const values=selectedIds('[data-v29-select]').map(preparedOrder);if(values.length&&values.every(Boolean)){stopEvent(event);directSharePreparedMany(values,`${values.length} pedidos`)}return}
  const v19Selected=event.target.closest?.('#v19ShareSelected');if(v19Selected){const values=selectedIds('[data-v19-select]').map(preparedOrder);if(values.length&&values.every(Boolean)){stopEvent(event);directSharePreparedMany(values,`${values.length} pedidos`)}return}
  const documentButton=event.target.closest?.('[data-document-key]');if(documentButton&&(documentButton.dataset.documentMode||'preview')==='share'){const key=documentButton.dataset.documentKey,prepared=cache.get(key);if(prepared){stopEvent(event);directSharePrepared({file:prepared.file,document:{name:documentButton.dataset.documentName||'pedido.pdf'}},documentButton.dataset.documentName||'pedido.pdf')}}
}

export function initializeFileActions(){
  if(initialized)return;initialized=true;
  document.addEventListener('pointerdown',event=>{const anchor=event.target.closest?.('[data-v43-order-menu]');if(anchor){activeContextOrderId=anchor.dataset.v43OrderMenu||'';if(activeContextOrderId)prepareOrderShare(activeContextOrderId).catch(()=>{})}const direct=event.target.closest?.('[data-v32-order-share],[data-v29-share],[data-v19-share-one]');if(direct){const id=shareButtonOrderId(direct);if(id&&!preparedOrder(id))prepareOrderShare(id).catch(()=>{})}},true);
  document.addEventListener('click',event=>{
    handleDirectShareCapture(event);if(event.defaultPrevented)return;
    const orderButton=event.target.closest?.('[data-document-key]'),invoiceButton=event.target.closest?.('[data-invoice-file]'),button=orderButton||invoiceButton;if(!button)return;
    const key=orderButton?button.dataset.documentKey:button.dataset.invoiceFile,name=orderButton?(button.dataset.documentName||'pedido.pdf'):(button.dataset.invoiceName||'factura.pdf'),mode=orderButton?(button.dataset.documentMode||'preview'):'preview';
    stopEvent(event);const action=mode==='share'?shareDocument:mode==='download'?downloadDocument:previewDocument;action(key,name).catch(error=>toast(error.message,'error'));
  },true);
  document.addEventListener('change',event=>{if(event.target.matches?.('[data-v29-select],[data-v19-select],#v29SelectAll,#v19SelectAll'))setTimeout(updateBatchShareButtons,0)},true);
  shareMutationObserver=new MutationObserver(queueScan);shareMutationObserver.observe(document.body,{subtree:true,childList:true});scanShareTargets();
  window.NuvastoDirectShare=Object.freeze({prepareOrderShare,shareDocument,ready:id=>Boolean(preparedOrder(id))});
}
