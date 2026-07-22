import {$,$$,esc,money,state,api,toast,roleNames,initials} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openOrderDetail} from './app-order-detail.js';

let initialized=false;
let enhanceTimer=0;
let supplierAssets=null;
const supplierLogoUrls=new Map();
const navigate=async view=>(await import('./app-views.js')).navigate(view);

const statusNames={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};

function injectStyles(){
  if($('#masterFeatureStyles'))return;
  const style=document.createElement('style');
  style.id='masterFeatureStyles';
  style.textContent=`
    .master-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.master-step{display:flex;gap:9px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}.master-step b{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:var(--primary);color:#fff}.master-step span{font-size:11px;font-weight:800}
    .master-toolbar{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,.45fr);gap:10px;align-items:end}.master-list{display:grid;gap:8px;max-height:min(55vh,620px);overflow:auto;padding:2px}.master-row{display:grid;grid-template-columns:minmax(190px,1fr) minmax(132px,.55fr) 105px 82px 94px;gap:8px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:13px;background:var(--card)}.master-product{min-width:0}.master-product strong,.master-product small{display:block}.master-product strong{font-size:11px;overflow-wrap:anywhere}.master-product small{margin-top:4px;color:var(--muted);font-size:9px}.master-supplier{display:flex;align-items:center;gap:7px;min-width:0}.master-supplier img,.supplier-logo-image{width:34px;height:34px;border-radius:9px;object-fit:contain;background:#fff;border:1px solid var(--line);padding:3px}.master-row select,.master-row input{width:100%;min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:0 9px}.master-qty{font-size:18px!important;font-weight:900;text-align:right}.master-summary{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.master-summary span{padding:7px 10px;border-radius:999px;background:color-mix(in srgb,var(--primary) 11%,var(--card));color:var(--primary);font-size:9px;font-weight:850}.master-empty{padding:30px;text-align:center;color:var(--muted)}
    .batch-results{display:grid;gap:10px}.batch-result{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:12px}.batch-result strong,.batch-result small{display:block}.batch-result small{margin-top:4px;color:var(--muted)}
    .supplier-logo-wrap{display:flex;align-items:center;gap:10px}.supplier-logo-placeholder{display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:var(--soft);font-weight:900}.supplier-actions{display:flex;gap:7px;margin-top:12px}.supplier-preview{display:grid;place-items:center;min-height:160px;border:1px dashed var(--line);border-radius:14px;background:var(--soft)}.supplier-preview img{max-width:220px;max-height:130px;object-fit:contain}
    .dashboard-master{display:grid;gap:14px}.analytics-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:9px;align-items:end}.analytics-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.analytics-card{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.analytics-card span,.analytics-card small{display:block;color:var(--muted);font-size:9px}.analytics-card strong{display:block;margin:7px 0;font-size:22px}.analytics-columns{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:12px}.analytics-bars{display:grid;gap:10px}.analytics-bar{display:grid;grid-template-columns:78px 1fr 80px;gap:9px;align-items:center;font-size:9px}.analytics-track{height:9px;border-radius:99px;background:var(--soft);overflow:hidden}.analytics-track i{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--primary2));border-radius:99px}.recommendations{display:grid;gap:8px}.recommendation{padding:11px;border-left:4px solid var(--primary);border-radius:10px;background:var(--soft)}.recommendation.high{border-color:var(--danger)}.recommendation.medium{border-color:var(--warning)}.recommendation strong,.recommendation p,.recommendation small{display:block;margin:0}.recommendation p{margin-top:5px;color:var(--muted);font-size:10px;line-height:1.45}.recommendation small{margin-top:6px;color:var(--primary);font-size:9px;font-weight:800}.analytics-loading{padding:30px;text-align:center;color:var(--muted)}
    .settings-separation{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}.settings-purpose{padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--card)}.settings-purpose h3{margin:0 0 6px}.settings-purpose p{color:var(--muted);font-size:10px;line-height:1.5}.settings-purpose .btn{margin-top:10px;width:100%}
    .invoice-ai-banner{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid color-mix(in srgb,var(--success) 35%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--success) 8%,var(--card));margin-bottom:12px}.invoice-ai-banner b{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:var(--success);color:#fff}.invoice-ai-banner strong,.invoice-ai-banner small{display:block}.invoice-ai-banner small{margin-top:4px;color:var(--muted)}
    @media(max-width:850px){.master-row{grid-template-columns:minmax(0,1fr) 116px 90px 72px}.master-supplier{grid-column:1/-1}.analytics-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-columns{grid-template-columns:1fr}}
    @media(max-width:560px){.master-steps,.settings-separation{grid-template-columns:1fr}.master-toolbar{grid-template-columns:1fr}.master-row{grid-template-columns:minmax(0,1fr) 88px 70px}.master-supplier{grid-column:1/-1}.master-product{grid-column:1/2}.master-format{grid-column:1/2}.master-pack{grid-column:2/3}.master-quantity{grid-column:3/4}.analytics-filters,.analytics-grid{grid-template-columns:1fr 1fr}.analytics-filters .btn{grid-column:1/-1}.analytics-bar{grid-template-columns:60px 1fr 65px}.invoice-ai-banner{grid-template-columns:auto 1fr}.invoice-ai-banner .btn{grid-column:1/-1}}
  `;
  document.head.append(style);
}

