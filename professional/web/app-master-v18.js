import {$,$$,state} from './app-core.js';

let initialized=false;

function injectStyles(){
  if($('#masterV18Styles'))return;
  const style=document.createElement('style');
  style.id='masterV18Styles';
  style.textContent=`
  .v16-next-quantity,.v18-master-nav{display:none!important}
  .order-file-row .order-file-supplier{display:grid!important}
  .order-file-supplier select,.order-file-unit select{font-size:10px;font-weight:750}
  .order-file-row:focus-within{outline:2px solid color-mix(in srgb,var(--primary) 58%,transparent);outline-offset:-2px;background:color-mix(in srgb,var(--primary) 8%,var(--card))}
  .order-file-supplier-static{display:none!important}
  .v18-single-supplier{width:100%;min-width:0;min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);padding:0 7px;font-size:10px;font-weight:750}
  .v18-row-index{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:20px;margin-right:5px;border-radius:7px;background:var(--soft);color:var(--muted);font-size:7px;font-weight:900;vertical-align:middle}
  [data-core-quantity],[data-edit-quantity]{pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important}
  @media(max-width:760px){.order-file-row{grid-template-columns:minmax(0,1fr) 105px 105px;grid-template-areas:'product quantity unit' 'supplier supplier supplier';padding:8px;gap:7px}.order-file-supplier{grid-area:supplier!important}.order-file-supplier>span,.order-file-unit>span,.order-file-quantity>span{display:block!important}.order-file-row select,.order-file-row input{min-height:43px}}
  @media(max-width:430px){.order-file-row{grid-template-columns:minmax(0,1fr) 96px;grid-template-areas:'product quantity' 'supplier unit'}.order-file-unit{grid-area:unit}.order-file-supplier{grid-area:supplier!important}}
  `;
  document.head.append(style);
}

function enhanceSupplierControls(root=document){
  const rows=[...root.querySelectorAll?.('[data-order-product]')||[]];
  rows.forEach((row,index)=>{
    if(row.dataset.v18Master)return;
    row.dataset.v18Master='1';
    const product=state.cache.products?.find(item=>item.id===row.dataset.orderProduct);
    const control=row.querySelector('.order-file-supplier');
    const relationInput=row.querySelector('[data-order-relation]');
    const quantity=row.querySelector('[data-core-quantity],[data-edit-quantity]');
    if(quantity){quantity.enterKeyHint='next';quantity.setAttribute('inputmode','decimal');quantity.autocomplete='off'}
    if(!control||!relationInput)return;
    const title=row.querySelector('.order-file-product strong');
    if(title&&!title.querySelector('.v18-row-index'))title.insertAdjacentHTML('afterbegin',`<span class="v18-row-index">${index+1}</span>`);
    if(relationInput.tagName==='INPUT'){
      const relation=(product?.suppliers||[]).find(item=>item.id===relationInput.value)||(product?.suppliers||[])[0];
      const select=document.createElement('select');
      select.className='v18-single-supplier';select.disabled=true;select.setAttribute('aria-label','Proveedor');
      select.innerHTML=`<option>${relation?.supplierName||'Sin proveedor alternativo'}</option>`;
      control.insertBefore(select,relationInput);
    }else{
      relationInput.setAttribute('aria-label','Seleccionar proveedor');
      relationInput.title='Cambia el proveedor para este producto en caso de quiebre de stock';
    }
    const unit=row.querySelector('[data-order-unit]');
    if(unit){unit.setAttribute('aria-label','Formato de compra');unit.title='Cambia el formato a pedir'}
  });
}

function enhance(root=document){enhanceSupplierControls(root)}

export function initializeMasterV18(){
  if(initialized)return;initialized=true;
  injectStyles();
  document.addEventListener('pedidos:view-rendered',()=>enhance(document));
  new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))requestAnimationFrame(()=>enhance(document))}).observe(document.body,{subtree:true,childList:true});
  enhance(document);
}
