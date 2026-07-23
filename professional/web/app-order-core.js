import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openOrderDetail} from './app-order-detail.js';
import {
  loadProcurementSettings,
  configForCenter,
  groupProductsByConfiguredOrder,
  unitsForCenter,
  warehouseForCategory
} from './app-procurement-settings.js';

let initialized=false;
let settingsCache=null;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

function injectStyles(){
  if($('#orderCoreStyles'))return;
  const style=document.createElement('style');style.id='orderCoreStyles';style.textContent=`
    .core-master{display:grid;gap:12px}.core-context{display:grid;grid-template-columns:minmax(170px,.8fr) minmax(160px,.7fr) minmax(150px,.6fr);gap:9px;align-items:end}.core-fixed-local{display:grid;gap:4px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}.core-fixed-local span{color:var(--muted);font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.core-fixed-local strong{font-size:12px}.core-draft{grid-column:1/-1}.core-master-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;padding:10px 12px;border:1px solid var(--line);border-radius:13px;background:var(--soft)}.core-summary{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;white-space:nowrap}.core-summary strong{font-size:22px}.core-summary span{color:var(--muted);font-size:9px}.core-list{display:grid;gap:14px}.core-warehouse{display:grid;gap:7px}.core-warehouse-title{padding:8px 10px;border-left:4px solid var(--primary);background:color-mix(in srgb,var(--primary) 7%,var(--card));font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.core-category{display:grid;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}.core-category-title{padding:8px 10px;border-bottom:1px solid var(--line);background:var(--soft);font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.core-product-row{display:grid;grid-template-columns:minmax(160px,1fr) minmax(105px,.42fr) minmax(108px,.4fr) 118px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line)}.core-product-row:last-child{border-bottom:0}.core-product-row.selected{background:color-mix(in srgb,var(--primary) 5%,var(--card))}.core-product-copy{min-width:0}.core-product-copy strong,.core-product-copy small{display:block}.core-product-copy strong{font-size:10.5px;line-height:1.3;overflow-wrap:anywhere}.core-product-copy small{margin-top:2px;color:var(--muted);font-size:8.5px}.core-control{display:grid;gap:4px;min-width:0}.core-control>span{color:var(--muted);font-size:7.5px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.core-control select,.core-control input,.core-static-supplier{width:100%;min-width:0;min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);padding:0 8px}.core-static-supplier{display:flex;align-items:center;font-size:10px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.core-quantity-wrap{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px}.core-quantity input{font-size:18px;font-weight:900;text-align:right;padding-right:10px}.core-next{min-height:38px;padding:0!important;font-size:17px}.core-empty{padding:30px 12px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}.core-batch-results{display:grid;gap:10px}.core-batch-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:14px}.core-batch-card strong,.core-batch-card small{display:block}.core-batch-card small{margin-top:4px;color:var(--muted)}
    @media(max-width:760px){.core-context{grid-template-columns:1fr 1fr}.core-fixed-local{grid-column:1/-1}.core-master-toolbar{grid-template-columns:1fr}.core-summary{justify-content:flex-start}.core-product-row{grid-template-columns:minmax(0,1fr) minmax(98px,.45fr) 112px;padding:8px}.core-product-copy{grid-column:1/-1}.core-supplier-control{grid-column:1/2}.core-unit-control{grid-column:2/3}.core-quantity{grid-column:3/4}.core-batch-card{grid-template-columns:1fr}.core-batch-card .row-actions{display:grid;grid-template-columns:1fr 1fr}}
    @media(max-width:440px){.core-context{grid-template-columns:1fr}.core-product-row{grid-template-columns:minmax(0,1fr) 104px}.core-supplier-control{grid-column:1/2}.core-unit-control{grid-column:2/3}.core-quantity{grid-column:1/-1}.core-quantity-wrap{grid-template-columns:minmax(0,1fr) 42px}}
  `;document.head.append(style);
}

