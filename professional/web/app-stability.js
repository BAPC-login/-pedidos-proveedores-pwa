import {$,$$,esc,state,api,toast,queueMutation,roleNames,initials} from './app-core.js';
import {openModal} from './app-modal.js';
import {openOrderDetail} from './app-order-detail.js';

let initialized=false;
let enhanceTimer=0;

const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function loadOperationalSources(){
  const [locations,centers,suppliers,products]=await Promise.all([
    api('/api/locations'),api('/api/cost-centers'),api('/api/suppliers'),api('/api/products')
  ]);
  state.cache.locations=locations.locations||[];
  state.cache.costCenters=centers.costCenters||[];
  state.cache.suppliers=suppliers.suppliers||[];
  state.cache.products=products.products||[];
}

function productRelation(product,supplierId){
  return (product.suppliers||[]).find(relation=>relation.supplierId===supplierId);
}

function productRow(product,relation,quantity){
  const unit=relation.orderUnit||'UNIDAD';
  const pack=Number(relation.unitsPerOrderUnit||1);
  return `<article class="order-product"><div class="order-product-copy"><strong>${esc(product.name)}</strong><small>${esc(product.categoryName||'Sin categoría')} · ${esc(unit)}${pack>1?` · ${pack} unidades`:''}</small></div><label class="order-quantity"><span>Cantidad</span><input type="number" min="0" step="0.001" inputmode="decimal" value="${quantity||0}" data-product-id="${esc(product.id)}" data-supplier-product-id="${esc(relation.id)}" data-order-unit="${esc(unit)}" data-units-per-order-unit="${pack}" data-price="${Number(relation.lastGrossUnitPrice||0)}"></label></article>`;
}

async function openStableOrder(){
  await loadOperationalSources();
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  if(!state.cache.suppliers.length)return toast('Primero debes crear un proveedor','error');
  const quantities=new Map();
  openModal({
    eyebrow:'NUEVO PEDIDO',title:'Crear pedido independiente',
    subtitle:'Un folio y un PDF por proveedor. Las cantidades y formatos se toman desde el catálogo sin mezclar proveedores.',size:'order',
    body:`<div class="order-builder"><section class="order-context">
      <label class="field"><span>Local</span><select name="locationId" id="stableOrderLocation" required>${state.cache.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Centro de costo</span><select name="costCenterId" id="stableOrderCenter" required></select></label>
      <label class="field"><span>Proveedor</span><select name="supplierId" id="stableOrderSupplier" required>${state.cache.suppliers.map(supplier=>`<option value="${esc(supplier.id)}">${esc(supplier.name)} · ${supplier.productCount||0} productos</option>`).join('')}</select></label>
      <label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label>
    </section><section class="order-catalog"><div class="order-catalog-head"><label class="field order-search"><span>Buscar dentro del proveedor</span><input id="stableOrderSearch" placeholder="Producto o categoría"></label><div class="order-selection"><strong id="stableSelectedCount">0</strong><span>productos seleccionados</span></div></div><div id="stableOrderProducts" class="order-product-list"></div></section><label class="field"><span>Notas para el proveedor</span><textarea name="notes" placeholder="Observaciones opcionales"></textarea></label></div>`,
    submitLabel:'Crear pedido y abrir documentos',
    onSubmit:async form=>{
      saveVisible();
      const supplierId=String(form.get('supplierId'));
      const centerId=String(form.get('costCenterId'));
      const items=[];
      for(const [productId,quantity] of quantities){
        if(Number(quantity)<=0)continue;
        const product=state.cache.products.find(entry=>entry.id===productId);
        if(!product||(product.costCenters||[]).every(center=>center.id!==centerId))continue;
        const relation=productRelation(product,supplierId);if(!relation)continue;
        items.push({supplierProductId:relation.id,productId:product.id,description:product.name,quantity:Number(quantity),orderUnit:relation.orderUnit||'UNIDAD',unitsPerOrderUnit:Number(relation.unitsPerOrderUnit||1),expectedGrossUnitPrice:Number(relation.lastGrossUnitPrice||0)});
      }
      if(!items.length)throw new Error('Ingresa cantidad en al menos un producto');
      const json={locationId:form.get('locationId'),costCenterId:centerId,supplierId,deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),items};
      let created=null;
      if(!navigator.onLine){await queueMutation('/api/orders','POST',json);toast('Pedido guardado para sincronizar')}
      else{created=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});toast('Pedido independiente y PDF creados')}
      state.cache.orders=[];await navigate('orders');
      if(created?.order?.id)setTimeout(()=>openOrderDetail(created.order.id),80);
    }
  });

  function saveVisible(){
    $$('#stableOrderProducts input[data-product-id]').forEach(input=>quantities.set(input.dataset.productId,Number(input.value||0)));
  }
  function updateCount(){
    saveVisible();
    $('#stableSelectedCount').textContent=[...quantities.values()].filter(value=>Number(value)>0).length;
  }
  function eligible(){
    const supplierId=$('#stableOrderSupplier').value;
    const centerId=$('#stableOrderCenter').value;
    const query=$('#stableOrderSearch').value.trim().toLowerCase();
    return state.cache.products.map(product=>({product,relation:productRelation(product,supplierId)}))
      .filter(entry=>entry.relation&&(entry.product.costCenters||[]).some(center=>center.id===centerId))
      .filter(entry=>!query||`${entry.product.name} ${entry.product.categoryName||''}`.toLowerCase().includes(query))
      .sort((a,b)=>(a.product.categoryName||'').localeCompare(b.product.categoryName||'','es')||a.product.name.localeCompare(b.product.name,'es'));
  }
  function renderProducts(){
    saveVisible();
    const entries=eligible();
    $('#stableOrderProducts').innerHTML=entries.length?entries.map(entry=>productRow(entry.product,entry.relation,quantities.get(entry.product.id)||0)).join(''):'<div class="empty-state compact-empty"><h3>Sin productos vinculados</h3><p>Este proveedor no tiene productos para el centro seleccionado.</p></div>';
    $$('#stableOrderProducts input[data-product-id]').forEach(input=>input.oninput=updateCount);updateCount();
  }
  function refreshCenters(clear=true){
    if(clear)quantities.clear();
    const locationId=$('#stableOrderLocation').value;
    const centers=state.cache.costCenters.filter(center=>center.locationId===locationId);
    $('#stableOrderCenter').innerHTML=centers.map(center=>`<option value="${esc(center.id)}">${esc(center.name)}</option>`).join('');
    renderProducts();
  }
  $('#stableOrderLocation').onchange=()=>refreshCenters(true);
  $('#stableOrderCenter').onchange=()=>{quantities.clear();renderProducts()};
  $('#stableOrderSupplier').onchange=()=>{quantities.clear();renderProducts()};
  $('#stableOrderSearch').oninput=renderProducts;
  refreshCenters(false);
}

