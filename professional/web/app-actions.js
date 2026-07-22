import {$,$$,esc,state,api,toast,setBusy,queueMutation,showApp,logoutLocal,roleNames,isAdmin} from './app-core.js';
import {navigate} from './app-views.js';
import {openOrderDetail as openProfessionalOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';

const BOOTSTRAP_TOKEN='pedidos-pro-inicializacion';

function closeModal(reason='cancel'){
  const dialog=$('#modal');
  if(dialog?.open)dialog.close(reason);
}

function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit,size='medium',hideSubmit=false}){
  const dialog=$('#modal');
  const frame=$('#modalFrame');
  frame.noValidate=true;
  frame.dataset.size=size;
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML=`
    <button class="btn" type="button" data-modal-close>Cancelar</button>
    ${hideSubmit?'':`<button class="btn primary" type="button" id="modalSubmit">${esc(submitLabel)}</button>`}
  `;
  if(dialog.open)dialog.close('replace');
  dialog.showModal();

  $$('[data-modal-close]').forEach(button=>button.onclick=()=>closeModal('cancel'));
  $('#modalClose').onclick=()=>closeModal('cancel');

  dialog.oncancel=event=>{event.preventDefault();closeModal('cancel')};
  dialog.onclick=event=>{if(event.target===dialog)closeModal('backdrop')};

  if(!hideSubmit){
    $('#modalSubmit').onclick=async()=>{
      if(!frame.reportValidity())return;
      const button=$('#modalSubmit');
      setBusy(button,true,'Guardando…');
      try{
        await onSubmit(new FormData(frame),frame);
        closeModal('saved');
      }catch(error){
        toast(error.message,'error');
      }finally{
        setBusy(button,false);
      }
    };
  }
  return dialog;
}

function resetWorkspaceCache(){
  state.cache={dashboard:null,orders:[],products:[],suppliers:[],categories:[],locations:[],costCenters:[],users:[],audit:[],brands:[],invoices:[],sessions:[]};
}

function centerChecks(selected=[]){
  return (state.cache.costCenters||[]).map(center=>`
    <label class="check-card">
      <input type="checkbox" name="costCenterIds" value="${esc(center.id)}"
        ${selected.includes(center.id)||(!selected.length&&center.code==='BARRA')?'checked':''}>
      <span><strong>${esc(center.name)}</strong><small>${esc(center.locationName)}</small></span>
    </label>`).join('');
}

async function ensureCatalogSources(){
  const requests=[];
  if(!state.cache.categories.length)requests.push(api('/api/categories').then(r=>state.cache.categories=r.categories));
  if(!state.cache.costCenters.length)requests.push(api('/api/cost-centers').then(r=>state.cache.costCenters=r.costCenters));
  if(!state.cache.suppliers.length)requests.push(api('/api/suppliers').then(r=>state.cache.suppliers=r.suppliers));
  if(!state.cache.locations.length)requests.push(api('/api/locations').then(r=>state.cache.locations=r.locations));
  await Promise.all(requests);
}

function openBootstrap(){
  openModal({
    eyebrow:'PRIMERA INSTALACIÓN',
    title:'Crear tu espacio',
    subtitle:'Define la cuenta propietaria y el primer local.',
    body:`<div class="form-grid">
      <label class="field"><span>Marca</span><input name="organizationName" value="Madriguera" required></label>
      <label class="field"><span>Local principal</span><input name="locationName" value="Madriguera Clubhaus" required></label>
      <label class="field"><span>Tu nombre</span><input name="displayName" value="Benjamín Palma" required></label>
      <label class="field"><span>Correo</span><input name="email" type="email" required></label>
      <label class="field full"><span>Contraseña</span><input name="password" type="password" minlength="10" required></label>
    </div>`,
    submitLabel:'Crear y entrar',
    onSubmit:async form=>{
      const response=await api('/api/bootstrap',{method:'POST',headers:{'X-Bootstrap-Token':BOOTSTRAP_TOKEN},json:Object.fromEntries(form)});
      state.token=response.token;
      localStorage.setItem('pp:token',state.token);
      state.me=await api('/api/me');
      showApp();
      await navigate('dashboard');
    }
  });
}

