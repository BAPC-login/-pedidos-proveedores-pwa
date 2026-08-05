import {$,$$,esc,state,api,toast,date,money,setBusy} from './app-core.js';
import {registerRouteRenderer} from './app-router-v14.js';
import {openOrderDetail} from './app-order-detail-v30.js';
import {openInvoiceAnalysisV30} from './app-invoice-v30.js';
import {ensureOrderDocument,shareDocument} from './app-file-actions.js';
import {openOrder} from './app-actions.js';
import {loadCapabilitiesV30} from './app-runtime-v30.js';
import {filterCount,openFilterDrawer,optionList,savedFilters,skeletonCards,statusLabel,uniq} from './app-v32-base.js';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const day=value=>value?date(value):'Sin fecha';

function stateInfo(order){
  if(order.status==='draft')return{label:'En edición',className:'info'};
  if(order.status==='cancelled')return{label:'Papelera',className:'warn'};
  if(['received','reconciled','closed'].includes(order.status))return{label:statusLabel(order.status),className:'ok'};
  if(Number(order.invoiceCount||0)===0)return{label:'Factura pendiente',className:'warn'};
  if(!order.lastReceivedAt)return{label:'Recepción pendiente',className:'info'};
  return{label:statusLabel(order.status),className:'ok'};
}

function matches(order,filters){
  const query=normalize(filters.query),stamp=String(order.emittedAt||order.createdAt||'').slice(0,10),haystack=normalize(`${order.folio} ${order.supplierName} ${order.locationName} ${order.costCenterName} ${(order.productBrands||[]).join(' ')} ${(order.categories||[]).map(item=>item.name).join(' ')}`);
  return(!query||haystack.includes(query))
    &&(!filters.from||stamp>=filters.from)
    &&(!filters.to||stamp<=filters.to)
    &&(!filters.supplier||order.supplierId===filters.supplier)
    &&(!filters.location||order.locationId===filters.location)
    &&(!filters.center||order.costCenterId===filters.center)
    &&(!filters.status||order.status===filters.status)
    &&(!filters.brand||(order.productBrands||[]).includes(filters.brand))
    &&(!filters.category||(order.categories||[]).some(item=>item.id===filters.category))
    &&(!filters.invoice||(filters.invoice==='pending'&&Number(order.invoiceCount||0)===0)||(filters.invoice==='linked'&&Number(order.invoiceCount||0)>0))
    &&(!filters.reception||(filters.reception==='pending'&&!order.lastReceivedAt)||(filters.reception==='received'&&Boolean(order.lastReceivedAt)));
}

function card(order,cap){
  const info=stateInfo(order),editing=order.status==='draft',pendingInvoice=Number(order.invoiceCount||0)===0&&!['received','reconciled','closed','cancelled'].includes(order.status),pendingReception=!order.lastReceivedAt&&!['draft','cancelled','received','reconciled','closed'].includes(order.status);
  let action='open',label='Ver pedido';
  if(editing&&cap.orders?.editDraft)label='Continuar edición';
  else if(pendingInvoice&&cap.invoices?.upload){action='invoice';label='Subir factura'}
  else if(pendingReception&&cap.reception?.register)label='Registrar recepción';
  return`<article class="v32-card" data-v32-order-card="${esc(order.id)}"><header class="v32-card-head"><div><span class="eyebrow">${esc(order.folio)}</span><h3>${esc(order.supplierName)}</h3><p>${esc(order.locationName)} · ${esc(order.costCenterName||'Sin centro')}</p></div><span class="v32-chip ${info.className}">${esc(info.label)}</span></header><div class="v32-metrics"><article class="v32-metric"><strong>${day(order.deliveryDate)}</strong><small>Entrega</small></article><article class="v32-metric"><strong>${Number(order.itemCount||0)}</strong><small>Productos</small></article><article class="v32-metric"><strong>${Number(order.grossTotal||0)>0?money(order.grossTotal):'Sin precio'}</strong><small>Total estimado</small></article><article class="v32-metric"><strong>${Number(order.invoiceCount||0)>0?money(order.invoicedGrossTotal||0):'Pendiente'}</strong><small>Total facturado</small></article></div><div class="v32-chips">${(order.productBrands||[]).slice(0,3).map(item=>`<span class="v32-chip">${esc(item)}</span>`).join('')}${(order.categories||[]).slice(0,3).map(item=>`<span class="v32-chip">${esc(item.name)}</span>`).join('')}</div><div class="v32-actions"><button class="btn primary primary-action" data-v32-order-primary="${esc(order.id)}" data-action="${action}">${esc(label)}</button><button class="btn v32-icon-btn" data-v32-order-share="${esc(order.id)}" aria-label="Compartir PDF">↗</button><button class="btn v32-icon-btn" data-v32-order-open="${esc(order.id)}" aria-label="Ver detalle">⋯</button></div></article>`;
}

async function share(button,order){
  if(!order)return;setBusy(button,true,'Preparando…');
  try{const document=await ensureOrderDocument(order);await shareDocument(document.key,document.name)}catch(error){toast(error.message,'error')}finally{if(button.isConnected)setBusy(button,false)}
}

