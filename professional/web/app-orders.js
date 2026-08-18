import {$,$$,esc,state,api,toast,date,money,clearResponseCache} from './app-core.js';
import {registerRouteRenderer,openRoute} from './app-router-v14.js';
import {openOrderDetail} from './app-order-detail-v30.js';
import {prepareOrderShare,shareDocument,sharePreparedOrderNow} from './app-file-actions.js';
import {openOrder} from './app-actions.js';
import {loadCapabilitiesV30} from './app-runtime-v30.js';
import {filterCount,openFilterDrawer,optionList,savedFilters,skeletonCards,statusLabel,uniq} from './app-v32-base.js';

const TERMINAL=new Set(['closed','cancelled']);
const RECEIVED=new Set(['partially_received','received','reconciled','closed']);
const ROLE_WEIGHT={readonly:10,finance:40,receiver:50,purchaser:60,approver:70,admin:80,owner:100};
const STATE_ACTIONS={
  requested:[['approved','Aprobar'],['cancelled','Anular']],
  approved:[['sent','Marcar enviado'],['cancelled','Anular']],
  sent:[['confirmed','Confirmar'],['cancelled','Anular']],
  confirmed:[['cancelled','Anular']],
  partially_received:[['closed','Cerrar pedido'],['cancelled','Anular']],
  received:[['closed','Cerrar pedido']],
  reconciled:[['closed','Cerrar pedido']]
};
const STATE_REQUIRED={sent:'purchaser',confirmed:'purchaser',cancelled:'purchaser',approved:'approver',closed:'receiver'};
const day=value=>value?date(value):'Sin fecha';
const svg=name=>({
  share:'<svg class="v67-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0-4 4m4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>',
  more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
}[name]||'');

function injectStyles(){
  if($('#v67OrderStyles'))return;
  const style=document.createElement('style');
  style.id='v67OrderStyles';
  style.textContent=`
.v67-icon{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.v67-order-actions{position:relative;display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text)}
.v67-order-actions>span{pointer-events:none}.v67-order-actions svg{width:21px;height:21px;fill:currentColor;stroke:none}
.v67-order-actions select{position:absolute;inset:0;width:100%;height:100%;opacity:.001;z-index:2;border:0;background:transparent;-webkit-appearance:menulist;appearance:auto}
.v67-order-select{position:absolute;left:10px;top:10px;z-index:4;display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--line);border-radius:11px;background:var(--card)}
.v67-order-select input{width:19px;height:19px;accent-color:var(--primary)}
.v32-card.v67-selectable{position:relative}.v32-card.v67-selectable .v32-card-head{padding-left:48px}
.v67-bulkbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;margin:0 0 12px;padding:11px;border:1px solid var(--line);border-radius:17px;background:var(--card)}
.v67-bulkbar strong,.v67-bulkbar small{display:block}.v67-bulkbar small{margin-top:3px;color:var(--muted);font-size:12px}.v67-bulkbar button:disabled{opacity:.45}
.v67-taskline{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.v67-task{padding:5px 9px;border-radius:999px;background:var(--soft);font-size:11px;color:var(--muted)}
.v67-task.pending{color:var(--warning);background:color-mix(in srgb,var(--warning) 11%,var(--card))}.v67-task.danger{color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,var(--card))}.v67-task.ok{color:var(--success);background:color-mix(in srgb,var(--success) 11%,var(--card))}
.v67-task.optional{color:var(--muted);background:color-mix(in srgb,var(--text) 5%,var(--card))}.v67-task.ready{color:var(--primary);background:color-mix(in srgb,var(--primary) 10%,var(--card))}
.v67-legacy{display:block;margin-top:4px;color:var(--muted);font-size:10px}.v32-actions .v67-icon-button{display:grid;place-items:center;min-width:44px;padding:0}
.v32-actions .v67-icon-button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.v32-actions .v67-icon-button:disabled{opacity:.45;cursor:default}
.v67-load-more{display:flex;justify-content:center;padding:10px 0 4px}.v67-load-more .btn{min-width:180px}.v32-card-head h3{font-size:17px!important}.v32-card-head p,.v32-metric small,.v32-chip{font-size:12px!important}.v32-metric strong{font-size:15px!important}
@media(max-width:680px){.v67-bulkbar{grid-template-columns:1fr 1fr}.v67-bulkbar>div{grid-column:1/-1}.v32-metrics{grid-template-columns:1fr 1fr!important}.v32-chips{display:none!important}}
`;
  document.head.append(style);
}

