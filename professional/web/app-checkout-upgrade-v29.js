import {$,$$,state,api} from './app-core.js';

let replacing=false;
async function replaceLegacyCheckout(){
  if(replacing||$('#modalTitle')?.textContent==='Checkout pedidos')return;
  const legacyIds=$$('[data-edit-file-order]').map(button=>button.dataset.editFileOrder).filter(Boolean);
  const v19Ids=$$('[data-v19-select]').map(input=>input.dataset.v19Select).filter(Boolean);
  const ids=[...new Set([...legacyIds,...v19Ids])];
  if(!ids.length||(!$('#v19EmitAll')&&!legacyIds.length))return;
  replacing=true;
  try{const payload=await api('/api/orders',{fresh:true,timeout:20000});state.cache.orders=payload.orders||[];const orders=state.cache.orders.filter(order=>ids.includes(order.id));if(orders.length)await window.NuvastoV29?.openCheckout?.(orders)}finally{setTimeout(()=>replacing=false,100)}
}
new MutationObserver(()=>replaceLegacyCheckout().catch(()=>{})).observe(document.documentElement,{subtree:true,childList:true});
