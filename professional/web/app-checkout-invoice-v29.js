import {$,$$,esc,state,api,toast,setBusy,date} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {registerRouteRenderer,openRoute} from './app-router-v14.js';
import {openOrder} from './app-actions.js';
import {openOrderDetail} from './app-order-detail.js';
import {ensureOrderDocument,shareDocument} from './app-file-actions.js';

const VERSION='29';
const inheritedWindowAdd=window.addEventListener.bind(window);
const inheritedDocumentAdd=document.addEventListener.bind(document);
let initialized=false,checkoutOpening=false,invoiceOpening=false,progressTimer=0;

window.__NUVASTO_CHECKOUT_OWNER='v29';
window.__NUVASTO_INVOICE_OWNER='v29';

function sourceOf(listener){return typeof listener==='function'?String(listener):''}
function blockLegacyRegistrations(){
  window.addEventListener=function(type,listener,options){
    const source=sourceOf(listener);
    if(type==='click'&&source.includes('interceptNewOrder'))return;
    return inheritedWindowAdd(type,listener,options);
  };
  document.addEventListener=function(type,listener,options){
    const source=sourceOf(listener);
    if(type==='click'&&source.includes('interceptBatchEmit'))return;
    if(type==='click'&&source.includes("orderTrigger=event.target.closest?.('#attachInvoice"))return;
    if(type==='submit'&&(source.includes('v26AiProgress')||source.includes('startProgress')))return;
    return inheritedDocumentAdd(type,listener,options);
  };
}
blockLegacyRegistrations();

function injectStyles(){
  if($('#nuvastoV29Styles'))return;
  const style=document.createElement('style');style.id='nuvastoV29Styles';style.textContent=`
    #v26AiProgress,#v27InvoiceProgress,#v28Progress{display:none!important}
    .v29-progress{display:flex;align-items:center;gap:10px;margin:10px 0;padding:12px 14px;border:1px solid var(--line);border-radius:13px;background:var(--soft);color:var(--muted);font-size:9px;line-height:1.45}
    .v29-progress::before{content:'';flex:0 0 auto;width:17px;height:17px;border:2px solid color-mix(in srgb,var(--primary) 22%,transparent);border-top-color:var(--primary);border-radius:50%;animation:v29Spin .75s linear infinite}
    .v29-checkout{display:grid;gap:12px}.v29-toolbar{display:grid;grid-template-columns:minmax(150px,1fr) auto auto;gap:8px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
    .v29-select-all{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:850}.v29-select-all input,.v29-order-select{width:22px;height:22px;accent-color:var(--primary)}
    .v29-order-list{display:grid;gap:9px}.v29-order{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
    .v29-order-copy strong,.v29-order-copy small{display:block}.v29-order-copy small{margin-top:4px;color:var(--muted);font-size:8px;line-height:1.4}.v29-order-actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .v29-checkout-footer{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v29-checkout-footer .v29-emit{grid-column:1/-1;min-height:52px}.v29-cancel{color:var(--danger)!important}
    .v29-orders-page{display:grid;gap:14px;max-width:980px;margin:0 auto}.v29-orders-header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}.v29-orders-header h2{margin:4px 0 0;font-size:28px}.v29-orders-header p{margin:7px 0 0;color:var(--muted);font-size:10px}.v29-batch-card{display:grid;gap:10px;padding:15px;border:1px solid var(--line);border-radius:17px;background:var(--card)}.v29-batch-card header{display:flex;justify-content:space-between;align-items:center;gap:10px}.v29-batch-card h3{margin:3px 0 0}.v29-batch-card p{margin:4px 0 0;color:var(--muted);font-size:8px}.v29-empty{padding:34px;text-align:center;border:1px dashed var(--line);border-radius:16px;background:var(--card)}
    @keyframes v29Spin{to{transform:rotate(360deg)}}
    @media(max-width:680px){.v29-toolbar{grid-template-columns:1fr 1fr}.v29-toolbar .v29-select-all{grid-column:1/-1}.v29-order-actions{grid-template-columns:1fr 1fr}.v29-order-actions button:first-child{grid-column:1/-1}.v29-orders-header{align-items:stretch;flex-direction:column}.v29-orders-header .btn{width:100%}}
    @media(prefers-reduced-motion:reduce){.v29-progress::before{animation:none}}
  `;document.head.append(style);
}

