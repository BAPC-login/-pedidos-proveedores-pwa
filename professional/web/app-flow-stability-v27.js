import {$,$$,api,state,toast,setBusy} from './app-core.js';

const VERSION='27';
const quantitySelector='[data-core-quantity],[data-edit-quantity]';
const nativeDocumentAdd=document.addEventListener.bind(document);
const viewport=window.visualViewport;
const nativeViewportAdd=viewport?.addEventListener?.bind(viewport);
const nativeFetch=window.fetch.bind(window);
let activeInput=null;
let visibilityFrame=0;
let visibilityTimer=0;
let progressTimer=0;
let invoiceOpening=false;

function legacyKeyboardListener(type,listener){
  if(!['focusin','focusout','keydown','input','pointerdown','click'].includes(type))return false;
  const source=typeof listener==='function'?String(listener):'';
  if(!source)return false;
  return [
    'quantitySelector','data-v23-next','data-v23-prev','data-v23-done','data-master-next','data-master-prev','data-master-done',
    'moveQuantity','focusQuantity','scheduleVisible','scheduleVisibility','keepQuantityVisible','keepVisible','sanitizeQuantity','activeQuantity'
  ].some(token=>source.includes(token));
}

function installLegacyKeyboardBlock(){
  document.addEventListener=function(type,listener,options){
    if(legacyKeyboardListener(type,listener))return;
    return nativeDocumentAdd(type,listener,options);
  };
  if(viewport&&nativeViewportAdd){
    viewport.addEventListener=function(type,listener,options){
      const source=typeof listener==='function'?String(listener):'';
      const legacy=['resize','scroll'].includes(type)&&['scheduleVisible','scheduleVisibility','keepVisible','keepQuantityVisible','syncToolbar','scheduleToolbarSync','activeQuantity','activeInput'].some(token=>source.includes(token));
      if(legacy)return;
      return nativeViewportAdd(type,listener,options);
    };
  }
}

