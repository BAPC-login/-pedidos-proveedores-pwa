import './app-commercial-completion-v25.js';
import './app-r2-invoice-keyboard-v26.js';
import {$,$$,toast} from './app-core.js';

let initialized=false;
let lockedScrollY=0;
const quantitySelector='[data-core-quantity],[data-edit-quantity]';
const fields=()=>$$(`${quantitySelector}`).filter(input=>!input.disabled&&input.offsetParent!==null);

function injectStyles(){
  if($('#nuvastoV24HotfixStyles'))return;
  const style=document.createElement('style');
  style.id='nuvastoV24HotfixStyles';
  style.textContent=`
    html.v24-legal-open,html.v24-legal-open body{overflow:hidden!important;overscroll-behavior:none}
    body.v24-legal-locked{position:fixed!important;left:0;right:0;width:100%;overflow:hidden!important}
    .public-legal-modal{position:fixed!important;inset:50% auto auto 50%!important;margin:0!important;transform:translate(-50%,-50%)!important;max-width:calc(100vw - 24px)!important}
    .public-legal-modal[open]{display:block!important}
    .public-legal-modal::backdrop{overscroll-behavior:none}
    .v23-master-nav{will-change:transform,opacity}
    .order-file-row.v24-active-row{scroll-margin-top:110px;scroll-margin-bottom:180px}
    .document-preview-frame iframe{background:#fff}
  `;
  document.head.append(style);
}

function sanitize(input){
  let value=String(input?.value||'').replace(/[^0-9.,]/g,'').replace(',','.');
  const pieces=value.split('.');
  if(pieces.length>2)value=`${pieces.shift()}.${pieces.join('')}`;
  if(input&&input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
}

function activeQuantity(){
  const focused=document.activeElement?.closest?.(quantitySelector);
  if(focused)return focused;
  return fields().find(input=>input.closest('.order-file-row')?.classList.contains('v24-active-row'))||null;
}

function markActive(input){
  $$('.order-file-row.v24-active-row').forEach(row=>row.classList.remove('v24-active-row'));
  input?.closest('.order-file-row')?.classList.add('v24-active-row');
}

function keepVisible(input,behavior='smooth'){
  if(!input?.isConnected)return;
  const toolbar=$('.v23-master-nav.keyboard-open');
  const viewport=window.visualViewport;
  const rect=(input.closest('.order-file-row')||input).getBoundingClientRect();
  const visibleTop=(viewport?.offsetTop||0)+12;
  const toolbarTop=toolbar?.getBoundingClientRect().top;
  const visibleBottom=Math.min(
    viewport?(viewport.offsetTop+viewport.height-10):window.innerHeight-10,
    Number.isFinite(toolbarTop)?toolbarTop-12:window.innerHeight-110
  );
  let delta=0;
  if(rect.bottom>visibleBottom)delta=rect.bottom-visibleBottom;
  else if(rect.top<visibleTop)delta=rect.top-visibleTop;
  if(Math.abs(delta)>2)window.scrollBy({top:delta,left:0,behavior});
}

function focusInput(input){
  if(!input)return false;
  markActive(input);
  input.inputMode='decimal';
  input.enterKeyHint='next';
  input.focus({preventScroll:true});
  for(const delay of [0,45,120,240])setTimeout(()=>keepVisible(input,delay?'smooth':'auto'),delay);
  setTimeout(()=>{try{input.select()}catch{}},40);
  return true;
}

function navigate(direction){
  const current=activeQuantity();
  if(!current)return;
  sanitize(current);
  const list=fields(),index=list.indexOf(current),target=list[index+direction];
  if(target)return focusInput(target);
  if(direction>0){
    current.blur();markActive(null);
    $('.v23-master-nav')?.classList.remove('keyboard-open');
    const submit=$('#modalSubmit');
    submit?.scrollIntoView({behavior:'smooth',block:'center'});
  }
}

function finishKeyboard(){
  const current=activeQuantity();
  if(current)sanitize(current);
  current?.blur();markActive(null);
  $('.v23-master-nav')?.classList.remove('keyboard-open');
}

function installKeyboardFix(){
  document.addEventListener('focusin',event=>{
    const input=event.target.closest?.(quantitySelector);
    if(!input)return;
    markActive(input);
    for(const delay of [60,140,280])setTimeout(()=>keepVisible(input),delay);
  },true);
  document.addEventListener('pointerdown',event=>{
    const button=event.target.closest?.('[data-v23-next],[data-v23-prev],[data-v23-done]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(button.matches('[data-v23-next]'))navigate(1);
    else if(button.matches('[data-v23-prev]'))navigate(-1);
    else finishKeyboard();
  },true);
  window.visualViewport?.addEventListener('resize',()=>{
    const input=activeQuantity();
    if(input)setTimeout(()=>keepVisible(input,'auto'),20);
  });
  window.visualViewport?.addEventListener('scroll',()=>{
    const input=activeQuantity();
    if(input)keepVisible(input,'auto');
  });
}

function lockLegalBackground(){
  if(document.body.classList.contains('v24-legal-locked'))return;
  lockedScrollY=window.scrollY;
  document.documentElement.classList.add('v24-legal-open');
  document.body.classList.add('v24-legal-locked');
  document.body.style.top=`-${lockedScrollY}px`;
}

function unlockLegalBackground(){
  if(!document.body.classList.contains('v24-legal-locked'))return;
  document.documentElement.classList.remove('v24-legal-open');
  document.body.classList.remove('v24-legal-locked');
  document.body.style.removeProperty('top');
  window.scrollTo({top:lockedScrollY,left:0,behavior:'auto'});
}

function installLegalFix(){
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('[data-public-legal]'))return;
    requestAnimationFrame(()=>{
      const dialog=$('#publicLegalModal');
      if(dialog?.open)lockLegalBackground();
    });
  },true);
  const attach=()=>{
    const dialog=$('#publicLegalModal');
    if(!dialog||dialog.dataset.v24Legal)return;
    dialog.dataset.v24Legal='1';
    dialog.addEventListener('close',unlockLegalBackground);
    dialog.addEventListener('cancel',unlockLegalBackground);
  };
  attach();
  new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});
}

function installCreateDocumentGuard(){
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#modalSubmit');
    if(!button||$('#modalTitle')?.textContent?.trim()!=='Lista maestra')return;
    if(button.disabled)return;
    const selected=fields().some(input=>Number(String(input.value||'').replace(',','.'))>0);
    if(!selected)toast('Ingresa una cantidad en al menos un producto','error');
  },true);
}

export function initializeProfessionalHotfixV24(){
  if(initialized)return;
  initialized=true;
  injectStyles();
  installKeyboardFix();
  installLegalFix();
  installCreateDocumentGuard();
}
