import {$,$$,api,state,toast,setBusy} from './app-core.js';

const VERSION='28';
const quantitySelector='[data-core-quantity],[data-edit-quantity]';
const nativeDocumentAdd=document.addEventListener.bind(document);
const viewport=window.visualViewport;
const nativeViewportAdd=viewport?.addEventListener?.bind(viewport);
let activeInput=null;
let invoiceOpening=null;
let visibilityFrame=0;
let progressTimer=0;

window.__NUVASTO_FLOW_OWNER='v28';

function isLegacyKeyboardListener(type,listener){
  if(!['focusin','focusout','keydown','input','pointerdown','click'].includes(type))return false;
  const source=typeof listener==='function'?String(listener):'';
  if(!source)return false;
  return ['quantitySelector','data-v23-next','data-v23-prev','data-v23-done','data-master-next','data-master-prev','data-master-done','moveQuantity','focusQuantity','scheduleVisible','scheduleVisibility','keepQuantityVisible','keepVisible','activeQuantity','activeInput'].some(token=>source.includes(token));
}
function blockLegacyKeyboardRegistrations(){
  document.addEventListener=function(type,listener,options){
    if(isLegacyKeyboardListener(type,listener))return;
    return nativeDocumentAdd(type,listener,options);
  };
  if(viewport&&nativeViewportAdd){
    viewport.addEventListener=function(type,listener,options){
      const source=typeof listener==='function'?String(listener):'';
      if(['resize','scroll'].includes(type)&&['scheduleVisible','scheduleVisibility','keepVisible','keepQuantityVisible','syncToolbar','scheduleToolbarSync','activeQuantity','activeInput'].some(token=>source.includes(token)))return;
      return nativeViewportAdd(type,listener,options);
    };
  }
}

function injectStyles(){
  if($('#nuvastoV28Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoV28Styles';
  style.textContent=`
    #modal.modal-replacing .modal-frame{opacity:.985}
    #modalBody.v28-keyboard-active{scroll-behavior:auto!important;overscroll-behavior:contain;scroll-padding-bottom:116px!important}
    .order-file-row.v28-focused-row{scroll-margin-top:8px;scroll-margin-bottom:110px;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--primary) 42%,transparent)!important}
    .v23-master-nav.v28-keyboard-open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;transition:none!important;animation:none!important}
    .v23-master-nav.v28-keyboard-open button{transition:none!important;animation:none!important}
    .v28-progress{display:flex;align-items:center;gap:10px;margin:10px 0;padding:12px 14px;border:1px solid var(--line);border-radius:13px;background:var(--soft);color:var(--muted);font-size:9px;line-height:1.45}
    .v28-progress::before{content:'';flex:0 0 auto;width:16px;height:16px;border:2px solid color-mix(in srgb,var(--primary) 22%,transparent);border-top-color:var(--primary);border-radius:50%;animation:v28Spin .75s linear infinite}
    @keyframes v28Spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.v28-progress::before{animation:none}}
  `;
  document.head.append(style);
}

function normalizeButtons(root=document){
  root.querySelectorAll?.('button:not([type])').forEach(button=>{button.type='button'});
}
function installButtonSemantics(){
  normalizeButtons();
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)normalizeButtons(node);
  }).observe(document.body,{subtree:true,childList:true});
  nativeDocumentAdd('submit',event=>{
    if(event.target?.id!=='modalFrame')return;
    const submit=$('#modalSubmit');
    if(!submit||event.submitter&&event.submitter!==submit){event.preventDefault();event.stopImmediatePropagation()}
  },true);
}

