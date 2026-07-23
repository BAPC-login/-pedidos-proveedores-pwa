import {$,$$,esc,state,api,toast,isAdmin} from './app-core.js';
import {openModal} from './app-modal.js';
import {bindDynamic} from './app-actions.js';
import {openProcurementSettings} from './app-procurement-settings.js';

let busy=false;
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function setActive(){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)==='operations'));
  $('#pageEyebrow').textContent='MAESTROS';$('#pageTitle').textContent='Operaciones';
}

function imageToJpeg(file){
  return new Promise((resolve,reject)=>{
    const source=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{try{const limit=1400,scale=Math.min(1,limit/Math.max(image.naturalWidth||1,image.naturalHeight||1)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);canvas.toBlob(blob=>{URL.revokeObjectURL(source);if(!blob)return reject(new Error('No se pudo procesar el logo'));resolve({blob,width,height})},'image/jpeg',.92)}catch(error){URL.revokeObjectURL(source);reject(error)}};
    image.onerror=()=>{URL.revokeObjectURL(source);reject(new Error('Usa una imagen JPG, PNG o WebP'))};image.src=source;
  });
}

async function openCategoryCreator(){
  openModal({eyebrow:'OPERACIONES',title:'Nueva categoría',subtitle:'Luego podrás asignarla a una bodega y ordenar su posición dentro de cada centro de costo.',body:`<label class="field"><span>Nombre de categoría</span><input name="name" required placeholder="Ej: Cervezas, Gin, Insumos"></label>`,submitLabel:'Crear categoría',onSubmit:async form=>{await api('/api/categories',{method:'POST',json:{name:form.get('name')}});toast('Categoría creada');await renderOperationsAdmin()}});
}

