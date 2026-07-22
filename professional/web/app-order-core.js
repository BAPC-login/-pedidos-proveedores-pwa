import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openOrderDetail} from './app-order-detail.js';

let initialized=false;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

function injectStyles(){
  if($('#orderCoreStyles'))return;
  const style=document.createElement('style');
  style.id='orderCoreStyles';
  style.textContent=`
    .core-order-intro{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:14px}
    .core-order-step{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}
    .core-order-step b{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:var(--primary);color:#fff}
    .core-order-step span{font-size:10px;font-weight:800;line-height:1.35}
    .core-master{display:grid;gap:12px}
    .core-master-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid var(--line);border-radius:15px;background:var(--soft)}
    .core-summary{display:flex;align-items:baseline;justify-content:flex-end;gap:6px;white-space:nowrap}
    .core-summary strong{font-size:24px}.core-summary span{color:var(--muted);font-size:9px}
    .core-supplier-summary{display:flex;flex-wrap:wrap;gap:6px}.core-supplier-summary span{padding:6px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary);font-size:9px;font-weight:850}
    .core-list{display:grid;gap:12px;overflow:visible}
    .core-category{display:grid;gap:7px}.core-category-title{position:sticky;top:-16px;z-index:2;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--card) 96%,var(--soft));font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
    .core-product-row{display:grid;grid-template-columns:minmax(180px,1.25fr) minmax(150px,.8fr) 112px 86px 92px;gap:8px;align-items:end;padding:11px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
    .core-product-copy{align-self:center;min-width:0}.core-product-copy strong,.core-product-copy small{display:block}.core-product-copy strong{font-size:11px;overflow-wrap:anywhere}.core-product-copy small{margin-top:4px;color:var(--muted);font-size:9px}
    .core-mini-field{display:grid;gap:5px}.core-mini-field>span{color:var(--muted);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .core-mini-field select,.core-mini-field input{width:100%;min-height:42px;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:0 9px;color:var(--text)}
    .core-quantity input{font-size:19px;font-weight:900;text-align:right}
    .core-product-row.selected{border-color:color-mix(in srgb,var(--primary) 58%,var(--line));background:color-mix(in srgb,var(--primary) 5%,var(--card))}
    .core-empty{padding:36px 14px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
    .core-batch-results{display:grid;gap:10px}.core-batch-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:14px}.core-batch-card strong,.core-batch-card small{display:block}.core-batch-card small{margin-top:4px;color:var(--muted)}
    @media(max-width:760px){.core-order-intro{grid-template-columns:1fr}.core-master-toolbar{grid-template-columns:1fr}.core-summary{justify-content:flex-start}.core-product-row{grid-template-columns:minmax(0,1fr) 94px 82px}.core-product-copy{grid-column:1/-1}.core-supplier-field{grid-column:1/-1}.core-category-title{top:-16px}.core-batch-card{grid-template-columns:1fr}.core-batch-card .row-actions{display:grid;grid-template-columns:1fr 1fr}}
  `;
  document.head.append(style);
}

async function loadSources(){
  const [locations,centers,suppliers,products]=await Promise.all([
    api('/api/locations'),
    api('/api/cost-centers'),
    api('/api/suppliers'),
    api('/api/products')
  ]);
  state.cache.locations=locations.locations||[];
  state.cache.costCenters=centers.costCenters||[];
  state.cache.suppliers=suppliers.suppliers||[];
  state.cache.products=products.products||[];
}

function unitOptions(selected){
  const values=[selected,'UNIDAD','CAJA','DISPLAY','PACK','KG','LITRO'].filter(Boolean).map(value=>String(value).toUpperCase());
  return [...new Set(values)].map(value=>`<option value="${esc(value)}" ${value===String(selected||'').toUpperCase()?'selected':''}>${esc(value)}</option>`).join('');
}

