import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openOrderDetail} from './app-order-detail.js';

let initialized=false;
let settingsCache=null;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

const LIQUOR_CATEGORIES=['Gin','Pisco','Ron','Vodka','Whisky','Tequila','Licores','Vinos','Espumantes','Cervezas'];
const BEVERAGE_CATEGORIES=['Bebidas sin alcohol','Bebidas','Energéticas','Energeticas','Aguas','Jugos','Gaseosas'];

function injectStyles(){
  if($('#orderCoreStyles'))return;
  const style=document.createElement('style');
  style.id='orderCoreStyles';
  style.textContent=`
    .core-master{display:grid;gap:12px}.core-order-intro{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:14px}.core-order-step{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}.core-order-step b{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:var(--primary);color:#fff}.core-order-step span{font-size:10px;font-weight:800;line-height:1.35}
    .core-master-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid var(--line);border-radius:15px;background:var(--soft)}.core-summary{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;white-space:nowrap}.core-summary strong{font-size:24px}.core-summary span{color:var(--muted);font-size:9px}.core-supplier-summary{display:flex;flex-wrap:wrap;gap:6px}.core-supplier-summary span{padding:6px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary);font-size:9px;font-weight:850}
    .core-list{display:grid;gap:14px;overflow:visible}.core-warehouse{display:grid;gap:9px}.core-warehouse-title{padding:10px 12px;border:1px solid color-mix(in srgb,var(--primary) 26%,var(--line));border-radius:13px;background:color-mix(in srgb,var(--primary) 8%,var(--card));color:var(--primary);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.09em}.core-category{display:grid;gap:7px}.core-category-title{position:sticky;top:-16px;z-index:2;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--card) 96%,var(--soft));font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
    .core-product-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,.36fr) minmax(105px,.33fr) 84px;gap:8px;align-items:end;padding:10px 11px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.core-product-copy{align-self:center;min-width:0}.core-product-copy strong,.core-product-copy small{display:block}.core-product-copy strong{font-size:11px;overflow-wrap:anywhere}.core-product-copy small{margin-top:4px;color:var(--muted);font-size:9px}.core-mini-field{display:grid;gap:5px}.core-mini-field>span{color:var(--muted);font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.core-mini-field select,.core-mini-field input{width:100%;min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:0 9px;color:var(--text)}.core-quantity input{font-size:19px;font-weight:900;text-align:right}.core-product-row.selected{border-color:color-mix(in srgb,var(--primary) 58%,var(--line));background:color-mix(in srgb,var(--primary) 5%,var(--card))}.core-empty{padding:36px 14px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
    .core-config{display:grid;gap:12px}.core-config-center{padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.core-config-center h3{margin:0 0 8px;font-size:14px}.core-config-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.core-config-list{display:grid;gap:8px}.core-config-row{display:grid;grid-template-columns:minmax(0,1fr) 92px 34px;gap:7px;align-items:center}.core-config-row.warehouse{grid-template-columns:70px minmax(0,1fr) minmax(0,1.3fr) 34px}.core-config-row input{min-height:38px;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:0 9px;color:var(--text)}.core-config-help{color:var(--muted);font-size:10px;line-height:1.45}.core-batch-results{display:grid;gap:10px}.core-batch-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:14px}.core-batch-card strong,.core-batch-card small{display:block}.core-batch-card small{margin-top:4px;color:var(--muted)}
    @media(max-width:760px){.core-order-intro{grid-template-columns:1fr}.core-master-toolbar{grid-template-columns:1fr}.core-summary{justify-content:flex-start}.core-product-row{grid-template-columns:minmax(0,1fr) 94px 78px}.core-product-copy{grid-column:1/-1}.core-supplier-field{grid-column:1/2}.core-unit-field{grid-column:2/3}.core-quantity{grid-column:3/4}.core-category-title{top:-16px}.core-batch-card{grid-template-columns:1fr}.core-batch-card .row-actions{display:grid;grid-template-columns:1fr 1fr}.core-config-columns{grid-template-columns:1fr}.core-config-row.warehouse{grid-template-columns:54px 1fr}.core-config-row.warehouse input:nth-child(3){grid-column:1/-1}}
  `;
  document.head.append(style);
}

