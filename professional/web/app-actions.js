import {$,$$,esc,state,api,toast,setBusy,queueMutation,showApp,logoutLocal} from './app-core.js';
import {navigate} from './app-views.js';
import {openOrderDetail as openProfessionalOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';

const BOOTSTRAP_TOKEN='pedidos-pro-inicializacion';

function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit}){
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML='<button class="btn" value="cancel">Cancelar</button><button class="btn primary" type="button" id="modalSubmit">'+esc(submitLabel)+'</button>';
  const dialog=$('#modal');
  if(dialog.open)dialog.close();
  dialog.showModal();
  $('#modalSubmit').onclick=async()=>{
    const button=$('#modalSubmit');
    setBusy(button,true);
    try{
      await onSubmit(new FormData($('#modalFrame')));
      if(dialog.open)dialog.close();
    }catch(error){toast(error.message,'error')}
    finally{setBusy(button,false)}
  };
}

function resetWorkspaceCache(){
  state.cache={dashboard:null,orders:[],products:[],suppliers:[],categories:[],locations:[],users:[],audit:[],brands:[],invoices:[]};
}

function openBootstrap(){
  openModal({
    eyebrow:'PRIMERA INSTALACIÓN',title:'Crear tu espacio',subtitle:'La infraestructura ya está lista. Solo define tu cuenta propietaria.',
    body:`<div class="form-grid"><label class="field"><span>Empresa</span><input name="organizationName" value="Pedidos Pro" required></label><label class="field"><span>Local principal</span><input name="locationName" value="Principal" required></label><label class="field"><span>Tu nombre</span><input name="displayName" value="Benjamín Palma" required></label><label class="field"><span>Correo</span><input name="email" type="email" required placeholder="tu@correo.cl"></label><label class="field full"><span>Contraseña</span><input name="password" type="password" minlength="10" required placeholder="Mínimo 10 caracteres"></label></div>`,
    submitLabel:'Crear y entrar',
    onSubmit:async form=>{
      const response=await api('/api/bootstrap',{method:'POST',headers:{'X-Bootstrap-Token':BOOTSTRAP_TOKEN},json:Object.fromEntries(form)});
      state.token=response.token;localStorage.setItem('pp:token',state.token);state.me=await api('/api/me');showApp();await navigate('dashboard');toast('Plataforma creada');
    }
  });
}

function openSupplier(){
  openModal({eyebrow:'ABASTECIMIENTO',title:'Nuevo proveedor',body:`<div class="form-grid"><label class="field"><span>Nombre comercial</span><input name="name" required></label><label class="field"><span>RUT</span><input name="rut"></label><label class="field"><span>Contacto</span><input name="contactName"></label><label class="field"><span>Correo</span><input name="email" type="email"></label><label class="field"><span>Teléfono</span><input name="phone"></label><label class="field"><span>Días de entrega</span><input name="leadDays" type="number" min="0" value="0"></label><label class="field"><span>Pedido mínimo</span><input name="minimumOrder" type="number" min="0" value="0"></label><label class="field"><span>Condiciones de pago</span><input name="paymentTerms"></label></div>`,onSubmit:async form=>{await api('/api/suppliers',{method:'POST',json:Object.fromEntries(form)});toast('Proveedor creado');await navigate('suppliers')}});
}

function openProduct(){
  const categories=state.cache.categories||[];
  openModal({eyebrow:'CATÁLOGO',title:'Nuevo producto',body:`<div class="form-grid"><label class="field full"><span>Nombre</span><input name="name" required></label><label class="field"><span>Marca</span><input name="brand"></label><label class="field"><span>Variante</span><input name="variant"></label><label class="field"><span>Categoría</span><select name="categoryId"><option value="">Sin categoría</option>${categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label class="field"><span>Contenido</span><input name="contentValue" type="number" min="0"></label><label class="field"><span>Unidad contenido</span><select name="contentUnit"><option>ml</option><option>l</option><option>g</option><option>kg</option><option>unidad</option></select></label><label class="field"><span>Unidad inventario</span><input name="baseUnit" value="unidad"></label><label class="field full"><span>Código de barras</span><input name="barcode"></label></div>`,onSubmit:async form=>{await api('/api/products',{method:'POST',json:Object.fromEntries(form)});toast('Producto creado');await navigate('catalog')}});
}