function canTransition(role,to){return Number(ROLE_WEIGHT[role]||0)>=Number(ROLE_WEIGHT[STATE_REQUIRED[to]||'admin']||80)}
function hasReception(order){return Boolean(order.lastReceivedAt)||RECEIVED.has(order.status)}
function stateInfo(order){
  if(order.status==='draft')return{label:'En edición',className:'info'};
  if(order.status==='cancelled'&&order.deliveryOutcome==='not_presented')return{label:'No presentado',className:'warn'};
  if(order.status==='cancelled')return{label:'Anulado',className:'warn'};
  if(order.status==='closed')return{label:'Cerrado',className:'ok'};
  if(hasReception(order))return{label:'Listo para cerrar',className:'ok'};
  return{label:'Recepción pendiente',className:'info'};
}
function taskMarkup(order){
  if(order.status==='draft')return'';
  if(order.status==='cancelled'&&order.deliveryOutcome==='not_presented')return'<div class="v67-taskline"><span class="v67-task danger">Proveedor no se presentó</span><span class="v67-task optional">Sin recepción</span></div>';
  const invoice=Number(order.invoiceCount||0)>0,reception=hasReception(order),paid=order.paymentState==='paid',overdue=order.paymentState==='overdue',reviewable=invoice&&reception;
  return`<div class="v67-taskline"><span class="v67-task ${reception?'ok':'pending'}">${reception?'Recepción registrada':'Falta recepción'}</span><span class="v67-task ${invoice?'ok':'optional'}">${invoice?'Factura vinculada':'Factura opcional'}</span>${reviewable?'<span class="v67-task ready">Revisión de diferencias disponible</span>':'<span class="v67-task optional">Conciliación opcional</span>'}${invoice?`<span class="v67-task ${paid?'ok':overdue?'danger':'optional'}">${paid?'Factura pagada':overdue?'Pago vencido':'Pago independiente'}</span>`:''}</div>`;
}
function fallbackMeta(orders){return{suppliers:uniq(orders.map(item=>item.supplierId?{id:item.supplierId,name:item.supplierName}:null)),locations:uniq(orders.map(item=>item.locationId?{id:item.locationId,name:item.locationName}:null)),costCenters:uniq(orders.map(item=>item.costCenterId?{id:item.costCenterId,name:item.costCenterName}:null)),brands:[...new Set(orders.flatMap(item=>item.productBrands||[]))].sort((a,b)=>a.localeCompare(b,'es')),categories:uniq(orders.flatMap(item=>item.categories||[]))}}
function stringOptions(items,selected=''){return`<option value="">Todas</option>${(items||[]).map(item=>`<option value="${esc(item)}" ${item===selected?'selected':''}>${esc(item)}</option>`).join('')}`}
function clientMatch(order,filters,history){if(history!==TERMINAL.has(order.status))return false;const q=String(filters.query||'').trim().toLowerCase(),stamp=String(order.emittedAt||order.createdAt||'').slice(0,10),haystack=`${order.folio||''} ${order.legacyFolio||''} ${order.supplierName||''} ${order.locationName||''} ${order.costCenterName||''}`.toLowerCase();return(!q||haystack.includes(q))&&(!filters.from||stamp>=filters.from)&&(!filters.to||stamp<=filters.to)&&(!filters.supplier||order.supplierId===filters.supplier)&&(!filters.location||order.locationId===filters.location)&&(!filters.center||order.costCenterId===filters.center)&&(!filters.status||order.status===filters.status)&&(!filters.brand||(order.productBrands||[]).includes(filters.brand))&&(!filters.category||(order.categories||[]).some(item=>item.id===filters.category))&&(!filters.invoice||(filters.invoice==='pending'&&Number(order.invoiceCount||0)===0)||(filters.invoice==='linked'&&Number(order.invoiceCount||0)>0))&&(!filters.reception||(filters.reception==='pending'&&!hasReception(order))||(filters.reception==='received'&&hasReception(order)))}
function queryFor(history,filters,cursor=''){const query=new URLSearchParams({view:history?'history':'active',limit:'60'});const pairs={q:filters.query,from:filters.from,to:filters.to,supplier:filters.supplier,location:filters.location,center:filters.center,status:filters.status,brand:filters.brand,category:filters.category,invoice:filters.invoice,reception:filters.reception,cursor};for(const[key,value]of Object.entries(pairs))if(value)query.set(key,value);return query.toString()}
async function loadOrdersPage(history,filters,cursor=''){
  try{return await api(`/api/orders/advanced?${queryFor(history,filters,cursor)}`,{fresh:true,timeout:30000})}
  catch(error){
    if([401,403].includes(Number(error.status||0)))throw error;
    if(cursor)return{orders:[],meta:{},page:{hasMore:false,nextCursor:''},fallback:true};
    const legacy=await api('/api/orders',{fresh:true,timeout:30000}),all=legacy.orders||[],orders=all.filter(order=>clientMatch(order,filters,history));return{orders,meta:fallbackMeta(all),page:{hasMore:false,nextCursor:''},fallback:true};
  }
}
function transitionOptions(order,cap){return(STATE_ACTIONS[order.status]||[]).filter(([to])=>canTransition(cap.role,to)).map(([to,label])=>[`state:${to}`,`Estado · ${label}`])}
function actionOptions(order,{history=false,cap={}}={}){
  if(history)return[['view','Ver detalle'],['documents','Documentos'],['share','Compartir PDF']];
  if(order.status==='draft')return[['view','Ver pedido'],['edit','Editar'],['emit','Emitir'],['duplicate','Duplicar']];
  const options=[['view','Ver detalle']];
  if(Number(order.invoiceCount||0)===0&&cap.invoices?.upload)options.push(['invoice','Subir factura']);
  if(!hasReception(order)&&cap.reception?.register)options.push(['receive','Registrar recepción']);
  if(!hasReception(order)&&['requested','approved','sent','confirmed'].includes(order.status)&&canTransition(cap.role,'cancelled'))options.push(['no-show','Proveedor no presentado']);
  if(Number(order.invoiceCount||0)>0&&hasReception(order)&&cap.invoices?.reconcile)options.push(['reconcile','Revisar diferencias']);
  options.push(['documents','Documentos'],...transitionOptions(order,cap),['share','Compartir PDF']);
  return options;
}
function card(order,{selectable=false,history=false,cap={}}={}){
  const info=stateInfo(order),select=selectable?`<label class="v67-order-select"><input type="checkbox" data-v67-select="${esc(order.id)}" aria-label="Seleccionar ${esc(order.supplierName)}"></label>`:'',native=`<label class="v67-order-actions" aria-label="Acciones"><span>${svg('more')}</span><select data-v67-order-actions="${esc(order.id)}" aria-label="Acciones de ${esc(order.supplierName)}"><option value="" selected>Acciones</option>${actionOptions(order,{history,cap}).map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`,primary=history?'Ver detalle':order.status==='draft'?'Editar borrador':'Gestionar pedido',legacy=order.legacyFolio&&order.legacyFolio!==order.folio?`<small class="v67-legacy">Folio anterior: ${esc(order.legacyFolio)}</small>`:'';
  return`<article class="v32-card ${selectable?'v67-selectable':''}" data-v32-order-card="${esc(order.id)}">${select}<header class="v32-card-head"><div><span class="eyebrow">${esc(order.status==='draft'?'BORRADOR':order.folio)}</span>${legacy}<h3>${esc(order.supplierName)}</h3><p>${esc(order.locationName)} · ${esc(order.costCenterName||'Sin centro')}</p></div><span class="v32-chip ${info.className}">${esc(info.label)}</span></header><div class="v32-metrics"><article class="v32-metric"><strong>${day(order.deliveryDate)}</strong><small>Entrega</small></article><article class="v32-metric"><strong>${Number(order.itemCount||0)}</strong><small>Productos</small></article><article class="v32-metric"><strong>${Number(order.grossTotal||0)>0?money(order.grossTotal):'—'}</strong><small>Estimado</small></article><article class="v32-metric"><strong>${Number(order.invoiceCount||0)>0?money(order.invoicedGrossTotal||0):'—'}</strong><small>Facturado</small></article></div>${taskMarkup(order)}<div class="v32-actions"><button class="btn primary primary-action" data-v32-order-primary="${esc(order.id)}">${primary}</button>${history?`<button class="btn v67-icon-button" data-v32-order-share="${esc(order.id)}" aria-label="Compartir PDF" title="Compartir PDF" disabled>${svg('share')}</button>`:''}${native}</div></article>`;
}
async function sharePreparedOrders(orders){const prepared=[];for(const order of orders)prepared.push(await prepareOrderShare(order));const files=prepared.map(item=>item.file).filter(Boolean);if(!files.length)throw new Error('No hay PDFs disponibles');if(navigator.share&&(!navigator.canShare||navigator.canShare({files}))){try{await navigator.share({title:`${files.length} pedido${files.length===1?'':'s'}`,files});return}catch(error){if(error?.name==='AbortError')return;throw error}}for(const item of prepared)await shareDocument(item.document.key,item.document.name)}
function shareOrder(order){if(!order)return;try{const result=sharePreparedOrderNow(order);Promise.resolve(result).catch(error=>{if(error?.name!=='AbortError')toast(error.message,'error')})}catch(error){if(error?.code==='share_not_ready')prepareOrderShare(order).catch(()=>{});toast(error.message,'error')}}
async function detailAction(id,selector){await openOrderDetail(id);setTimeout(()=>document.querySelector(selector)?.click(),70)}
async function transitionState(order,to){
  if(!order||!to)return;
  const destructive=to==='closed'||to==='cancelled';
  if(destructive&&!confirm(to==='closed'?`¿Cerrar ${order.folio}? La recepción quedará finalizada y el pedido pasará a Historial. La factura y el pago pueden registrarse después.`:`¿Anular ${order.folio}? Pasará a Historial como anulado.`))return;
  await api(`/api/orders/${encodeURIComponent(order.id)}/transition`,{method:'POST',json:{status:to,reason:to==='closed'?'Cierre operativo posterior a recepción':to==='cancelled'?'Anulación desde Pedidos':'Actualización de estado desde Pedidos'}});
  clearResponseCache();state.cache.orders=[];toast(to==='closed'?'Pedido cerrado · enviado a Historial':to==='cancelled'?'Pedido anulado':`Estado actualizado: ${statusLabel(to)}`);await openRoute(TERMINAL.has(to)?'history':'orders','',{replace:true});
}
async function markNotPresented(order){
  if(!order)return;
  if(!confirm(`¿Marcar ${order.folio} como “Proveedor no presentado”? Se archivará sin recepción y quedará identificado en Historial.`))return;
  await api(`/api/orders/${encodeURIComponent(order.id)}/transition`,{method:'POST',json:{status:'cancelled',reason:'Proveedor no presentado · pedido archivado sin recepción'}});
  clearResponseCache();state.cache.orders=[];toast('Pedido archivado como no presentado');await openRoute('history','',{replace:true});
}
async function runNativeAction(order,action,{history=false}={}){if(!order||!action)return;if(action==='view')return openOrderDetail(order.id);if(action==='edit')return detailAction(order.id,'#v30EditOrder');if(action==='emit')return detailAction(order.id,'#v30EmitOrder');if(action==='duplicate')return detailAction(order.id,'#v30Duplicate');if(action==='invoice')return detailAction(order.id,'#v30AttachInvoice');if(action==='receive')return detailAction(order.id,'#v30Reception');if(action==='reconcile')return detailAction(order.id,'#v30Reconcile');if(action==='no-show')return markNotPresented(order);if(action==='documents'){if(window.NuvastoMultiInvoice?.open)return window.NuvastoMultiInvoice.open({orderId:order.id,returnToHistory:history});return openOrderDetail(order.id)}if(action==='share')return sharePreparedOrderNow(order);if(action.startsWith('state:'))return transitionState(order,action.slice(6))}