function fields(){return $$(quantitySelector).filter(input=>!input.disabled&&input.offsetParent!==null)}
function toolbar(){return $('.v23-master-nav')}
function modalBody(){return $('#modalBody')}
function keyboardInset(){if(!viewport)return 0;return Math.max(0,window.innerHeight-(viewport.height+viewport.offsetTop))}
function keyboardOpen(){return Boolean(activeInput&&document.activeElement===activeInput&&keyboardInset()>70)}
function isMaster(){return $('#modal')?.open&&$('#modalTitle')?.textContent?.trim()==='Lista maestra'}
function markFocused(input){$$('.order-file-row.v28-focused-row').forEach(row=>row.classList.remove('v28-focused-row'));input?.closest('.order-file-row')?.classList.add('v28-focused-row')}
function configureInput(input){if(!input)return;input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';input.setAttribute('pattern','[0-9.,]*')}
function sanitize(input){if(!input)return;let value=String(input.value||'').replace(/[^0-9.,]/g,'').replace(',','.');const parts=value.split('.');if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}}
function positionToolbar(){const bar=toolbar();if(!bar||!viewport)return;const height=bar.offsetHeight||68;bar.style.top=`${Math.max(viewport.offsetTop+4,viewport.offsetTop+viewport.height-height-6)}px`;bar.style.bottom='auto'}
function updateToolbar(){const bar=toolbar();if(!bar)return;const open=keyboardOpen()&&isMaster();bar.classList.toggle('keyboard-open',open);bar.classList.toggle('v28-keyboard-open',open);bar.setAttribute('aria-hidden',open?'false':'true');if(!open)return;const list=fields(),index=list.indexOf(activeInput),prev=bar.querySelector('[data-v23-prev]'),next=bar.querySelector('[data-v23-next]');if(prev)prev.disabled=index<=0;if(next)next.textContent=index>=list.length-1?'Finalizar ↵':'Enter ↵';positionToolbar()}
function keepVisible(){cancelAnimationFrame(visibilityFrame);visibilityFrame=requestAnimationFrame(()=>{const input=activeInput,body=modalBody(),bar=toolbar();if(!input?.isConnected||!body||!bar||!keyboardOpen())return;body.classList.add('v28-keyboard-active');markFocused(input);updateToolbar();const row=input.closest('.order-file-row')||input,rect=row.getBoundingClientRect(),bodyRect=body.getBoundingClientRect(),barRect=bar.getBoundingClientRect();const top=Math.max(bodyRect.top+8,(viewport?.offsetTop||0)+8),bottom=Math.min(barRect.top-10,(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-10);let delta=0;if(rect.bottom>bottom)delta=rect.bottom-bottom+8;else if(rect.top<top)delta=rect.top-top-8;if(Math.abs(delta)>1)body.scrollTop+=delta})}
function focusQuantity(input){if(!input?.isConnected)return;activeInput=input;configureInput(input);input.focus({preventScroll:true});try{input.setSelectionRange(0,String(input.value||'').length)}catch{}updateToolbar();keepVisible()}
function finishKeyboard(){sanitize(activeInput);activeInput?.blur();activeInput=null;cancelAnimationFrame(visibilityFrame);modalBody()?.classList.remove('v28-keyboard-active');markFocused(null);const bar=toolbar();bar?.classList.remove('keyboard-open','v28-keyboard-open','v27-keyboard-open','v26-forced-open');bar?.setAttribute('aria-hidden','true')}
function moveQuantity(direction){const current=document.activeElement?.closest?.(quantitySelector)||activeInput;if(!current)return;sanitize(current);const list=fields(),target=list[list.indexOf(current)+direction];if(target)focusQuantity(target);else if(direction>0)finishKeyboard()}
function installKeyboard(){
  nativeDocumentAdd('focusin',event=>{const input=event.target.closest?.(quantitySelector);if(!input)return;activeInput=input;configureInput(input);updateToolbar();keepVisible()},true);
  nativeDocumentAdd('focusout',event=>{if(!event.target.matches?.(quantitySelector))return;setTimeout(()=>{const next=document.activeElement?.closest?.(quantitySelector);if(next){activeInput=next;updateToolbar();keepVisible()}else if(keyboardInset()<55)finishKeyboard()},20)},true);
  nativeDocumentAdd('pointerdown',event=>{const button=event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done],[data-master-next],[data-master-prev],[data-master-done]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(button.matches('[data-v23-next],[data-master-next]'))moveQuantity(1);else if(button.matches('[data-v23-prev],[data-master-prev]'))moveQuantity(-1);else finishKeyboard()},true);
  nativeDocumentAdd('click',event=>{if(!event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done],[data-master-next],[data-master-prev],[data-master-done]'))return;event.preventDefault();event.stopImmediatePropagation()},true);
  nativeDocumentAdd('keydown',event=>{const input=event.target.closest?.(quantitySelector);if(!input||event.key!=='Enter')return;event.preventDefault();event.stopImmediatePropagation();activeInput=input;moveQuantity(1)},true);
  nativeDocumentAdd('input',event=>{const input=event.target.closest?.(quantitySelector);if(input)sanitize(input)},true);
  nativeViewportAdd?.('resize',()=>{updateToolbar();keepVisible()});
  nativeViewportAdd?.('scroll',()=>{positionToolbar();keepVisible()});
  $('#modal')?.addEventListener('close',finishKeyboard);
}

function currentOrderFromDetail(){const folio=$('#modalEyebrow')?.textContent?.trim()||'';return(state.cache.orders||[]).find(order=>String(order.folio||'')===folio)||null}
async function resolveCurrentOrder(){let order=currentOrderFromDetail();if(order)return order;const payload=await api('/api/orders',{fresh:true,timeout:12000});state.cache.orders=payload.orders||[];return currentOrderFromDetail()}
async function openInvoiceFrom(trigger,options={}){
  if(invoiceOpening)return invoiceOpening;
  setBusy(trigger,true,'Abriendo…');
  invoiceOpening=(async()=>{
    try{const{openInvoiceAnalysis}=await import('./app-invoices.js');await openInvoiceAnalysis(options)}
    catch(error){console.error('invoice_open_failed',error);toast(error?.message||'No se pudo abrir el ingreso de factura','error')}
    finally{if(trigger?.isConnected)setBusy(trigger,false);invoiceOpening=null}
  })();
  return invoiceOpening;
}
function installInvoiceEntry(){
  nativeDocumentAdd('click',async event=>{
    const orderTrigger=event.target.closest?.('#attachInvoice,#attachInvoiceBottom');
    const homeTrigger=event.target.closest?.('[data-action="analyze-invoice"]');
    const primaryTrigger=event.target.closest?.('#primaryAction');
    if(!orderTrigger&&!homeTrigger&&!(primaryTrigger&&state.view==='invoices'))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(orderTrigger){const order=await resolveCurrentOrder().catch(()=>null);if(!order)return toast('No se pudo identificar el pedido abierto','error');return openInvoiceFrom(orderTrigger,{orderId:order.id,returnToOrder:true})}
    return openInvoiceFrom(homeTrigger||primaryTrigger,{});
  },true);
}

function stopProgress(){clearInterval(progressTimer);progressTimer=0;$('#v28Progress')?.remove();$('#v27InvoiceProgress')?.remove();$('#v26AiProgress')?.remove()}
function startProgress(){stopProgress();const body=modalBody();if(!body)return;const node=document.createElement('div');node.id='v28Progress';node.className='v28-progress';node.setAttribute('aria-live','polite');node.textContent='Guardando el original y preparando el cotejo…';body.prepend(node);const started=Date.now();progressTimer=setInterval(()=>{const elapsed=Math.round((Date.now()-started)/1000),button=$('#modalSubmit'),title=$('#modalTitle')?.textContent||'';if(!node.isConnected||!/Analizar documento|Adjuntar documento al pedido/i.test(title)){stopProgress();return}if(button&&!button.disabled&&elapsed>1){stopProgress();return}node.textContent=elapsed<10?'Guardando el original en R2…':elapsed<32?`Leyendo productos y cantidades… ${elapsed} s`:elapsed<70?`Comparando factura, pedido y catálogo… ${elapsed} s`:`Finalizando análisis… ${elapsed} s`},500)}
function installProgress(){nativeDocumentAdd('submit',event=>{if(event.target?.id!=='modalFrame')return;const title=$('#modalTitle')?.textContent||'',file=$('#modalFrame input[type="file"]')?.files?.[0];if(file&&/Analizar documento|Adjuntar documento al pedido/i.test(title))startProgress()},true);$('#modal')?.addEventListener('close',stopProgress);new MutationObserver(()=>{if($('[data-invoice-line]'))stopProgress();const button=$('#modalSubmit');if(button&&!button.disabled&&$('#v28Progress'))setTimeout(()=>{if(!button.disabled)stopProgress()},50)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']})}

function installErrorBoundary(){
  window.addEventListener('unhandledrejection',event=>{const error=event.reason;if(!error)return;console.error('nuvasto_unhandled_rejection',error);event.preventDefault();stopProgress();toast(error?.message||'La operación no pudo completarse','error')});
  window.addEventListener('error',event=>{if(!event.error)return;console.error('nuvasto_runtime_error',event.error);stopProgress()});
}

blockLegacyKeyboardRegistrations();
injectStyles();
installButtonSemantics();
installKeyboard();
installInvoiceEntry();
installProgress();
installErrorBoundary();
window.NuvastoV28=Object.freeze({version:VERSION,finishKeyboard,stopProgress});
