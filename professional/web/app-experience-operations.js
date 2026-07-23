import {$,$$,esc,state,api,toast,money,date} from './app-core.js';
import {bindDynamic} from './app-actions.js';
import {openOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';
import {previewDocument,downloadDocument,shareDocument,ensureOrderDocument,warmDocuments} from './app-file-actions.js';

const LABELS={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};
const DOCS={'33':'Factura','34':'Factura exenta','39':'Boleta','52':'Guía de despacho','61':'Nota de crédito','0':'Documento'};
const ACTIVE=new Set(['requested','approved','sent','confirmed','partially_received']);
const label=value=>LABELS[value]||value||'Sin estado';
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function setExperienceActive(view){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)===view));
  const headings={receiving:['OPERACIÓN','Vigentes'],history:['CONTROL','Historial'],operations:['MAESTROS','Operaciones']};
  if(headings[view]){$('#pageEyebrow').textContent=headings[view][0];$('#pageTitle').textContent=headings[view][1]}
}

function metrics(orders){
  const active=orders.filter(order=>ACTIVE.has(order.status));
  return{active,preparation:active.filter(order=>['requested','approved'].includes(order.status)),transit:active.filter(order=>['sent','confirmed'].includes(order.status)),partial:active.filter(order=>order.status==='partially_received'),withoutDocument:active.filter(order=>Number(order.invoiceCount||0)===0)};
}

function queueCard(order){
  const documents=Number(order.invoiceCount||0),receptions=Number(order.receptionCount||0),pdf=Boolean(order.pdfKey);
  return`<article class="ops-order-card compact-order-card" data-order-card="${esc(order.id)}"><div class="ops-order-main"><div class="ops-order-top"><strong>${esc(order.supplierName)}</strong><span class="status ${esc(order.status)}">${esc(label(order.status))}</span></div><p><b>${esc(order.folio)}</b> · ${esc(order.costCenterName||'Centro')} · ${Number(order.itemCount||0)} productos</p><div class="ops-meta-row"><span>Entrega ${date(order.deliveryDate)}</span><span>${documents?`${documents} documento${documents===1?'':'s'}`:'Factura pendiente'}</span>${receptions?`<span>${receptions} recepción${receptions===1?'':'es'}</span>`:''}</div></div><div class="ops-document-actions"><button class="btn" type="button" data-order-pdf="preview" data-order-id="${esc(order.id)}">${pdf?'Vista previa':'Generar PDF'}</button><button class="btn" type="button" data-order-pdf="download" data-order-id="${esc(order.id)}">Guardar</button><button class="btn" type="button" data-order-pdf="share" data-order-id="${esc(order.id)}">Compartir</button><button class="btn primary" type="button" data-attach-document="${esc(order.id)}">Subir factura</button><button class="btn ghost" type="button" data-open-order="${esc(order.id)}">Gestionar</button></div></article>`;
}

async function performOrderPdf(order,mode){
  const document=await ensureOrderDocument(order);if(!document.key)throw new Error('El PDF todavía no está disponible');
  if(mode==='preview')return previewDocument(document.key,document.name);
  if(mode==='download')return downloadDocument(document.key,document.name);
  return shareDocument(document.key,document.name);
}