async function openStableUser(){
  const locations=(await api('/api/locations')).locations||[];
  if(!locations.length)return toast('Primero debes crear un local','error');
  const ownerOption=state.me?.user?.role==='owner'?'<option value="owner">Propietario</option>':'';
  openModal({eyebrow:'SEGURIDAD',title:'Nuevo usuario y perfil',subtitle:'Cada persona tendrá correo, contraseña, nombre, cargo y locales propios.',size:'large',body:`<div class="form-grid"><label class="field"><span>Nombre y apellido</span><input name="displayName" required autocomplete="name"></label><label class="field"><span>Cargo</span><input name="jobTitle" placeholder="Ej: Jefe de Barra"></label><label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label><label class="field"><span>Teléfono</span><input name="phone" type="tel"></label><label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label><label class="field"><span>Rol</span><select name="role"><option value="readonly">Solo lectura</option><option value="purchaser" selected>Compras</option><option value="receiver">Recepción</option><option value="approver">Aprobador</option><option value="finance">Finanzas</option><option value="admin">Administrador</option>${ownerOption}</select></label><div class="full"><span class="field-label">Locales permitidos</span><div class="check-grid">${locations.map(location=>`<label class="check-card"><input type="checkbox" name="locationScope" value="${esc(location.id)}" checked><span><strong>${esc(location.name)}</strong><small>Acceso operativo</small></span></label>`).join('')}</div></div></div>`,submitLabel:'Crear usuario',onSubmit:async form=>{
    const role=String(form.get('role'));const locationScope=role==='owner'?['*']:form.getAll('locationScope').map(String);if(!locationScope.length)throw new Error('Selecciona al menos un local');
    await api('/api/users',{method:'POST',json:{displayName:form.get('displayName'),email:form.get('email'),password:form.get('password'),profile:{jobTitle:form.get('jobTitle'),phone:form.get('phone'),signatureName:form.get('displayName')},role,locationScope}});
    state.cache.users=[];toast('Usuario y perfil creados');await navigate('team');
  }});
}