async function openUser(){
  if(!state.cache.locations.length)state.cache.locations=(await api('/api/locations')).locations;
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  const locationOptions=state.cache.locations.map(location=>`<label class="field"><span><input type="checkbox" name="locationScope" value="${esc(location.id)}"> ${esc(location.name)}</span></label>`).join('');
  openModal({
    eyebrow:'SEGURIDAD',title:'Nuevo usuario',subtitle:'Asigna únicamente los locales que esta persona podrá consultar y operar.',
    body:`<div class="form-grid"><label class="field"><span>Nombre</span><input name="displayName" required></label><label class="field"><span>Correo</span><input name="email" type="email" required></label><label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required></label><label class="field"><span>Rol</span><select name="role"><option value="readonly">Solo lectura</option><option value="purchaser">Compras</option><option value="receiver">Recepción</option><option value="approver">Aprobador</option><option value="finance">Finanzas</option><option value="admin">Administrador</option></select></label><div class="full"><div class="panel-head"><h3>Locales permitidos</h3><small>Solo el owner puede verlos todos</small></div><div class="form-grid">${locationOptions}</div></div></div>`,
    onSubmit:async form=>{
      const locationScope=form.getAll('locationScope').map(String);
      if(!locationScope.length)throw new Error('Selecciona al menos un local');
      await api('/api/users',{method:'POST',json:{displayName:form.get('displayName'),email:form.get('email'),password:form.get('password'),role:form.get('role'),locationScope}});
      toast('Usuario creado');await navigate('team');
    }
  });
}

function openBrand(){
  openModal({
    eyebrow:'OWNER',title:'Nueva marca',subtitle:'La marca tendrá su propio catálogo, proveedores, pedidos, facturas, locales y usuarios.',
    body:`<div class="form-grid"><label class="field"><span>Nombre de la marca</span><input name="name" required></label><label class="field"><span>Identificador</span><input name="slug" placeholder="ej: madriguera"></label><label class="field"><span>Primer local</span><input name="locationName" value="Principal" required></label><label class="field"><span>Código del local</span><input name="locationCode" placeholder="MDR"></label></div>`,
    submitLabel:'Crear marca',
    onSubmit:async form=>{await api('/api/brands',{method:'POST',json:Object.fromEntries(form)});state.cache.brands=[];toast('Marca creada');await navigate('settings')}
  });
}

async function switchBrand(id){
  const response=await api(`/api/brands/${id}/switch`,{method:'POST',json:{}});
  state.token=response.token;localStorage.setItem('pp:token',state.token);resetWorkspaceCache();state.me=await api('/api/me');showApp();await navigate('dashboard');toast('Marca activa actualizada');
}

function openChangePassword(){
  openModal({eyebrow:'SEGURIDAD',title:'Cambiar contraseña',subtitle:'Al guardar se cerrarán todas tus sesiones, incluida esta.',body:`<div class="form-grid"><label class="field full"><span>Nueva contraseña</span><input name="password" type="password" minlength="10" autocomplete="new-password" required placeholder="Mínimo 10 caracteres"></label><label class="field full"><span>Repite la contraseña</span><input name="confirmation" type="password" minlength="10" autocomplete="new-password" required></label></div>`,submitLabel:'Cambiar contraseña',onSubmit:async form=>{const password=String(form.get('password')||''),confirmation=String(form.get('confirmation')||'');if(password!==confirmation)throw new Error('Las contraseñas no coinciden');await api(`/api/users/${state.me.user.id}/password`,{method:'POST',json:{password}});toast('Contraseña actualizada. Ingresa nuevamente.');setTimeout(()=>logoutLocal(),500)}});
}

async function ensureOrderSources(){
  if(!state.cache.locations.length)state.cache.locations=(await api('/api/locations')).locations;
  if(!state.cache.suppliers.length)state.cache.suppliers=(await api('/api/suppliers')).suppliers;
  if(!state.cache.products.length)state.cache.products=(await api('/api/products')).products;
}

