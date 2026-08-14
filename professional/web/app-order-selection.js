import {$,$$} from './app-core.js';

let initialized=false,scheduled=false;
function syncControl(control,inputs){
  const selected=inputs.filter(input=>input.checked).length;
  control.checked=Boolean(inputs.length&&selected===inputs.length);
  control.indeterminate=selected>0&&selected<inputs.length;
  control.disabled=!inputs.length;
  const label=control.closest('label')?.querySelector('span');
  if(label)label.textContent=control.checked?'Deseleccionar todos':'Seleccionar todos';
}
function enhance(){
  const bar=$('.v67-bulkbar');if(!bar)return;
  let wrap=bar.querySelector('.v71-select-all');
  if(!wrap){
    wrap=document.createElement('label');wrap.className='v71-select-all';wrap.innerHTML='<input type="checkbox" id="v71SelectAllOrders"><span>Seleccionar todos</span>';bar.insertBefore(wrap,bar.children[1]||null);
  }
  const control=wrap.querySelector('input'),inputs=$$('[data-v67-select]');
  syncControl(control,inputs);
  if(control.dataset.bound!=='1'){
    control.dataset.bound='1';
    control.addEventListener('change',()=>{
      for(const input of $$('[data-v67-select]')){
        if(input.checked===control.checked)continue;
        input.checked=control.checked;input.dispatchEvent(new Event('change',{bubbles:true}));
      }
      syncControl(control,$$('[data-v67-select]'));
    });
  }
  for(const input of inputs)if(input.dataset.selectAllBound!=='1'){
    input.dataset.selectAllBound='1';input.addEventListener('change',()=>syncControl(control,$$('[data-v67-select]')));
  }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance()})}
export function initializeOrderSelection(){if(initialized)return;initialized=true;document.addEventListener('pedidos:view-rendered',schedule);new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))schedule()}).observe(document.body,{subtree:true,childList:true});schedule()}
