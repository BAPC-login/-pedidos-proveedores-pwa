import {$,$$,esc,state,api,toast,money,date} from './app-core.js';
import {bindDynamic} from './app-actions.js';
import {openOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';
import {previewDocument,downloadDocument,shareDocument,ensureOrderDocument,warmDocuments} from './app-file-actions.js';
import {hydrateProtectedImages} from './app-assets-v13.js';

const DOCS={'33':'Factura','34':'Factura exenta','39':'Boleta','52':'Guía de despacho','61':'Nota de crédito','0':'Documento'};
const PUBLIC_LABELS={editing:'En edición',emitted:'Emitido',received:'Recibido',cancelled:'Eliminado'};
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const canDelete=()=>['owner','admin','purchaser'].includes(state.me?.user?.role);
const canForceDelete=()=>['owner','admin'].includes(state.me?.user?.role);

export function setExperienceActive(view){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)===view));
  const headings={receiving:['OPERACIÓN','Pedidos'],history:['CONTROL','Historial'],operations:['MAESTROS','Operaciones']};
  if(headings[view]){$('#pageEyebrow').textContent=headings[view][0];$('#pageTitle').textContent=headings[view][1]}
}

function logoShell(order,size='normal'){
  const initials=String(order.supplierName||'?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  return `<span class="supplier-logo-shell ${size}" data-logo-shell>${order.supplierLogoKey?`<img data-protected-key="${esc(order.supplierLogoKey)}" alt="Logo ${esc(order.supplierName)}">`:''}<b>${esc(initials)}</b></span>`;
}

async function performOrderPdf(order,mode){
  const document=await ensureOrderDocument(order);if(!document.key)throw new Error('El PDF todavía no está disponible');
  if(mode==='preview')return previewDocument(document.key,document.name);
  if(mode==='download')return downloadDocument(document.key,document.name);
  return shareDocument(document.key,document.name);
}

async function deleteOrder(order){
  const emitted=order.publicState!=='editing';
  if(emitted&&!canForceDelete())throw new Error('Solo un administrador puede eliminar pedidos emitidos');
  const message=emitted?'Este pedido ya fue emitido. ¿Eliminarlo definitivamente? Esta acción queda registrada.':'¿Eliminar este pedido del archivo?';
  if(!confirm(message))return false;
  await api(`/api/orders/${encodeURIComponent(order.id)}${emitted?'?force=1':''}`,{method:'DELETE'});toast(`Pedido ${order.folio} eliminado`);state.cache.orders=[];return true;
}

function bindOrderActions(orders,{refresh}={}){
  const map=new Map(orders.map(order=>[order.id,order]));
  $$('[data-open-order]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openOrderDetail(button.dataset.openOrder)});
  $$('[data-attach-document]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openInvoiceAnalysis({orderId:button.dataset.attachDocument,returnToOrder:true})});
  $$('[data-order-pdf]').forEach(button=>button.onclick=async event=>{event.preventDefault();event.stopPropagation();const order=map.get(button.dataset.orderId);if(!order)return;button.disabled=true;const before=button.textContent;button.textContent='Preparando…';try{await performOrderPdf(order,button.dataset.orderPdf);button.textContent=before==='Generar PDF'?'Vista previa':before}catch(error){toast(error.message,'error');button.textContent=before}finally{button.disabled=false}});
  $$('[data-delete-order]').forEach(button=>button.onclick=async event=>{event.preventDefault();event.stopPropagation();const order=map.get(button.dataset.deleteOrder);if(!order)return;try{if(await deleteOrder(order))await refresh?.()}catch(error){toast(error.message,'error')}});
  $$('[data-order-delivery]').forEach(input=>input.onchange=async()=>{const order=map.get(input.dataset.orderDelivery);if(!order)return;input.disabled=true;try{const response=await api(`/api/orders/${encodeURIComponent(order.id)}/quick`,{method:'PATCH',json:{deliveryDate:input.value}});order.deliveryDate=response.order.deliveryDate;toast('Fecha de entrega guardada')}catch(error){toast(error.message,'error');input.value=order.deliveryDate||''}finally{input.disabled=false}});
  warmDocuments(orders.filter(order=>order.pdfKey).map(order=>({key:order.pdfKey,name:order.pdfName||`${order.folio}.pdf`})));
  hydrateProtectedImages($('#mainContent')).catch(()=>{});
}

function orderActions(order){
  const edit=order.publicState==='editing';
  return `<div class="simple-order-actions"><button class="btn" type="button" data-order-pdf="preview" data-order-id="${esc(order.id)}">${order.pdfKey?'Vista previa':'Generar PDF'}</button><button class="btn" type="button" data-order-pdf="share" data-order-id="${esc(order.id)}">Compartir</button>${edit?`<button class="btn primary" type="button" data-open-order="${esc(order.id)}">Editar</button>`:`<button class="btn primary" type="button" data-attach-document="${esc(order.id)}">Subir factura</button>`}${canDelete()?`<button class="btn danger" type="button" data-delete-order="${esc(order.id)}">Eliminar</button>`:''}</div>`;
}

function emittedCard(order){
  const received=order.publicState==='received';
  return `<article class="simple-order-card" data-order-card="${esc(order.id)}"><div class="simple-order-identity">${logoShell(order)}<div><strong>${esc(order.supplierName)}</strong><small>${esc(order.folio)} · ${esc(order.costCenterName||'Centro')} · ${Number(order.itemCount||0)} productos</small></div><span class="simple-state ${esc(order.publicState)}">${esc(PUBLIC_LABELS[order.publicState]||'Emitido')}</span></div><div class="simple-order-details"><span><b>Entrega</b>${order.deliveryDate?date(order.deliveryDate):'Sin fecha'}</span><span><b>Documento</b>${Number(order.invoiceCount||0)?`${Number(order.invoiceCount)} cargado${Number(order.invoiceCount)===1?'':'s'}`:'Factura pendiente'}</span><span><b>Recepción</b>${received?'Completada':'Pendiente'}</span></div>${orderActions(order)}</article>`;
}

function editableOrderRow(order){
  return `<article class="editable-supplier-row"><div class="editable-supplier-main">${logoShell(order,'small')}<div><strong>${esc(order.supplierName)}</strong><small>${esc(order.folio)} · ${Number(order.itemCount||0)} productos</small></div></div><label class="editable-date"><span>Entrega</span><input type="date" data-order-delivery="${esc(order.id)}" value="${esc(order.deliveryDate||'')}"></label>${orderActions(order)}</article>`;
}

function batchCard(batchId,orders){
  return `<section class="editable-batch-card" data-batch-card="${esc(batchId)}"><div class="editable-batch-head"><div><span class="eyebrow">ARCHIVO EN EDICIÓN</span><h3>${orders.length} proveedor${orders.length===1?'':'es'}</h3><p>Puedes editar, poner fechas, eliminar pedidos y revisar los PDF antes de emitir.</p></div><button class="btn primary" type="button" data-emit-batch="${esc(batchId)}">Emitir todo</button></div><div class="editable-supplier-list">${orders.map(editableOrderRow).join('')}</div></section>`;
}

function groupDrafts(orders){const map=new Map();for(const order of orders.filter(item=>item.publicState==='editing')){const id=order.batchId||order.id;if(!map.has(id))map.set(id,[]);map.get(id).push(order)}return [...map.entries()]}

export async function renderReceiving(){
  state.view='receiving';setExperienceActive('receiving');let orders=state.cache.orders||[];
  const paint=()=>{
    const editing=orders.filter(order=>order.publicState==='editing'),emitted=orders.filter(order=>order.publicState==='emitted'),received=orders.filter(order=>order.publicState==='received'),withoutInvoice=emitted.filter(order=>Number(order.invoiceCount||0)===0);
    if($('#pendingCount'))$('#pendingCount').textContent=editing.length+emitted.length;if($('#receivingCount'))$('#receivingCount').textContent=editing.length+emitted.length;
    $('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">PEDIDOS</span><h2>Archivos y pedidos emitidos</h2><p>Primero guarda un archivo editable. Cuando esté correcto, emite todos sus pedidos de una vez.</p></div><button class="btn primary" data-action="new-order">＋ Nuevo archivo</button></div><section class="simple-filter-row"><button class="simple-filter active" data-simple-filter="editing"><b>${editing.length}</b><span>En edición</span></button><button class="simple-filter" data-simple-filter="emitted"><b>${emitted.length}</b><span>Emitidos</span></button><button class="simple-filter" data-simple-filter="received"><b>${received.length}</b><span>Recibidos</span></button><button class="simple-filter" data-simple-filter="withoutInvoice"><b>${withoutInvoice.length}</b><span>Sin factura</span></button></section><section class="ops-toolbar"><label class="field"><span>Buscar</span><input id="receivingSearch" placeholder="Proveedor, folio, centro o local"></label><label class="field"><span>Orden</span><select id="receivingSort"><option value="updated">Última modificación</option><option value="delivery">Entrega más próxima</option><option value="supplier">Proveedor</option></select></label></section><section class="simple-orders-feed" id="receivingFeed"></section>`;
    let filter='editing';
    const source=()=>filter==='editing'?editing:filter==='emitted'?emitted:filter==='received'?received:withoutInvoice;
    const renderList=()=>{
      const q=normalized($('#receivingSearch')?.value),sort=$('#receivingSort')?.value||'updated',list=[...source()].filter(order=>!q||normalized(`${order.folio} ${order.supplierName} ${order.costCenterName} ${order.locationName}`).includes(q));
      list.sort((a,b)=>sort==='supplier'?String(a.supplierName).localeCompare(String(b.supplierName),'es'):sort==='delivery'?String(a.deliveryDate||'9999').localeCompare(String(b.deliveryDate||'9999')):String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      if(filter==='editing'){$('#receivingFeed').innerHTML=groupDrafts(list).map(([id,items])=>batchCard(id,items)).join('')||'<div class="panel empty-state"><h3>No hay archivos en edición</h3><p>Crea un archivo nuevo para comenzar.</p></div>';$$('[data-emit-batch]').forEach(button=>button.onclick=async()=>{if(!confirm('¿Emitir todos los pedidos de este archivo? Después no podrán editarse.'))return;button.disabled=true;button.textContent='Emitiendo…';try{await api(`/api/order-batches/${encodeURIComponent(button.dataset.emitBatch)}/emit`,{method:'POST',json:{}});toast('Archivo emitido');await refresh()}catch(error){toast(error.message,'error');button.disabled=false;button.textContent='Emitir todo'}})}else $('#receivingFeed').innerHTML=list.length?list.map(emittedCard).join(''):'<div class="panel empty-state"><h3>Sin pedidos</h3><p>No hay resultados para este filtro.</p></div>';
      bindOrderActions(list,{refresh});
    };
    $$('[data-simple-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.simpleFilter;$$('[data-simple-filter]').forEach(item=>item.classList.toggle('active',item===button));renderList()});$('#receivingSearch').oninput=renderList;$('#receivingSort').onchange=renderList;bindDynamic();renderList();
  };
  const refresh=async()=>{const payload=await api('/api/orders');orders=payload.orders||[];state.cache.orders=orders;paint()};
  if(orders.length)paint();else $('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando pedidos…</div></section>';
  try{await refresh()}catch(error){if(!orders.length)$('#mainContent').innerHTML=`<section class="panel"><div class="empty-state"><h3>No se pudieron cargar los pedidos</h3><p>${esc(error.message)}</p></div></section>`}
}

async function openFile(key,name='documento.pdf'){return previewDocument(key,name)}
function orderRow(order){return `<article class="history-row history-order-row">${logoShell(order,'small')}<div><div class="history-title"><strong>${esc(order.supplierName)}</strong><span>${esc(order.folio)}</span><span class="simple-state ${esc(order.publicState)}">${esc(PUBLIC_LABELS[order.publicState]||'Emitido')}</span></div><p>${esc(order.costCenterName||'Centro')} · ${Number(order.itemCount||0)} productos · ${date(order.createdAt)}</p><small>${Number(order.invoiceCount||0)} documento${Number(order.invoiceCount||0)===1?'':'s'}</small></div><div class="history-direct-actions"><button class="btn small" type="button" data-order-pdf="preview" data-order-id="${esc(order.id)}">PDF</button><button class="btn small" type="button" data-order-pdf="share" data-order-id="${esc(order.id)}">Compartir</button><button class="btn small primary" type="button" data-attach-document="${esc(order.id)}">Factura</button><button class="btn small" type="button" data-open-order="${esc(order.id)}">Abrir</button>${canDelete()?`<button class="btn small danger" type="button" data-delete-order="${esc(order.id)}">Eliminar</button>`:''}</div></article>`}
function documentRow(invoice){const type=DOCS[String(invoice.documentType||'0')]||'Documento';return `<article class="history-row"><span class="history-icon document">▧</span><div><div class="history-title"><strong>${esc(type)} ${esc(invoice.invoiceNumber)}</strong></div><p>${esc(invoice.supplierName)} · ${esc((invoice.locationNames||[]).join(', ')||'Sin local')}</p><small>${date(invoice.invoiceDate)} · ${money(invoice.grossTotal)}</small></div>${invoice.pdfKey?`<button class="btn small" type="button" data-open-file="${esc(invoice.pdfKey)}" data-file-name="${esc(invoice.pdfName||`${type}-${invoice.invoiceNumber}.pdf`)}">Abrir</button>`:''}</article>`}

export async function renderHistory(){
  state.view='history';setExperienceActive('history');let orders=state.cache.orders||[],invoices=state.cache.invoices||[],events=state.cache.audit||[];
  const paint=()=>{$('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">TRAZABILIDAD</span><h2>Historial</h2><p>Pedidos y documentos con acciones directas.</p></div></div><section class="simple-filter-row"><button class="simple-filter active" data-history-filter="orders"><b>${orders.length}</b><span>Pedidos</span></button><button class="simple-filter" data-history-filter="documents"><b>${invoices.length}</b><span>Documentos</span></button><button class="simple-filter" data-history-filter="activity"><b>${events.length}</b><span>Actividad</span></button></section><section class="ops-toolbar"><label class="field"><span>Buscar historial</span><input id="historySearch" placeholder="Folio, proveedor, documento o usuario"></label></section><section class="history-feed" id="historyFeed"></section>`;let filter='orders';const render=()=>{const q=normalized($('#historySearch')?.value);if(filter==='orders'){$('#historyFeed').innerHTML=orders.filter(item=>!q||normalized(`${item.folio} ${item.supplierName} ${item.costCenterName}`).includes(q)).map(orderRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';bindOrderActions(orders,{refresh:renderHistory});hydrateProtectedImages($('#historyFeed')).catch(()=>{})}else if(filter==='documents'){$('#historyFeed').innerHTML=invoices.filter(item=>!q||normalized(`${item.invoiceNumber} ${item.supplierName} ${(item.locationNames||[]).join(' ')}`).includes(q)).map(documentRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';$$('[data-open-file]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openFile(button.dataset.openFile,button.dataset.fileName).catch(error=>toast(error.message,'error'))})}else $('#historyFeed').innerHTML=events.filter(item=>!q||normalized(`${item.action} ${item.actorEmail} ${item.entityType}`).includes(q)).map(item=>`<article class="history-row"><span class="history-icon activity">◷</span><div><div class="history-title"><strong>${esc(item.action)}</strong></div><p>${esc(item.actorEmail||'Sistema')} · ${esc(item.entityType||'')}</p><small>${date(item.createdAt)}</small></div></article>`).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>'};$$('[data-history-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.historyFilter;$$('[data-history-filter]').forEach(item=>item.classList.toggle('active',item===button));render()});$('#historySearch').oninput=render;render()};
  if(orders.length||invoices.length)paint();else $('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando historial…</div></section>';
  try{const [orderData,invoiceData,auditData]=await Promise.all([api('/api/orders'),api('/api/invoices'),api('/api/audit?limit=120').catch(()=>({events:[]}))]);orders=orderData.orders||[];invoices=invoiceData.invoices||[];events=auditData.events||[];state.cache.orders=orders;state.cache.invoices=invoices;state.cache.audit=events;paint()}catch(error){if(!orders.length&&!invoices.length)toast(error.message,'error')}
}