async function openOrder(){
  await ensureOrderSources();
  if(!state.cache.locations.length||!state.cache.suppliers.length)return toast('Primero debes crear un local y un proveedor','error');
  openModal({eyebrow:'NUEVA ORDEN',title:'Crear pedido',subtitle:'Se guarda como borrador y cada revisión genera un PDF histórico.',body:`<div class="form-grid"><label class="field"><span>Local</span><select name="locationId">${state.cache.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><label class="field"><span>Proveedor</span><select name="supplierId">${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>Fecha de entrega</span><input name="deliveryDate" type="date"></label><label class="field full"><span>Notas</span><textarea name="notes"></textarea></label><div class="full"><div class="panel-head"><h3>Productos</h3><button class="btn small" type="button" id="addOrderLine">＋ Línea</button></div><div class="order-lines" id="orderLines"></div></div></div>`,submitLabel:'Crear borrador',onSubmit:async form=>{const items=$$('#orderLines .order-line').map(row=>({productId:row.querySelector('[name=productId]').value,description:row.querySelector('[name=productId]').selectedOptions[0]?.textContent||'Producto',quantity:Number(row.querySelector('[name=quantity]').value),orderUnit:row.querySelector('[name=orderUnit]').value,unitsPerOrderUnit:Number(row.querySelector('[name=units]').value),expectedGrossUnitPrice:Number(row.querySelector('[name=price]').value)})).filter(item=>item.productId&&item.quantity>0);const json={locationId:form.get('locationId'),supplierId:form.get('supplierId'),deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),items};if(!navigator.onLine){await queueMutation('/api/orders','POST',json);toast('Pedido guardado para sincronizar');return navigate('orders')}await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});toast('Pedido y PDF creados');await navigate('orders')}});
  const add=()=>{const row=document.createElement('div');row.className='order-line';row.innerHTML=`<label class="field line-product"><span>Producto</span><select name="productId"><option value="">Seleccionar</option>${state.cache.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label class="field"><span>Cantidad</span><input name="quantity" type="number" step="0.001" min="0" value="1"></label><label class="field line-unit"><span>Unidad</span><input name="orderUnit" value="unidad"></label><label class="field"><span>Unid./pack</span><input name="units" type="number" step="0.001" value="1"></label><label class="field line-price"><span>Precio unit.</span><input name="price" type="number" min="0" value="0"></label><button class="remove-line" type="button">×</button>`;row.querySelector('.remove-line').onclick=()=>row.remove();$('#orderLines').append(row)};$('#addOrderLine').onclick=add;add();
}

async function linkSupplier(productId){
  if(!state.cache.suppliers.length)state.cache.suppliers=(await api('/api/suppliers')).suppliers;
  openModal({eyebrow:'PRESENTACIÓN DE COMPRA',title:'Vincular proveedor',body:`<div class="form-grid"><label class="field"><span>Proveedor</span><select name="supplierId">${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>SKU proveedor</span><input name="supplierSku"></label><label class="field full"><span>Nombre usado por proveedor</span><input name="supplierProductName"></label><label class="field"><span>Unidad de compra</span><input name="orderUnit" value="caja"></label><label class="field"><span>Unidades por compra</span><input name="unitsPerOrderUnit" type="number" step="0.001" value="1"></label><label class="field"><span>Mínimo</span><input name="minimumQuantity" type="number" step="0.001" value="0"></label><label class="field"><span>Múltiplo</span><input name="quantityMultiple" type="number" step="0.001" value="1"></label></div>`,onSubmit:async form=>{await api(`/api/products/${productId}/suppliers`,{method:'POST',json:Object.fromEntries(form)});toast('Proveedor vinculado');await navigate('catalog')}});
}

function bindDynamic(){
  $$('[data-view-link]').forEach(node=>node.onclick=()=>navigate(node.dataset.viewLink));
  $$('[data-action]').forEach(node=>node.onclick=()=>handleAction(node.dataset.action));
  $$('[data-order]').forEach(node=>node.onclick=()=>openProfessionalOrderDetail(node.dataset.order));
  $$('[data-link-supplier]').forEach(node=>node.onclick=()=>linkSupplier(node.dataset.linkSupplier));
  $$('[data-switch-brand]').forEach(node=>node.onclick=()=>switchBrand(node.dataset.switchBrand));
  $$('[data-toggle-user]').forEach(node=>node.onclick=async()=>{const active=node.dataset.active==='1';const user=state.cache.users.find(item=>item.id===node.dataset.toggleUser);await api(`/api/users/${node.dataset.toggleUser}`,{method:'PATCH',json:{active:!active,role:user?.role,locationScope:user?.locationScope||[]}});toast(active?'Usuario revocado':'Usuario reactivado');await navigate('team')});
  $$('[data-revoke-session]').forEach(node=>node.onclick=async()=>{await api(`/api/sessions/${node.dataset.revokeSession}/revoke`,{method:'POST',json:{}});toast('Sesión revocada');await navigate('settings')});
  if(state.view==='settings'&&!$('#changePasswordButton')){const target=$('.panel-grid .panel');if(target){const button=document.createElement('button');button.id='changePasswordButton';button.type='button';button.className='btn primary';button.style.marginTop='14px';button.textContent='Cambiar contraseña';button.onclick=openChangePassword;target.append(button)}}
}

function handleAction(action){
  if(action==='new-order')return openOrder();
  if(action==='new-supplier')return openSupplier();
  if(action==='new-product')return openProduct();
  if(action==='new-user')return openUser();
  if(action==='new-brand')return openBrand();
  if(action==='analyze-invoice')return openInvoiceAnalysis();
  if(action==='change-password')return openChangePassword();
}

export {openBootstrap,openOrder,handleAction,bindDynamic};