export async function renderOrdersHistoryV32(mode='orders'){
  const history=mode==='history';state.view=mode;
  $$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===mode));
  if($('#pageEyebrow'))$('#pageEyebrow').textContent=history?'TRAZABILIDAD':'COMPRAS';if($('#pageTitle'))$('#pageTitle').textContent=history?'Historial':'Pedidos';
  $('#mainContent').innerHTML=`<section class="v32-page">${skeletonCards(4)}</section>`;
  try{
    const[payload,cap]=await Promise.all([api('/api/orders/advanced',{fresh:true,timeout:30000}),loadCapabilitiesV30()]),all=payload.orders||[],orders=all.filter(order=>history?order.status!=='draft':order.status!=='cancelled'),meta=payload.meta||{},defaults={query:'',from:'',to:'',supplier:'',location:'',center:'',status:'',brand:'',category:'',invoice:'',reception:''};
    let filters=savedFilters(mode,defaults);
    $('#mainContent').innerHTML=`<section class="v32-page"><header class="v32-head"><div><span class="eyebrow">${history?'TRAZABILIDAD':'COMPRAS'}</span><h2>${history?'Historial de pedidos':'Pedidos'}</h2><p>${history?'Consulta documentos, recepciones y estados desde una sola vista.':'Gestiona cada pedido con una acción principal clara y accesos directos.'}</p></div><div class="v32-head-actions">${!history&&cap.orders?.create?'<button class="btn primary" id="v32NewOrder">＋ Nuevo pedido</button>':''}</div></header><div class="v32-toolbar"><label class="v32-search"><span class="sr-only">Buscar pedidos</span><input id="v32OrderSearch" value="${esc(filters.query)}" placeholder="Buscar folio, proveedor, marca o categoría"></label><button class="v32-filter-trigger" id="v32OrderFilters" type="button">Filtros avanzados <span class="v32-filter-count ${filterCount(filters)?'':'hidden'}" id="v32OrderFilterCount">${filterCount(filters)}</span></button></div><div class="v32-grid" id="v32OrderGrid"></div></section>`;
    const bind=()=>{
      $$('[data-v32-order-open]').forEach(button=>button.onclick=()=>openOrderDetail(button.dataset.v32OrderOpen).catch(error=>toast(error.message,'error')));
      $$('[data-v32-order-share]').forEach(button=>button.onclick=()=>share(button,orders.find(item=>item.id===button.dataset.v32OrderShare)));
      $$('[data-v32-order-primary]').forEach(button=>button.onclick=()=>button.dataset.action==='invoice'?openInvoiceAnalysisV30({orderId:button.dataset.v32OrderPrimary,returnToHistory:true}).catch(error=>toast(error.message,'error')):openOrderDetail(button.dataset.v32OrderPrimary).catch(error=>toast(error.message,'error')));
    };
    const render=()=>{filters.query=$('#v32OrderSearch').value;const filtered=orders.filter(order=>matches(order,filters));$('#v32OrderGrid').innerHTML=filtered.map(order=>card(order,cap)).join('')||'<div class="v32-empty"><h3>No hay resultados</h3><p>Prueba otro período o limpia los filtros avanzados.</p></div>';bind();const count=filterCount(filters),badge=$('#v32OrderFilterCount');badge.textContent=count;badge.classList.toggle('hidden',!count)};
    $('#v32OrderSearch').oninput=render;$('#v32NewOrder')?.addEventListener('click',()=>openOrder());
    $('#v32OrderFilters').onclick=()=>openFilterDrawer({scope:mode,title:'Filtros avanzados',subtitle:'Combina período, proveedor, local, centro, marca, categoría y estados.',filters,fields:`<label class="field"><span>Desde</span><input type="date" name="from"></label><label class="field"><span>Hasta</span><input type="date" name="to"></label><label class="field"><span>Proveedor</span><select name="supplier">${optionList(meta.suppliers||[],filters.supplier)}</select></label><label class="field"><span>Local</span><select name="location">${optionList(meta.locations||[],filters.location)}</select></label><label class="field"><span>Centro de costo</span><select name="center">${optionList(meta.costCenters||[],filters.center)}</select></label><label class="field"><span>Estado</span><select name="status">${optionList(uniq(orders.map(item=>({id:item.status,name:statusLabel(item.status)}))),filters.status)}</select></label><label class="field"><span>Marca de producto</span><select name="brand">${optionList((meta.brands||[]).map(item=>({id:item,name:item})),filters.brand)}</select></label><label class="field"><span>Categoría</span><select name="category">${optionList(meta.categories||[],filters.category)}</select></label><label class="field"><span>Factura</span><select name="invoice"><option value="">Todas</option><option value="pending">Pendiente</option><option value="linked">Con factura</option></select></label><label class="field"><span>Recepción</span><select name="reception"><option value="">Todas</option><option value="pending">Pendiente</option><option value="received">Registrada</option></select></label>`,onApply:next=>{filters=next;render()}});
    render();
  }catch(error){$('#mainContent').innerHTML=`<section class="v32-page"><div class="v32-empty" role="alert"><h3>No se pudo cargar ${history?'el historial':'los pedidos'}</h3><p>${esc(error.message)}</p><button class="btn primary" id="v32RetryOrders">Reintentar</button></div></section>`;$('#v32RetryOrders').onclick=()=>renderOrdersHistoryV32(mode)}
}

export function initializeOrdersHistoryV32(){registerRouteRenderer('orders',()=>renderOrdersHistoryV32('orders'));registerRouteRenderer('history',()=>renderOrdersHistoryV32('history'))}