function openSupplier(){
  openModal({
    eyebrow:'ABASTECIMIENTO',
    title:'Nuevo proveedor',
    subtitle:'Los datos de contacto y condiciones pueden completarse después.',
    body:`<div class="form-grid">
      <label class="field full"><span>Nombre comercial</span><input name="name" required autocomplete="organization"></label>
      <label class="field"><span>RUT</span><input name="rut" inputmode="text" placeholder="76.123.456-7"></label>
      <label class="field"><span>Contacto</span><input name="contactName" autocomplete="name"></label>
      <label class="field"><span>Correo</span><input name="email" type="email" autocomplete="email"></label>
      <label class="field"><span>Teléfono</span><input name="phone" type="tel" autocomplete="tel"></label>
      <label class="field"><span>Plazo de entrega</span><div class="input-suffix"><input name="leadDays" type="number" min="0" value="0" inputmode="numeric"><span>días</span></div></label>
      <label class="field"><span>Pedido mínimo</span><input name="minimumOrder" type="number" min="0" value="0" inputmode="numeric"></label>
      <label class="field full"><span>Condiciones de pago</span><input name="paymentTerms" placeholder="Ej: 30 días"></label>
    </div>`,
    submitLabel:'Crear proveedor',
    onSubmit:async form=>{
      await api('/api/suppliers',{method:'POST',json:Object.fromEntries(form)});
      state.cache.suppliers=[];
      toast('Proveedor creado');
      await navigate('suppliers');
    }
  });
}

async function openProduct(){
  await ensureCatalogSources();
  if(!state.cache.suppliers.length){
    toast('Primero crea al menos un proveedor','error');
    return openSupplier();
  }
  openModal({
    eyebrow:'CATÁLOGO',
    title:'Nuevo producto',
    subtitle:'Configura el formato real de compra y los centros donde se utilizará.',
    size:'large',
    body:`<div class="form-grid">
      <label class="field full"><span>Nombre del producto</span><input name="name" required placeholder="Ej: PISCO MISTRAL 35"></label>
      <label class="field"><span>Categoría</span><select name="categoryId">
        <option value="">Sin categoría</option>
        ${state.cache.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Proveedor principal</span><select name="supplierId" required>
        <option value="">Seleccionar proveedor</option>
        ${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Formato de pedido</span><select name="orderUnit" id="productOrderUnit">
        <option value="UNIDAD">Unidad</option>
        <option value="CAJA">Caja</option>
        <option value="DISPLAY">Display</option>
        <option value="KG">Kilogramo</option>
      </select></label>
      <label class="field"><span>Unidades por formato</span><input name="unitsPerOrderUnit" type="number" min="0.001" step="0.001" value="1" inputmode="decimal"></label>
      <label class="field"><span>Marca (opcional)</span><input name="brand"></label>
      <label class="field"><span>Variante/contenido</span><input name="variant" placeholder="Ej: 1 litro"></label>
      <label class="field"><span>Código de barras</span><input name="barcode" inputmode="numeric"></label>
      <label class="field"><span>Unidad de inventario</span><select name="baseUnit"><option value="unidad">Unidad</option><option value="kg">Kg</option><option value="litro">Litro</option></select></label>
      <div class="full">
        <span class="field-label">Centros de costo</span>
        <div class="check-grid">${centerChecks()}</div>
      </div>
    </div>`,
    submitLabel:'Crear producto',
    onSubmit:async form=>{
      const costCenterIds=form.getAll('costCenterIds').map(String);
      if(!costCenterIds.length)throw new Error('Selecciona al menos un centro de costo');
      const json={
        name:form.get('name'),
        categoryId:form.get('categoryId'),
        brand:form.get('brand'),
        variant:form.get('variant'),
        barcode:form.get('barcode'),
        baseUnit:form.get('baseUnit'),
        contentValue:0,
        contentUnit:form.get('baseUnit'),
        costCenterIds
      };
      const created=await api('/api/products',{method:'POST',json});
      await api(`/api/products/${created.product.id}/suppliers`,{
        method:'POST',
        json:{
          supplierId:form.get('supplierId'),
          supplierProductName:form.get('name'),
          orderUnit:form.get('orderUnit'),
          unitsPerOrderUnit:Number(form.get('unitsPerOrderUnit')||1),
          quantityMultiple:1
        }
      });
      state.cache.products=[];
      toast('Producto creado y vinculado al proveedor');
      await navigate('catalog');
    }
  });
}