async function loadOperationalSources(force=false){
  if(!force&&state.cache.locations.length&&state.cache.costCenters.length&&state.cache.suppliers.length&&state.cache.products.length)return;
  const [locations,centers,suppliers,products]=await Promise.all([api('/api/locations'),api('/api/cost-centers'),api('/api/suppliers'),api('/api/products')]);
  state.cache.locations=locations.locations||[];
  state.cache.costCenters=centers.costCenters||[];
  state.cache.suppliers=suppliers.suppliers||[];
  state.cache.products=products.products||[];
}

async function loadSupplierAssets(force=false){
  if(supplierAssets&&!force)return supplierAssets;
  supplierAssets=(await api('/api/supplier-assets')).assets||[];
  return supplierAssets;
}

async function protectedImageUrl(key){
  if(!key)return '';
  if(supplierLogoUrls.has(key))return supplierLogoUrls.get(key);
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok)return '';
  const url=URL.createObjectURL(await response.blob());supplierLogoUrls.set(key,url);return url;
}

async function hydrateSupplierLogos(){
  await loadSupplierAssets();
  await Promise.all(supplierAssets.filter(asset=>asset.logoKey).map(async asset=>{asset.url=await protectedImageUrl(asset.logoKey)}));
  return supplierAssets;
}

function assetForSupplier(id){return (supplierAssets||[]).find(asset=>asset.supplierId===id)||null}

async function openStoredDocument(key,name='pedido.pdf'){
  const popup=window.open('about:blank','_blank');
  try{
    const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el PDF')}
    const url=URL.createObjectURL(await response.blob());
    if(popup)popup.location.href=url;else window.open(url,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(error){popup?.close();throw error}
}

function fileToJpeg(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);const image=new Image();
    image.onload=()=>{try{const limit=1600;const scale=Math.min(1,limit/Math.max(image.naturalWidth||1,image.naturalHeight||1));const width=Math.max(1,Math.round(image.naturalWidth*scale));const height=Math.max(1,Math.round(image.naturalHeight*scale));const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(!blob)return reject(new Error('No se pudo procesar la imagen'));resolve({blob,width,height})},'image/jpeg',.92)}catch(error){URL.revokeObjectURL(url);reject(error)}};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Imagen inválida'))};image.src=url;
  });
}

async function uploadImage(file,purpose){
  if(!file||!file.size)throw new Error('Selecciona una imagen');
  if(file.size>8*1024*1024)throw new Error('La imagen supera 8 MB');
  const converted=await fileToJpeg(file);const form=new FormData();form.append('file',converted.blob,`${String(file.name||'logo').replace(/\.[^.]+$/,'')}.jpg`);
  const response=await fetch(`/api/files?purpose=${encodeURIComponent(purpose)}`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form});
  const payload=await response.json().catch(()=>({}));if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo subir la imagen');
  return {...payload.file,width:converted.width,height:converted.height};
}

function relationOptions(product,selectedId){
  return (product.suppliers||[]).map(relation=>`<option value="${esc(relation.id)}" ${relation.id===selectedId?'selected':''}>${esc(relation.supplierName)} · ${esc(relation.orderUnit||'UNIDAD')}</option>`).join('');
}

function formatOptions(selected){
  const values=[selected,'UNIDAD','CAJA','DISPLAY','PACK','KG'].filter(Boolean).map(value=>String(value).toUpperCase());
  return [...new Set(values)].map(value=>`<option value="${esc(value)}" ${value===String(selected||'').toUpperCase()?'selected':''}>${esc(value)}</option>`).join('');
}