function injectStyles(){
  if($('#nuvastoV27Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoV27Styles';
  style.textContent=`
    #modalBody.v27-keyboard-active{scroll-behavior:auto!important;scroll-padding-bottom:118px!important;overscroll-behavior:contain}
    .order-file-row.v27-focused-row{scroll-margin-top:10px;scroll-margin-bottom:112px;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--primary) 45%,transparent)!important}
    .v23-master-nav.v27-keyboard-open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;transition:none!important;animation:none!important}
    .v23-master-nav.v27-keyboard-open button{transition:none!important;animation:none!important}
    .v27-invoice-progress{display:flex;align-items:center;gap:10px;margin:10px 0;padding:12px 14px;border:1px solid var(--line);border-radius:13px;background:var(--soft);color:var(--muted);font-size:9px;line-height:1.45}
    .v27-invoice-progress::before{content:'';flex:0 0 auto;width:16px;height:16px;border:2px solid color-mix(in srgb,var(--primary) 22%,transparent);border-top-color:var(--primary);border-radius:50%;animation:v27Spin .8s linear infinite}
    @keyframes v27Spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.v27-invoice-progress::before{animation:none}.v23-master-nav.v27-keyboard-open{transition:none!important}}
  `;
  document.head.append(style);
}

function fields(){return $$(quantitySelector).filter(input=>!input.disabled&&input.offsetParent!==null)}
function toolbar(){return $('.v23-master-nav')}
function modalBody(){return $('#modalBody')}
function keyboardInset(){if(!viewport)return 0;return Math.max(0,window.innerHeight-(viewport.height+viewport.offsetTop))}
function keyboardOpen(){return Boolean(activeInput&&document.activeElement===activeInput&&keyboardInset()>70)}

function markFocused(input){
  $$('.order-file-row.v27-focused-row').forEach(row=>row.classList.remove('v27-focused-row'));
  input?.closest('.order-file-row')?.classList.add('v27-focused-row');
}
function configureInput(input){
  if(!input)return;
  input.inputMode='decimal';
  input.enterKeyHint='next';
  input.autocomplete='off';
  input.setAttribute('pattern','[0-9.,]*');
}
function sanitize(input){
  if(!input)return;
  let value=String(input.value||'').replace(/[^0-9.,]/g,'').replace(',','.');
  const pieces=value.split('.');
  if(pieces.length>2)value=`${pieces.shift()}.${pieces.join('')}`;
  if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
}
function positionToolbar(){
  const bar=toolbar();if(!bar||!viewport)return;
  const height=bar.offsetHeight||66;
  bar.style.top=`${Math.max(viewport.offsetTop+6,viewport.offsetTop+viewport.height-height-7)}px`;
  bar.style.bottom='auto';
}
function updateToolbar(){
  const bar=toolbar();if(!bar)return;
  const open=keyboardOpen()&&$('#modal')?.open&&$('#modalTitle')?.textContent?.trim()==='Lista maestra';
  bar.classList.toggle('keyboard-open',open);
  bar.classList.toggle('v27-keyboard-open',open);
  bar.setAttribute('aria-hidden',open?'false':'true');
  if(!open)return;
  const list=fields(),index=list.indexOf(activeInput),previous=bar.querySelector('[data-v23-prev]'),next=bar.querySelector('[data-v23-next]');
  if(previous)previous.disabled=index<=0;
  if(next)next.textContent=index>=list.length-1?'Finalizar ↵':'Enter ↵';
  positionToolbar();
}
function keepVisible(){
  cancelAnimationFrame(visibilityFrame);
  visibilityFrame=requestAnimationFrame(()=>{
    const input=activeInput,body=modalBody(),bar=toolbar();
    if(!input?.isConnected||!body||!bar||!keyboardOpen())return;
    body.classList.add('v27-keyboard-active');markFocused(input);updateToolbar();
    const row=input.closest('.order-file-row')||input,rect=row.getBoundingClientRect(),bodyRect=body.getBoundingClientRect(),barRect=bar.getBoundingClientRect();
    const visibleTop=Math.max(bodyRect.top+8,(viewport?.offsetTop||0)+8),visibleBottom=Math.min(barRect.top-10,(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-10);
    let delta=0;
    if(rect.bottom>visibleBottom)delta=rect.bottom-visibleBottom+8;
    else if(rect.top<visibleTop)delta=rect.top-visibleTop-8;
    if(Math.abs(delta)>1)body.scrollTop+=delta;
  });
}
function scheduleVisible(){
  clearTimeout(visibilityTimer);keepVisible();visibilityTimer=setTimeout(keepVisible,72);
}
function focusQuantity(input){
  if(!input?.isConnected)return false;
  activeInput=input;configureInput(input);markFocused(input);
  input.focus({preventScroll:true});
  try{input.setSelectionRange(0,String(input.value||'').length)}catch{}
  updateToolbar();scheduleVisible();return true;
}
function finishKeyboard(){
  sanitize(activeInput);activeInput?.blur();activeInput=null;
  clearTimeout(visibilityTimer);cancelAnimationFrame(visibilityFrame);
  modalBody()?.classList.remove('v27-keyboard-active');markFocused(null);
  const bar=toolbar();bar?.classList.remove('keyboard-open','v27-keyboard-open','v26-forced-open');bar?.setAttribute('aria-hidden','true');
}
function moveQuantity(direction){
  const current=document.activeElement?.closest?.(quantitySelector)||activeInput;if(!current)return;
  sanitize(current);
  const list=fields(),index=list.indexOf(current),target=list[index+direction];
  if(target){focusQuantity(target);return}
  if(direction>0)finishKeyboard();
}

function installKeyboardNavigation(){
  nativeDocumentAdd('focusin',event=>{
    const input=event.target.closest?.(quantitySelector);if(!input)return;
    activeInput=input;configureInput(input);markFocused(input);updateToolbar();scheduleVisible();
  },true);
  nativeDocumentAdd('focusout',event=>{
    if(!event.target.matches?.(quantitySelector))return;
    setTimeout(()=>{
      const next=document.activeElement?.closest?.(quantitySelector);
      if(next){activeInput=next;configureInput(next);updateToolbar();scheduleVisible()}
      else if(keyboardInset()<55)finishKeyboard();
    },35);
  },true);
  nativeDocumentAdd('pointerdown',event=>{
    const button=event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done],[data-master-next],[data-master-prev],[data-master-done]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.matches('[data-v23-next],[data-master-next]'))moveQuantity(1);
    else if(button.matches('[data-v23-prev],[data-master-prev]'))moveQuantity(-1);
    else finishKeyboard();
  },true);
  nativeDocumentAdd('click',event=>{
    if(!event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done],[data-master-next],[data-master-prev],[data-master-done]'))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  nativeDocumentAdd('keydown',event=>{
    const input=event.target.closest?.(quantitySelector);if(!input||event.key!=='Enter')return;
    event.preventDefault();event.stopImmediatePropagation();activeInput=input;moveQuantity(1);
  },true);
  nativeDocumentAdd('input',event=>{const input=event.target.closest?.(quantitySelector);if(input)sanitize(input)},true);
  nativeViewportAdd?.('resize',()=>{updateToolbar();scheduleVisible()});
  nativeViewportAdd?.('scroll',()=>{positionToolbar();keepVisible()});
  $('#modal')?.addEventListener('close',finishKeyboard);
}

function orderFromCurrentDetail(){
  const folio=$('#modalEyebrow')?.textContent?.trim()||'';
  return(state.cache.orders||[]).find(order=>String(order.folio||'')===folio)||null;
}
async function resolveCurrentOrder(){
  let order=orderFromCurrentDetail();if(order)return order;
  const payload=await api('/api/orders',{fresh:true,timeout:12000});state.cache.orders=payload.orders||[];return orderFromCurrentDetail();
}
function installStableInvoiceEntry(){
  nativeDocumentAdd('click',async event=>{
    const trigger=event.target.closest?.('#attachInvoice,#attachInvoiceBottom');if(!trigger||invoiceOpening)return;
    event.preventDefault();event.stopImmediatePropagation();invoiceOpening=true;setBusy(trigger,true,'Abriendo…');
    try{
      const order=await resolveCurrentOrder();if(!order)throw new Error('No se pudo identificar el pedido abierto');
      const{openInvoiceAnalysis}=await import('./app-invoices.js');
      await openInvoiceAnalysis({orderId:order.id,returnToOrder:true});
    }catch(error){console.error('invoice_entry_failed',error);toast(error?.message||'No se pudo abrir el ingreso de factura','error')}
    finally{invoiceOpening=false;if(trigger.isConnected)setBusy(trigger,false)}
  },true);
}

function installInvoiceFetchTimeout(){
  window.fetch=function(input,init={}){
    let url='';try{url=new URL(typeof input==='string'?input:input.url,location.href).pathname}catch{}
    if(url!=='/api/invoices/analyze')return nativeFetch(input,init);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),95000),requestInit={...init,signal:controller.signal};
    return nativeFetch(input,requestInit).finally(()=>clearTimeout(timer));
  };
}
function stopProgress(){clearInterval(progressTimer);progressTimer=0;$('#v26AiProgress')?.remove();$('#v27InvoiceProgress')?.remove()}
function startProgress(){
  stopProgress();
  const body=modalBody();if(!body)return;
  const node=document.createElement('div');node.id='v27InvoiceProgress';node.className='v27-invoice-progress';node.setAttribute('aria-live','polite');node.textContent='Guardando el original en R2 y comenzando el cotejo…';body.prepend(node);
  const started=Date.now();
  progressTimer=setInterval(()=>{
    const elapsed=Math.round((Date.now()-started)/1000),button=$('#modalSubmit'),title=$('#modalTitle')?.textContent||'';
    if(!node.isConnected||!/Analizar documento|Adjuntar documento al pedido/i.test(title)){stopProgress();return}
    if(button&&!button.disabled&&elapsed>1){stopProgress();return}
    node.textContent=elapsed<12?'Guardando el original en R2 y comenzando el cotejo…':elapsed<40?`Leyendo productos, cantidades y formatos… ${elapsed} s`:elapsed<82?`Comparando factura, pedido y catálogo… ${elapsed} s`:`Finalizando el análisis. Tiempo transcurrido: ${elapsed} s`;
  },500);
}
function installProgressLifecycle(){
  nativeDocumentAdd('submit',event=>{
    if(event.target?.id!=='modalFrame')return;
    const title=$('#modalTitle')?.textContent||'',file=$('#modalFrame input[type="file"]')?.files?.[0];
    if(!file||!/Analizar documento|Adjuntar documento al pedido/i.test(title))return;
    startProgress();
  },true);
  $('#modal')?.addEventListener('close',stopProgress);
  new MutationObserver(()=>{
    if($('[data-invoice-line]'))stopProgress();
    const button=$('#modalSubmit');if(button&&!button.disabled&&$('#v27InvoiceProgress'))setTimeout(()=>{if(!button.disabled)stopProgress()},80);
  }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
}

installLegacyKeyboardBlock();
injectStyles();
installInvoiceFetchTimeout();
installKeyboardNavigation();
installStableInvoiceEntry();
installProgressLifecycle();
window.NuvastoV27=Object.freeze({version:VERSION,finishKeyboard,stopProgress});