async function openCostCenter(){
  await ensureCatalogSources();
  openModal({
    eyebrow:'CENTROS DE COSTO',
    title:'Nuevo centro de costo',
    subtitle:'Podrás asignarle productos y generar pedidos separados.',
    body:`<div class="form-grid">
      <label class="field full"><span>Local</span><select name="locationId" required>
        ${state.cache.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Nombre</span><input name="name" required placeholder="Ej: Eventos"></label>
      <label class="field"><span>Código</span><input name="code" placeholder="EVENTOS"></label>
    </div>`,
    submitLabel:'Crear centro',
    onSubmit:async form=>{
      await api('/api/cost-centers',{method:'POST',json:Object.fromEntries(form)});
      state.cache.costCenters=[];
      toast('Centro de costo creado');
      await navigate('catalog');
    }
  });
}

async function assignCostCenters(productId){
  await ensureCatalogSources();
  if(!state.cache.products.length)state.cache.products=(await api('/api/products')).products;
  const product=state.cache.products.find(item=>item.id===productId);
  const selected=(product?.costCenters||[]).map(center=>center.id);
  openModal({
    eyebrow:'CATÁLOGO',
    title:product?.name||'Centros de costo',
    subtitle:'Define en qué áreas estará disponible este producto.',
    body:`<div class="check-grid">${centerChecks(selected)}</div>`,
    submitLabel:'Guardar asignación',
    onSubmit:async form=>{
      const costCenterIds=form.getAll('costCenterIds').map(String);
      if(!costCenterIds.length)throw new Error('Selecciona al menos un centro de costo');
      await api(`/api/products/${productId}/cost-centers`,{method:'PUT',json:{costCenterIds}});
      state.cache.products=[];
      toast('Centros actualizados');
      await navigate('catalog');
    }
  });
}

async function linkSupplier(productId){
  await ensureCatalogSources();
  if(!state.cache.products.length)state.cache.products=(await api('/api/products')).products;
  const product=state.cache.products.find(item=>item.id===productId);
  openModal({
    eyebrow:'CATÁLOGO',
    title:`Proveedor de ${product?.name||'producto'}`,
    subtitle:'Define cómo se compra este producto a ese proveedor.',
    body:`<div class="form-grid">
      <label class="field full"><span>Proveedor</span><select name="supplierId" required>
        <option value="">Seleccionar</option>
        ${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Formato de pedido</span><select name="orderUnit">
        <option value="UNIDAD">Unidad</option><option value="CAJA">Caja</option><option value="DISPLAY">Display</option><option value="KG">Kg</option>
      </select></label>
      <label class="field"><span>Unidades por formato</span><input name="unitsPerOrderUnit" type="number" min="0.001" step="0.001" value="1"></label>
      <label class="field full"><span>Nombre usado por el proveedor</span><input name="supplierProductName" value="${esc(product?.name||'')}"></label>
    </div>`,
    submitLabel:'Vincular proveedor',
    onSubmit:async form=>{
      await api(`/api/products/${productId}/suppliers`,{method:'POST',json:{
        supplierId:form.get('supplierId'),
        supplierProductName:form.get('supplierProductName'),
        orderUnit:form.get('orderUnit'),
        unitsPerOrderUnit:Number(form.get('unitsPerOrderUnit')||1),
        quantityMultiple:1
      }});
      state.cache.products=[];
      toast('Proveedor vinculado');
      await navigate('catalog');
    }
  });
}