async function freshOrders(){const payload=await api('/api/orders',{fresh:true,timeout:20000});state.cache.orders=payload.orders||[];return state.cache.orders}
const isDraft=order=>order.publicState==='editing'||order.status==='draft';
function groups(orders){const map=new Map();for(const order of orders.filter(isDraft)){const id=order.batchId||order.id;if(!map.has(id))map.set(id,[]);map.get(id).push(order)}return [...map.entries()].sort((a,b)=>String(b[1][0]?.updatedAt||'').localeCompare(String(a[1][0]?.updatedAt||'')))}

async function shareOrders(orders){
  if(!orders.length)throw new Error('Selecciona al menos un pedido');
  if(orders.length===1){const document=await ensureOrderDocument(orders[0]);return shareDocument(document.key,document.name)}
  const files=[];
  for(const order of orders){const document=await ensureOrderDocument(order),response=await fetch(`/api/files/${encodeURIComponent(document.key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'});if(!response.ok)throw new Error(`No se pudo preparar ${order.folio}`);const blob=await response.blob();files.push(new File([blob],document.name||`${order.folio}.pdf`,{type:blob.type||'application/pdf'}))}
  if(!navigator.share||navigator.canShare&&!navigator.canShare({files}))throw new Error('Este dispositivo no permite compartir varios PDF juntos');
  try{await navigator.share({title:`${orders.length} pedidos`,files})}catch(error){if(error?.name!=='AbortError')throw error}
}

function checkoutBody(orders){
  return `<div class="v29-checkout"><div class="v29-toolbar"><label class="v29-select-all"><input id="v29SelectAll" type="checkbox" checked>Seleccionar todo para compartir</label><span id="v29Selected">${orders.length} seleccionados</span><button class="btn" id="v29ShareSelected" type="button">Compartir seleccionados</button></div><div class="v29-order-list">${orders.map(order=>`<article class="v29-order" data-v29-order="${esc(order.id)}"><input class="v29-order-select" data-v29-select="${esc(order.id)}" type="checkbox" checked aria-label="Seleccionar ${esc(order.supplierName)}"><div class="v29-order-copy"><strong>${esc(order.supplierName)} · ${esc(order.folio)}</strong><small>${Number(order.itemCount||0)} productos · entrega ${order.deliveryDate?date(order.deliveryDate):'sin fecha'} · ${esc(order.costCenterName||'Centro de costo')}</small></div><div class="v29-order-actions"><button class="btn" type="button" data-v29-share="${esc(order.id)}">Compartir</button><button class="btn" type="button" data-v29-edit="${esc(order.id)}">Editar</button><button class="btn danger" type="button" data-v29-delete="${esc(order.id)}">Eliminar</button></div></article>`).join('')}</div><div class="v29-checkout-footer"><button class="btn v29-cancel" id="v29CancelBatch" type="button">Cancelar todo</button><button class="btn" type="button" data-modal-close>Cerrar</button><button class="btn primary v29-emit" id="v29EmitAll" type="button">Emitir todo</button></div></div>`;
}

export async function openCheckoutV29(sourceOrders){
  if(checkoutOpening)return;
  checkoutOpening=true;
  try{
    const all=await freshOrders(),ids=new Set((sourceOrders||[]).map(order=>order.id)),batchId=sourceOrders?.[0]?.batchId||sourceOrders?.[0]?.id||'',orders=all.filter(order=>(!ids.size||ids.has(order.id))&&(order.batchId||order.id)===batchId&&isDraft(order));
    if(!orders.length){closeModal('empty');await openRoute('dashboard','',{replace:true});return}
    openModal({eyebrow:'PEDIDOS EN EDICIÓN',title:'Checkout pedidos',subtitle:`${orders.length} pedido${orders.length===1?'':'s'} · comparte, edita o elimina antes de emitir el archivo completo.`,size:'large',hideSubmit:true,body:checkoutBody(orders)});
    const selected=()=>orders.filter(order=>$(`[data-v29-select="${CSS.escape(order.id)}"]`)?.checked);
    const sync=()=>{const chosen=selected(),allBox=$('#v29SelectAll');$('#v29Selected').textContent=`${chosen.length} seleccionado${chosen.length===1?'':'s'}`;allBox.checked=chosen.length===orders.length;allBox.indeterminate=chosen.length>0&&chosen.length<orders.length;$('#v29ShareSelected').disabled=!chosen.length};
    $('#v29SelectAll').onchange=()=>{$$('[data-v29-select]').forEach(input=>input.checked=$('#v29SelectAll').checked);sync()};
    $$('[data-v29-select]').forEach(input=>input.onchange=sync);
    $$('[data-v29-share]').forEach(button=>button.onclick=async()=>{const order=orders.find(item=>item.id===button.dataset.v29Share);setBusy(button,true,'Preparando…');try{await shareOrders([order])}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}});
    $('#v29ShareSelected').onclick=async()=>{const button=$('#v29ShareSelected');setBusy(button,true,'Preparando…');try{await shareOrders(selected())}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
    $$('[data-v29-edit]').forEach(button=>button.onclick=()=>{closeModal('edit');setTimeout(()=>openOrderDetail(button.dataset.v29Edit),0)});
    $$('[data-v29-delete]').forEach(button=>button.onclick=async()=>{const order=orders.find(item=>item.id===button.dataset.v29Delete);if(!order||!confirm(`¿Eliminar ${order.folio}? Los folios restantes se reajustarán automáticamente.`))return;setBusy(button,true,'Eliminando…');try{const deleted=await api(`/api/orders/${encodeURIComponent(order.id)}`,{method:'DELETE'});if(deleted.batchId)await api(`/api/order-batches/${encodeURIComponent(deleted.batchId)}/renumber`,{method:'POST',json:{deletedFolio:deleted.folio}});toast('Pedido eliminado y folios reajustados');await openCheckoutV29(orders.filter(item=>item.id!==order.id))}catch(error){toast(error.message,'error');setBusy(button,false)}});
    $('#v29EmitAll').onclick=async()=>{if(!confirm('¿Emitir todos los pedidos? Después quedarán cerrados y pendientes de factura o recepción.'))return;const button=$('#v29EmitAll');setBusy(button,true,'Emitiendo…');try{await api(`/api/order-batches/${encodeURIComponent(batchId)}/emit`,{method:'POST',json:{}});state.cache.orders=[];toast('Pedidos emitidos correctamente');closeModal('emitted');await openRoute('dashboard','',{replace:true})}catch(error){toast(error.message,'error');setBusy(button,false)}};
    $('#v29CancelBatch').onclick=async()=>{if(!confirm('¿Cancelar y eliminar todos los pedidos de este checkout?'))return;const button=$('#v29CancelBatch');setBusy(button,true,'Cancelando…');try{for(const order of orders)await api(`/api/orders/${encodeURIComponent(order.id)}`,{method:'DELETE'});state.cache.orders=[];toast('Checkout cancelado');closeModal('cancelled');await openRoute('dashboard','',{replace:true})}catch(error){toast(error.message,'error');setBusy(button,false)}};
    sync();
  }finally{checkoutOpening=false}
}

async function renderOrdersV29(){
  state.view='receiving';
  $$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='orders'));
  if($('#pageEyebrow'))$('#pageEyebrow').textContent='PEDIDOS';if($('#pageTitle'))$('#pageTitle').textContent='Pedidos por emitir';
  $('#mainContent').innerHTML='<section class="panel"><div class="v29-empty">Cargando pedidos pendientes…</div></section>';
  try{const orderGroups=groups(await freshOrders());if($('#pendingCount'))$('#pendingCount').textContent=orderGroups.reduce((sum,[,items])=>sum+items.length,0);$('#mainContent').innerHTML=`<section class="v29-orders-page"><header class="v29-orders-header"><div><span class="eyebrow">PEDIDOS</span><h2>Pedidos por emitir</h2><p>Los borradores permanecen editables hasta que confirmes “Emitir todo”.</p></div><button class="btn primary" type="button" id="v29NewOrder">＋ Nuevo pedido</button></header>${orderGroups.map(([batchId,orders])=>`<article class="v29-batch-card"><header><div><span class="eyebrow">CHECKOUT PENDIENTE</span><h3>${orders.length} pedido${orders.length===1?'':'s'}</h3><p>${orders.map(order=>order.supplierName).join(' · ')}</p></div><button class="btn primary" type="button" data-v29-open-batch="${esc(batchId)}">Abrir checkout</button></header></article>`).join('')||'<div class="v29-empty"><h3>No hay pedidos pendientes</h3><p>Crea un pedido nuevo para comenzar.</p></div>'}</section>`;$('#v29NewOrder').onclick=()=>openOrder();$$('[data-v29-open-batch]').forEach(button=>button.onclick=()=>{const group=orderGroups.find(([id])=>id===button.dataset.v29OpenBatch);if(group)openCheckoutV29(group[1]).catch(error=>toast(error.message,'error'))})}catch(error){$('#mainContent').innerHTML=`<section class="panel"><div class="v29-empty"><h3>No se pudieron cargar los pedidos</h3><p>${esc(error.message)}</p></div></section>`}
}

async function resolveOrderFromDetail(){
  const folio=$('#modalTitle')?.textContent?.trim()||'';
  const orders=state.cache.orders.length?state.cache.orders:await freshOrders();
  return orders.find(order=>String(order.folio||'')===folio)||null;
}
async function openInvoice(options,trigger){
  if(invoiceOpening)return;invoiceOpening=true;setBusy(trigger,true,'Abriendo…');
  try{const{openInvoiceAnalysis}=await import('./app-invoices.js');await openInvoiceAnalysis(options)}catch(error){toast(error.message||'No se pudo abrir la factura','error')}finally{if(trigger?.isConnected)setBusy(trigger,false);invoiceOpening=false}
}

function stopProgress(){clearInterval(progressTimer);progressTimer=0;$('#v29InvoiceProgress')?.remove();$('#v26AiProgress')?.remove();$('#v27InvoiceProgress')?.remove();$('#v28Progress')?.remove()}
function startProgress(){stopProgress();const body=$('#modalBody');if(!body)return;const progress=document.createElement('div');progress.id='v29InvoiceProgress';progress.className='v29-progress';progress.setAttribute('aria-live','polite');progress.textContent='Guardando el original en R2…';body.prepend(progress);const started=Date.now();progressTimer=setInterval(()=>{if(!progress.isConnected){stopProgress();return}const seconds=Math.round((Date.now()-started)/1000);progress.textContent=seconds<8?'Guardando el original en R2…':seconds<32?`Leyendo productos, cantidades y precios… ${seconds} s`:`Cotejando factura, pedido y formatos… ${seconds} s`},600)}

function installInteractionOwner(){
  inheritedWindowAdd('click',async event=>{
    const invoiceDetail=event.target.closest?.('#attachInvoice,#attachInvoiceBottom');
    const invoiceHome=event.target.closest?.('[data-action="analyze-invoice"]');
    const legacyEmit=event.target.closest?.('[data-emit-batch],#emitWholeBatch');
    if(invoiceDetail||invoiceHome||legacyEmit){event.preventDefault();event.stopImmediatePropagation()}
    if(invoiceDetail){const order=await resolveOrderFromDetail();if(!order)return toast('No se pudo identificar el pedido abierto','error');return openInvoice({orderId:order.id,returnToHistory:true},invoiceDetail)}
    if(invoiceHome)return openInvoice({},invoiceHome);
    if(legacyEmit){const batchId=legacyEmit.dataset.emitBatch||'',all=await freshOrders(),orders=all.filter(order=>isDraft(order)&&(!batchId||(order.batchId||order.id)===batchId));return openCheckoutV29(orders)}
  },true);
  inheritedDocumentAdd('submit',event=>{if(event.target?.id!=='modalFrame')return;const title=$('#modalTitle')?.textContent||'',file=$('#modalFrame input[type="file"]')?.files?.[0];if(file&&/Analizar documento|Adjuntar documento al pedido/i.test(title))startProgress()},true);
  $('#modal')?.addEventListener('close',stopProgress);
  new MutationObserver(()=>{
    $('#v26AiProgress')?.remove();$('#v27InvoiceProgress')?.remove();$('#v28Progress')?.remove();
    if($('[data-invoice-line]'))stopProgress();
    const legacyOrders=$$('[data-edit-file-order]');
    if(legacyOrders.length&&$('#modalTitle')?.textContent!=='Checkout pedidos'){
      const ids=legacyOrders.map(button=>button.dataset.editFileOrder);
      freshOrders().then(orders=>openCheckoutV29(orders.filter(order=>ids.includes(order.id)))).catch(()=>{});
    }
  }).observe(document.body,{subtree:true,childList:true});
}

export function initializeCheckoutInvoiceV29(){if(initialized)return;initialized=true;injectStyles();registerRouteRenderer('receiving',renderOrdersV29);installInteractionOwner();window.NuvastoV29=Object.freeze({version:VERSION,openCheckout:openCheckoutV29,stopProgress})}