async function openMasterOrder(){
  await loadOperationalSources(true);await hydrateSupplierLogos();
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');
  const selections=new Map();let activeProducts=[];
  openModal({
    eyebrow:'NUEVO PEDIDO',title:'Lista maestra de pedido',subtitle:'Completa una sola lista. Pedidos Pro la separará automáticamente por proveedor y generará un PDF para cada uno.',size:'order',
    body:`<div class="master-steps"><div class="master-step"><b>1</b><span>Escoge local y centro de costo</span></div><div class="master-step"><b>2</b><span>Ingresa cantidades en la lista completa</span></div></div>
      <section class="order-context"><label class="field"><span>Local</span><select id="masterLocation" name="locationId" required>${state.cache.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label><label class="field"><span>Centro de costo</span><select id="masterCenter" name="costCenterId" required></select></label><label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date"></label><label class="check-card"><input name="saveAsDraft" type="checkbox"><span><strong>Guardar como borrador</strong><small>Desmarcado: queda emitido como Solicitado</small></span></label></section>
      <section class="order-catalog"><div class="master-toolbar"><label class="field"><span>Buscar en la lista</span><input id="masterSearch" placeholder="Producto, categoría o proveedor" enterkeyhint="search"></label><div class="order-selection"><strong id="masterSelectedCount">0</strong><span>productos · <b id="masterSupplierCount">0</b> proveedores</span></div></div><div id="masterSupplierSummary" class="master-summary"></div><div id="masterProducts" class="master-list"></div></section>
      <label class="field"><span>Notas generales</span><textarea name="notes" placeholder="Se incluirán en cada pedido por proveedor"></textarea></label>`,
    submitLabel:'Separar por proveedor y generar PDFs',
    onSubmit:async form=>{
      saveVisible();const items=[];
      for(const product of activeProducts){const selection=selections.get(product.id);if(!selection||Number(selection.quantity)<=0)continue;items.push({supplierProductId:selection.relationId,productId:product.id,quantity:Number(selection.quantity),orderUnit:selection.orderUnit,unitsPerOrderUnit:Number(selection.pack||1),persistFormat:true})}
      if(!items.length)throw new Error('Ingresa una cantidad en al menos un producto');
      const response=await api('/api/order-batches',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json:{locationId:form.get('locationId'),costCenterId:form.get('costCenterId'),deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),saveAsDraft:form.get('saveAsDraft')==='on',items}});
      state.cache.orders=[];toast(`${response.batch.supplierCount} pedidos y PDFs creados`);await navigate('orders');setTimeout(()=>showBatchResults(response.batch),60);
    }
  });

  function selectedRelation(product,selection){return (product.suppliers||[]).find(relation=>relation.id===selection?.relationId)||(product.suppliers||[])[0]}
  function initializeProducts(){
    const centerId=$('#masterCenter').value;activeProducts=state.cache.products.filter(product=>product.active&&(product.costCenters||[]).some(center=>center.id===centerId)&&(product.suppliers||[]).length).sort((a,b)=>(a.categoryName||'').localeCompare(b.categoryName||'','es')||a.name.localeCompare(b.name,'es'));
    selections.clear();for(const product of activeProducts){const relation=product.suppliers[0];selections.set(product.id,{quantity:'',relationId:relation.id,orderUnit:String(relation.orderUnit||'UNIDAD').toUpperCase(),pack:Number(relation.unitsPerOrderUnit||1)})}render();
  }
  function saveVisible(){
    $$('#masterProducts [data-master-product]').forEach(row=>{const id=row.dataset.masterProduct;const current=selections.get(id)||{};current.quantity=row.querySelector('[data-master-quantity]').value;current.relationId=row.querySelector('[data-master-relation]').value;current.orderUnit=row.querySelector('[data-master-format]').value;current.pack=Number(row.querySelector('[data-master-pack]').value||1);selections.set(id,current)});
  }
  function updateSummary(){
    saveVisible();const selected=activeProducts.filter(product=>Number(selections.get(product.id)?.quantity)>0);const groups=new Map();selected.forEach(product=>{const relation=selectedRelation(product,selections.get(product.id));if(relation)groups.set(relation.supplierId,(groups.get(relation.supplierId)||{name:relation.supplierName,count:0}));if(relation)groups.get(relation.supplierId).count++});
    $('#masterSelectedCount').textContent=selected.length;$('#masterSupplierCount').textContent=groups.size;$('#masterSupplierSummary').innerHTML=[...groups.values()].map(group=>`<span>${esc(group.name)} · ${group.count}</span>`).join('')||'<span>Los proveedores se detectarán automáticamente</span>';
  }
  function bindRows(){
    $$('#masterProducts [data-master-product]').forEach(row=>{
      const product=activeProducts.find(item=>item.id===row.dataset.masterProduct);const quantity=row.querySelector('[data-master-quantity]');const relationSelect=row.querySelector('[data-master-relation]');const format=row.querySelector('[data-master-format]');const pack=row.querySelector('[data-master-pack]');
      quantity.addEventListener('focus',()=>quantity.select());quantity.addEventListener('input',updateSummary);quantity.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();saveVisible();const fields=$$('[data-master-quantity]');const index=fields.indexOf(quantity);const next=fields[index+1];if(next){next.focus();next.select()}else $('#modalSubmit')?.focus()});
      relationSelect.onchange=()=>{const relation=(product.suppliers||[]).find(item=>item.id===relationSelect.value);format.innerHTML=formatOptions(relation?.orderUnit||'UNIDAD');format.value=String(relation?.orderUnit||'UNIDAD').toUpperCase();pack.value=Number(relation?.unitsPerOrderUnit||1);const selection=selections.get(product.id);selection.relationId=relationSelect.value;selection.orderUnit=format.value;selection.pack=Number(pack.value);updateSupplierVisual(row,relation);updateSummary()};format.onchange=updateSummary;pack.oninput=updateSummary;
    });
  }
  function updateSupplierVisual(row,relation){const asset=assetForSupplier(relation?.supplierId);const holder=row.querySelector('[data-master-supplier-visual]');holder.innerHTML=asset?.url?`<img src="${asset.url}" alt=""><small>${esc(relation.supplierName)}</small>`:`<span class="supplier-logo-placeholder">${esc(initials(relation?.supplierName||'P'))}</span><small>${esc(relation?.supplierName||'Proveedor')}</small>`}
  function render(){
    saveVisible();const query=$('#masterSearch').value.trim().toLowerCase();const visible=activeProducts.filter(product=>{const relation=selectedRelation(product,selections.get(product.id));return !query||`${product.name} ${product.categoryName||''} ${relation?.supplierName||''}`.toLowerCase().includes(query)});
    $('#masterProducts').innerHTML=visible.length?visible.map(product=>{const selection=selections.get(product.id);const relation=selectedRelation(product,selection);const asset=assetForSupplier(relation?.supplierId);return `<article class="master-row" data-master-product="${esc(product.id)}"><div class="master-product"><strong>${esc(product.name)}</strong><small>${esc(product.categoryName||'Sin categoría')}</small></div><div class="master-supplier" data-master-supplier-visual>${asset?.url?`<img src="${asset.url}" alt=""><small>${esc(relation.supplierName)}</small>`:`<span class="supplier-logo-placeholder">${esc(initials(relation?.supplierName||'P'))}</span><small>${esc(relation?.supplierName||'Proveedor')}</small>`}</div><select data-master-relation aria-label="Proveedor">${relationOptions(product,selection.relationId)}</select><select class="master-format" data-master-format aria-label="Formato">${formatOptions(selection.orderUnit)}</select><input class="master-pack" data-master-pack type="number" min="0.001" step="0.001" value="${selection.pack}" inputmode="decimal" aria-label="Unidades por formato"><label class="master-quantity"><input class="master-qty" data-master-quantity type="number" min="0" step="0.001" value="${esc(selection.quantity)}" placeholder="0" inputmode="decimal" enterkeyhint="next" aria-label="Cantidad"></label></article>`}).join(''):'<div class="master-empty">No hay productos para este filtro.</div>';
    bindRows();updateSummary();
  }
  function refreshCenters(){const centers=state.cache.costCenters.filter(center=>center.locationId===$('#masterLocation').value);$('#masterCenter').innerHTML=centers.map(center=>`<option value="${esc(center.id)}">${esc(center.name)} · ${center.productCount} productos</option>`).join('');initializeProducts()}
  $('#masterLocation').onchange=refreshCenters;$('#masterCenter').onchange=initializeProducts;$('#masterSearch').oninput=render;refreshCenters();
}