function bindOrderActions(orders){
  const map=new Map(orders.map(order=>[order.id,order]));
  $$('[data-open-order]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openOrderDetail(button.dataset.openOrder)});
  $$('[data-attach-document]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openInvoiceAnalysis({orderId:button.dataset.attachDocument,returnToOrder:true})});
  $$('[data-order-pdf]').forEach(button=>button.onclick=async event=>{event.preventDefault();event.stopPropagation();const order=map.get(button.dataset.orderId);if(!order)return;button.disabled=true;const labelBefore=button.textContent;button.textContent='Preparando…';try{await performOrderPdf(order,button.dataset.orderPdf);button.textContent=labelBefore==='Generar PDF'?'Vista previa':labelBefore}catch(error){toast(error.message,'error');button.textContent=labelBefore}finally{button.disabled=false}});
  warmDocuments(orders.filter(order=>order.pdfKey).map(order=>({key:order.pdfKey,name:order.pdfName||`${order.folio}.pdf`})));
}

export async function renderReceiving(){
  state.view='receiving';setExperienceActive('receiving');
  let orders=state.cache.orders||[];
  const paint=()=>{
    const groups=metrics(orders);if($('#pendingCount'))$('#pendingCount').textContent=groups.active.length;if($('#receivingCount'))$('#receivingCount').textContent=groups.active.length;
    $('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">PEDIDOS VIGENTES</span><h2>Pedidos por recibir</h2><p>Abre, comparte, guarda el PDF o carga la factura sin entrar pedido por pedido.</p></div><button class="btn primary" data-action="new-order">＋ Nuevo pedido</button></div><section class="ops-story-row"><button class="ops-story active" data-queue-filter="all"><span><b>${groups.active.length}</b></span><strong>Todos</strong></button><button class="ops-story" data-queue-filter="preparation"><span><b>${groups.preparation.length}</b></span><strong>Por enviar</strong></button><button class="ops-story" data-queue-filter="transit"><span><b>${groups.transit.length}</b></span><strong>En tránsito</strong></button><button class="ops-story" data-queue-filter="partial"><span><b>${groups.partial.length}</b></span><strong>Parciales</strong></button><button class="ops-story" data-queue-filter="withoutDocument"><span><b>${groups.withoutDocument.length}</b></span><strong>Sin factura</strong></button></section><section class="ops-toolbar"><label class="field"><span>Buscar pedido</span><input id="receivingSearch" placeholder="Folio, proveedor, centro o local"></label><label class="field"><span>Orden</span><select id="receivingSort"><option value="delivery">Entrega más próxima</option><option value="created">Más recientes</option><option value="supplier">Proveedor</option></select></label></section><section class="ops-feed" id="receivingFeed"></section>`;
    let filter='all';
    const renderList=()=>{const q=normalized($('#receivingSearch')?.value),sort=$('#receivingSort')?.value||'delivery',list=[...(filter==='all'?groups.active:groups[filter]||groups.active)].filter(order=>!q||normalized(`${order.folio} ${order.supplierName} ${order.costCenterName} ${order.locationName}`).includes(q));list.sort((a,b)=>sort==='supplier'?String(a.supplierName).localeCompare(String(b.supplierName),'es'):sort==='created'?String(b.createdAt||'').localeCompare(String(a.createdAt||'')):String(a.deliveryDate||'9999').localeCompare(String(b.deliveryDate||'9999')));$('#receivingFeed').innerHTML=list.length?list.map(queueCard).join(''):'<div class="panel empty-state"><h3>Sin pedidos en esta categoría</h3><p>Cambia el filtro o crea un nuevo pedido.</p></div>';bindOrderActions(list)};
    $$('[data-queue-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.queueFilter;$$('[data-queue-filter]').forEach(item=>item.classList.toggle('active',item===button));renderList()});$('#receivingSearch').oninput=renderList;$('#receivingSort').onchange=renderList;bindDynamic();renderList();
  };
  if(orders.length)paint();else $('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando pedidos vigentes…</div></section>';
  try{const payload=await api('/api/orders');orders=payload.orders||[];state.cache.orders=orders;paint()}catch(error){if(!orders.length)$('#mainContent').innerHTML=`<section class="panel"><div class="empty-state"><h3>No se pudieron cargar los pedidos</h3><p>${esc(error.message)}</p></div></section>`}
}

async function openFile(key,name='documento.pdf'){return previewDocument(key,name)}
function orderRow(order){return`<article class="history-row history-order-row"><span class="history-icon order">▤</span><div><div class="history-title"><strong>${esc(order.supplierName)}</strong><span>${esc(order.folio)}</span></div><p>${esc(order.costCenterName||'Centro')} · ${Number(order.itemCount||0)} productos · ${date(order.createdAt)}</p><small>${Number(order.invoiceCount||0)} documento${Number(order.invoiceCount||0)===1?'':'s'}</small></div><div class="history-direct-actions"><button class="btn small" type="button" data-order-pdf="preview" data-order-id="${esc(order.id)}">PDF</button><button class="btn small" type="button" data-order-pdf="share" data-order-id="${esc(order.id)}">Compartir</button><button class="btn small primary" type="button" data-attach-document="${esc(order.id)}">Factura</button><button class="btn small" type="button" data-open-order="${esc(order.id)}">Abrir</button></div></article>`}
function documentRow(invoice){const type=DOCS[String(invoice.documentType||'0')]||'Documento';return`<article class="history-row"><span class="history-icon document">▧</span><div><div class="history-title"><strong>${esc(type)} ${esc(invoice.invoiceNumber)}</strong></div><p>${esc(invoice.supplierName)} · ${esc((invoice.locationNames||[]).join(', ')||'Sin local')}</p><small>${date(invoice.invoiceDate)} · ${money(invoice.grossTotal)}</small></div>${invoice.pdfKey?`<button class="btn small" type="button" data-open-file="${esc(invoice.pdfKey)}" data-file-name="${esc(invoice.pdfName||`${type}-${invoice.invoiceNumber}.pdf`)}">Abrir</button>`:''}</article>`}

export async function renderHistory(){
  state.view='history';setExperienceActive('history');let orders=state.cache.orders||[],invoices=state.cache.invoices||[],events=state.cache.audit||[];
  const paint=()=>{$('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">TRAZABILIDAD</span><h2>Historial</h2><p>Acciones directas para pedidos y documentos, sin abrir cada registro primero.</p></div></div><section class="ops-story-row"><button class="ops-story active" data-history-filter="orders"><span><b>${orders.length}</b></span><strong>Pedidos</strong></button><button class="ops-story" data-history-filter="documents"><span><b>${invoices.length}</b></span><strong>Documentos</strong></button><button class="ops-story" data-history-filter="activity"><span><b>${events.length}</b></span><strong>Actividad</strong></button></section><section class="ops-toolbar"><label class="field"><span>Buscar historial</span><input id="historySearch" placeholder="Folio, proveedor, documento o usuario"></label></section><section class="history-feed" id="historyFeed"></section>`;let filter='orders';const render=()=>{const q=normalized($('#historySearch')?.value);if(filter==='orders'){$('#historyFeed').innerHTML=orders.filter(item=>!q||normalized(`${item.folio} ${item.supplierName} ${item.costCenterName}`).includes(q)).map(orderRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';bindOrderActions(orders)}else if(filter==='documents'){$('#historyFeed').innerHTML=invoices.filter(item=>!q||normalized(`${item.invoiceNumber} ${item.supplierName} ${(item.locationNames||[]).join(' ')}`).includes(q)).map(documentRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';$$('[data-open-file]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();openFile(button.dataset.openFile,button.dataset.fileName).catch(error=>toast(error.message,'error'))})}else $('#historyFeed').innerHTML=events.filter(item=>!q||normalized(`${item.action} ${item.actorEmail} ${item.entityType}`).includes(q)).map(item=>`<article class="history-row"><span class="history-icon activity">◷</span><div><div class="history-title"><strong>${esc(item.action)}</strong></div><p>${esc(item.actorEmail||'Sistema')} · ${esc(item.entityType||'')}</p><small>${date(item.createdAt)}</small></div></article>`).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>'};$$('[data-history-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.historyFilter;$$('[data-history-filter]').forEach(item=>item.classList.toggle('active',item===button));render()});$('#historySearch').oninput=render;render()};
  if(orders.length||invoices.length)paint();else $('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando historial…</div></section>';
  try{const [orderData,invoiceData,auditData]=await Promise.all([api('/api/orders'),api('/api/invoices'),api('/api/audit?limit=120').catch(()=>({events:[]}))]);orders=orderData.orders||[];invoices=invoiceData.invoices||[];events=auditData.events||[];state.cache.orders=orders;state.cache.invoices=invoices;state.cache.audit=events;paint()}catch(error){if(!orders.length&&!invoices.length)toast(error.message,'error')}
}