function relationFor(product,selection){
  return (product.suppliers||[]).find(relation=>relation.id===selection?.relationId)||(product.suppliers||[])[0]||null;
}

function supplierOptions(product,selectedId){
  return (product.suppliers||[]).map(relation=>`<option value="${esc(relation.id)}" ${relation.id===selectedId?'selected':''}>${esc(relation.supplierName)}</option>`).join('');
}

function groupByCategory(products){
  const groups=new Map();
  for(const product of products){
    const category=product.categoryName||'Sin categoría';
    if(!groups.has(category))groups.set(category,[]);
    groups.get(category).push(product);
  }
  return [...groups.entries()];
}

async function openMasterOrder(){
  await loadSources();
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  if(!state.cache.products.length)return toast('No hay productos disponibles en la lista maestra','error');

  const selections=new Map();
  let activeProducts=[];

  openModal({
    eyebrow:'ETAPA 1 · EMISIÓN',
    title:'Lista maestra de pedido',
    subtitle:'Completa una sola lista. El sistema separa automáticamente por proveedor, asigna un folio y prepara un PDF para cada pedido.',
    size:'order',
    body:`<div class="core-order-intro"><div class="core-order-step"><b>1</b><span>Escoge local y centro de costo</span></div><div class="core-order-step"><b>2</b><span>Define formato y cantidad en cada producto</span></div><div class="core-order-step"><b>3</b><span>Separa por proveedor y asigna folios</span></div></div>
      <div class="core-master">
        <section class="order-context">
          <label class="field"><span>Local</span><select id="coreLocation" name="locationId" required>${state.cache.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Centro de costo</span><select id="coreCenter" name="costCenterId" required></select></label>
          <label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label>
          <label class="check-card"><input name="saveAsDraft" type="checkbox"><span><strong>Guardar como borrador</strong><small>Desmarcado: se emite como Solicitado</small></span></label>
        </section>
        <section class="core-master-toolbar">
          <label class="field"><span>Buscar en toda la lista</span><input id="coreSearch" placeholder="Producto, categoría o proveedor" enterkeyhint="search"></label>
          <div class="core-summary"><strong id="coreSelectedCount">0</strong><span>productos · <b id="coreSupplierCount">0</b> proveedores</span></div>
        </section>
        <div id="coreSupplierSummary" class="core-supplier-summary"><span>Los proveedores se detectarán automáticamente</span></div>
        <div id="coreProducts" class="core-list"></div>
        <label class="field"><span>Notas generales</span><textarea name="notes" placeholder="Se incluirán en cada pedido separado por proveedor"></textarea></label>
      </div>`,
    submitLabel:'Emitir y separar por proveedor',
    onSubmit:async form=>{
      saveVisible();
      const items=[];
      for(const product of activeProducts){
        const selection=selections.get(product.id);
        if(!selection||Number(selection.quantity)<=0)continue;
        items.push({
          supplierProductId:selection.relationId,
          productId:product.id,
          quantity:Number(selection.quantity),
          orderUnit:selection.orderUnit,
          unitsPerOrderUnit:Number(selection.pack||1),
          persistFormat:true
        });
      }
      if(!items.length)throw new Error('Ingresa una cantidad en al menos un producto');
      const response=await api('/api/order-batches/v2',{
        method:'POST',
        headers:{'Idempotency-Key':crypto.randomUUID()},
        json:{
          locationId:form.get('locationId'),
          costCenterId:form.get('costCenterId'),
          deliveryDate:form.get('deliveryDate'),
          notes:form.get('notes'),
          saveAsDraft:form.get('saveAsDraft')==='on',
          items
        }
      });
      state.cache.orders=[];
      toast(`${response.batch.supplierCount} pedidos creados desde una sola lista`);
      await navigate('orders');
      setTimeout(()=>showBatchResults(response.batch),80);
    }
  });

  function initializeProducts(){
    const centerId=$('#coreCenter').value;
    activeProducts=state.cache.products
      .filter(product=>product.active&&(product.costCenters||[]).some(center=>center.id===centerId)&&(product.suppliers||[]).length)
      .sort((a,b)=>(a.categoryName||'').localeCompare(b.categoryName||'','es')||a.name.localeCompare(b.name,'es'));
    selections.clear();
    for(const product of activeProducts){
      const relation=product.suppliers[0];
      selections.set(product.id,{quantity:'',relationId:relation.id,orderUnit:String(relation.orderUnit||'UNIDAD').toUpperCase(),pack:Number(relation.unitsPerOrderUnit||1)});
    }
    render();
  }

  function saveVisible(){
    $$('#coreProducts [data-core-product]').forEach(row=>{
      const selection=selections.get(row.dataset.coreProduct);
      if(!selection)return;
      selection.quantity=row.querySelector('[data-core-quantity]').value;
      selection.relationId=row.querySelector('[data-core-relation]').value;
      selection.orderUnit=row.querySelector('[data-core-unit]').value;
      selection.pack=Number(row.querySelector('[data-core-pack]').value||1);
    });
  }

  function updateSummary(){
    saveVisible();
    const selected=activeProducts.filter(product=>Number(selections.get(product.id)?.quantity)>0);
    const groups=new Map();
    for(const product of selected){
      const relation=relationFor(product,selections.get(product.id));
      if(!relation)continue;
      if(!groups.has(relation.supplierId))groups.set(relation.supplierId,{name:relation.supplierName,count:0});
      groups.get(relation.supplierId).count++;
    }
    $('#coreSelectedCount').textContent=selected.length;
    $('#coreSupplierCount').textContent=groups.size;
    $('#coreSupplierSummary').innerHTML=[...groups.values()].map(group=>`<span>${esc(group.name)} · ${group.count}</span>`).join('')||'<span>Los proveedores se detectarán automáticamente</span>';
    $$('#coreProducts [data-core-product]').forEach(row=>row.classList.toggle('selected',Number(selections.get(row.dataset.coreProduct)?.quantity)>0));
  }

  function bindRows(){
    const quantityFields=$$('[data-core-quantity]');
    $$('#coreProducts [data-core-product]').forEach(row=>{
      const product=activeProducts.find(item=>item.id===row.dataset.coreProduct);
      const quantity=row.querySelector('[data-core-quantity]');
      const relationSelect=row.querySelector('[data-core-relation]');
      const unit=row.querySelector('[data-core-unit]');
      const pack=row.querySelector('[data-core-pack]');
      quantity.onfocus=()=>quantity.select();
      quantity.oninput=updateSummary;
      quantity.onkeydown=event=>{
        if(event.key!=='Enter')return;
        event.preventDefault();
        saveVisible();
        const next=quantityFields[quantityFields.indexOf(quantity)+1];
        if(next){next.focus();next.select()}else $('#modalSubmit')?.focus();
      };
      relationSelect.onchange=()=>{
        const relation=(product.suppliers||[]).find(item=>item.id===relationSelect.value);
        const selection=selections.get(product.id);
        selection.relationId=relationSelect.value;
        selection.orderUnit=String(relation?.orderUnit||'UNIDAD').toUpperCase();
        selection.pack=Number(relation?.unitsPerOrderUnit||1);
        unit.innerHTML=unitOptions(selection.orderUnit);
        unit.value=selection.orderUnit;
        pack.value=selection.pack;
        updateSummary();
      };
      unit.onchange=updateSummary;
      pack.oninput=updateSummary;
    });
  }

  function render(){
    saveVisible();
    const query=$('#coreSearch').value.trim().toLowerCase();
    const visible=activeProducts.filter(product=>{
      const relation=relationFor(product,selections.get(product.id));
      return !query||`${product.name} ${product.categoryName||''} ${relation?.supplierName||''}`.toLowerCase().includes(query);
    });
    const groups=groupByCategory(visible);
    $('#coreProducts').innerHTML=groups.length?groups.map(([category,products])=>`<section class="core-category"><div class="core-category-title">${esc(category)} · ${products.length}</div>${products.map(product=>{
      const selection=selections.get(product.id);
      const relation=relationFor(product,selection);
      return `<article class="core-product-row ${Number(selection.quantity)>0?'selected':''}" data-core-product="${esc(product.id)}">
        <div class="core-product-copy"><strong>${esc(product.name)}</strong><small>${esc(product.brand||product.variant||product.baseUnit||'Producto de catálogo')}</small></div>
        <label class="core-mini-field core-supplier-field"><span>Proveedor</span><select data-core-relation>${supplierOptions(product,selection.relationId)}</select></label>
        <label class="core-mini-field"><span>Formato</span><select data-core-unit>${unitOptions(selection.orderUnit)}</select></label>
        <label class="core-mini-field"><span>Unid./formato</span><input data-core-pack type="number" min="0.001" step="0.001" value="${Number(selection.pack||1)}" inputmode="decimal"></label>
        <label class="core-mini-field core-quantity"><span>Cantidad</span><input data-core-quantity type="number" min="0" step="0.001" value="${esc(selection.quantity)}" placeholder="0" inputmode="decimal" enterkeyhint="next"></label>
      </article>`;
    }).join('')}</section>`).join(''):'<div class="core-empty">No hay productos para este filtro o centro de costo.</div>';
    bindRows();
    updateSummary();
  }

  function refreshCenters(){
    const centers=state.cache.costCenters.filter(center=>center.locationId===$('#coreLocation').value&&center.active!==false);
    $('#coreCenter').innerHTML=centers.map(center=>`<option value="${esc(center.id)}">${esc(center.name)} · ${center.productCount} productos</option>`).join('');
    initializeProducts();
  }

  $('#coreLocation').onchange=refreshCenters;
  $('#coreCenter').onchange=initializeProducts;
  $('#coreSearch').oninput=render;
  refreshCenters();
}

