import {$,state,api,toast} from './app-core.js';
import {closeModal} from './app-modal.js';

let initialized=false,opening=false;
const isNewOrderTarget=target=>target?.id==='mobileCreate'||target?.dataset?.action==='new-order'||(target?.id==='primaryAction'&&['dashboard','orders'].includes(state.view));
async function master(){return import('./app-master-order.js')}
export async function openMasterOrder(options={}){const module=await master();return module.openMasterOrder(options)}
async function openExistingFromDetail(){
  if(opening)return;opening=true;
  try{
    const folio=String($('#modalEyebrow')?.textContent||'').trim();
    const summary=(state.cache.orders||[]).find(item=>String(item.folio||'').trim()===folio)||null;
    if(!summary?.id)throw new Error('No se pudo identificar el pedido en edición');
    const payload=await api(`/api/orders/${encodeURIComponent(summary.id)}`,{fresh:true,timeout:20000});
    closeModal('edit');setTimeout(()=>openMasterOrder({order:payload.order}).catch(error=>toast(error.message,'error')),0);
  }catch(error){toast(error.message,'error')}finally{opening=false}
}
function intercept(event){
  const target=event.target.closest('button,[data-action]');if(!target)return;
  if(target.id==='v30EditOrder'){
    event.preventDefault();event.stopImmediatePropagation();openExistingFromDetail();return;
  }
  if(!isNewOrderTarget(target))return;
  event.preventDefault();event.stopImmediatePropagation();openMasterOrder().catch(error=>toast(error.message,'error'));
}
export function initializeOrderCore(){if(initialized)return;initialized=true;document.addEventListener('click',intercept,true)}