async function loadSources(){
  const [locations,centers,suppliers,products,categories,settings]=await Promise.all([
    api('/api/locations'),api('/api/cost-centers'),api('/api/suppliers'),api('/api/products'),api('/api/categories'),loadProcurementSettings(true)
  ]);
  state.cache.locations=locations.locations||[];state.cache.costCenters=centers.costCenters||[];state.cache.suppliers=suppliers.suppliers||[];state.cache.products=products.products||[];state.cache.categories=categories.categories||[];settingsCache=settings;
}

function relationFor(product,selection){return(product.suppliers||[]).find(relation=>relation.id===selection?.relationId)||(product.suppliers||[])[0]||null}
function exactUnit(config,name){const normalized=String(name||'').trim().toUpperCase();return unitsForCenter(config).find(unit=>unit.name===normalized)||unitsForCenter(config)[0]||{name:'UNIDAD',unitsPerFormat:1}}
function unitOptions(config,selected){return unitsForCenter(config).map(unit=>`<option value="${esc(unit.name)}" ${unit.name===selected?'selected':''}>${esc(unit.name)}</option>`).join('')}
function supplierControl(product,selection){
  const relations=product.suppliers||[];
  if(relations.length<=1){const relation=relations[0];return`<div class="core-static-supplier" title="${esc(relation?.supplierName||'Sin proveedor')}">${esc(relation?.supplierName||'Sin proveedor')}</div><input type="hidden" data-core-relation value="${esc(relation?.id||'')}">`;}
  return`<select data-core-relation>${relations.map(relation=>`<option value="${esc(relation.id)}" ${relation.id===selection.relationId?'selected':''}>${esc(relation.supplierName)}</option>`).join('')}</select>`;
}