function showBatchResults(batch){
  openModal({
    eyebrow:'ETAPA 1 COMPLETADA',
    title:`${batch.supplierCount} pedidos creados`,
    subtitle:'Cada proveedor tiene un folio independiente. Los PDF se preparan en segundo plano para evitar perder el pedido por una espera o corte de conexión.',
    size:'large',
    hideSubmit:true,
    body:`<div class="core-batch-results">${batch.orders.map(order=>`<article class="core-batch-card"><div><strong>${esc(order.supplierName)} · ${esc(order.folio)}</strong><small>${Number(order.itemCount||0)} productos · ${esc(order.status==='draft'?'Borrador':'Solicitado')}</small></div><div class="row-actions"><button class="btn" data-core-order="${esc(order.id)}">Abrir pedido</button><button class="btn primary" data-core-invoice="${esc(order.id)}">Adjuntar factura</button></div></article>`).join('')}</div>`
  });
  $$('[data-core-order]').forEach(button=>button.onclick=()=>{closeModal('open-order');setTimeout(()=>openOrderDetail(button.dataset.coreOrder),0)});
  $$('[data-core-invoice]').forEach(button=>button.onclick=async()=>{const orderId=button.dataset.coreInvoice;closeModal('invoice');const {openInvoiceAnalysis}=await import('./app-invoices.js');setTimeout(()=>openInvoiceAnalysis({orderId,returnToOrder:true}),0)});
}

function intercept(event){
  const target=event.target.closest('button,[data-action]');
  if(!target)return;
  const isOrder=target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders'].includes(state.view));
  if(!isOrder)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openMasterOrder().catch(error=>toast(error.message,'error'));
}

export function initializeOrderCore(){
  if(initialized)return;
  initialized=true;
  injectStyles();
  document.addEventListener('click',intercept,true);
}
