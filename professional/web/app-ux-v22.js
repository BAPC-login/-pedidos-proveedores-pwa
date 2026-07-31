import {$,$$,state,api,toast} from './app-core.js';
import {ensureOrderDocument} from './app-file-actions.js';

let initialized=false;
let toolbar=null;
let activeQuantity=null;
let shareState={key:'',ready:false,loading:false,filesById:new Map(),zipFile:null};

const quantityFields=()=>$$('[data-core-quantity],[data-edit-quantity]').filter(input=>!input.disabled&&input.offsetParent!==null);

function injectStyles(){
  if($('#nuvastoUxV22Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoUxV22Styles';
  style.textContent=`
  :root{--v22-motion:cubic-bezier(.22,.8,.22,1)}
  .btn,button,input,select,textarea,.panel,.card,.v19-batch-card,.v16-order-card,.history-order-v18,.modal-frame,.bottom-nav{transition:background-color .2s var(--v22-motion),border-color .2s var(--v22-motion),color .2s var(--v22-motion),box-shadow .22s var(--v22-motion),transform .22s var(--v22-motion),opacity .18s var(--v22-motion)}
  .btn:not(:disabled):active,button:not(:disabled):active{transform:scale(.985)}
  dialog[open] .modal-frame{animation:v22ModalIn .24s var(--v22-motion) both}
  .v22-enter{animation:v22Enter .24s var(--v22-motion) both}
  button[disabled][data-label]{position:relative;cursor:progress}
  button[disabled][data-label]::before{content:'';display:inline-block;width:.82em;height:.82em;margin-right:.55em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.08em;animation:v22Spin .75s linear infinite}
  .v18-master-nav{display:none!important}
  .v22-master-nav{position:fixed;z-index:2147483646;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));top:auto;display:grid;grid-template-columns:76px minmax(0,1fr) 92px;gap:7px;padding:8px;border:1px solid color-mix(in srgb,var(--primary) 42%,var(--line));border-radius:18px;background:color-mix(in srgb,var(--card) 96%,transparent);box-shadow:0 18px 52px rgba(4,10,24,.34);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);opacity:1;transform:translate3d(0,0,0);animation:v22ToolbarIn .18s var(--v22-motion) both}
  .v22-master-nav.hidden{display:none!important}
  .v22-master-nav button{min-height:52px;border:1px solid color-mix(in srgb,var(--primary) 28%,var(--line));border-radius:13px;background:var(--soft);color:var(--text);font-size:11px;font-weight:900}
  .v22-master-nav [data-v22-next]{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 72%,#3b82f6));color:#fff;font-size:16px;border-color:transparent}
  .v22-master-nav button:disabled{opacity:.34}
  .v22-share-preparing{opacity:.72;pointer-events:none}
  .v22-share-ready{animation:v22Pulse .34s var(--v22-motion)}
  @keyframes v22Spin{to{transform:rotate(360deg)}}
  @keyframes v22ModalIn{from{opacity:0;transform:translateY(12px) scale(.992)}to{opacity:1;transform:none}}
  @keyframes v22Enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes v22ToolbarIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes v22Pulse{0%{transform:scale(.985)}100%{transform:scale(1)}}
  @media(max-width:460px){.v22-master-nav{grid-template-columns:64px minmax(0,1fr) 82px;padding:7px;gap:6px}.v22-master-nav button{min-height:50px}.v22-master-nav [data-v22-next]{font-size:15px}}
  @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  `;
  document.head.append(style);
}

function installNewOrderGuard(){
  const original=window.addEventListener;
  window.addEventListener=function(type,listener,options){
    const isWorkflowInterceptor=type==='click'&&typeof listener==='function'&&(listener.name==='interceptNewOrder'||String(listener).includes('draftGroups(await freshOrders())'));
    if(!isWorkflowInterceptor)return original.call(this,type,listener,options);
    const wrapped=function(event){
      const target=event.target?.closest?.('button,[data-action]');
      const isNew=target&&(target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders','receiving'].includes(state.view)));
      if(isNew)return;
      return listener.call(this,event);
    };
    return original.call(this,type,wrapped,options);
  };
  queueMicrotask(()=>{window.addEventListener=original});
}

function sanitizeQuantity(input){
  let value=String(input?.value||'').replace(/[^0-9.,]/g,'').replace(',','.');
  const parts=value.split('.');
  if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;
  if(input&&input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
}

function ensureToolbar(){
  const dialog=$('#modal');
  if(!dialog)return null;
  if(toolbar&&toolbar.isConnected&&toolbar.parentElement===dialog)return toolbar;
  toolbar?.remove();
  toolbar=document.createElement('div');
  toolbar.className='v22-master-nav hidden';
  toolbar.setAttribute('role','toolbar');
  toolbar.setAttribute('aria-label','Navegación de la lista maestra');
  toolbar.innerHTML='<button type="button" data-v22-prev>Anterior</button><button type="button" data-v22-next>Enter ↵</button><button type="button" data-v22-done>Listo</button>';
  dialog.append(toolbar);
  toolbar.addEventListener('pointerdown',event=>event.preventDefault());
  toolbar.querySelector('[data-v22-prev]').onclick=()=>moveQuantity(-1);
  toolbar.querySelector('[data-v22-next]').onclick=()=>moveQuantity(1);
  toolbar.querySelector('[data-v22-done]').onclick=finishQuantityNavigation;
  return toolbar;
}

function updateToolbar(){
  const bar=ensureToolbar();
  if(!bar||!activeQuantity)return;
  const list=quantityFields(),index=list.indexOf(activeQuantity);
  bar.querySelector('[data-v22-prev]').disabled=index<=0;
  bar.querySelector('[data-v22-next]').textContent=index>=list.length-1?'Finalizar ↵':'Enter ↵';
}

function positionToolbar(){
  const bar=ensureToolbar();
  if(!bar||bar.classList.contains('hidden'))return;
  const viewport=window.visualViewport;
  const height=bar.offsetHeight||68;
  const visibleBottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  const top=Math.max(8,visibleBottom-height-8);
  bar.style.top=`${top}px`;
  bar.style.bottom='auto';
}

function focusQuantity(input){
  if(!input)return finishQuantityNavigation();
  activeQuantity=input;
  input.type='text';
  input.inputMode='decimal';
  input.enterKeyHint='next';
  input.autocomplete='off';
  input.setAttribute('pattern','[0-9.,]*');
  input.focus({preventScroll:true});
  input.scrollIntoView({behavior:'smooth',block:'center'});
  const bar=ensureToolbar();
  bar?.classList.remove('hidden');
  requestAnimationFrame(()=>{positionToolbar();updateToolbar()});
  setTimeout(()=>{try{input.select()}catch{}positionToolbar()},90);
}

function moveQuantity(direction){
  if(!activeQuantity)return;
  sanitizeQuantity(activeQuantity);
  const list=quantityFields(),index=list.indexOf(activeQuantity),target=list[index+direction];
  if(target)return focusQuantity(target);
  if(direction>0){
    const submit=$('#modalSubmit');
    finishQuantityNavigation();
    submit?.scrollIntoView({behavior:'smooth',block:'center'});
    submit?.focus();
  }else updateToolbar();
}

function finishQuantityNavigation(){
  if(activeQuantity)sanitizeQuantity(activeQuantity);
  activeQuantity?.blur();
  activeQuantity=null;
  ensureToolbar()?.classList.add('hidden');
}

function enhanceMasterModal(){
  const title=$('#modalTitle')?.textContent?.trim();
  if(title!=='Lista maestra')return;
  const submit=$('#modalSubmit');
  if(submit&&/guardar archivo/i.test(submit.textContent))submit.textContent='Crear documento';
  ensureToolbar();
}

function crcTable(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
    table[n]=c>>>0;
  }
  return table;
}
const CRC_TABLE=crcTable();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0}
function u16(value){return new Uint8Array([value&255,(value>>>8)&255])}
function u32(value){return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255])}
function concat(parts){const size=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out}