async function loadSources(){
  const [locations,centers,suppliers,products,settings]=await Promise.all([
    api('/api/locations'),api('/api/cost-centers'),api('/api/suppliers'),api('/api/products'),api('/api/settings').catch(()=>null)
  ]);
  state.cache.locations=locations.locations||[];
  state.cache.costCenters=centers.costCenters||[];
  state.cache.suppliers=suppliers.suppliers||[];
  state.cache.products=products.products||[];
  settingsCache=settings;
}

function slug(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||crypto.randomUUID()}
function centerName(centerId){return state.cache.costCenters.find(center=>center.id===centerId)?.name||''}
function defaultUnits(centerId){
  const name=centerName(centerId).toLowerCase();
  const values=name.includes('cocina')
    ? [['UNIDAD',1],['KG',1],['BIDÓN',1],['CAJA(6)',6],['CAJA(12)',12]]
    : [['UNIDAD',1],['CAJA(6)',6],['CAJA(12)',12],['DISPLAY(6)',6],['DISPLAY(12)',12],['DISPLAY(24)',24],['KG',1]];
  return values.map(([name,unitsPerFormat])=>({id:slug(name),name,unitsPerFormat,active:true}));
}
function defaultWarehouses(centerId){
  const name=centerName(centerId).toLowerCase();
  if(name.includes('cocina'))return [{id:'cocina',name:'Bodega cocina',sortOrder:1,categories:['Abarrotes','Insumos','Otros'],active:true}];
  return [
    {id:'licores',name:'Bodega licores',sortOrder:1,categories:LIQUOR_CATEGORIES,active:true},
    {id:'bebidas',name:'Bodega bebidas',sortOrder:2,categories:BEVERAGE_CATEGORIES,active:true},
    {id:'insumos',name:'Bodega insumos',sortOrder:3,categories:['Abarrotes','Insumos','Otros'],active:true}
  ];
}
function procurement(){return settingsCache?.organization?.procurement||{costCenters:{}}}
function configFor(centerId){
  const config=procurement().costCenters?.[centerId]||{};
  return {
    units:(config.units?.length?config.units:defaultUnits(centerId)).filter(unit=>unit.active!==false),
    warehouses:(config.warehouses?.length?config.warehouses:defaultWarehouses(centerId)).filter(item=>item.active!==false).sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),'es'))
  };
}
function unitFromName(centerId,name){return configFor(centerId).units.find(unit=>unit.name===name)||configFor(centerId).units[0]||{name:'UNIDAD',unitsPerFormat:1}}
function unitOptions(centerId,selected){
  const units=configFor(centerId).units;
  return units.map(unit=>`<option value="${esc(unit.name)}" ${unit.name===selected?'selected':''}>${esc(unit.name)}</option>`).join('');
}
function relationFor(product,selection){return (product.suppliers||[]).find(relation=>relation.id===selection?.relationId)||(product.suppliers||[])[0]||null}
function supplierOptions(product,selectedId){return (product.suppliers||[]).map(relation=>`<option value="${esc(relation.id)}" ${relation.id===selectedId?'selected':''}>${esc(relation.supplierName)}</option>`).join('')}
function warehouseForCategory(centerId,category){
  const normalized=String(category||'Sin categoría').trim().toLowerCase();
  const warehouses=configFor(centerId).warehouses;
  return warehouses.find(warehouse=>(warehouse.categories||[]).some(item=>String(item).trim().toLowerCase()===normalized))||warehouses[warehouses.length-1]||{id:'general',name:'Bodega general',sortOrder:999,categories:[]};
}
function groupedByWarehouseAndCategory(centerId,products){
  const root=new Map();
  for(const product of products){
    const warehouse=warehouseForCategory(centerId,product.categoryName);
    if(!root.has(warehouse.id))root.set(warehouse.id,{warehouse,categories:new Map()});
    const bucket=root.get(warehouse.id);
    const category=product.categoryName||'Sin categoría';
    if(!bucket.categories.has(category))bucket.categories.set(category,[]);
    bucket.categories.get(category).push(product);
  }
  return [...root.values()].sort((a,b)=>Number(a.warehouse.sortOrder||0)-Number(b.warehouse.sortOrder||0)||a.warehouse.name.localeCompare(b.warehouse.name,'es')).map(bucket=>({
    warehouse:bucket.warehouse,
    categories:[...bucket.categories.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([category,items])=>({category,items:items.sort((a,b)=>a.name.localeCompare(b.name,'es'))}))
  }));
}

