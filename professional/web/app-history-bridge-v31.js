import {toast} from './app-core.js';
import {openOrderDetail} from './app-order-detail-v30.js';

let initialized=false;

export function initializeHistoryBridgeV31(){
  if(initialized)return;
  initialized=true;
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-v18-detail]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openOrderDetail(button.dataset.v18Detail).catch(error=>toast(error?.message||'No se pudo abrir el pedido','error'));
  },true);
}

initializeHistoryBridgeV31();