function showBatchResults(batch){
  openModal({eyebrow:'PEDIDO CREADO',title:`${batch.supplierCount} proveedores procesados`,subtitle:`Se generó un folio y un PDF independiente por proveedor. Estado: ${statusNames[batch.status]||batch.status}.`,size:'large',hideSubmit:true,body:`<div class="batch-results">${batch.orders.map(order=>`<article class="batch-result"><div><strong>${esc(order.supplierName)} · ${esc(order.folio)}</strong><small>${order.items.length} productos · ${esc(statusNames[order.status]||order.status)}</small></div><div class="row-actions"><button class="btn small" data-batch-pdf="${esc(order.pdfDocument?.key||'')}" data-name="${esc(order.pdfDocument?.name||'pedido.pdf')}">PDF</button><button class="btn small primary" data-batch-order="${esc(order.id)}">Gestionar</button></div></article>`).join('')}</div>`});
  $$('[data-batch-pdf]').forEach(button=>button.onclick=()=>openStoredDocument(button.dataset.batchPdf,button.dataset.name).catch(error=>toast(error.message,'error')));
  $$('[data-batch-order]').forEach(button=>button.onclick=()=>{closeModal('order');setTimeout(()=>openOrderDetail(button.dataset.batchOrder),0)});
}

async function openStableUser(){
  const locations=(await api('/api/locations')).locations||[];if(!locations.length)return toast('Primero debes crear un local','error');const ownerOption=state.me?.user?.role==='owner'?'<option value="owner">Propietario</option>':'';
  openModal({eyebrow:'USUARIO',title:'Crear usuario y perfil',subtitle:'Datos personales, acceso y cargo se administran aquí. Los datos de empresa se administran por separado.',size:'large',body:`<div class="form-grid"><label class="field"><span>Nombre y apellido</span><input name="displayName" required autocomplete="name"></label><label class="field"><span>Cargo</span><input name="jobTitle" placeholder="Ej: Jefe de Barra"></label><label class="field"><span>Correo de acceso</span><input name="email" type="email" required autocomplete="email"></label><label class="field"><span>Teléfono</span><input name="phone" type="tel"></label><label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label><label class="field"><span>Rol</span><select name="role"><option value="readonly">Solo lectura</option><option value="purchaser" selected>Compras</option><option value="receiver">Recepción</option><option value="approver">Aprobador</option><option value="finance">Finanzas</option><option value="admin">Administrador</option>${ownerOption}</select></label><div class="full"><span class="field-label">Locales permitidos</span><div class="check-grid">${locations.map(location=>`<label class="check-card"><input type="checkbox" name="locationScope" value="${esc(location.id)}" checked><span><strong>${esc(location.name)}</strong><small>Acceso operativo</small></span></label>`).join('')}</div></div></div>`,submitLabel:'Crear usuario',onSubmit:async form=>{const role=String(form.get('role'));const locationScope=role==='owner'?['*']:form.getAll('locationScope').map(String);if(!locationScope.length)throw new Error('Selecciona al menos un local');await api('/api/users',{method:'POST',json:{displayName:form.get('displayName'),email:form.get('email'),password:form.get('password'),profile:{jobTitle:form.get('jobTitle'),phone:form.get('phone'),signatureName:form.get('displayName')},role,locationScope}});state.cache.users=[];toast('Usuario creado');await navigate('team')}});
}

