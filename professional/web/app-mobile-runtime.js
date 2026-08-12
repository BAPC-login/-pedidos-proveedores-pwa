import {$,$$} from './app-core.js';

const RELEASE='r62-mobile-stable';
let initialized=false,modalObserver=null;
function injectStyles(){if($('#r62MobileStyles'))return;const style=document.createElement('style');style.id='r62MobileStyles';style.textContent=`
[data-core-quantity],[data-edit-quantity]{pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;position:relative;z-index:2;font-size:18px!important;font-weight:800!important;text-align:center!important}.order-file-row{content-visibility:visible!important;contain:none!important}.order-file-category-title,.order-file-warehouse-title{position:relative!important;top:auto!important}.order-file-supplier:has(select[data-order-relation]){display:block!important;grid-area:supplier!important}.order-file-row:has(.order-file-supplier select[data-order-relation]){grid-template-areas:'product quantity unit' 'supplier supplier supplier'!important}.order-file-supplier select[data-order-relation]{min-height:40px!important;font-size:14px!important}
`;document.head.append(style)}
function prepareQuantities(){for(const input of $$('[data-core-quantity],[data-edit-quantity]')){if(input.dataset.r62Quantity==='1')continue;input.dataset.r62Quantity='1';input.disabled=false;input.readOnly=false;input.type='text';input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';input.setAttribute('pattern','[0-9.,]*')}}
function enhanceModal(){prepareQuantities()}
export function initializeMobileRuntimeV57(){if(initialized)return;initialized=true;document.documentElement.dataset.mobileRuntime=RELEASE;injectStyles();enhanceModal();const body=$('#modalBody');if(body){modalObserver=new MutationObserver(()=>requestAnimationFrame(enhanceModal));modalObserver.observe(body,{subtree:true,childList:true})}}
initializeMobileRuntimeV57();