async function openMasterOrder(){
  await loadSources();
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  if(!state.cache.products.length)return toast('No hay productos disponibles en la lista maestra','error');
  const selections=new Map();let activeProducts=[];
  openModal({eyebrow:'ETAPA 1 · EMISIÓN',title:'Lista maestra de pedido',subtitle:'Ordenada por bodegas del centro de costo. Completa cantidades y el sistema separa por proveedor.',size:'order',body:`
    <div class="core-order-intro"><div class="core-order-step"><b>1</b><span>Escoge local, centro y bodega</span></div><div class="core-order-step"><b>2</b><span>Cantidad + unidad de compra por producto</span></div><div class="core-order-step"><b>3</b><span>Separa por proveedor y genera folios</span></div></div>
    <div class="core-master"><section class="order-context"><label class="field"><span>Local</span><select id="coreLocation" name="locationId" required>${state.cache.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label><label class="field"><span>Centro de costo</span><select id="coreCenter" name="costCenterId" required></select></label><label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label><label class="check-card"><input name="saveAsDraft" type="checkbox"><span><strong>Guardar como borrador</strong><small>Desmarcado: se emite como Solicitado</small></span></label></section>
    <section class="core-master-toolbar"><label class="field"><span>Buscar en toda la lista</span><input id="coreSearch" placeholder="Producto, categoría, bodega o proveedor" enterkeyhint="search"></label><div class="core-summary"><strong id="coreSelectedCount">0</strong><span>productos · <b id="coreSupplierCount">0</b> proveedores</span></div></section><div class="view-actions"><button class="btn" type="button" id="coreConfigure">Configurar bodegas y unidades del centro</button></div><div id="coreSupplierSummary" class="core-supplier-summary"><span>Los proveedores se detectarán automáticamente</span></div><div id="coreProducts" class="core-list"></div><label class="field"><span>Notas generales</span><textarea name="notes" placeholder="Se incluirán en cada pedido separado por proveedor"></textarea></label></div>`,submitLabel:'Emitir y separar por proveedor',onSubmit:async form=>{saveVisible();const items=[];for(const product of activeProducts){const selection=selections.get(product.id);if(!selection||Number(selection.quantity)<=0)continue;const unit=unitFromName(form.get('costCenterId'),selection.orderUnit);items.push({supplierProductId:selection.relationId,productId:product.id,quantity:Number(selection.quantity),orderUnit:unit.name,unitsPerOrderUnit:Number(unit.unitsPerFormat||1),persistFormat:true})}if(!items.length)throw new Error('Ingresa una cantidad en al menos un producto');const response=await api('/api/order-batches/v2',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json:{locationId:form.get('locationId'),costCenterId:form.get('costCenterId'),deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),saveAsDraft:form.get('saveAsDraft')==='on',items}});state.cache.orders=[];toast(`${response.batch.supplierCount} pedidos creados desde una sola lista`);await navigate('orders');setTimeout(()=>showBatchResults(response.batch),80)}});

  function initializeProducts(){
    const centerId=$('#coreCenter').value;
    activeProducts=state.cache.products.filter(product=>product.active&&(product.costCenters||[]).some(center=>center.id===centerId)&&(product.suppliers||[]).length);
    selections.clear();
    for(const product of activeProducts){const relation=product.suppliers[0];const preferred=unitFromName(centerId,String(relation.orderUnit||'').toUpperCase());selections.set(product.id,{quantity:'',relationId:relation.id,orderUnit:preferred?.name||configFor(centerId).units[0]?.name||'UNIDAD'});}
    render();
  }
  function saveVisible(){
    $$('#coreProducts [data-core-product]').forEach(row=>{const selection=selections.get(row.dataset.coreProduct);if(!selection)return;selection.quantity=row.querySelector('[data-core-quantity]').value;selection.relationId=row.querySelector('[data-core-relation]').value;selection.orderUnit=row.querySelector('[data-core-unit]').value;});
  }
  function updateSummary(){
    saveVisible();const selected=activeProducts.filter(product=>Number(selections.get(product.id)?.quantity)>0);const groups=new Map();for(const product of selected){const relation=relationFor(product,selections.get(product.id));if(!relation)continue;if(!groups.has(relation.supplierId))groups.set(relation.supplierId,{name:relation.supplierName,count:0});groups.get(relation.supplierId).count++;}
    $('#coreSelectedCount').textContent=selected.length;$('#coreSupplierCount').textContent=groups.size;$('#coreSupplierSummary').innerHTML=[...groups.values()].map(group=>`<span>${esc(group.name)} · ${group.count}</span>`).join('')||'<span>Los proveedores se detectarán automáticamente</span>';$$('#coreProducts [data-core-product]').forEach(row=>row.classList.toggle('selected',Number(selections.get(row.dataset.coreProduct)?.quantity)>0));
  }
  function bindRows(){
    const quantityFields=$$('[data-core-quantity]');
    $$('#coreProducts [data-core-product]').forEach(row=>{const product=activeProducts.find(item=>item.id===row.dataset.coreProduct);const quantity=row.querySelector('[data-core-quantity]');const relationSelect=row.querySelector('[data-core-relation]');const unit=row.querySelector('[data-core-unit]');quantity.onfocus=()=>quantity.select();quantity.oninput=updateSummary;quantity.onkeydown=event=>{if(event.key!=='Enter')return;event.preventDefault();saveVisible();const next=quantityFields[quantityFields.indexOf(quantity)+1];if(next){next.focus();next.select()}else $('#modalSubmit')?.focus()};relationSelect.onchange=()=>{const relation=(product.suppliers||[]).find(item=>item.id===relationSelect.value);const selection=selections.get(product.id);selection.relationId=relationSelect.value;const centerId=$('#coreCenter').value;const matched=unitFromName(centerId,String(relation?.orderUnit||'').toUpperCase());selection.orderUnit=matched.name;unit.innerHTML=unitOptions(centerId,selection.orderUnit);unit.value=selection.orderUnit;updateSummary()};unit.onchange=updateSummary;});
  }
  function render(){
    saveVisible();const centerId=$('#coreCenter').value;const query=$('#coreSearch').value.trim().toLowerCase();const visible=activeProducts.filter(product=>{const relation=relationFor(product,selections.get(product.id));const warehouse=warehouseForCategory(centerId,product.categoryName);return !query||`${product.name} ${product.categoryName||''} ${warehouse.name} ${relation?.supplierName||''}`.toLowerCase().includes(query)});const groups=groupedByWarehouseAndCategory(centerId,visible);
    $('#coreProducts').innerHTML=groups.length?groups.map(({warehouse,categories})=>`<section class="core-warehouse"><div class="core-warehouse-title">${esc(warehouse.name)}</div>${categories.map(({category,items})=>`<section class="core-category"><div class="core-category-title">${esc(category)} · ${items.length}</div>${items.map(product=>{const selection=selections.get(product.id);const relation=relationFor(product,selection);return `<article class="core-product-row ${Number(selection.quantity)>0?'selected':''}" data-core-product="${esc(product.id)}"><div class="core-product-copy"><strong>${esc(product.name)}</strong><small>${esc(product.brand||product.variant||product.baseUnit||'Producto de catálogo')}</small></div><label class="core-mini-field core-supplier-field"><span>Proveedor</span><select data-core-relation>${supplierOptions(product,selection.relationId)}</select></label><label class="core-mini-field core-unit-field"><span>Unidad compra</span><select data-core-unit>${unitOptions(centerId,selection.orderUnit)}</select></label><label class="core-mini-field core-quantity"><span>Cantidad</span><input data-core-quantity type="number" min="0" step="0.001" value="${esc(selection.quantity)}" placeholder="0" inputmode="decimal" enterkeyhint="next"></label></article>`}).join('')}</section>`).join('')}</section>`).join(''):'<div class="core-empty">No hay productos para este filtro o centro de costo.</div>';
    bindRows();updateSummary();
  }
  function refreshCenters(){const centers=state.cache.costCenters.filter(center=>center.locationId===$('#coreLocation').value&&center.active!==false);$('#coreCenter').innerHTML=centers.map(center=>`<option value="${esc(center.id)}">${esc(center.name)} · ${center.productCount} productos</option>`).join('');initializeProducts()}
  $('#coreLocation').onchange=refreshCenters;$('#coreCenter').onchange=initializeProducts;$('#coreSearch').oninput=render;$('#coreConfigure').onclick=()=>openProcurementConfig($('#coreCenter').value,async()=>{settingsCache=await api('/api/settings');initializeProducts()});refreshCenters();
}

