import {$,$$} from './app-core.js';

const RELEASE='r83-canonical-mobile';
let initialized=false,modalObserver=null,activeQuantity=null,visibilityTimer=0;
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function injectStyles(){if($('#r64MobileStyles'))return;const style=document.createElement('style');style.id='r64MobileStyles';style.textContent=`
[data-core-quantity],[data-edit-quantity]{pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;position:relative;z-index:2;font-size:17px!important;font-weight:800!important;text-align:center!important}.order-file-row{content-visibility:visible!important;contain:none!important;grid-template-columns:minmax(0,1fr) 64px 92px!important;grid-template-areas:'product quantity unit' 'supplier . .'!important;column-gap:6px!important;row-gap:3px!important;padding:5px 8px!important;min-height:46px!important;background:var(--card)!important;scroll-margin-block:82px 190px}.order-file-category>.order-file-row:nth-of-type(even){background:color-mix(in srgb,var(--soft) 72%,var(--card))!important}.order-file-category>.order-file-row.selected{background:color-mix(in srgb,var(--primary) 7%,var(--card))!important}.order-file-category-title,.order-file-warehouse-title{position:relative!important;top:auto!important}.order-file-quantity{width:64px!important;justify-self:end}.order-file-quantity input{width:64px!important;min-height:42px!important;padding:0 4px!important;border-radius:9px!important}.order-file-unit{width:92px!important}.order-file-unit select{width:92px!important;min-height:42px!important;padding:0 5px!important;font-size:12px!important}.order-file-supplier{display:block!important;grid-area:supplier!important;min-width:0!important;width:min(42vw,150px)!important;max-width:150px!important;justify-self:start!important}.order-file-supplier-static{display:flex!important;align-items:center!important;min-height:22px!important;width:auto!important;max-width:150px!important;border:0!important;background:transparent!important;padding:0!important;color:var(--muted)!important;font-size:10px!important;font-weight:650!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.order-file-supplier:has(select[data-order-relation]){padding-top:2px!important}.order-file-supplier select[data-order-relation]{min-height:30px!important;height:30px!important;width:100%!important;max-width:150px!important;padding:0 24px 0 6px!important;border-radius:7px!important;font-size:10px!important;font-weight:650!important;color:var(--muted)!important}.order-file-product{padding-right:0!important}.order-file-product strong{font-size:15px!important;line-height:1.18!important;font-weight:850!important}.order-file-product small{display:none!important}.v44-favorite,[data-v44-master-mode="favorites"]{display:none!important}
@media(max-width:900px){
  .modal{padding-top:max(10px,env(safe-area-inset-top))!important;padding-right:env(safe-area-inset-right)!important;padding-left:env(safe-area-inset-left)!important;padding-bottom:0!important;box-sizing:border-box!important}
  .modal-frame{max-height:calc(100dvh - max(10px,env(safe-area-inset-top)))!important;max-width:100%!important}
  .modal-head{position:relative!important;z-index:5!important;padding-top:14px!important;min-height:72px!important}
  #modalClose{flex:0 0 auto!important;align-self:flex-start!important;margin-top:0!important}
  .command-menu{padding-top:max(10px,env(safe-area-inset-top))!important;padding-right:env(safe-area-inset-right)!important;padding-left:env(safe-area-inset-left)!important;box-sizing:border-box!important}
  .v57-more-sheet{max-height:calc(100dvh - max(10px,env(safe-area-inset-top)) - max(10px,env(safe-area-inset-bottom)) - 90px)!important}
}
`;document.head.append(style)}
function prepareQuantities(){for(const input of $$('[data-core-quantity],[data-edit-quantity]')){if(input.dataset.r64Quantity==='1')continue;input.dataset.r64Quantity='1';input.disabled=false;input.readOnly=false;input.type='text';input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';input.tabIndex=0;input.setAttribute('pattern','[0-9.,]*');const row=input.closest('[data-order-product]');const unit=row?.querySelector('[data-order-unit]');if(unit)unit.tabIndex=-1;const supplier=row?.querySelector('select[data-order-relation]');if(supplier)supplier.tabIndex=-1}}
function prepareProductPhotoPicker(){
  if(normalize($('#modalEyebrow')?.textContent)!=='fotografia')return;
  for(const input of $$('#modalBody input[type="file"][accept*="image"]')){
    input.removeAttribute('capture');input.setAttribute('accept','image/*,.heic,.heif');input.dataset.photoSource='library-files-camera';
  }
}
function quantityInput(node){return node?.closest?.('[data-core-quantity],[data-edit-quantity]')||null}
function keepQuantityVisible(input,behavior='smooth'){
  const body=$('#modalBody'),row=input?.closest?.('.order-file-row');if(!body||!row||!body.contains(row))return;
  row.scrollIntoView({behavior,block:'center',inline:'nearest'});
  requestAnimationFrame(()=>{
    if(!row.isConnected)return;
    const rect=row.getBoundingClientRect(),bodyRect=body.getBoundingClientRect(),viewport=window.visualViewport;
    const viewportTop=viewport?.offsetTop||0,viewportBottom=viewportTop+(viewport?.height||window.innerHeight);
    const top=Math.max(bodyRect.top,viewportTop)+18,bottom=Math.min(bodyRect.bottom,viewportBottom)-118;
    if(rect.bottom>bottom)body.scrollBy({top:rect.bottom-bottom+22,behavior:'auto'});
    else if(rect.top<top)body.scrollBy({top:rect.top-top-18,behavior:'auto'});
  });
}
function scheduleQuantityVisibility(input){if(!input?.isConnected)return;activeQuantity=input;clearTimeout(visibilityTimer);keepQuantityVisible(input,'smooth');setTimeout(()=>keepQuantityVisible(input,'auto'),80);visibilityTimer=setTimeout(()=>keepQuantityVisible(input,'auto'),220)}
function enhanceModal(){prepareQuantities();prepareProductPhotoPicker()}
export function initializeMobileRuntimeV57(){
  if(initialized)return;initialized=true;document.documentElement.dataset.mobileRuntime=RELEASE;injectStyles();enhanceModal();const body=$('#modalBody');
  if(body){
    modalObserver=new MutationObserver(()=>requestAnimationFrame(enhanceModal));modalObserver.observe(body,{subtree:true,childList:true});
    body.addEventListener('focusin',event=>{const input=quantityInput(event.target);if(input)scheduleQuantityVisibility(input)},true);
  }
  window.visualViewport?.addEventListener('resize',()=>{if(activeQuantity&&document.activeElement===activeQuantity)scheduleQuantityVisibility(activeQuantity)});
  $('#modal')?.addEventListener('close',()=>{activeQuantity=null;clearTimeout(visibilityTimer)});
}
initializeMobileRuntimeV57();