async function openMasterOrder(){
  await loadSources();
  const locations=state.cache.locations;
  if(!locations.length)return toast('No tienes locales asignados','error');
  if(!state.cache.products.length)return toast('No hay productos disponibles en la lista maestra','error');
  const selections=new Map();let activeProducts=[];let activeConfig=null;
  const localControl=locations.length===1
    ?`<div class="core-fixed-local"><span>Local</span><strong>${esc(locations[0].name)}</strong></div><input type="hidden" id="coreLocation" name="locationId" value="${esc(locations[0].id)}">`
    :`<label class="field"><span>Local</span><select id="coreLocation" name="locationId" required>${locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label>`;

  openModal({
    eyebrow:'ETAPA 1 · EMISIÓN',title:'Lista maestra de pedido',subtitle:'Ingresa cantidades en una sola lista. El sistema separa por proveedor y asigna los folios.',size:'order',
    body:`<div class="core-master"><section class="core-context">${localControl}<label class="field"><span>Centro de costo</span><select id="coreCenter" name="costCenterId" required></select></label><label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label><label class="check-card core-draft"><input name="saveAsDraft" type="checkbox"><span><strong>Guardar como borrador</strong><small>Desmarcado: queda emitido como solicitado</small></span></label></section><section class="core-master-toolbar"><label class="field"><span>Buscar</span><input id="coreSearch" placeholder="Producto, categoría, bodega o proveedor" enterkeyhint="search"></label><div class="core-summary"><strong id="coreSelectedCount">0</strong><span>productos · <b id="coreSupplierCount">0</b> proveedores</span></div></section><div id="coreProducts" class="core-list"></div><label class="field"><span>Notas generales</span><textarea name="notes" placeholder="Se incluirán en cada pedido separado por proveedor"></textarea></label></div>`,
    submitLabel:'Emitir y separar por proveedor',
    onSubmit:async form=>{
      saveVisible();const items=[];
      for(const product of activeProducts){const selection=selections.get(product.id);if(!selection||Number(selection.quantity)<=0)continue;const unit=exactUnit(activeConfig,selection.orderUnit);items.push({supplierProductId:selection.relationId,productId:product.id,quantity:Number(selection.quantity),orderUnit:unit.name,unitsPerOrderUnit:Number(unit.unitsPerFormat||1),persistFormat:true});}
      if(!items.length)throw new Error('Ingresa una cantidad en al menos un producto');
      const response=await api('/api/order-batches/v2',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json:{locationId:form.get('locationId'),costCenterId:form.get('costCenterId'),deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),saveAsDraft:form.get('saveAsDraft')==='on',items}});
      state.cache.orders=[];toast(`${response.batch.supplierCount} pedidos creados desde una sola lista`);await navigate('orders');setTimeout(()=>showBatchResults(response.batch),80);
    }
  });

  function currentLocationId(){return String($('#coreLocation')?.value||locations[0]?.id||'')}
  function centersForLocation(){return state.cache.costCenters.filter(center=>center.locationId===currentLocationId()&&center.active!==false)}
  function center(){return state.cache.costCenters.find(item=>item.id===$('#coreCenter').value)}
  function categoryNames(){return state.cache.categories.map(item=>item.name).filter(Boolean)}
  function initializeProducts(){
    const selectedCenter=center();if(!selectedCenter){activeProducts=[];render();return}
    activeConfig=configForCenter(selectedCenter,categoryNames(),settingsCache);
    activeProducts=state.cache.products.filter(product=>product.active&&(product.costCenters||[]).some(item=>item.id===selectedCenter.id)&&(product.suppliers||[]).length);
    selections.clear();
    for(const product of activeProducts){const relation=product.suppliers[0];const preferred=exactUnit(activeConfig,String(relation.orderUnit||'').toUpperCase());selections.set(product.id,{quantity:'',relationId:relation.id,orderUnit:preferred.name});}
    render();
  }
  function saveVisible(){
    $$('#coreProducts [data-core-product]').forEach(row=>{const selection=selections.get(row.dataset.coreProduct);if(!selection)return;selection.quantity=row.querySelector('[data-core-quantity]').value;selection.relationId=row.querySelector('[data-core-relation]').value;selection.orderUnit=row.querySelector('[data-core-unit]').value;});
  }
  function updateSummary(){
    saveVisible();const selected=activeProducts.filter(product=>Number(selections.get(product.id)?.quantity)>0);const suppliers=new Set(selected.map(product=>relationFor(product,selections.get(product.id))?.supplierId).filter(Boolean));$('#coreSelectedCount').textContent=selected.length;$('#coreSupplierCount').textContent=suppliers.size;$$('#coreProducts [data-core-product]').forEach(row=>row.classList.toggle('selected',Number(selections.get(row.dataset.coreProduct)?.quantity)>0));
  }
  function focusNext(current){
    const fields=$$('[data-core-quantity]').filter(input=>!input.disabled&&input.offsetParent!==null);const index=fields.indexOf(current);const next=fields[index+1];if(next){next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>next.select(),120)}else $('#modalSubmit')?.focus();
  }
  function bindRows(){
    $$('#coreProducts [data-core-product]').forEach(row=>{const product=activeProducts.find(item=>item.id===row.dataset.coreProduct);const quantity=row.querySelector('[data-core-quantity]');const relationInput=row.querySelector('[data-core-relation]');const unit=row.querySelector('[data-core-unit]');quantity.onfocus=()=>quantity.select();quantity.oninput=updateSummary;quantity.onkeydown=event=>{if(event.key!=='Enter')return;event.preventDefault();saveVisible();focusNext(quantity)};row.querySelector('[data-core-next]').onclick=()=>{saveVisible();focusNext(quantity)};if(relationInput.tagName==='SELECT')relationInput.onchange=()=>{const relation=(product.suppliers||[]).find(item=>item.id===relationInput.value);const selection=selections.get(product.id);selection.relationId=relationInput.value;selection.orderUnit=exactUnit(activeConfig,relation?.orderUnit).name;unit.value=selection.orderUnit;updateSummary()};unit.onchange=updateSummary;});
  }
  function render(){
    saveVisible();const query=String($('#coreSearch')?.value||'').trim().toLowerCase();const centerId=center()?.id||'';const visible=activeProducts.filter(product=>{const relation=relationFor(product,selections.get(product.id));const warehouse=warehouseForCategory(activeConfig,product.categoryName);return!query||`${product.name} ${product.categoryName||''} ${warehouse?.name||''} ${relation?.supplierName||''}`.toLowerCase().includes(query)});const groups=activeConfig?groupProductsByConfiguredOrder(visible,activeConfig):[];
    $('#coreProducts').innerHTML=groups.length?groups.map(({warehouse,categories})=>`<section class="core-warehouse"><div class="core-warehouse-title">${esc(warehouse.name)}</div>${categories.map(({category,items})=>`<section class="core-category"><div class="core-category-title">${esc(category)} · ${items.length}</div>${items.map(product=>{const selection=selections.get(product.id);return`<article class="core-product-row ${Number(selection.quantity)>0?'selected':''}" data-core-product="${esc(product.id)}"><div class="core-product-copy"><strong>${esc(product.name)}</strong><small>${esc([product.brand,product.variant,product.baseUnit].filter(Boolean).join(' · ')||category)}</small></div><label class="core-control core-supplier-control"><span>Proveedor</span>${supplierControl(product,selection)}</label><label class="core-control core-unit-control"><span>Unidad compra</span><select data-core-unit>${unitOptions(activeConfig,selection.orderUnit)}</select></label><label class="core-control core-quantity"><span>Cantidad</span><div class="core-quantity-wrap"><input data-core-quantity type="number" min="0" step="0.001" value="${esc(selection.quantity)}" placeholder="0" inputmode="decimal" enterkeyhint="next"><button class="btn core-next" type="button" data-core-next aria-label="Ir al siguiente producto">↓</button></div></label></article>`}).join('')}</section>`).join('')}</section>`).join(''):'<div class="core-empty">No hay productos para este centro de costo o filtro.</div>';
    bindRows();updateSummary();
  }
  function refreshCenters(){const centers=centersForLocation();$('#coreCenter').innerHTML=centers.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${item.productCount} productos</option>`).join('');initializeProducts()}
  if(locations.length>1)$('#coreLocation').onchange=refreshCenters;$('#coreCenter').onchange=initializeProducts;$('#coreSearch').oninput=render;refreshCenters();
}

function showBatchResults(batch){
  openModal({eyebrow:'ETAPA 1 COMPLETADA',title:`${batch.supplierCount} pedidos creados`,subtitle:'Cada proveedor tiene un folio independiente. Ahora puedes abrir el pedido o adjuntar su documento.',size:'large',hideSubmit:true,body:`<div class="core-batch-results">${batch.orders.map(order=>`<article class="core-batch-card"><div><strong>${esc(order.supplierName)} · ${esc(order.folio)}</strong><small>${Number(order.itemCount||0)} productos · ${esc(order.status==='draft'?'Borrador':'Solicitado')}</small></div><div class="row-actions"><button class="btn" data-core-order="${esc(order.id)}">Abrir pedido</button><button class="btn primary" data-core-invoice="${esc(order.id)}">Adjuntar documento</button></div></article>`).join('')}</div>`});
  $$('[data-core-order]').forEach(button=>button.onclick=()=>{closeModal('open-order');setTimeout(()=>openOrderDetail(button.dataset.coreOrder),0)});
  $$('[data-core-invoice]').forEach(button=>button.onclick=async()=>{const orderId=button.dataset.coreInvoice;closeModal('invoice');const{openInvoiceAnalysis}=await import('./app-invoices.js');setTimeout(()=>openInvoiceAnalysis({orderId,returnToOrder:true}),0)});
}

function intercept(event){const target=event.target.closest('button,[data-action]');if(!target)return;const isOrder=target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders'].includes(state.view));if(!isOrder)return;event.preventDefault();event.stopImmediatePropagation();openMasterOrder().catch(error=>toast(error.message,'error'))}

export function initializeOrderCore(){if(initialized)return;initialized=true;injectStyles();document.addEventListener('click',intercept,true)}
