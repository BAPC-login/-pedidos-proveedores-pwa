import './app-v29-ui.js';
import './app-runtime-v30.js';
import './app-checkout-upgrade-v29.js';
import './app-history-bridge-v31.js';
import './app-v32-entry.js';
import {$,state,api,toast,setBusy} from './app-core.js';
import {openInvoiceAnalysisV30} from './app-invoice-v30.js';

let opening=false;
async function freshOrders(){const payload=await api('/api/orders',{fresh:true,timeout:20000});state.cache.orders=payload.orders||[];return state.cache.orders}
async function orderForTrigger(trigger){
  const directId=trigger?.dataset?.v16Invoice||trigger?.dataset?.orderId||'';
  if(directId)return directId;
  const folio=$('#modalTitle')?.textContent?.trim()||'';
  const orders=state.cache.orders.length?state.cache.orders:await freshOrders();
  return orders.find(order=>String(order.folio||'')===folio)?.id||'';
}

window.addEventListener('click',async event=>{
  const detail=event.target.closest?.('#attachInvoice,#attachInvoiceBottom');
  const history=event.target.closest?.('[data-v16-invoice]');
  const home=event.target.closest?.('[data-action="analyze-invoice"]');
  const primary=event.target.closest?.('#primaryAction');
  if(!detail&&!history&&!home&&!(primary&&state.view==='invoices'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(opening)return;opening=true;const trigger=detail||history||home||primary;setBusy(trigger,true,'Abriendo…');
  try{
    const orderId=detail||history?await orderForTrigger(trigger):'';
    if((detail||history)&&!orderId)throw new Error('No se pudo identificar el pedido pendiente');
    await openInvoiceAnalysisV30(orderId?{orderId,returnToHistory:false}:{});
  }catch(error){toast(error.message||'No se pudo abrir el ingreso de factura','error')}
  finally{if(trigger?.isConnected)setBusy(trigger,false);opening=false}
},true);
