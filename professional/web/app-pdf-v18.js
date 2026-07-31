import {$,state,toast,setBusy} from './app-core.js';
import {ensureOrderDocument,previewDocument,shareDocument} from './app-file-actions.js';

let initialized=false;
function currentOrder(){const folio=String($('#modalTitle')?.textContent||'').trim();return(state.cache.orders||[]).find(order=>String(order.folio||'')===folio)||null}
export function initializePdfV18(){if(initialized)return;initialized=true;document.addEventListener('click',async event=>{const button=event.target.closest?.('#v18OpenPdf,#v18SharePdf');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const order=currentOrder();if(!order)return toast('No se pudo identificar el pedido','error');setBusy(button,true,'Preparando…');try{const document=await ensureOrderDocument(order);if(button.id==='v18SharePdf')await shareDocument(document.key,document.name);else await previewDocument(document.key,document.name)}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}},true)}