async function openSupplierLogo(supplierId){
  await loadOperationalSources();await hydrateSupplierLogos();const supplier=state.cache.suppliers.find(item=>item.id===supplierId);if(!supplier)return toast('Proveedor no encontrado','error');const current=assetForSupplier(supplierId);let preview=current?.url||'';
  openModal({eyebrow:'PROVEEDOR',title:`Logo de ${supplier.name}`,subtitle:'Este logo se mostrará en la lista maestra y permitirá reconocer rápidamente cada proveedor.',body:`<div class="stack"><div class="supplier-preview" id="supplierLogoPreview">${preview?`<img src="${preview}" alt="Logo">`:'<span>Sin logo cargado</span>'}</div><label class="field"><span>Imagen PNG, JPG o WebP</span><input id="supplierLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="field"><span>Tamaño visual</span><input name="logoSize" type="range" min="24" max="96" value="${Number(current?.logoSize||44)}"></label><label class="check-card"><input name="removeLogo" type="checkbox"><span><strong>Quitar logo actual</strong><small>Conserva el proveedor y sus productos</small></span></label></div>`,submitLabel:'Guardar logo',onSubmit:async form=>{let identity={logoKey:current?.logoKey||'',logoName:current?.logoName||'',logoWidth:current?.logoWidth||0,logoHeight:current?.logoHeight||0,logoSize:Number(form.get('logoSize')||44)};if(form.get('removeLogo')==='on')identity={...identity,logoKey:'',logoName:'',logoWidth:0,logoHeight:0};const file=$('#supplierLogoFile').files?.[0];if(file){const uploaded=await uploadImage(file,'supplier-logo');identity={...identity,logoKey:uploaded.key,logoName:uploaded.name,logoWidth:uploaded.width,logoHeight:uploaded.height}}await api(`/api/suppliers/${supplierId}/identity`,{method:'PATCH',json:identity});supplierAssets=null;toast('Logo del proveedor actualizado');await navigate('suppliers')}});
  $('#supplierLogoFile').onchange=async()=>{const file=$('#supplierLogoFile').files?.[0];if(!file)return;const converted=await fileToJpeg(file);preview=URL.createObjectURL(converted.blob);$('#supplierLogoPreview').innerHTML=`<img src="${preview}" alt="Vista previa">`};
}

