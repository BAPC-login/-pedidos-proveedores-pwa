import {$,$$,esc,state,api,toast,money,date} from './app-core.js';
import {bindDynamic} from './app-actions.js';
import {openOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';

const LABELS={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};
const DOCS={'33':'Factura','34':'Factura exenta','39':'Boleta','52':'Guía de despacho','61':'Nota de crédito','0':'Documento'};
const ACTIVE=new Set(['requested','approved','sent','confirmed','partially_received','received']);
const label=value=>LABELS[value]||value||'Sin estado';
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function setExperienceActive(view){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)===view));
  const headings={receiving:['OPERACIÓN','Recepción'],history:['CONTROL','Historial']};
  if(headings[view]){ $('#pageEyebrow').textContent=headings[view][0];$('#pageTitle').textContent=headings[view][1] }
}

function metrics(orders){
  const active=orders.filter(order=>ACTIVE.has(order.status));
  return {active,preparation:active.filter(order=>['requested','approved'].includes(order.status)),transit:active.filter(order=>['sent','confirmed'].includes(order.status)),partial:active.filter(order=>order.status==='partially_received'),withoutDocument:active.filter(order=>Number(order.invoiceCount||0)===0)};
}

function queueCard(order){
  const documents=Number(order.invoiceCount||0),receptions=Number(order.receptionCount||0);
  return `<article class="ops-order-card"><div class="ops-order-main"><div class="ops-order-top"><span class="status ${esc(order.status)}">${esc(label(order.status))}</span><strong>${esc(order.folio)}</strong></div><h3>${esc(order.supplierName)}</h3><p>${esc(order.costCenterName||'Centro')} · ${esc(order.locationName||'Local')} · ${Number(order.itemCount||0)} productos</p><div class="ops-meta-row"><span>Entrega ${date(order.deliveryDate)}</span><span>${documents?`${documents} documento${documents===1?'':'s'}`:'Documento pendiente'}</span>${receptions?`<span>${receptions} recepción${receptions===1?'':'es'}</span>`:''}</div></div><div class="ops-order-actions"><button class="btn" type="button" data-open-order="${esc(order.id)}">Abrir</button><button class="btn primary" type="button" data-attach-document="${esc(order.id)}">${documents?'Agregar documento':'Subir factura/guía'}</button></div></article>`;
}