function enhanceTeam(){
  if(state.view!=='team'||!state.cache.users?.length)return;
  const rows=$$('#mainContent tbody tr');
  for(const row of rows){
    const email=row.querySelector('[data-label="Usuario"] small')?.textContent?.trim();
    const user=state.cache.users.find(entry=>entry.email===email);if(!user)continue;
    const userCell=row.querySelector('[data-label="Usuario"]');
    if(user.profile?.jobTitle&&!userCell.querySelector('.profile-title'))userCell.querySelector('strong')?.insertAdjacentHTML('afterend',`<span class="profile-title">${esc(user.profile.jobTitle)}</span>`);
    const actions=row.querySelector('[data-label="Acciones"] .row-actions');if(!actions)continue;
    if(!actions.querySelector('[data-user-profile]'))actions.insertAdjacentHTML('afterbegin',`<button class="btn small" data-user-profile="${esc(user.id)}">Perfil</button>`);
    if(user.role==='owner'){
      actions.querySelector('[data-toggle-user]')?.remove();
      if(user.id!==state.me.user.id)actions.querySelector('[data-reset-password]')?.remove();
      if(!actions.querySelector('.protected-owner'))actions.insertAdjacentHTML('beforeend','<span class="protected-owner">Propietario protegido</span>');
    }
  }
}

function enhanceSettings(){
  if(state.view!=='settings')return;
  const account=$('.account-summary');
  if(account){
    const paragraph=account.querySelector('p');if(paragraph&&state.me.user.profile?.jobTitle)paragraph.textContent=state.me.user.profile.jobTitle;
    const panel=account.closest('.panel');if(panel&&!panel.querySelector('[data-user-profile]'))account.insertAdjacentHTML('afterend',`<button class="btn wide-action" data-user-profile="${esc(state.me.user.id)}">Editar mi perfil</button>`);
  }
  if(!$('#mainContent [data-branding-settings]')){
    const sessions=[...$$('#mainContent h3')].find(node=>node.textContent.trim()==='Sesiones')?.closest('.panel');
    if(sessions)sessions.insertAdjacentHTML('beforebegin',`<section class="panel-grid admin-grid"><article class="panel"><div class="panel-head"><div><h3>Identidad visual y PDF</h3><small>Logo, empresa, local, paleta, posición y tamaño.</small></div></div><div class="branding-summary"><div class="palette-swatch"></div><p>Se aplica a la interfaz y a cada nuevo PDF independiente por proveedor.</p><button class="btn primary wide-action" data-branding-settings>Configurar empresa, local y documentos</button></div></article><article class="panel"><div class="panel-head"><div><h3>Perfil del emisor</h3><small>Nombre y cargo visibles en los informes.</small></div></div><div class="account-summary"><span class="user-avatar large-avatar">${esc(initials(state.me.user.displayName))}</span><div><strong>${esc(state.me.user.displayName)}</strong><p>${esc(state.me.user.profile?.jobTitle||'Cargo sin completar')}</p></div></div><button class="btn wide-action" data-user-profile="${esc(state.me.user.id)}">Completar mi perfil</button></article></section>`);
  }
  const sessionRows=$$('.session-row');
  for(const row of sessionRows){
    const name=row.querySelector('strong')?.textContent?.trim();const session=state.cache.sessions?.find(entry=>entry.displayName===name&&!entry.current&&!entry.revokedAt);if(session?.role==='owner'){
      row.querySelector('[data-revoke-session]')?.remove();const side=row.lastElementChild;if(side&&!side.querySelector('.protected-owner'))side.innerHTML='<span class="protected-owner">Propietario protegido</span>';
    }
  }
}

function enhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{enhanceTeam();enhanceSettings()},20)}

function intercept(event){
  const target=event.target.closest('button,[data-action]');if(!target)return;
  const isOrder=target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders'].includes(state.view));
  const isUser=target.dataset.action==='new-user'||(target.id==='primaryAction'&&state.view==='team');
  if(!isOrder&&!isUser)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(isOrder)openStableOrder().catch(error=>toast(error.message,'error'));
  else openStableUser().catch(error=>toast(error.message,'error'));
}

export function initializeStabilityPass(){
  if(initialized)return;initialized=true;
  document.addEventListener('click',intercept,true);
  new MutationObserver(enhance).observe($('#appShell')||document.body,{subtree:true,childList:true});
  enhance();
}