export async function renderOrdersHistoryV32(mode='orders'){
  injectStyles();const history=mode==='history';state.view=mode;$$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===mode));if($('#pageEyebrow'))$('#pageEyebrow').textContent=history?'TRAZABILIDAD':'OPERACIÓN';if($('#pageTitle'))$('#pageTitle').textContent=history?'Historial':'Pedidos';$('#mainContent').innerHTML=`<section class="v32-page">${skeletonCards(4)}</section>`;
  try{
    const cap=await loadCapabilitiesV30(),defaults={query:'',from:'',to:'',supplier:'',location:'',center:'',status:'',brand:'',category:'',invoice:'',reception:''};let filters=savedFilters(mode,defaults),orders=[],meta={suppliers:[],locations:[],costCenters:[],brands:[],categories:[]},page={hasMore:false,nextCursor:''},selected=new Set(),shareObserver=null,loadSerial=0,searchTimer=0;
    $('#mainContent').innerHTML=`<section class="v32-page"><header class="v32-head"><div><span class="eyebrow">${history?'TRAZABILIDAD CERRADA':'OPERACIÓN ACTIVA'}</span><h2>${history?'Historial de pedidos':'Pedidos pendientes de recepción o cierre'}</h2><p>${history?'Pedidos cerrados, anulados o marcados como proveedor no presentado. Factura, conciliación y pago mantienen su trazabilidad de forma independiente.':'Un pedido se cierra después de registrar una recepción. Factura, conciliación y pago son controles independientes y nunca bloquean el cierre operativo.'}</p></div><div class="v32-head-actions">${!history&&cap.orders?.create?`<button class="btn primary" id="v32NewOrder">${svg('plus')} Nuevo pedido</button>`:''}</div></header><div id="v67Fallback"></div><div class="v32-toolbar"><label class="v32-search"><span class="sr-only">Buscar pedidos</span><input id="v32OrderSearch" value="${esc(filters.query)}" placeholder="Buscar folio, folio anterior o proveedor"></label><button class="v32-filter-trigger" id="v32OrderFilters" type="button">Filtros <span class="v32-filter-count ${filterCount(filters)?'':'hidden'}" id="v32OrderFilterCount">${filterCount(filters)}</span></button></div>${history?'':'<section class="v67-bulkbar"><div><strong id="v67BulkCount">0 borradores seleccionados</strong><small>La selección masiva solo modifica borradores. Los emitidos se gestionan individualmente hasta su recepción y cierre.</small></div><button class="btn primary" id="v67BulkEmit" type="button" disabled>Emitir</button><button class="btn danger" id="v67BulkDelete" type="button" disabled>Eliminar</button></section>'}<div class="v32-grid" id="v32OrderGrid"></div><div class="v67-load-more" id="v67LoadMoreWrap"></div></section>`;
    const cacheLoaded=()=>{const current=new Map((state.cache.orders||[]).map(item=>[item.id,item]));for(const order of orders)current.set(order.id,order);state.cache.orders=[...current.values()]};
    const updateBulk=()=>{const count=$('#v67BulkCount');if(count)count.textContent=`${selected.size} borrador${selected.size===1?'':'es'} seleccionado${selected.size===1?'':'s'}`;['v67BulkEmit','v67BulkDelete'].forEach(id=>{const button=$(`#${id}`);if(button)button.disabled=!selected.size})};
    const primeOrderShare=order=>{if(!order||order.status==='draft')return;prepareOrderShare(order).then(()=>{const button=$(`[data-v32-order-share="${CSS.escape(String(order.id))}"]`);if(button){button.disabled=false;button.dataset.shareReady='1'}}).catch(error=>console.warn('order_share_prepare_failed',order.id,error))};
    const bindCards=()=>{
      shareObserver?.disconnect();shareObserver=null;const cards=$$('[data-v32-order-card]');if(cards.length){if('IntersectionObserver'in window){shareObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;shareObserver?.unobserve(entry.target);primeOrderShare(orders.find(item=>item.id===entry.target.dataset.v32OrderCard))}},{rootMargin:'700px 0px'});cards.forEach(node=>shareObserver.observe(node))}else cards.slice(0,8).forEach(node=>primeOrderShare(orders.find(item=>item.id===node.dataset.v32OrderCard)))}
      $$('[data-v32-order-share]').forEach(button=>button.onclick=()=>shareOrder(orders.find(item=>item.id===button.dataset.v32OrderShare)));
      $$('[data-v32-order-primary]').forEach(button=>button.onclick=()=>openOrderDetail(button.dataset.v32OrderPrimary).catch(error=>toast(error.message,'error')));
      $$('[data-v67-order-actions]').forEach(select=>select.onchange=async()=>{const action=select.value;select.value='';if(!action)return;select.disabled=true;try{await runNativeAction(orders.find(item=>item.id===select.dataset.v67OrderActions),action,{history})}catch(error){if(error?.code==='share_not_ready'){const order=orders.find(item=>item.id===select.dataset.v67OrderActions);prepareOrderShare(order).catch(()=>{})}if(error?.name!=='AbortError')toast(error.message,'error')}finally{select.disabled=false}});
      $$('[data-v67-select]').forEach(input=>{input.checked=selected.has(input.dataset.v67Select);input.onchange=()=>{input.checked?selected.add(input.dataset.v67Select):selected.delete(input.dataset.v67Select);updateBulk()}});
    };
    const paint=()=>{for(const id of [...selected])if(!orders.some(order=>order.id===id&&order.status==='draft'))selected.delete(id);$('#v32OrderGrid').innerHTML=orders.map(order=>card(order,{selectable:!history&&order.status==='draft',history,cap})).join('')||`<div class="v32-empty"><h3>${history?'Aún no hay pedidos archivados':'No hay pedidos pendientes'}</h3><p>${history?'Los pedidos aparecerán aquí al cerrarse, anularse o marcarse como no presentados.':'La operación está al día.'}</p></div>`;$('#v67LoadMoreWrap').innerHTML=page.hasMore?'<button class="btn" id="v67LoadMore" type="button">Cargar más</button>':'';$('#v67LoadMore')?.addEventListener('click',()=>load(true));bindCards();updateBulk();const count=filterCount(filters),badge=$('#v32OrderFilterCount');badge.textContent=count;badge.classList.toggle('hidden',!count)};
    const load=async append=>{const serial=++loadSerial,cursor=append?page.nextCursor:'';if(append){const button=$('#v67LoadMore');if(button){button.disabled=true;button.textContent='Cargando…'}}else $('#v32OrderGrid').innerHTML=skeletonCards(4);const payload=await loadOrdersPage(history,filters,cursor);if(serial!==loadSerial)return;const incoming=payload.orders||[];orders=append?[...orders,...incoming.filter(item=>!orders.some(current=>current.id===item.id))]:incoming;meta={...meta,...(payload.meta||{})};page=payload.page||{hasMore:false,nextCursor:''};$('#v67Fallback').innerHTML=payload.fallback?'<div class="v33-inline-notice" role="status">Se usó el servicio de respaldo. La vista principal se reintentará en la próxima carga.</div>':'';cacheLoaded();paint()};
    $('#v32OrderSearch').oninput=()=>{clearTimeout(searchTimer);filters.query=$('#v32OrderSearch').value;searchTimer=setTimeout(()=>load(false).catch(error=>toast(error.message,'error')),280)};
    $('#v32NewOrder')?.addEventListener('click',()=>openOrder());
    $('#v32OrderFilters').onclick=()=>openFilterDrawer({scope:mode,title:history?'Filtros de historial':'Filtros de pedidos',subtitle:history?'Busca exclusivamente entre operaciones terminadas.':'Combina período, proveedor, local, centro y estado de la cola activa.',filters,fields:`<label class="field"><span>Desde</span><input type="date" name="from"></label><label class="field"><span>Hasta</span><input type="date" name="to"></label><label class="field"><span>Proveedor</span><select name="supplier">${optionList(meta.suppliers||[],filters.supplier)}</select></label><label class="field"><span>Local</span><select name="location">${optionList(meta.locations||[],filters.location)}</select></label><label class="field"><span>Centro de costo</span><select name="center">${optionList(meta.costCenters||[],filters.center)}</select></label><label class="field"><span>Estado</span><select name="status">${optionList(uniq(orders.map(item=>({id:item.status,name:item.deliveryOutcome==='not_presented'?'No presentado':statusLabel(item.status)}))),filters.status)}</select></label><label class="field"><span>Marca</span><select name="brand">${stringOptions(meta.brands||[],filters.brand)}</select></label><label class="field"><span>Categoría</span><select name="category">${optionList(meta.categories||[],filters.category)}</select></label><label class="field"><span>Factura</span><select name="invoice"><option value="">Todas</option><option value="pending" ${filters.invoice==='pending'?'selected':''}>Sin factura</option><option value="linked" ${filters.invoice==='linked'?'selected':''}>Con factura</option></select></label><label class="field"><span>Recepción</span><select name="reception"><option value="">Todas</option><option value="pending" ${filters.reception==='pending'?'selected':''}>Pendiente</option><option value="received" ${filters.reception==='received'?'selected':''}>Registrada</option></select></label>`,onApply:next=>{filters={...defaults,...next,query:$('#v32OrderSearch').value};selected.clear();load(false).catch(error=>toast(error.message,'error'))}});
    if(!history){
      $('#v67BulkEmit').onclick=async()=>{const button=$('#v67BulkEmit');button.disabled=true;try{const full=await Promise.all([...selected].map(async id=>(await api(`/api/orders/${encodeURIComponent(id)}`,{fresh:true,timeout:20000})).order)),batchIds=[...new Set(full.map(order=>order?.batchId).filter(Boolean))];if(!batchIds.length)throw new Error('Los pedidos seleccionados no pertenecen a un archivo emitible');for(const batchId of batchIds)await api(`/api/order-batches/${encodeURIComponent(batchId)}/emit`,{method:'POST',json:{}});clearResponseCache();toast('Pedidos emitidos. Quedarán pendientes de recepción.');selected.clear();await load(false);try{const fresh=await Promise.all(full.map(async order=>(await api(`/api/orders/${encodeURIComponent(order.id)}`,{fresh:true,timeout:15000})).order));await sharePreparedOrders(fresh)}catch(error){if(error?.name!=='AbortError')toast('Emitidos. Puedes compartirlos desde el menú de cada pedido.','ok')}}catch(error){toast(error.message,'error')}finally{button.disabled=false}};
      $('#v67BulkDelete').onclick=async()=>{if(!selected.size||!confirm(`¿Eliminar ${selected.size} borrador${selected.size===1?'':'es'}?`))return;for(const id of selected)await api(`/api/orders/${encodeURIComponent(id)}`,{method:'DELETE'});selected.clear();clearResponseCache();toast('Borradores eliminados');await load(false)};
    }
    await load(false);
  }catch(error){const diagnostic=[error.code,error.status].filter(Boolean).join(' · ');$('#mainContent').innerHTML=`<section class="v32-page"><div class="v32-empty" role="alert"><h3>No se pudo cargar ${history?'el historial':'los pedidos'}</h3><p>${esc(error.message)}</p>${diagnostic?`<small>${esc(diagnostic)}</small>`:''}<button class="btn primary" id="v32RetryOrders">Reintentar</button></div></section>`;$('#v32RetryOrders').onclick=()=>renderOrdersHistoryV32(mode)}
}
export function initializeOrdersHistoryV32(){injectStyles();registerRouteRenderer('orders',()=>renderOrdersHistoryV32('orders'));registerRouteRenderer('history',()=>renderOrdersHistoryV32('history'))}
