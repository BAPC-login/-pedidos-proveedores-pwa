import {$,$$,toast} from './app-core.js';

const VERSION='25';
const quantitySelector='[data-core-quantity],[data-edit-quantity]';
let activeQuantity=null;
let scrollSpacer=null;
let reloadScheduled=false;

const pad=value=>String(value).padStart(2,'0');
function localDate(offset=0){
  const value=new Date();
  value.setHours(12,0,0,0);
  value.setDate(value.getDate()+offset);
  return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))}
function isMasterModal(){return $('#modal')?.open&&$('#modalTitle')?.textContent?.trim()==='Lista maestra'}
function dispatchChange(element){element?.dispatchEvent(new Event('change',{bubbles:true}))}

function injectStyles(){
  if($('#nuvastoCommercialV25Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoCommercialV25Styles';
  style.textContent=`
    .modal-body.v25-keyboard-space{scroll-padding-top:18px!important;scroll-padding-bottom:280px!important;overscroll-behavior:contain}
    .v25-keyboard-spacer{display:block;width:1px;height:270px;pointer-events:none;visibility:hidden}
    .order-file-row.v25-active-row{position:relative;z-index:1;scroll-margin-top:18px;scroll-margin-bottom:270px;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--primary) 52%,transparent)}
    .v25-date-repaired{animation:v25DateRepair .26s ease both}
    @keyframes v25DateRepair{from{box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 20%,transparent)}to{box-shadow:none}}
    @media(prefers-reduced-motion:reduce){.v25-date-repaired{animation:none}}
  `;
  document.head.append(style);
}

function dateScope(){return $('#orderFileDateScope')}
function generalDate(){return $('#orderFileGeneralDate')}
function customDate(){return $('#orderFileCustomDate')}
function activeDateMode(){return $('[data-delivery-base].active')?.dataset.deliveryBase||'tomorrow'}
function configuredExceptions(){
  const wizardDates=$$('[data-wizard-date]').filter(input=>validDate(input.value));
  if(wizardDates.length)return true;
  const summary=$('#exceptionSummary');
  const title=$('#exceptionSummaryTitle')?.textContent||'';
  const details=$('#exceptionSummaryDetail')?.textContent||'';
  const visible=summary&&!summary.classList.contains('hidden');
  const titleCount=Number((title.match(/\d+/)||[])[0]||0);
  return Boolean(visible&&titleCount>0&&details.trim());
}
function syncScopeButtons(value){
  $$('[data-v16-scope]').forEach(button=>button.classList.toggle('active',button.dataset.v16Scope===value));
}
function setScopeAll({notify=false}={}){
  const scope=dateScope();
  if(!scope)return;
  const changed=scope.value!=='all';
  scope.value='all';
  syncScopeButtons('all');
  if(changed)dispatchChange(scope);
  if(notify){
    const plan=$('.delivery-plan');
    plan?.classList.add('v25-date-repaired');
    setTimeout(()=>plan?.classList.remove('v25-date-repaired'),320);
  }
}
function resolveGeneralDate(){
  const mode=activeDateMode();
  if(mode==='today')return localDate(0);
  if(mode==='tomorrow')return localDate(1);
  const selected=customDate()?.value;
  return validDate(selected)?selected:'';
}
function normalizeMasterDates({fallbackScope=true,announce=false}={}){
  if(!isMasterModal())return true;
  const hidden=generalDate();
  if(!hidden)return true;
  const resolved=resolveGeneralDate()||hidden.value;
  if(!validDate(resolved)){
    toast('Selecciona Hoy, Mañana o una fecha de entrega','error');
    customDate()?.focus();
    return false;
  }
  hidden.value=resolved;
  hidden.setAttribute('value',resolved);
  const scope=dateScope();
  if(scope?.value==='except'&&!configuredExceptions()&&fallbackScope){
    setScopeAll({notify:true});
    if(announce)toast(`Se aplicará ${resolved===localDate(0)?'hoy':resolved===localDate(1)?'mañana':'la fecha elegida'} a todos los proveedores`);
  }
  return true;
}
function installDateGuard(){
  document.addEventListener('click',event=>{
    const baseButton=event.target.closest?.('.delivery-base-buttons [data-delivery-base]');
    if(baseButton&&isMasterModal()){
      setScopeAll();
      setTimeout(()=>normalizeMasterDates({fallbackScope:true}),0);
      return;
    }
    const allButton=event.target.closest?.('[data-v16-scope="all"]');
    if(allButton&&isMasterModal())setTimeout(()=>normalizeMasterDates({fallbackScope:true}),0);
  },true);
  document.addEventListener('change',event=>{
    if(!isMasterModal())return;
    if(event.target.matches?.('#orderFileCustomDate,#orderFileDateScope'))setTimeout(()=>normalizeMasterDates({fallbackScope:false}),0);
  },true);
  document.addEventListener('submit',event=>{
    if(event.target?.id!=='modalFrame'||!isMasterModal())return;
    if(!normalizeMasterDates({fallbackScope:true,announce:true}))event.preventDefault();
  },true);
  document.addEventListener('click',event=>{
    const submit=event.target.closest?.('#modalSubmit');
    if(submit&&isMasterModal())normalizeMasterDates({fallbackScope:true,announce:true});
  },true);
}

function scrollableAncestor(element){
  let node=element?.parentElement;
  let fallback=null;
  while(node&&node!==document.body){
    const style=getComputedStyle(node);
    const overflow=style.overflowY;
    const canScroll=node.scrollHeight>node.clientHeight+2;
    if(canScroll&&!fallback)fallback=node;
    if(canScroll&&['auto','scroll','overlay'].includes(overflow))return node;
    node=node.parentElement;
  }
  return fallback||$('#modalBody')||document.scrollingElement;
}
function toolbarTop(){
  const toolbar=$('.v23-master-nav.keyboard-open');
  if(!toolbar)return null;
  const top=toolbar.getBoundingClientRect().top;
  return Number.isFinite(top)?top:null;
}
function keyboardLikelyOpen(){
  if($('.v23-master-nav.keyboard-open'))return true;
  const viewport=window.visualViewport;
  return Boolean(viewport&&window.innerHeight-(viewport.height+viewport.offsetTop)>110);
}
function ensureSpacer(){
  const body=$('#modalBody');
  if(!body)return;
  body.classList.add('v25-keyboard-space');
  if(scrollSpacer?.isConnected)return;
  scrollSpacer=document.createElement('span');
  scrollSpacer.className='v25-keyboard-spacer';
  scrollSpacer.setAttribute('aria-hidden','true');
  body.append(scrollSpacer);
}
function removeSpacer(){
  $('#modalBody')?.classList.remove('v25-keyboard-space');
  scrollSpacer?.remove();
  scrollSpacer=null;
  $$('.order-file-row.v25-active-row').forEach(row=>row.classList.remove('v25-active-row'));
}
function scrollHostBy(host,delta,behavior='auto'){
  if(Math.abs(delta)<2)return;
  if(host===document.scrollingElement||host===document.documentElement||host===document.body)window.scrollBy({top:delta,left:0,behavior});
  else if(typeof host?.scrollBy==='function')host.scrollBy({top:delta,left:0,behavior});
  else if(host)host.scrollTop+=delta;
}
function keepQuantityVisible(input=activeQuantity,behavior='auto'){
  if(!input?.isConnected||!keyboardLikelyOpen())return;
  ensureSpacer();
  const row=input.closest('.order-file-row')||input;
  $$('.order-file-row.v25-active-row').forEach(item=>item.classList.toggle('v25-active-row',item===row));
  row.classList.add('v25-active-row');
  const viewport=window.visualViewport;
  const visibleTop=(viewport?.offsetTop||0)+14;
  const top=toolbarTop();
  const visibleBottom=(top??((viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)))-22;
  let rect=row.getBoundingClientRect();
  const host=scrollableAncestor(row);
  if(rect.bottom>visibleBottom){
    scrollHostBy(host,rect.bottom-visibleBottom+24,behavior);
    rect=row.getBoundingClientRect();
  }
  if(rect.top<visibleTop)scrollHostBy(host,rect.top-visibleTop-12,behavior);
}
function scheduleVisibility(input){
  activeQuantity=input;
  for(const [delay,behavior] of [[0,'auto'],[45,'auto'],[110,'smooth'],[220,'smooth'],[380,'auto']])setTimeout(()=>keepQuantityVisible(input,behavior),delay);
}
function installKeyboardViewportGuard(){
  document.addEventListener('focusin',event=>{
    const input=event.target.closest?.(quantitySelector);
    if(!input)return;
    activeQuantity=input;
    input.inputMode='decimal';
    input.enterKeyHint='next';
    scheduleVisibility(input);
  },true);
  document.addEventListener('focusout',event=>{
    if(!event.target.matches?.(quantitySelector))return;
    setTimeout(()=>{
      const focused=document.activeElement?.closest?.(quantitySelector);
      if(focused){scheduleVisibility(focused);return}
      activeQuantity=null;
      if(!keyboardLikelyOpen())removeSpacer();
    },80);
  },true);
  const sync=()=>{
    const focused=document.activeElement?.closest?.(quantitySelector)||activeQuantity;
    if(focused&&keyboardLikelyOpen())scheduleVisibility(focused);
    else if(!keyboardLikelyOpen())removeSpacer();
  };
  window.visualViewport?.addEventListener('resize',sync);
  window.visualViewport?.addEventListener('scroll',sync);
  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-v23-next],[data-v23-prev]'))setTimeout(sync,30);
    if(event.target.closest?.('[data-v23-done]'))setTimeout(removeSpacer,80);
  },false);
}

function installFreshServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  navigator.serviceWorker.ready.then(registration=>{
    const activate=worker=>worker?.postMessage?.({type:'SKIP_WAITING'});
    activate(registration.waiting);
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)activate(worker)});
    });
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadScheduled||sessionStorage.getItem('nuvasto:v25-reloaded')==='1')return;
    reloadScheduled=true;
    sessionStorage.setItem('nuvasto:v25-reloaded','1');
    setTimeout(()=>location.reload(),80);
  });
}

function installDiagnostics(){
  window.NuvastoDiagnostics=Object.freeze({
    version:VERSION,
    snapshot:()=>({
      version:VERSION,
      online:navigator.onLine,
      standalone:matchMedia('(display-mode: standalone)').matches,
      visualViewport:Boolean(window.visualViewport),
      serviceWorker:Boolean(navigator.serviceWorker?.controller),
      dateMode:activeDateMode(),
      deliveryDate:generalDate()?.value||'',
      deliveryScope:dateScope()?.value||'',
      keyboardOpen:keyboardLikelyOpen()
    })
  });
}

export function initializeCommercialCompletionV25(){
  injectStyles();
  installDateGuard();
  installKeyboardViewportGuard();
  installFreshServiceWorker();
  installDiagnostics();
}

initializeCommercialCompletionV25();