function showBatchResults(batch){
  openModal({eyebrow:'ETAPA 1 COMPLETADA',title:`${batch.supplierCount} pedidos creados`,subtitle:'Cada proveedor tiene un folio independiente. Los PDF se preparan en segundo plano.',size:'large',hideSubmit:true,body:`<div class="core-batch-results">${batch.orders.map(order=>`<article class="core-batch-card"><div><strong>${esc(order.supplierName)} · ${esc(order.folio)}</strong><small>${Number(order.itemCount||0)} productos · ${esc(order.status==='draft'?'Borrador':'Solicitado')}</small></div><div class="row-actions"><button class="btn" data-core-order="${esc(order.id)}">Abrir pedido</button><button class="btn primary" data-core-invoice="${esc(order.id)}">Adjuntar factura</button></div></article>`).join('')}</div>`});
  $$('[data-core-order]').forEach(button=>button.onclick=()=>{closeModal('open-order');setTimeout(()=>openOrderDetail(button.dataset.coreOrder),0)});
  $$('[data-core-invoice]').forEach(button=>button.onclick=async()=>{const orderId=button.dataset.coreInvoice;closeModal('invoice');const {openInvoiceAnalysis}=await import('./app-invoices.js');setTimeout(()=>openInvoiceAnalysis({orderId,returnToOrder:true}),0)});
}