async function openUser(){
  await ensureCatalogSources();
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  const options=state.cache.locations.map(location=>`
    <label class="check-card"><input type="checkbox" name="locationScope" value="${esc(location.id)}" checked>
      <span><strong>${esc(location.name)}</strong><small>Acceso operativo</small></span>
    </label>`).join('');
  const ownerOption=state.me?.user?.role==='owner'?'<option value="owner">Propietario</option>':'';
  openModal({
    eyebrow:'SEGURIDAD',
    title:'Nuevo usuario',
    subtitle:'Creará sus propias sesiones usando este correo y contraseña.',
    size:'large',
    body:`<div class="form-grid">
      <label class="field"><span>Nombre</span><input name="displayName" required autocomplete="name"></label>
      <label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
      <label class="field"><span>Rol</span><select name="role">
        <option value="readonly">Solo lectura</option>
        <option value="purchaser" selected>Compras</option>
        <option value="receiver">Recepción</option>
        <option value="approver">Aprobador</option>
        <option value="finance">Finanzas</option>
        <option value="admin">Administrador</option>
        ${ownerOption}
      </select></label>
      <div class="full"><span class="field-label">Locales permitidos</span><div class="check-grid">${options}</div></div>
    </div>`,
    submitLabel:'Crear usuario',
    onSubmit:async form=>{
      const role=String(form.get('role'));
      const locationScope=role==='owner'?['*']:form.getAll('locationScope').map(String);
      if(!locationScope.length)throw new Error('Selecciona al menos un local');
      await api('/api/users',{method:'POST',json:{
        displayName:form.get('displayName'),
        email:form.get('email'),
        password:form.get('password'),
        role,
        locationScope
      }});
      state.cache.users=[];
      toast('Usuario creado');
      await navigate('team');
    }
  });
}

function openLocation(){
  openModal({
    eyebrow:'LOCALES',
    title:'Nuevo local',
    subtitle:'Se crearán Barra, Salón y Cocina automáticamente.',
    body:`<div class="form-grid">
      <label class="field full"><span>Nombre</span><input name="name" required></label>
      <label class="field"><span>Código</span><input name="code" placeholder="MDR"></label>
      <label class="field"><span>Zona horaria</span><input name="timezone" value="America/Santiago"></label>
    </div>`,
    submitLabel:'Crear local',
    onSubmit:async form=>{
      await api('/api/locations',{method:'POST',json:Object.fromEntries(form)});
      state.cache.locations=[];state.cache.costCenters=[];
      toast('Local y centros de costo creados');
      await navigate('settings');
    }
  });
}

function openBrand(){
  openModal({
    eyebrow:'OWNER',
    title:'Nueva marca',
    subtitle:'Tendrá locales, usuarios, catálogo, pedidos y documentos separados.',
    body:`<div class="form-grid">
      <label class="field full"><span>Nombre de la marca</span><input name="name" required placeholder="Ej: Bierstube"></label>
      <label class="field"><span>Identificador</span><input name="slug" placeholder="bierstube"></label>
      <label class="field"><span>Primer local</span><input name="locationName" required placeholder="Bierstube Clubhaus"></label>
      <label class="field"><span>Código del local</span><input name="locationCode" placeholder="BST"></label>
    </div>`,
    submitLabel:'Crear marca',
    onSubmit:async form=>{
      await api('/api/brands',{method:'POST',json:Object.fromEntries(form)});
      state.cache.brands=[];
      toast('Marca creada');
      await navigate('settings');
    }
  });
}

async function switchBrand(id){
  const response=await api(`/api/brands/${id}/switch`,{method:'POST',json:{}});
  state.token=response.token;
  localStorage.setItem('pp:token',state.token);
  resetWorkspaceCache();
  state.me=await api('/api/me');
  showApp();
  closeModal('switch');
  await navigate('dashboard');
  toast('Marca activa actualizada');
}

