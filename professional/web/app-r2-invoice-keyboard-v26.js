import {$,$$,api,isAdmin,state,toast} from './app-core.js';

const VERSION='26';
const quantitySelector='[data-core-quantity],[data-edit-quantity]';
let activeInput=null;
let spacer=null;
let storageStarted=false;

function injectStyles(){
  if($('#nuvastoV26Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoV26Styles';
  style.textContent=`
    #modalBody.v26-keyboard-active{scroll-padding-top:18px!important;scroll-padding-bottom:330px!important;overscroll-behavior:contain}
    .v26-keyboard-spacer{display:block;width:1px;height:320px;visibility:hidden;pointer-events:none}
    .order-file-row.v26-focused-row{position:relative;z-index:2;scroll-margin-top:18px;scroll-margin-bottom:320px;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--primary) 58%,transparent)}
    .v23-master-nav.v26-forced-open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
    .v26-ai-progress{display:flex;align-items:center;gap:9px;margin:10px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--soft);color:var(--muted);font-size:9px}
    .v26-ai-progress::before{content:'';width:16px;height:16px;border:2px solid color-mix(in srgb,var(--primary) 24%,transparent);border-top-color:var(--primary);border-radius:50%;animation:v26Spin .75s linear infinite}
    .v26-invoice-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:12px}
    .v26-invoice-summary article{padding:10px;border:1px solid var(--line);border-radius:11px;background:var(--soft)}
    .v26-invoice-summary strong,.v26-invoice-summary small{display:block}.v26-invoice-summary strong{font-size:16px}.v26-invoice-summary small{margin-top:3px;color:var(--muted);font-size:7px}
    .v26-conversion{margin-top:6px;padding:7px 8px;border-radius:8px;background:color-mix(in srgb,var(--primary) 8%,var(--soft));color:var(--text);font-size:8px;line-height:1.35}
    .v26-conversion.review{background:color-mix(in srgb,var(--warning) 13%,var(--soft));color:var(--warning)}
    @keyframes v26Spin{to{transform:rotate(360deg)}}
    @media(max-width:600px){.v26-invoice-summary{grid-template-columns:1fr 1fr}.v26-invoice-summary article:last-child{grid-column:1/-1}}
    @media(prefers-reduced-motion:reduce){.v26-ai-progress::before{animation:none}}
  `;
  document.head.append(style);
}

function quantityFields(){return $$(quantitySelector).filter(input=>!input.disabled&&input.offsetParent!==null)}
function keyboardInset(){const viewport=window.visualViewport;if(!viewport)return 0;return Math.max(0,window.innerHeight-(viewport.height+viewport.offsetTop))}
function keyboardOpen(){return Boolean(activeInput&&document.activeElement===activeInput&&keyboardInset()>90)}
function toolbar(){return $('.v23-master-nav')}
function modalBody(){return $('#modalBody')}

function ensureSpacer(){
  const body=modalBody();if(!body)return;
  body.classList.add('v26-keyboard-active');
  if(spacer?.isConnected)return;
  spacer=document.createElement('span');spacer.className='v26-keyboard-spacer';spacer.setAttribute('aria-hidden','true');body.append(spacer);
}
function clearSpacer(){modalBody()?.classList.remove('v26-keyboard-active');spacer?.remove();spacer=null;$$('.order-file-row.v26-focused-row').forEach(row=>row.classList.remove('v26-focused-row'));toolbar()?.classList.remove('v26-forced-open')}
function markRow(input){$$('.order-file-row.v26-focused-row').forEach(row=>row.classList.remove('v26-focused-row'));input?.closest('.order-file-row')?.classList.add('v26-focused-row')}

function keepVisible(input=activeInput,behavior='auto'){
  if(!input?.isConnected||!keyboardOpen())return;
  ensureSpacer();markRow(input);
  const body=modalBody(),bar=toolbar();if(!body||!bar)return;
  bar.classList.add('v26-forced-open','keyboard-open');
  const bodyRect=body.getBoundingClientRect(),barTop=bar.getBoundingClientRect().top,viewport=window.visualViewport;
  const top=Math.max(bodyRect.top+12,(viewport?.offsetTop||0)+12),bottom=Math.min(barTop-18,(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-18);
  const rect=input.getBoundingClientRect();
  const desired=top+Math.max(48,(bottom-top)*.52),current=rect.top+rect.height/2,delta=current-desired;
  if(Math.abs(delta)>3)body.scrollBy({top:delta,left:0,behavior});
  requestAnimationFrame(()=>{
    const next=input.getBoundingClientRect();
    if(next.bottom>bottom)body.scrollTop+=next.bottom-bottom+18;
    else if(next.top<top)body.scrollTop+=next.top-top-12;
  });
}
function scheduleVisible(input){activeInput=input;for(const [delay,behavior]of[[0,'auto'],[35,'auto'],[90,'auto'],[180,'smooth'],[320,'auto']])setTimeout(()=>keepVisible(input,behavior),delay)}

function focusQuantity(input){
  if(!input?.isConnected)return false;
  activeInput=input;input.inputMode='decimal';input.enterKeyHint='next';
  input.focus({preventScroll:true});
  try{input.setSelectionRange(0,String(input.value||'').length)}catch{}
  const bar=toolbar();bar?.classList.add('keyboard-open','v26-forced-open');bar?.setAttribute('aria-hidden','false');
  scheduleVisible(input);return true;
}
function moveQuantity(direction){
  const current=document.activeElement?.closest?.(quantitySelector)||activeInput;if(!current)return;
  const fields=quantityFields(),index=fields.indexOf(current),target=fields[index+direction];
  if(target){focusQuantity(target);return}
  if(direction>0){current.blur();activeInput=null;clearSpacer();$('#modalSubmit')?.scrollIntoView({behavior:'smooth',block:'center'})}
}
function finishKeyboard(){const current=document.activeElement?.closest?.(quantitySelector)||activeInput;current?.blur();activeInput=null;clearSpacer()}

function installKeyboardFix(){
  document.addEventListener('focusin',event=>{const input=event.target.closest?.(quantitySelector);if(!input)return;activeInput=input;scheduleVisible(input)},true);
  document.addEventListener('focusout',event=>{if(!event.target.matches?.(quantitySelector))return;setTimeout(()=>{const next=document.activeElement?.closest?.(quantitySelector);if(next){activeInput=next;scheduleVisible(next)}else if(!keyboardOpen()){activeInput=null;clearSpacer()}},90)},true);
  document.addEventListener('pointerdown',event=>{
    const button=event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.matches('[data-v23-next]'))moveQuantity(1);else if(button.matches('[data-v23-prev]'))moveQuantity(-1);else finishKeyboard();
  },true);
  document.addEventListener('keydown',event=>{const input=event.target.closest?.(quantitySelector);if(!input||event.key!=='Enter')return;event.preventDefault();event.stopImmediatePropagation();activeInput=input;moveQuantity(1)},true);
  const sync=()=>{const input=document.activeElement?.closest?.(quantitySelector)||activeInput;if(input&&keyboardInset()>90){activeInput=input;toolbar()?.classList.add('keyboard-open','v26-forced-open');scheduleVisible(input)}else if(keyboardInset()<=60)clearSpacer()};
  window.visualViewport?.addEventListener('resize',sync);window.visualViewport?.addEventListener('scroll',sync);$('#modal')?.addEventListener('close',()=>{activeInput=null;clearSpacer()});
}

function eligibleOrders(){return(state.cache.orders||[]).filter(order=>order.publicState==='emitted'&&Number(order.invoiceCount||0)===0&&!['received','reconciled','closed','cancelled'].includes(String(order.status||'')))}
function restrictInvoiceSelectors(){
  const supplier=$('#invoiceSupplier'),location=$('#invoiceLocation'),order=$('#invoiceOrder');if(!supplier||!order)return;
  const eligible=eligibleOrders(),supplierIds=new Set(eligible.map(item=>String(item.supplierId))),locationIds=new Set(eligible.map(item=>String(item.locationId)));
  [...supplier.options].forEach(option=>{if(option.value&&!supplierIds.has(option.value))option.remove()});
  if(location)[...location.options].forEach(option=>{if(option.value&&!locationIds.has(option.value))option.remove()});
  supplier.dispatchEvent(new Event('change',{bubbles:true}));
  if(location)location.dispatchEvent(new Event('change',{bubbles:true}));
  const empty=order.querySelector('option[value=""]');if(empty)empty.textContent='Selecciona un folio pendiente';
}

function lineConversion(row){
  const qty=Number(row.querySelector('[name=packageQty]')?.value||0),pack=Number(row.querySelector('[name=packSize]')?.value||1),units=Math.round(qty*pack*1000)/1000,reason=row.querySelector('td[data-label="Texto leído"] small')?.textContent||'';
  const conversion=reason.split(' · ').find(part=>part.includes('=')&&(/pedido:/i.test(part)||/unidad/i.test(part)))||`${qty} × ${pack} = ${units} unidades`;
  const review=/pero el pedido indica|parcial|exceso/i.test(reason);
  let card=row.querySelector('.v26-conversion');if(!card){card=document.createElement('div');row.querySelector('td[data-label="Texto leído"]')?.append(card)}
  card.className=`v26-conversion${review?' review':''}`;card.textContent=conversion;
}
function enhanceInvoiceReview(){
  const rows=$$('[data-invoice-line]');if(!rows.length)return;
  rows.forEach(row=>{if(row.dataset.v26Enhanced)return;row.dataset.v26Enhanced='1';lineConversion(row);row.querySelectorAll('[name=packageQty],[name=packSize]').forEach(input=>input.addEventListener('input',()=>lineConversion(row)))});
  if($('#v26InvoiceSummary'))return;
  const matched=rows.filter(row=>row.querySelector('[name=productId]')?.value).length,review=rows.filter(row=>row.querySelector('.v26-conversion.review')).length;
  const section=document.createElement('section');section.id='v26InvoiceSummary';section.className='v26-invoice-summary';section.innerHTML=`<article><strong>${rows.length}</strong><small>Líneas leídas</small></article><article><strong>${matched}</strong><small>Productos vinculados</small></article><article><strong>${review}</strong><small>Cantidades por revisar</small></article>`;
  $('#modalBody')?.prepend(section);
}
function installInvoiceFlow(){
  document.addEventListener('submit',event=>{
    if(event.target?.id!=='modalFrame')return;
    const title=$('#modalTitle')?.textContent||'';
    if(/Analizar documento|Adjuntar documento al pedido/i.test(title)){
      const order=$('#invoiceOrder');if(order&&!order.value){event.preventDefault();event.stopImmediatePropagation();toast('Selecciona un folio emitido pendiente de factura','error');order.focus();return}
      if(!$('#v26AiProgress')){const progress=document.createElement('div');progress.id='v26AiProgress';progress.className='v26-ai-progress';progress.setAttribute('aria-live','polite');progress.textContent='Guardando el original en R2 y cotejando cantidades, formatos y precios…';$('#modalBody')?.prepend(progress)}
    }
  },true);
  const observer=new MutationObserver(()=>{if($('#invoiceSupplier'))restrictInvoiceSelectors();if($('[data-invoice-line]'))enhanceInvoiceReview()});observer.observe(document.body,{subtree:true,childList:true});
}

async function activateStorage(){
  if(storageStarted||!state.token||!isAdmin())return;storageStarted=true;
  let migrated=0;
  try{
    const verification=await api('/api/storage/r2/verify',{method:'POST',json:{},timeout:15000});
    let summary=verification.summary||await api('/api/storage/r2/status',{fresh:true});
    for(let batch=0;batch<20&&Number(summary.d1Files||0)>0;batch++){
      const result=await api('/api/storage/migrate-r2',{method:'POST',json:{},timeout:60000});migrated+=Number(result.processed||0);if(!Number(result.remaining||0))break;summary=await api('/api/storage/r2/status',{fresh:true});
    }
    const finalStatus=await api('/api/storage/r2/status',{fresh:true});
    localStorage.setItem('nuvasto:r2:v26',JSON.stringify({verifiedAt:new Date().toISOString(),...finalStatus}));
    window.NuvastoStorage=Object.freeze({version:VERSION,status:()=>api('/api/storage/r2/status',{fresh:true}),verify:()=>api('/api/storage/r2/verify',{method:'POST',json:{}}),migrate:()=>api('/api/storage/migrate-r2',{method:'POST',json:{}})});
    if(migrated)toast(`${migrated} archivo${migrated===1?'':'s'} migrado${migrated===1?'':'s'} a R2`);
  }catch(error){storageStarted=false;console.warn('nuvasto_r2_activation_failed',error)}
}
function scheduleStorage(){let attempts=0;const timer=setInterval(()=>{attempts++;if(state.token&&isAdmin()){clearInterval(timer);activateStorage()}else if(attempts>20)clearInterval(timer)},750)}

export function initializeProductionV26(){injectStyles();installKeyboardFix();installInvoiceFlow();scheduleStorage();window.NuvastoV26=Object.freeze({version:VERSION,activateStorage})}
initializeProductionV26();