function serializeRows(selector, mapper){return $$(selector).map(mapper).filter(Boolean)}
async function openProcurementConfig(centerId,onSaved){
  if(!settingsCache)settingsCache=await api('/api/settings');const center=state.cache.costCenters.find(item=>item.id===centerId);if(!center)return toast('Selecciona un centro de costo','error');const config=configFor(centerId);const unitRows=config.units.map(unit=>`<div class="core-config-row" data-unit-row><input name="unitName" value="${esc(unit.name)}" placeholder="CAJA(12)"><input name="unitPack" type="number" min="0.001" step="0.001" value="${Number(unit.unitsPerFormat||1)}"><button class="btn small" type="button" data-remove-config>×</button></div>`).join('');const warehouseRows=config.warehouses.map((warehouse,index)=>`<div class="core-config-row warehouse" data-warehouse-row><input name="warehouseOrder" type="number" min="0" value="${Number(warehouse.sortOrder??index)}"><input name="warehouseName" value="${esc(warehouse.name)}" placeholder="Bodega licores"><input name="warehouseCategories" value="${esc((warehouse.categories||[]).join(', '))}" placeholder="Gin, Pisco, Ron"><button class="btn small" type="button" data-remove-config>×</button></div>`).join('');
  openModal({eyebrow:'CONFIGURACIÓN OPERATIVA',title:`Bodegas y unidades · ${center.name}`,subtitle:'Esta configuración aplica solo a este centro de costo. No mezcla unidades de Barra con Cocina.',size:'large',body:`<div class="core-config"><section class="security-note"><strong>Criterio de orden</strong><p>Primero se ordenan las bodegas según el número indicado. Dentro de cada bodega, las categorías se ordenan alfabéticamente. Los productos quedan alfabéticos dentro de su categoría.</p></section><div class="core-config-columns"><article class="core-config-center"><h3>Unidades de compra del centro</h3><p class="core-config-help">Ej: UNIDAD=1, CAJA(6)=6, CAJA(12)=12, DISPLAY(24)=24. Solo aparecerán en ${esc(center.name)}.</p><div id="unitConfigRows" class="core-config-list">${unitRows}</div><button class="btn wide-action" type="button" id="addUnitRow">Agregar unidad</button></article><article class="core-config-center"><h3>Bodegas y categorías</h3><p class="core-config-help">Ej: Bodega licores: Gin, Pisco, Ron. Bodega bebidas: Bebidas sin alcohol, Cervezas.</p><div id="warehouseConfigRows" class="core-config-list">${warehouseRows}</div><button class="btn wide-action" type="button" id="addWarehouseRow">Agregar bodega</button></article></div></div>`,submitLabel:'Guardar configuración del centro',onSubmit:async()=>{const units=serializeRows('[data-unit-row]',row=>{const name=row.querySelector('[name=unitName]').value.trim().toUpperCase();if(!name)return null;return{id:slug(name),name,unitsPerFormat:Number(row.querySelector('[name=unitPack]').value||1),active:true}});const warehouses=serializeRows('[data-warehouse-row]',row=>{const name=row.querySelector('[name=warehouseName]').value.trim();if(!name)return null;return{id:slug(name),name,sortOrder:Number(row.querySelector('[name=warehouseOrder]').value||0),categories:row.querySelector('[name=warehouseCategories]').value.split(',').map(item=>item.trim()).filter(Boolean),active:true}});if(!units.length)throw new Error('Crea al menos una unidad de compra');if(!warehouses.length)throw new Error('Crea al menos una bodega');const current=settingsCache.organization.procurement||{costCenters:{}};const procurement={costCenters:{...(current.costCenters||{}),[centerId]:{units,warehouses}}};settingsCache=await api('/api/settings',{method:'PATCH',json:{procurement}});toast('Bodegas y unidades guardadas para este centro');if(onSaved)await onSaved();}});
  $('#addUnitRow').onclick=()=>$('#unitConfigRows').insertAdjacentHTML('beforeend','<div class="core-config-row" data-unit-row><input name="unitName" placeholder="CAJA(12)"><input name="unitPack" type="number" min="0.001" step="0.001" value="1"><button class="btn small" type="button" data-remove-config>×</button></div>');
  $('#addWarehouseRow').onclick=()=>$('#warehouseConfigRows').insertAdjacentHTML('beforeend','<div class="core-config-row warehouse" data-warehouse-row><input name="warehouseOrder" type="number" min="0" value="1"><input name="warehouseName" placeholder="Bodega bebidas"><input name="warehouseCategories" placeholder="Bebidas sin alcohol, Cervezas"><button class="btn small" type="button" data-remove-config>×</button></div>');
  $('#modalBody').onclick=event=>{const button=event.target.closest('[data-remove-config]');if(button)button.closest('[data-unit-row],[data-warehouse-row]')?.remove()};
}

function intercept(event){
  const target=event.target.closest('button,[data-action]');if(!target)return;const isOrder=target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders'].includes(state.view));
  if(!isOrder)return;event.preventDefault();event.stopImmediatePropagation();openMasterOrder().catch(error=>toast(error.message,'error'));
}

export function initializeOrderCore(){
  if(initialized)return;initialized=true;injectStyles();document.addEventListener('click',intercept,true);
}