function openChangePassword(userId=state.me?.user?.id,displayName=state.me?.user?.displayName){
  const own=userId===state.me?.user?.id;
  openModal({
    eyebrow:'SEGURIDAD',
    title:own?'Cambiar mi contraseña':`Nueva contraseña para ${displayName||'usuario'}`,
    subtitle:'Al guardar se cerrarán las sesiones activas de esa cuenta.',
    body:`<div class="form-grid">
      <label class="field full"><span>Nueva contraseña</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label>
      <label class="field full"><span>Repite la contraseña</span><input name="confirmation" type="password" minlength="10" required autocomplete="new-password"></label>
    </div>`,
    submitLabel:'Actualizar contraseña',
    onSubmit:async form=>{
      const password=String(form.get('password')||'');
      if(password!==String(form.get('confirmation')||''))throw new Error('Las contraseñas no coinciden');
      await api(`/api/users/${userId}/password`,{method:'POST',json:{password}});
      toast('Contraseña actualizada');
      if(own)setTimeout(()=>logoutLocal(),500);
      else await navigate('team');
    }
  });
}

async function ensureOrderSources(){
  const [locations,suppliers,products,centers]=await Promise.all([
    api('/api/locations'),api('/api/suppliers'),api('/api/products'),api('/api/cost-centers')
  ]);
  state.cache.locations=locations.locations;
  state.cache.suppliers=suppliers.suppliers;
  state.cache.products=products.products;
  state.cache.costCenters=centers.costCenters;
}

function orderProductRow(product,relation){
  const format=relation?.orderUnit||'UNIDAD';
  const pack=Number(relation?.unitsPerOrderUnit||1);
  const detail=pack>1?`${format} · ${pack} unidades`:`${format}`;
  return `<article class="order-product" data-order-product="${esc(product.id)}">
    <div class="order-product-copy">
      <strong>${esc(product.name)}</strong>
      <small>${esc(product.categoryName||'Sin categoría')} · ${esc(detail)}</small>
    </div>
    <label class="order-quantity">
      <span>Cantidad</span>
      <input type="number" inputmode="decimal" min="0" step="0.001" value="0"
        data-product-id="${esc(product.id)}"
        data-supplier-product-id="${esc(relation?.id||'')}"
        data-order-unit="${esc(format)}"
        data-units-per-order-unit="${esc(pack)}"
        data-price="${esc(relation?.lastGrossUnitPrice||0)}">
    </label>
  </article>`;
}