async function zipFiles(files){
  const encoder=new TextEncoder(),locals=[],centrals=[];let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name),data=new Uint8Array(await file.arrayBuffer()),crc=crc32(data);
    const local=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central=concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central);offset+=local.length;
  }
  const centralBytes=concat(centrals),localBytes=concat(locals),end=concat([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(localBytes.length),u16(0)]);
  return new File([concat([localBytes,centralBytes,end])],`Pedidos-Nuvasto-${new Date().toISOString().slice(0,10)}.zip`,{type:'application/zip'});
}

async function fetchOrderFile(order){
  const document=await ensureOrderDocument(order);
  const response=await fetch(`/api/files/${encodeURIComponent(document.key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'});
  if(!response.ok)throw new Error(`No se pudo preparar ${order.folio}`);
  const blob=await response.blob();
  return new File([blob],document.name||`${order.folio}.pdf`,{type:'application/pdf'});
}

async function prepareBatchShare(){
  const modalBody=$('#modalBody'),shareButton=$('#v19ShareSelected');
  if(!modalBody||!shareButton)return;
  const ids=$$('[data-v19-order]').map(node=>node.dataset.v19Order).filter(Boolean),key=ids.join('|');
  if(!ids.length||shareState.loading||(shareState.ready&&shareState.key===key))return;
  shareState={key,ready:false,loading:true,filesById:new Map(),zipFile:null};
  const buttons=[shareButton,...$$('[data-v19-share-one]')];
  buttons.forEach(button=>{button.disabled=true;button.classList.add('v22-share-preparing');button.dataset.v22Label=button.textContent;button.textContent='Preparando…'});
  try{
    const payload=await api('/api/orders',{fresh:true}),orders=(payload.orders||[]).filter(order=>ids.includes(order.id));
    for(const order of orders)shareState.filesById.set(order.id,await fetchOrderFile(order));
    const files=[...shareState.filesById.values()];
    shareState.zipFile=files.length>1?await zipFiles(files):files[0]||null;
    shareState.ready=true;
    buttons.forEach(button=>{button.disabled=false;button.classList.remove('v22-share-preparing');button.classList.add('v22-share-ready');button.textContent=button.dataset.v22Label||'Compartir';setTimeout(()=>button.classList.remove('v22-share-ready'),400)});
  }catch(error){
    buttons.forEach(button=>{button.disabled=false;button.classList.remove('v22-share-preparing');button.textContent=button.dataset.v22Label||'Compartir'});
    toast(error.message,'error');
  }finally{shareState.loading=false}
}

function downloadFile(file){
  const url=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
}

function sharePrepared(files,title){
  if(!files.length)return toast('Selecciona al menos un pedido','error');
  if(!navigator.share){downloadFile(files.length===1?files[0]:shareState.zipFile);return toast('Se descargó el archivo para compartirlo desde el dispositivo')}
  let payloadFiles=files;
  if(files.length>1&&navigator.canShare&&!navigator.canShare({files}))payloadFiles=shareState.zipFile?[shareState.zipFile]:files;
  if(navigator.canShare&&!navigator.canShare({files:payloadFiles})){downloadFile(payloadFiles.length===1?payloadFiles[0]:shareState.zipFile);return toast('Se descargó el archivo porque este navegador no admite compartirlo directamente')}
  const promise=navigator.share({title,text:'Documentos preparados en Nuvasto',files:payloadFiles});
  promise.catch(error=>{if(error?.name!=='AbortError')toast(error.message||'No se pudo abrir el menú de compartir','error')});
}

function interceptShare(event){
  const button=event.target.closest?.('#v19ShareSelected,[data-v19-share-one]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!shareState.ready)return toast('Los documentos aún se están preparando. Intenta nuevamente en unos segundos.','error');
  if(button.matches('[data-v19-share-one]')){
    const file=shareState.filesById.get(button.dataset.v19ShareOne);
    return sharePrepared(file?[file]:[],button.closest('[data-v19-order]')?.querySelector('strong')?.textContent||'Pedido');
  }
  const selected=$$('[data-v19-select]:checked').map(input=>input.dataset.v19Select),files=selected.map(id=>shareState.filesById.get(id)).filter(Boolean);
  sharePrepared(files,`${files.length} pedidos Nuvasto`);
}

function animateNewNodes(records){
  for(const record of records)for(const node of record.addedNodes){
    if(!(node instanceof HTMLElement))continue;
    const candidates=[node,...node.querySelectorAll?.('.panel,.v19-batch-card,.v16-order-card,.history-order-v18,.settings-section')||[]];
    candidates.slice(0,24).forEach(element=>{if(element.dataset.v22Animated)return;element.dataset.v22Animated='1';element.classList.add('v22-enter');setTimeout(()=>element.classList.remove('v22-enter'),360)});
  }
}

function enhance(){
  enhanceMasterModal();
  prepareBatchShare().catch(error=>console.warn('batch_share_prepare_failed',error));
}

export function initializeNuvastoUXV22(){
  if(initialized)return;
  initialized=true;
  injectStyles();
  installNewOrderGuard();
  ensureToolbar();
  document.addEventListener('focusin',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(input)focusQuantity(input)});
  document.addEventListener('keydown',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input||event.key!=='Enter')return;event.preventDefault();event.stopImmediatePropagation();activeQuantity=input;moveQuantity(1)},true);
  document.addEventListener('input',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(input)sanitizeQuantity(input)});
  document.addEventListener('click',interceptShare,true);
  $('#modal')?.addEventListener('close',()=>{finishQuantityNavigation();shareState={key:'',ready:false,loading:false,filesById:new Map(),zipFile:null}});
  window.visualViewport?.addEventListener('resize',positionToolbar);
  window.visualViewport?.addEventListener('scroll',positionToolbar);
  window.addEventListener('resize',positionToolbar);
  document.addEventListener('pedidos:view-rendered',enhance);
  new MutationObserver(records=>{animateNewNodes(records);requestAnimationFrame(enhance)}).observe(document.body,{subtree:true,childList:true});
  enhance();
}