export async function renderReceiving(){
  state.view='receiving';setExperienceActive('receiving');
  $('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando pedidos pendientes…</div></section>';
  const payload=await api('/api/orders'),groups=metrics(payload.orders||[]);
  if($('#pendingCount'))$('#pendingCount').textContent=groups.active.length;if($('#receivingCount'))$('#receivingCount').textContent=groups.active.length;
  $('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">CONTROL DE COMPRA</span><h2>Recepción y documentos</h2><p>Pedidos en tránsito, recepciones y documentos pendientes en un solo flujo.</p></div><button class="btn primary" data-action="analyze-invoice">＋ Subir documento</button></div><section class="ops-story-row"><button class="ops-story active" data-queue-filter="all"><span><b>${groups.active.length}</b></span><strong>Todos</strong></button><button class="ops-story" data-queue-filter="preparation"><span><b>${groups.preparation.length}</b></span><strong>Por enviar</strong></button><button class="ops-story" data-queue-filter="transit"><span><b>${groups.transit.length}</b></span><strong>En tránsito</strong></button><button class="ops-story" data-queue-filter="partial"><span><b>${groups.partial.length}</b></span><strong>Parciales</strong></button><button class="ops-story" data-queue-filter="withoutDocument"><span><b>${groups.withoutDocument.length}</b></span><strong>Sin documento</strong></button></section><section class="ops-toolbar"><label class="field"><span>Buscar pedido</span><input id="receivingSearch" placeholder="Folio, proveedor, centro o local"></label><label class="field"><span>Orden</span><select id="receivingSort"><option value="delivery">Entrega más próxima</option><option value="created">Más recientes</option><option value="supplier">Proveedor</option></select></label></section><section class="ops-feed" id="receivingFeed"></section>`;
  let filter='all';
  const render=()=>{
    const q=normalized($('#receivingSearch')?.value),sort=$('#receivingSort')?.value||'delivery';
    const list=[...(filter==='all'?groups.active:groups[filter]||groups.active)].filter(order=>!q||normalized(`${order.folio} ${order.supplierName} ${order.costCenterName} ${order.locationName}`).includes(q));
    list.sort((a,b)=>sort==='supplier'?String(a.supplierName).localeCompare(String(b.supplierName),'es'):sort==='created'?String(b.createdAt||'').localeCompare(String(a.createdAt||'')):String(a.deliveryDate||'9999').localeCompare(String(b.deliveryDate||'9999')));
    $('#receivingFeed').innerHTML=list.length?list.map(queueCard).join(''):'<div class="panel empty-state"><h3>Sin pedidos en esta categoría</h3><p>Cambia el filtro o crea un nuevo pedido.</p></div>';
    $$('[data-open-order]').forEach(button=>button.onclick=()=>openOrderDetail(button.dataset.openOrder));
    $$('[data-attach-document]').forEach(button=>button.onclick=()=>openInvoiceAnalysis({orderId:button.dataset.attachDocument,returnToOrder:true}));
  };
  $$('[data-queue-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.queueFilter;$$('[data-queue-filter]').forEach(item=>item.classList.toggle('active',item===button));render()});
  $('#receivingSearch').oninput=render;$('#receivingSort').onchange=render;bindDynamic();render();
}

async function openFile(key){
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)throw new Error('No se pudo abrir el documento');
  const url=URL.createObjectURL(await response.blob());window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function orderRow(order){return `<article class="history-row"><span class="history-icon order">▤</span><div><div class="history-title"><strong>${esc(order.folio)}</strong><span class="status ${esc(order.status)}">${esc(label(order.status))}</span></div><p>${esc(order.supplierName)} · ${esc(order.costCenterName||'Centro')} · ${Number(order.itemCount||0)} productos</p><small>${date(order.createdAt)} · ${Number(order.invoiceCount||0)} documento${Number(order.invoiceCount||0)===1?'':'s'}</small></div><button class="btn small" data-open-order="${esc(order.id)}">Abrir</button></article>`}
function documentRow(invoice){const type=DOCS[String(invoice.documentType||'0')]||'Documento';return `<article class="history-row"><span class="history-icon document">▧</span><div><div class="history-title"><strong>${esc(type)} ${esc(invoice.invoiceNumber)}</strong><span class="status active">${esc(invoice.status==='review'?'En revisión':invoice.status)}</span></div><p>${esc(invoice.supplierName)} · ${esc((invoice.locationNames||[]).join(', ')||'Sin local')}</p><small>${date(invoice.invoiceDate)} · ${money(invoice.grossTotal)}</small></div>${invoice.pdfKey?`<button class="btn small" data-open-file="${esc(invoice.pdfKey)}">Abrir</button>`:''}</article>`}

export async function renderHistory(){
  state.view='history';setExperienceActive('history');$('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando historial…</div></section>';
  const [orderData,invoiceData,auditData]=await Promise.all([api('/api/orders'),api('/api/invoices'),api('/api/audit?limit=120').catch(()=>({events:[]}))]);
  const orders=orderData.orders||[],invoices=invoiceData.invoices||[],events=auditData.events||[];
  $('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">TRAZABILIDAD</span><h2>Historial completo</h2><p>Pedidos, documentos y cambios importantes en una línea de tiempo fácil de revisar.</p></div></div><section class="ops-story-row"><button class="ops-story active" data-history-filter="orders"><span><b>${orders.length}</b></span><strong>Pedidos</strong></button><button class="ops-story" data-history-filter="documents"><span><b>${invoices.length}</b></span><strong>Documentos</strong></button><button class="ops-story" data-history-filter="activity"><span><b>${events.length}</b></span><strong>Actividad</strong></button></section><section class="ops-toolbar"><label class="field"><span>Buscar historial</span><input id="historySearch" placeholder="Folio, proveedor, documento o usuario"></label></section><section class="history-feed" id="historyFeed"></section>`;
  let filter='orders';
  const render=()=>{
    const q=normalized($('#historySearch')?.value);
    if(filter==='orders'){$('#historyFeed').innerHTML=orders.filter(item=>!q||normalized(`${item.folio} ${item.supplierName} ${item.costCenterName}`).includes(q)).map(orderRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';$$('[data-open-order]').forEach(button=>button.onclick=()=>openOrderDetail(button.dataset.openOrder))}
    else if(filter==='documents'){$('#historyFeed').innerHTML=invoices.filter(item=>!q||normalized(`${item.invoiceNumber} ${item.supplierName} ${(item.locationNames||[]).join(' ')}`).includes(q)).map(documentRow).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';$$('[data-open-file]').forEach(button=>button.onclick=()=>openFile(button.dataset.openFile).catch(error=>toast(error.message,'error')))}
    else $('#historyFeed').innerHTML=events.filter(item=>!q||normalized(`${item.action} ${item.actorEmail} ${item.entityType}`).includes(q)).map(item=>`<article class="history-row"><span class="history-icon activity">◷</span><div><div class="history-title"><strong>${esc(item.action)}</strong></div><p>${esc(item.actorEmail||'Sistema')} · ${esc(item.entityType||'')}</p><small>${date(item.createdAt)}</small></div></article>`).join('')||'<div class="panel empty-state"><h3>Sin resultados</h3></div>';
  };
  $$('[data-history-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.historyFilter;$$('[data-history-filter]').forEach(item=>item.classList.toggle('active',item===button));render()});$('#historySearch').oninput=render;render();
}