async function openOrder(){
  await ensureOrderSources();
  if(!state.cache.locations.length)return toast('No existe un local asignado a esta cuenta','error');
  if(!state.cache.suppliers.length){
    toast('No hay proveedores disponibles. Crea uno para comenzar.','error');
    return openSupplier();
  }
  if(!state.cache.products.length){
    toast('El catálogo aún no tiene productos. Recarga la app en unos segundos.','error');
    return navigate('catalog');
  }

  openModal({
    eyebrow:'NUEVO PEDIDO',
    title:'Crear pedido',
    subtitle:'Selecciona proveedor y cantidades. Los formatos vienen desde el catálogo.',
    size:'order',
    body:`<div class="order-builder">
      <section class="order-context">
        <label class="field"><span>Local</span><select name="locationId" id="orderLocation" required>
          ${state.cache.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Centro de costo</span><select name="costCenterId" id="orderCostCenter" required></select></label>
        <label class="field"><span>Proveedor</span><select name="supplierId" id="orderSupplier" required>
          ${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${s.productCount||0} productos</option>`).join('')}
        </select></label>
        <label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label>
      </section>
      <section class="order-catalog">
        <div class="order-catalog-head">
          <label class="field order-search"><span>Buscar dentro del proveedor</span><input id="orderProductSearch" placeholder="Producto o categoría"></label>
          <div class="order-selection"><strong id="orderSelectedCount">0</strong><span>productos seleccionados</span></div>
        </div>
        <div id="orderProductList" class="order-product-list"></div>
      </section>
      <label class="field"><span>Notas para el proveedor</span><textarea name="notes" placeholder="Observaciones opcionales"></textarea></label>
    </div>`,
    submitLabel:'Crear pedido y PDF',
    onSubmit:async form=>{
      const items=$$('#orderProductList input[data-product-id]').map(input=>{
        const quantity=Number(input.value||0);
        if(quantity<=0)return null;
        const product=state.cache.products.find(item=>item.id===input.dataset.productId);
        return {
          supplierProductId:input.dataset.supplierProductId,
          productId:input.dataset.productId,
          description:product?.name||'Producto',
          quantity,
          orderUnit:input.dataset.orderUnit||'UNIDAD',
          unitsPerOrderUnit:Number(input.dataset.unitsPerOrderUnit||1),
          expectedGrossUnitPrice:Number(input.dataset.price||0)
        };
      }).filter(Boolean);
      if(!items.length)throw new Error('Ingresa cantidad en al menos un producto');
      const json={
        locationId:form.get('locationId'),
        costCenterId:form.get('costCenterId'),
        supplierId:form.get('supplierId'),
        deliveryDate:form.get('deliveryDate'),
        notes:form.get('notes'),
        items
      };
      if(!navigator.onLine){
        await queueMutation('/api/orders','POST',json);
        toast('Pedido guardado para sincronizar');
      }else{
        await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});
        toast('Pedido y PDF creados');
      }
      state.cache.orders=[];
      await navigate('orders');
    }
  });

  const centersForLocation=()=>state.cache.costCenters.filter(center=>center.locationId===$('#orderLocation').value);
  const relationFor=(product,supplierId)=>(product.suppliers||[]).find(relation=>relation.supplierId===supplierId);
  const eligibleProducts=()=>{
    const centerId=$('#orderCostCenter').value;
    const supplierId=$('#orderSupplier').value;
    const query=$('#orderProductSearch').value.trim().toLowerCase();
    return state.cache.products
      .filter(product=>(product.costCenters||[]).some(center=>center.id===centerId))
      .map(product=>({product,relation:relationFor(product,supplierId)}))
      .filter(entry=>entry.relation)
      .filter(entry=>!query||`${entry.product.name} ${entry.product.categoryName||''}`.toLowerCase().includes(query))
      .sort((a,b)=>(a.product.categoryName||'').localeCompare(b.product.categoryName||'','es')||a.product.name.localeCompare(b.product.name,'es'));
  };
  const updateSelected=()=>{
    const count=$$('#orderProductList input[data-product-id]').filter(input=>Number(input.value)>0).length;
    $('#orderSelectedCount').textContent=count;
  };
  const renderProducts=()=>{
    const entries=eligibleProducts();
    $('#orderProductList').innerHTML=entries.length
      ? entries.map(entry=>orderProductRow(entry.product,entry.relation)).join('')
      : `<div class="empty-state compact-empty"><h3>Sin productos vinculados</h3><p>Este proveedor no tiene productos para el centro seleccionado.</p><button class="btn" type="button" data-action="new-product">＋ Crear producto</button></div>`;
    $$('#orderProductList input[data-product-id]').forEach(input=>input.oninput=updateSelected);
    $('#orderProductList [data-action="new-product"]')?.addEventListener('click',()=>{closeModal('new-product');openProduct()});
    updateSelected();
  };
  const refreshCenters=()=>{
    const centers=centersForLocation();
    $('#orderCostCenter').innerHTML=centers.map(center=>`<option value="${esc(center.id)}">${esc(center.name)}</option>`).join('');
    renderProducts();
  };
  $('#orderLocation').onchange=refreshCenters;
  $('#orderCostCenter').onchange=renderProducts;
  $('#orderSupplier').onchange=renderProducts;
  $('#orderProductSearch').oninput=renderProducts;
  refreshCenters();
}

async function openWorkspaceSwitcher(){
  const platformOwner=Boolean(state.me?.user?.isPlatformOwner);
  const payload=await api('/api/brands');
  const brands=payload.brands||[];
  state.cache.brands=brands;
  const brandSection=brands.length?`
    <section class="workspace-section">
      <div class="section-title"><div><strong>Marcas</strong><small>Cambia de espacio sin volver a iniciar sesión.</small></div>${platformOwner?'<button class="btn small" type="button" data-action="new-brand">＋ Nueva</button>':''}</div>
      <div class="workspace-list">${brands.map(brand=>`
        <button class="workspace-option ${brand.current?'current':''}" type="button" ${brand.current?'disabled':`data-switch-brand="${esc(brand.id)}"`}>
          <span class="workspace-option-avatar">${esc(brand.name.slice(0,2).toUpperCase())}</span>
          <span><strong>${esc(brand.name)}</strong><small>${brand.locations.length} local${brand.locations.length===1?'':'es'} · ${esc(brand.plan)}</small></span>
          <b>${brand.current?'Actual':'Cambiar'}</b>
        </button>`).join('')}</div>
    </section>`:'';
  openModal({
    eyebrow:'ESPACIO DE TRABAJO',
    title:state.me.organization.name,
    subtitle:`${state.me.user.displayName} · ${roleNames[state.me.user.role]||state.me.user.role}`,
    size:'workspace',
    hideSubmit:true,
    body:`<div class="workspace-manager">
      ${brandSection}
      <section class="workspace-section">
        <div class="section-title"><div><strong>Administración</strong><small>Configura personas, locales y seguridad.</small></div></div>
        <div class="admin-shortcuts">
          ${isAdmin()?'<button class="admin-shortcut" type="button" data-view-link="team"><span>◎</span><strong>Usuarios</strong><small>Correos, roles y contraseñas</small></button>':''}
          ${isAdmin()?'<button class="admin-shortcut" type="button" data-view-link="settings"><span>⌂</span><strong>Locales y marcas</strong><small>Espacios de operación</small></button>':''}
          <button class="admin-shortcut" type="button" data-action="change-password"><span>◉</span><strong>Mi contraseña</strong><small>Actualizar acceso</small></button>
          <button class="admin-shortcut danger-shortcut" type="button" id="workspaceLogout"><span>↪</span><strong>Cerrar sesión</strong><small>Salir de este dispositivo</small></button>
        </div>
      </section>
    </div>`
  });
  bindDynamic();
  $('#workspaceLogout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',json:{}})}catch{}closeModal('logout');logoutLocal()};
}

function bindDynamic(){
  $$('[data-view-link]').forEach(node=>node.onclick=()=>{closeModal('navigate');navigate(node.dataset.viewLink)});
  $$('[data-action]').forEach(node=>node.onclick=()=>handleAction(node.dataset.action));
  $$('[data-order]').forEach(node=>node.onclick=()=>openProfessionalOrderDetail(node.dataset.order));
  $$('[data-link-supplier]').forEach(node=>node.onclick=()=>linkSupplier(node.dataset.linkSupplier));
  $$('[data-assign-cost-centers]').forEach(node=>node.onclick=()=>assignCostCenters(node.dataset.assignCostCenters));
  $$('[data-switch-brand]').forEach(node=>node.onclick=()=>switchBrand(node.dataset.switchBrand));
  $$('[data-toggle-user]').forEach(node=>node.onclick=async()=>{
    const active=node.dataset.active==='1';
    const user=state.cache.users.find(item=>item.id===node.dataset.toggleUser);
    await api(`/api/users/${node.dataset.toggleUser}`,{method:'PATCH',json:{active:!active,role:user?.role,locationScope:user?.locationScope||[]}});
    toast(active?'Usuario revocado':'Usuario reactivado');
    await navigate('team');
  });
  $$('[data-reset-password]').forEach(node=>node.onclick=()=>{
    const user=state.cache.users.find(item=>item.id===node.dataset.resetPassword);
    openChangePassword(node.dataset.resetPassword,user?.displayName);
  });
  $$('[data-revoke-session]').forEach(node=>node.onclick=async()=>{
    await api(`/api/sessions/${node.dataset.revokeSession}/revoke`,{method:'POST',json:{}});
    toast('Sesión revocada');
    await navigate('settings');
  });
}

function handleAction(action){
  if(action==='new-order')return openOrder();
  if(action==='new-supplier')return openSupplier();
  if(action==='new-product')return openProduct();
  if(action==='new-cost-center')return openCostCenter();
  if(action==='new-user')return openUser();
  if(action==='new-brand')return openBrand();
  if(action==='new-location')return openLocation();
  if(action==='analyze-invoice')return openInvoiceAnalysis();
  if(action==='change-password')return openChangePassword();
  if(action==='workspace')return openWorkspaceSwitcher();
}

export {openBootstrap,openOrder,openWorkspaceSwitcher,openChangePassword,handleAction,bindDynamic,closeModal};