async function uploadSupplierLogo(supplier,asset={}){
  let pending=null,preview='';
  if(asset.logoKey){const response=await fetch(`/api/files/${encodeURIComponent(asset.logoKey)}`,{headers:{Authorization:`Bearer ${state.token}`}});if(response.ok)preview=URL.createObjectURL(await response.blob())}
  openModal({eyebrow:'IDENTIDAD DE PROVEEDOR',title:supplier.name,subtitle:'El logo se usa en la ficha del proveedor y en los próximos PDF emitidos para él.',body:`<div class="supplier-logo-editor"><div id="supplierLogoPreview">${preview?`<img src="${preview}" alt="Logo ${esc(supplier.name)}">`:'<span>Sin logo</span>'}</div><label class="field"><span>Seleccionar logo</span><input id="supplierLogoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="field"><span>Tamaño en PDF</span><input name="logoSize" type="range" min="24" max="96" value="${Number(asset.logoSize||44)}"></label><label class="check-card"><input name="removeLogo" type="checkbox"><span><strong>Quitar logo actual</strong><small>No elimina documentos históricos</small></span></label></div>`,submitLabel:'Guardar logo',onSubmit:async form=>{let logo={logoKey:asset.logoKey||'',logoName:asset.logoName||'',logoWidth:asset.logoWidth||0,logoHeight:asset.logoHeight||0,logoSize:Number(form.get('logoSize')||44)};if(form.get('removeLogo')==='on')logo={...logo,logoKey:'',logoName:'',logoWidth:0,logoHeight:0};if(pending){const converted=await imageToJpeg(pending),upload=new FormData();upload.append('file',converted.blob,`${String(pending.name||'logo').replace(/\.[^.]+$/,'')}.jpg`);const response=await fetch('/api/files?purpose=supplier-logo',{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:upload}),payload=await response.json().catch(()=>({}));if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo cargar el logo');logo={logoKey:payload.file.key,logoName:payload.file.name,logoWidth:converted.width,logoHeight:converted.height,logoSize:Number(form.get('logoSize')||44)}}await api(`/api/suppliers/${supplier.id}/identity`,{method:'PATCH',json:logo});toast('Logo del proveedor actualizado');await renderOperationsAdmin()}});
  $('#supplierLogoFile').onchange=async()=>{pending=$('#supplierLogoFile').files?.[0]||null;if(!pending)return;const converted=await imageToJpeg(pending);preview=URL.createObjectURL(converted.blob);$('#supplierLogoPreview').innerHTML=`<img src="${preview}" alt="Vista previa">`};
}

function categoryRows(categories){
  return categories.map(category=>`<article class="ops-master-row"><div><strong>${esc(category.name)}</strong><small>Orden global ${Number(category.sortOrder||0)+1}</small></div><button class="btn small" type="button" data-category-route="${esc(category.id)}">Asignar y ordenar</button></article>`).join('');
}

function supplierRows(suppliers,assets){
  const map=new Map(assets.map(asset=>[asset.supplierId,asset]));
  return suppliers.map(supplier=>{const asset=map.get(supplier.id)||{};return`<article class="ops-master-row"><div><strong>${esc(supplier.name)}</strong><small>${supplier.productCount||0} productos · ${asset.logoKey?'Logo cargado':'Sin logo'}</small></div><button class="btn small" type="button" data-supplier-logo="${esc(supplier.id)}">${asset.logoKey?'Cambiar logo':'Cargar logo'}</button></article>`}).join('');
}

export async function renderOperationsAdmin(){
  if(busy)return;busy=true;state.view='operations';setActive();
  const cached=state.cache.categories.length&&state.cache.suppliers.length&&state.cache.costCenters.length;
  if(!cached)$('#mainContent').innerHTML='<section class="panel"><div class="empty-state compact-empty">Cargando operaciones…</div></section>';
  try{
    const [categoriesPayload,centersPayload,suppliersPayload,productsPayload,assetsPayload]=await Promise.all([api('/api/categories'),api('/api/cost-centers'),api('/api/suppliers'),api('/api/products'),api('/api/supplier-assets')]);
    const categories=categoriesPayload.categories||[],centers=centersPayload.costCenters||[],suppliers=suppliersPayload.suppliers||[],products=productsPayload.products||[],assets=assetsPayload.assets||[];
    state.cache.categories=categories;state.cache.costCenters=centers;state.cache.suppliers=suppliers;state.cache.products=products;
    $('#mainContent').innerHTML=`<div class="view-header ops-header"><div><span class="eyebrow">CONFIGURACIÓN OPERATIVA</span><h2>Operaciones</h2><p>Crea y vincula categorías, centros, productos, proveedores, bodegas y unidades desde un solo lugar.</p></div></div><section class="settings-highlight-row"><button class="settings-highlight" data-new-category><span>＋</span><strong>Categoría</strong></button><button class="settings-highlight" data-action="new-cost-center"><span>◎</span><strong>Centro</strong></button><button class="settings-highlight" data-action="new-product"><span>▤</span><strong>Producto</strong></button><button class="settings-highlight" data-action="new-supplier"><span>◇</span><strong>Proveedor</strong></button><button class="settings-highlight" data-view-link="catalog"><span>▦</span><strong>Vínculos</strong></button></section><section class="ops-master-summary"><article><strong>${categories.length}</strong><span>Categorías</span></article><article><strong>${centers.length}</strong><span>Centros</span></article><article><strong>${products.length}</strong><span>Productos</span></article><article><strong>${suppliers.length}</strong><span>Proveedores</span></article></section><section class="operations-grid"><article class="settings-section"><div class="settings-section-head"><div><h3>Categorías y recorrido</h3><p>Crea categorías y asígnalas a bodegas por centro.</p></div><button class="btn primary" type="button" data-new-category>＋ Categoría</button></div><div class="ops-master-list">${categoryRows(categories)||'<div class="empty-state compact-empty">Sin categorías</div>'}</div></article><article class="settings-section"><div class="settings-section-head"><div><h3>Centros de costo</h3><p>Configura bodegas, unidades y orden de cada área.</p></div></div><div class="ops-master-list">${centers.map(center=>`<article class="ops-master-row"><div><strong>${esc(center.name)}</strong><small>${esc(center.locationName)} · ${center.productCount||0} productos</small></div><button class="btn small" type="button" data-center-config="${esc(center.id)}">Configurar lista</button></article>`).join('')}</div></article><article class="settings-section operations-wide"><div class="settings-section-head"><div><h3>Logos de proveedores</h3><p>Carga la identidad que se mostrará en documentos y fichas.</p></div></div><div class="ops-master-list supplier-master-list">${supplierRows(suppliers,assets)}</div></article></section>`;
    bindDynamic();
    $$('[data-new-category]').forEach(button=>button.onclick=()=>openCategoryCreator().catch(error=>toast(error.message,'error')));
    $$('[data-center-config]').forEach(button=>button.onclick=()=>openProcurementSettings(button.dataset.centerConfig).catch(error=>toast(error.message,'error')));
    $$('[data-category-route]').forEach(button=>button.onclick=()=>openProcurementSettings(centers[0]?.id||'').catch(error=>toast(error.message,'error')));
    $$('[data-supplier-logo]').forEach(button=>{const supplier=suppliers.find(item=>item.id===button.dataset.supplierLogo),asset=assets.find(item=>item.supplierId===button.dataset.supplierLogo)||{};button.onclick=()=>uploadSupplierLogo(supplier,asset).catch(error=>toast(error.message,'error'))});
  }catch(error){$('#mainContent').innerHTML=`<section class="panel"><div class="empty-state"><h3>No se pudo cargar Operaciones</h3><p>${esc(error.message)}</p><button class="btn" id="retryOperations">Reintentar</button></div></section>`;$('#retryOperations').onclick=renderOperationsAdmin}
  finally{busy=false}
}