function csvCell(value){const text=String(value??'');return /[;"\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function downloadText(name,text,type='text/csv;charset=utf-8'){const blob=new Blob(['\ufeff',text],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

async function downloadCatalogTemplate(){
  await loadOperationalSources(true);const headers=['Local','CentroCosto','Producto','Categoria','Marca','Variante','Contenido','UnidadContenido','UnidadBase','CodigoBarras','Proveedor','RutProveedor','CodigoProveedor','Formato','UnidadesPorFormato','CantidadMinima','Multiplo','PrecioBrutoUnitario'];const lines=[headers.join(';')];
  for(const product of state.cache.products){for(const relation of product.suppliers||[]){const supplier=state.cache.suppliers.find(item=>item.id===relation.supplierId);const center=(product.costCenters||[])[0];lines.push([center?.locationName||'',center?.name||'Barra',product.name,product.categoryName||'Otros',product.brand||'',product.variant||'',product.contentValue||'',product.contentUnit||'ml',product.baseUnit||'unidad',product.barcode||'',relation.supplierName,supplier?.rut||'',relation.supplierSku||'',relation.orderUnit||'UNIDAD',relation.unitsPerOrderUnit||1,relation.minimumQuantity||0,relation.quantityMultiple||1,relation.lastGrossUnitPrice||0].map(csvCell).join(';'))}}
  if(lines.length===1)lines.push(['Madriguera Clubhaus','Barra','PRODUCTO EJEMPLO','Otros','','','750','ml','unidad','','PROVEEDOR EJEMPLO','','','CAJA','6','1','1','0'].map(csvCell).join(';'));
  downloadText('plantilla-catalogo-pedidos-pro.csv',lines.join('\n'));
}

function parseCsv(text){
  const first=String(text).split(/\r?\n/,1)[0]||'';const delimiter=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';const matrix=[];let row=[],cell='',quoted=false;
  for(let index=0;index<text.length;index++){const char=text[index];if(quoted){if(char==='"'&&text[index+1]==='"'){cell+='"';index++}else if(char==='"')quoted=false;else cell+=char}else if(char==='"')quoted=true;else if(char===delimiter){row.push(cell);cell=''}else if(char==='\n'){row.push(cell.replace(/\r$/,''));matrix.push(row);row=[];cell=''}else cell+=char}if(cell||row.length){row.push(cell.replace(/\r$/,''));matrix.push(row)}
  const header=(matrix.shift()||[]).map(value=>String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase());const aliases={local:'location',centrocosto:'costCenter',producto:'product',categoria:'category',marca:'brand',variante:'variant',contenido:'contentValue',unidadcontenido:'contentUnit',unidadbase:'baseUnit',codigobarras:'barcode',proveedor:'supplier',rutproveedor:'supplierRut',codigoproveedor:'supplierSku',formato:'orderUnit',unidadesporformato:'unitsPerOrderUnit',cantidadminima:'minimumQuantity',multiplo:'quantityMultiple',preciobrutounitario:'lastGrossUnitPrice'};
  return matrix.filter(values=>values.some(value=>String(value).trim())).map(values=>Object.fromEntries(header.map((key,index)=>[aliases[key]||key,String(values[index]??'').trim()])));
}

function openCatalogImport(){
  openModal({eyebrow:'IMPORTACIÓN MASIVA',title:'Importar catálogo y proveedores',subtitle:'Usa la plantilla de Pedidos Pro. Puedes complementar la base o reemplazar la configuración activa sin borrar el historial de pedidos y facturas.',size:'large',body:`<div class="stack"><section class="security-note"><strong>Antes de importar</strong><p>“Reemplazar” desactiva la base operativa anterior y activa solo lo presente en la plantilla. El historial legal y los PDF no se eliminan.</p></section><label class="field"><span>Plantilla CSV</span><input id="catalogImportFile" type="file" accept=".csv,text/csv" required></label><div class="check-grid"><label class="check-card"><input type="radio" name="importMode" value="merge" checked><span><strong>Complementar lo que falta</strong><small>Conserva lo existente y agrega filas nuevas</small></span></label><label class="check-card"><input type="radio" name="importMode" value="replace"><span><strong>Reemplazar base activa</strong><small>Deja activa únicamente la información importada</small></span></label></div><div id="importPreview" class="auth-note">Selecciona un archivo para revisar la cantidad de filas.</div></div>`,submitLabel:'Importar plantilla',onSubmit:async form=>{const file=$('#catalogImportFile').files?.[0];if(!file)throw new Error('Selecciona la plantilla CSV');const rows=parseCsv(await file.text());if(!rows.length)throw new Error('La plantilla no contiene filas');const mode=String(form.get('importMode')||'merge');if(mode==='replace'&&!confirm('Se reemplazará la base operativa activa. El historial se conservará. ¿Continuar?'))throw new Error('Importación cancelada');const response=await api('/api/catalog/import',{method:'POST',json:{mode,rows}});toast(`${response.result.productCount} productos y ${response.result.supplierCount} proveedores importados`);state.cache.products=[];state.cache.suppliers=[];state.cache.costCenters=[];await navigate('catalog')}});
  $('#catalogImportFile').onchange=async()=>{const file=$('#catalogImportFile').files?.[0];if(!file)return;try{const rows=parseCsv(await file.text());$('#importPreview').textContent=`${rows.length} filas detectadas. Revisa el modo antes de importar.`}catch(error){$('#importPreview').textContent=error.message}};
}

function filtersQuery(){const values={months:$('#analyticsMonths')?.value||6,locationId:$('#analyticsLocation')?.value||'',costCenterId:$('#analyticsCenter')?.value||'',supplierId:$('#analyticsSupplier')?.value||''};return new URLSearchParams(values).toString()}
function analyticsMetrics(data){return `<div class="analytics-grid"><article class="analytics-card"><span>Gasto facturado</span><strong>${money(data.metrics.spend)}</strong><small>${data.metrics.invoiceCount} facturas</small></article><article class="analytics-card"><span>Pedidos</span><strong>${data.metrics.orders}</strong><small>${Math.round(data.metrics.completionRate*100)}% completado</small></article><article class="analytics-card"><span>Pendientes</span><strong>${data.metrics.pending}</strong><small>${Math.round(data.metrics.pendingRate*100)}% del período</small></article><article class="analytics-card"><span>Promedio factura</span><strong>${money(data.descriptive.mean)}</strong><small>Mediana ${money(data.descriptive.median)}</small></article></div>`}
function recommendationHtml(items){return `<div class="recommendations">${(items||[]).map(item=>`<article class="recommendation ${esc(item.priority||'low')}"><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p>${item.action?`<small>Acción: ${esc(item.action)}</small>`:''}</article>`).join('')}</div>`}
function renderAnalytics(data){
  const maxSpend=Math.max(1,...data.monthly.map(item=>item.spend||item.estimatedSpend||0));const maxSupplier=Math.max(1,...data.topSuppliers.map(item=>item.spend||0));
  $('#analyticsBody').innerHTML=`${analyticsMetrics(data)}<div class="analytics-columns"><section class="panel"><div class="panel-head"><div><h3>Evolución mensual</h3><small>Facturado; si falta factura, se conserva la estimación del pedido</small></div></div><div class="analytics-bars">${data.monthly.map(item=>{const value=item.spend||item.estimatedSpend||0;return `<div class="analytics-bar"><span>${esc(item.month)}</span><div class="analytics-track"><i style="width:${Math.max(2,value/maxSpend*100)}%"></i></div><strong>${money(value)}</strong></div>`}).join('')}</div></section><section class="panel"><div class="panel-head"><div><h3>Estadística descriptiva</h3><small>${data.descriptive.count} documentos válidos</small></div></div><div class="entity-meta"><div><span>Mínimo</span><strong>${money(data.descriptive.minimum)}</strong></div><div><span>Máximo</span><strong>${money(data.descriptive.maximum)}</strong></div><div><span>Desv. estándar</span><strong>${money(data.descriptive.standardDeviation)}</strong></div><div><span>Sin precio</span><strong>${data.dataQuality.productsWithoutPrice}</strong></div></div></section></div><div class="analytics-columns"><section class="panel"><div class="panel-head"><div><h3>Principales proveedores</h3><small>Participación del gasto</small></div></div><div class="analytics-bars">${data.topSuppliers.map(item=>`<div class="analytics-bar"><span>${esc(item.name)}</span><div class="analytics-track"><i style="width:${Math.max(2,item.spend/maxSupplier*100)}%"></i></div><strong>${money(item.spend)}</strong></div>`).join('')||'<div class="empty-state compact-empty">Sin datos</div>'}</div></section><section class="panel"><div class="panel-head"><div><h3>Recomendaciones automáticas</h3><small>Basadas en estadística y calidad de datos</small></div></div>${recommendationHtml(data.recommendations)}</section></div><section class="panel"><div class="panel-head"><div><h3>Recomendaciones con Gemini</h3><small id="aiInsightModel">Presiona el botón para generar análisis contextual</small></div><button class="btn primary" id="generateAiInsights">Generar con IA</button></div><div id="aiInsightBody"><div class="auth-note">Gemini analizará los filtros y métricas actuales, sin inventar datos.</div></div></section>`;
  $('#generateAiInsights').onclick=generateAiInsights;
}
async function loadAnalytics(){if(!$('#analyticsBody'))return;$('#analyticsBody').innerHTML='<div class="analytics-loading">Calculando métricas…</div>';try{const payload=await api(`/api/dashboard/analytics?${filtersQuery()}`);renderAnalytics(payload.analytics)}catch(error){$('#analyticsBody').innerHTML=`<div class="empty-state"><p>${esc(error.message)}</p></div>`}}
async function generateAiInsights(){const button=$('#generateAiInsights');button.disabled=true;button.textContent='Analizando…';try{const payload=await api(`/api/dashboard/insights?${filtersQuery()}`,{method:'POST'});$('#aiInsightModel').textContent=`Modelo ${payload.ai.model}`;$('#aiInsightBody').innerHTML=`<p>${esc(payload.ai.summary||'')}</p>${recommendationHtml(payload.ai.recommendations)}`}catch(error){$('#aiInsightBody').innerHTML=`<div class="recommendation high"><strong>No se pudo generar el análisis IA</strong><p>${esc(error.message)}</p></div>`}finally{button.disabled=false;button.textContent='Generar con IA'}}

async function enhanceDashboard(){
  if(state.view!=='dashboard'||$('#masterDashboard'))return;await loadOperationalSources();const recent=$('#mainContent .table-card');const section=document.createElement('section');section.id='masterDashboard';section.className='dashboard-master panel';section.innerHTML=`<div class="panel-head"><div><h3>Tablero máster de compras</h3><small>Filtros dinámicos, tendencias, estadística descriptiva y recomendaciones IA</small></div></div><div class="analytics-filters"><label class="field"><span>Período</span><select id="analyticsMonths"><option value="3">3 meses</option><option value="6" selected>6 meses</option><option value="12">12 meses</option><option value="24">24 meses</option></select></label><label class="field"><span>Local</span><select id="analyticsLocation"><option value="">Todos</option>${state.cache.locations.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Centro</span><select id="analyticsCenter"><option value="">Todos</option>${state.cache.costCenters.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Proveedor</span><select id="analyticsSupplier"><option value="">Todos</option>${state.cache.suppliers.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><button class="btn" id="applyAnalytics">Aplicar filtros</button></div><div id="analyticsBody"></div>`;recent?.before(section);$('#applyAnalytics').onclick=loadAnalytics;$('#analyticsLocation').onchange=()=>{const location=$('#analyticsLocation').value;$('#analyticsCenter').innerHTML=`<option value="">Todos</option>${state.cache.costCenters.filter(item=>!location||item.locationId===location).map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}`};loadAnalytics();
}

async function enhanceSuppliers(){
  if(state.view!=='suppliers')return;await hydrateSupplierLogos();const cards=$$('#supplierGrid .supplier-card');for(const card of cards){const name=card.querySelector('h3')?.textContent?.trim();const supplier=state.cache.suppliers.find(item=>item.name===name);if(!supplier||card.dataset.enhancedLogo)return;card.dataset.enhancedLogo='1';const asset=assetForSupplier(supplier.id);const logo=card.querySelector('.entity-logo');if(asset?.url)logo.outerHTML=`<img class="supplier-logo-image" src="${asset.url}" alt="Logo ${esc(supplier.name)}">`;card.insertAdjacentHTML('beforeend',`<div class="supplier-actions"><button class="btn small" data-supplier-logo="${esc(supplier.id)}">Cargar o cambiar logo</button></div>`)}
}

function enhanceCatalog(){
  if(state.view!=='catalog'||$('#catalogBulkActions'))return;const actions=$('#mainContent .view-header .view-actions');if(!actions)return;const holder=document.createElement('div');holder.id='catalogBulkActions';holder.className='view-actions';holder.innerHTML='<button class="btn" data-download-template>Descargar plantilla</button><button class="btn" data-import-catalog>Importar masivamente</button>';actions.prepend(holder);
}

function enhanceTeam(){
  if(state.view!=='team'||!state.cache.users?.length)return;for(const row of $$('#mainContent tbody tr')){const email=row.querySelector('[data-label="Usuario"] small')?.textContent?.trim();const user=state.cache.users.find(item=>item.email===email);if(!user)continue;const cell=row.querySelector('[data-label="Usuario"]');if(user.profile?.jobTitle&&!cell.querySelector('.profile-title'))cell.querySelector('strong')?.insertAdjacentHTML('afterend',`<span class="profile-title">${esc(user.profile.jobTitle)}</span>`);const actions=row.querySelector('[data-label="Acciones"] .row-actions');if(!actions)continue;if(!actions.querySelector('[data-user-profile]'))actions.insertAdjacentHTML('afterbegin',`<button class="btn small" data-user-profile="${esc(user.id)}">Datos personales</button>`);if(user.role==='owner'){actions.querySelector('[data-toggle-user]')?.remove();if(user.id!==state.me.user.id)actions.querySelector('[data-reset-password]')?.remove();if(!actions.querySelector('.protected-owner'))actions.insertAdjacentHTML('beforeend','<span class="protected-owner">Propietario protegido</span>')}}
}

function enhanceSettings(){
  if(state.view!=='settings'||$('#settingsSeparation'))return;const header=$('#mainContent .view-header');if(!header)return;const section=document.createElement('section');section.id='settingsSeparation';section.className='settings-separation';section.innerHTML=`<article class="settings-purpose"><h3>Datos personales</h3><p>Nombre, cargo, teléfono y firma del usuario que emite pedidos. No modifica la empresa.</p><button class="btn" data-user-profile="${esc(state.me.user.id)}">Editar mi perfil personal</button></article><article class="settings-purpose"><h3>Empresa, local y documentos</h3><p>Razón social, RUT, direcciones, logo corporativo, colores y formato de los PDF.</p><button class="btn primary" data-branding-settings>Editar empresa y diseño PDF</button></article>`;header.after(section);
}

async function enhanceInvoices(){
  if(state.view!=='invoices'||$('#invoiceAiBanner'))return;const header=$('#mainContent .view-header');if(!header)return;const banner=document.createElement('section');banner.id='invoiceAiBanner';banner.className='invoice-ai-banner';banner.innerHTML='<b>IA</b><div><strong>Motor de cotejo Gemini conectado</strong><small>Lee PDF o imagen, detecta cajas y unidades, calcula precio final y compara contra pedido o catálogo.</small></div><button class="btn primary" data-action="analyze-invoice">Analizar factura ahora</button>';header.after(banner);
}

function enhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{enhanceDashboard().catch(console.warn);enhanceSuppliers().catch(console.warn);enhanceCatalog();enhanceTeam();enhanceSettings();enhanceInvoices().catch(console.warn)},35)}

function intercept(event){
  const target=event.target.closest('button,[data-action]');if(!target)return;const isOrder=target.id==='mobileCreate'||target.dataset.action==='new-order'||(target.id==='primaryAction'&&['dashboard','orders'].includes(state.view));const isUser=target.dataset.action==='new-user'||(target.id==='primaryAction'&&state.view==='team');
  if(isOrder||isUser){event.preventDefault();event.stopImmediatePropagation();(isOrder?openMasterOrder():openStableUser()).catch(error=>toast(error.message,'error'));return}
  if(target.dataset.supplierLogo){event.preventDefault();openSupplierLogo(target.dataset.supplierLogo).catch(error=>toast(error.message,'error'));return}
  if(target.hasAttribute('data-download-template')){event.preventDefault();downloadCatalogTemplate().catch(error=>toast(error.message,'error'));return}
  if(target.hasAttribute('data-import-catalog')){event.preventDefault();openCatalogImport();return}
}

export function initializeStabilityPass(){
  if(initialized)return;initialized=true;injectStyles();document.addEventListener('click',intercept,true);new MutationObserver(enhance).observe($('#appShell')||document.body,{subtree:true,childList:true});enhance();
}
