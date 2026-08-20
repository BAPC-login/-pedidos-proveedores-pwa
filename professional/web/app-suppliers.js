import {$,$$,esc,state,api,toast,initials} from './app-core.js';
import {openModal} from './app-modal.js';
import {hydrateProtectedImages,protectedAssetUrl} from './app-assets-v13.js';

let busy=false;
const canManage=()=>['owner','admin','purchaser'].includes(String(state.me?.user?.role||''));
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function injectStyles(){
  if($('#supplierWorkspaceV94Styles'))return;
  const style=document.createElement('style');
  style.id='supplierWorkspaceV94Styles';
  style.textContent=`
    .supplier-v94{display:grid;gap:14px}.supplier-v94-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
    .supplier-v94-card{display:grid;gap:12px;padding:15px;border:1px solid var(--line);border-radius:16px;background:var(--card);min-width:0}
    .supplier-v94-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.supplier-v94-logo{width:54px;height:54px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--soft);font-size:13px;font-weight:900}
    .supplier-v94-logo img{width:100%;height:100%;object-fit:contain;background:#fff}.supplier-v94-copy{min-width:0}.supplier-v94-copy h3{margin:0;font-size:13px;overflow-wrap:anywhere}.supplier-v94-copy p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.45;overflow-wrap:anywhere}
    .supplier-v94-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.supplier-v94-meta div{padding:9px;border-radius:11px;background:var(--soft)}.supplier-v94-meta span,.supplier-v94-meta strong{display:block}.supplier-v94-meta span{color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.06em}.supplier-v94-meta strong{margin-top:4px;font-size:9px;overflow-wrap:anywhere}
    .supplier-v94-actions{display:flex;gap:7px;flex-wrap:wrap}.supplier-profile-stack{display:grid;gap:13px}.supplier-profile-section{padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.supplier-profile-section h3{margin:0 0 4px;font-size:12px}.supplier-profile-section>p{margin:0 0 12px;color:var(--muted);font-size:8px;line-height:1.45}
    .supplier-logo-editor-v94{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;align-items:center}.supplier-logo-preview-v94{height:120px;display:grid;place-items:center;overflow:hidden;border:1px dashed var(--line);border-radius:13px;background:var(--soft)}.supplier-logo-preview-v94 img{max-width:92%;max-height:105px;object-fit:contain;background:#fff;border-radius:8px}.supplier-logo-preview-v94 b{font-size:22px}
    .supplier-linked-products{display:grid;gap:6px;max-height:180px;overflow:auto}.supplier-linked-product{display:flex;justify-content:space-between;gap:10px;padding:8px 9px;border-radius:9px;background:var(--soft);font-size:8px}.supplier-linked-product strong{font-size:9px}.supplier-linked-product span{color:var(--muted);text-align:right}
    .supplier-term-hint{margin-top:7px;color:var(--muted);font-size:8px;line-height:1.45}
    @media(max-width:980px){.supplier-v94-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:650px){.supplier-v94-grid{grid-template-columns:1fr}.supplier-logo-editor-v94{grid-template-columns:1fr}.supplier-logo-preview-v94{height:105px}.supplier-v94-meta{grid-template-columns:1fr 1fr}}
  `;
  document.head.append(style);
}

function setActive(){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)==='suppliers'));
  $('#pageEyebrow').textContent='ABASTECIMIENTO';$('#pageTitle').textContent='Proveedores';$('#primaryAction')?.classList.add('hidden');
}

function imageToJpeg(file){
  return new Promise((resolve,reject)=>{
    const source=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{try{const limit=1400,scale=Math.min(1,limit/Math.max(image.naturalWidth||1,image.naturalHeight||1)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);canvas.toBlob(blob=>{URL.revokeObjectURL(source);if(!blob)return reject(new Error('No se pudo procesar el logo'));resolve({blob,width,height})},'image/jpeg',.92)}catch(error){URL.revokeObjectURL(source);reject(error)}};
    image.onerror=()=>{URL.revokeObjectURL(source);reject(new Error('Usa una imagen JPG, PNG o WebP'))};image.src=source;
  });
}

async function uploadSupplierLogo(file){
  if(!file||!file.size)throw new Error('Selecciona un logo');
  if(file.size>8*1024*1024)throw new Error('El logo supera 8 MB');
  const converted=await imageToJpeg(file),form=new FormData();
  form.append('file',converted.blob,`${String(file.name||'logo').replace(/\.[^.]+$/,'')}.jpg`);
  const response=await fetch('/api/files?purpose=supplier-logo',{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form}),payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo cargar el logo');
  return {...payload.file,width:converted.width,height:converted.height};
}

function assetFor(data,supplierId){return (data.assets||[]).find(item=>String(item.supplierId)===String(supplierId))||{}}
function linkedProducts(data,supplierId){return (data.products||[]).filter(product=>(product.suppliers||[]).some(link=>String(link.supplierId)===String(supplierId)))}
function paymentSummary(supplier){return String(supplier.paymentTerms||'').trim()||'Condición no configurada'}
function supplierLogo(supplier,asset={}){return `<span class="supplier-v94-logo" data-logo-shell>${asset.logoKey?`<img data-protected-key="${esc(asset.logoKey)}" alt="Logo ${esc(supplier.name)}">`:`<b>${esc(initials(supplier.name))}</b>`}</span>`}
function supplierCard(supplier,data){
  const asset=assetFor(data,supplier.id),lastInvoice=supplier.lastInvoiceDate?new Date(`${String(supplier.lastInvoiceDate).slice(0,10)}T12:00:00`).toLocaleDateString('es-CL'):'Sin facturas';
  return `<article class="supplier-v94-card" data-supplier-card="${esc(supplier.id)}">
    <div class="supplier-v94-head">${supplierLogo(supplier,asset)}<span class="status ${supplier.active?'active':'inactive'}">${supplier.active?'Activo':'Inactivo'}</span></div>
    <div class="supplier-v94-copy"><h3>${esc(supplier.name)}</h3><p>${esc(supplier.legalName||supplier.contactName||supplier.email||supplier.rut||'Completa el perfil comercial del proveedor')}</p></div>
    <div class="supplier-v94-meta"><div><span>Productos</span><strong>${Number(supplier.productCount||0)}</strong></div><div><span>Entrega</span><strong>${Number(supplier.leadDays||0)} días</strong></div><div><span>Pago pactado</span><strong>${esc(paymentSummary(supplier))}</strong></div><div><span>Última factura</span><strong>${esc(lastInvoice)}</strong></div></div>
    <div class="supplier-v94-actions"><button class="btn small primary" type="button" data-supplier-profile="${esc(supplier.id)}">${canManage()?'Editar perfil':'Ver perfil'}</button>${canManage()?`<button class="btn small danger" type="button" data-supplier-delete-v94="${esc(supplier.id)}">Papelera</button>`:''}</div>
  </article>`;
}
function cards(suppliers,data){return suppliers.length?suppliers.map(supplier=>supplierCard(supplier,data)).join(''):'<div class="panel empty-state"><h3>Sin proveedores</h3><p>Crea el primero para comenzar a configurar abastecimiento, pagos e identidad.</p></div>'}

async function loadWorkspace(){
  const [suppliersPayload,assetsPayload,productsPayload]=await Promise.all([api('/api/suppliers?active=all',{fresh:true}),api('/api/supplier-assets',{fresh:true}),api('/api/products',{fresh:true})]);
  const data={suppliers:suppliersPayload.suppliers||[],assets:assetsPayload.assets||[],products:productsPayload.products||[]};
  Object.assign(state.cache,{suppliers:data.suppliers,supplierAssets:data.assets,products:data.products});return data;
}
async function readTerms(supplier){
  if(!supplier?.id)return{type:'delivery',days:0,day:1,anchor:'reception',label:'Contra entrega'};
  try{return (await api(`/api/suppliers/${encodeURIComponent(supplier.id)}/payment-terms`,{fresh:true})).paymentTerms||{type:'delivery',days:0,day:1,anchor:'reception'}}catch{return{type:'delivery',days:0,day:1,anchor:'reception',label:paymentSummary(supplier)}}
}
function termTypeOptions(selected){return [['delivery','Contra entrega'],['days','Crédito a días'],['fixed_day','Pago en día fijo del mes'],['prepaid','Prepago']].map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
function anchorOptions(selected){return [['reception','Fecha de recepción'],['invoice','Fecha de factura'],['delivery','Fecha de entrega']].map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
function linkedProductRows(products){return products.length?products.map(product=>{const link=(product.suppliers||[])[0]||{};const supplierLink=(product.suppliers||[]).find(item=>String(item.supplierId)===String(link.supplierId))||link;return `<div class="supplier-linked-product"><strong>${esc(product.name)}</strong><span>${esc(supplierLink.orderUnit||'Formato configurado')}${Number(supplierLink.unitsPerOrderUnit||1)>1?` · ${Number(supplierLink.unitsPerOrderUnit)} un.`:''}</span></div>`}).join(''):'<div class="empty-state compact-empty">Aún no hay productos vinculados a este proveedor.</div>'}

async function openSupplierProfile(supplier,data){
  if(!supplier&&!canManage())return toast('Tu rol no puede crear proveedores','error');
  const existing=Boolean(supplier?.id),asset=existing?assetFor(data,supplier.id):{},terms=await readTerms(supplier),products=existing?linkedProducts(data,supplier.id):[];
  let pendingLogo=null,preview=asset.logoKey?await protectedAssetUrl(asset.logoKey):'',removeLogo=false;
  openModal({eyebrow:'PROVEEDOR',title:existing?supplier.name:'Nuevo proveedor',subtitle:'Datos comerciales, abastecimiento, pago pactado, identidad visual y productos en un solo perfil.',size:'large',body:`<div class="supplier-profile-stack">
    <section class="supplier-profile-section"><h3>Datos generales</h3><p>Identificación y contacto del proveedor.</p><div class="form-grid">
      <label class="field full"><span>Nombre comercial</span><input name="name" value="${esc(supplier?.name||'')}" required></label><label class="field full"><span>Razón social</span><input name="legalName" value="${esc(supplier?.legalName||'')}"></label>
      <label class="field"><span>RUT</span><input name="rut" value="${esc(supplier?.rut||'')}"></label><label class="field"><span>Contacto</span><input name="contactName" value="${esc(supplier?.contactName||'')}"></label>
      <label class="field"><span>Correo</span><input name="email" type="email" value="${esc(supplier?.email||'')}"></label><label class="field"><span>Teléfono</span><input name="phone" type="tel" value="${esc(supplier?.phone||'')}"></label>
    </div></section>
    <section class="supplier-profile-section"><h3>Condiciones de abastecimiento</h3><p>Parámetros usados al planificar y emitir pedidos.</p><div class="form-grid">
      <label class="field"><span>Plazo de entrega</span><div class="input-suffix"><input name="leadDays" type="number" min="0" max="365" value="${Number(supplier?.leadDays||0)}" inputmode="numeric"><span>días</span></div></label>
      <label class="field"><span>Hora de corte</span><input name="cutoffTime" type="time" value="${esc(supplier?.cutoffTime||'')}"></label>
      <label class="field full"><span>Pedido mínimo</span><input name="minimumOrder" type="number" min="0" value="${Number(supplier?.minimumOrder||0)}" inputmode="numeric"></label>
    </div></section>
    <section class="supplier-profile-section"><h3>Pago pactado</h3><p>La condición queda asociada al proveedor y calcula vencimientos de sus facturas.</p><div class="form-grid">
      <label class="field full"><span>Tipo de pago pactado</span><select id="supplierTermType" name="paymentTermType">${termTypeOptions(terms.type||'delivery')}</select></label>
      <label class="field" id="supplierTermDaysField"><span>Días de crédito</span><input name="paymentTermDays" type="number" min="0" max="365" value="${Number(terms.days||0)}"></label>
      <label class="field" id="supplierPaymentDayField"><span>Día fijo del mes</span><input name="paymentDay" type="number" min="1" max="28" value="${Number(terms.day||1)||1}"></label>
      <label class="field full" id="supplierTermAnchorField"><span>Contar desde</span><select name="paymentTermAnchor">${anchorOptions(terms.anchor||'reception')}</select></label>
    </div><div class="supplier-term-hint">Contra entrega y prepago no agregan días. Para crédito o día fijo, Nuvasto usa la fecha base seleccionada para programar el vencimiento.</div></section>
    <section class="supplier-profile-section"><h3>Identidad visual</h3><p>El logo se muestra en Proveedores y documentos donde corresponda.</p><div class="supplier-logo-editor-v94"><div class="supplier-logo-preview-v94" id="supplierProfileLogoPreview">${preview?`<img src="${preview}" alt="Logo ${esc(supplier?.name||'proveedor')}">`:`<b>${esc(initials(supplier?.name||'Proveedor'))}</b>`}</div><div class="stack"><label class="field"><span>Logo</span><input id="supplierProfileLogoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="field"><span>Tamaño en PDF</span><input name="logoSize" type="range" min="24" max="96" value="${Number(asset.logoSize||44)}"></label><button class="btn danger" id="supplierProfileRemoveLogo" type="button">Quitar logo</button></div></div></section>
    <section class="supplier-profile-section"><h3>Productos vinculados</h3><p>${existing?`${products.length} producto${products.length===1?'':'s'} relacionado${products.length===1?'':'s'} con este proveedor.`:'Guarda el proveedor y luego vincula productos desde Catálogo.'}</p><div class="supplier-linked-products">${linkedProductRows(products)}</div></section>
  </div>`,submitLabel:canManage()?(existing?'Guardar proveedor':'Crear proveedor'):'Cerrar',hideSubmit:!canManage(),onSubmit:async form=>{
    const body={name:form.get('name'),legalName:form.get('legalName'),rut:form.get('rut'),contactName:form.get('contactName'),email:form.get('email'),phone:form.get('phone'),leadDays:Number(form.get('leadDays')||0),cutoffTime:form.get('cutoffTime'),minimumOrder:Number(form.get('minimumOrder')||0)};
    let supplierId=supplier?.id||'';
    if(existing)await api(`/api/suppliers/${encodeURIComponent(supplierId)}`,{method:'PATCH',json:body});
    else{const created=await api('/api/suppliers',{method:'POST',json:body});supplierId=created.supplier?.id||created.id||'';if(!supplierId)throw new Error('No se pudo identificar el proveedor creado')}
    await api(`/api/suppliers/${encodeURIComponent(supplierId)}/payment-terms`,{method:'PATCH',json:{type:form.get('paymentTermType'),days:Number(form.get('paymentTermDays')||0),day:Number(form.get('paymentDay')||1),anchor:form.get('paymentTermAnchor')}});
    if(pendingLogo||removeLogo){let logo={logoKey:removeLogo?'':asset.logoKey||'',logoName:removeLogo?'':asset.logoName||'',logoWidth:removeLogo?0:Number(asset.logoWidth||0),logoHeight:removeLogo?0:Number(asset.logoHeight||0),logoSize:Number(form.get('logoSize')||44)};if(pendingLogo){const uploaded=await uploadSupplierLogo(pendingLogo);logo={logoKey:uploaded.key,logoName:uploaded.name,logoWidth:uploaded.width,logoHeight:uploaded.height,logoSize:Number(form.get('logoSize')||44)}}await api(`/api/suppliers/${encodeURIComponent(supplierId)}/identity`,{method:'PATCH',json:logo})}
    toast(existing?'Proveedor actualizado':'Proveedor creado');await renderSuppliersWorkspaceV94();
  }});
  const syncPaymentFields=()=>{const type=$('#supplierTermType')?.value||'delivery';$('#supplierTermDaysField')?.classList.toggle('hidden',type!=='days');$('#supplierPaymentDayField')?.classList.toggle('hidden',type!=='fixed_day');$('#supplierTermAnchorField')?.classList.toggle('hidden',!['days','fixed_day'].includes(type))};
  $('#supplierTermType')?.addEventListener('change',syncPaymentFields);syncPaymentFields();
  $('#supplierProfileLogoFile')?.addEventListener('change',async()=>{pendingLogo=$('#supplierProfileLogoFile').files?.[0]||null;if(!pendingLogo)return;removeLogo=false;try{const converted=await imageToJpeg(pendingLogo);preview=URL.createObjectURL(converted.blob);$('#supplierProfileLogoPreview').innerHTML=`<img src="${preview}" alt="Vista previa del logo">`}catch(error){pendingLogo=null;toast(error.message,'error')}});
  $('#supplierProfileRemoveLogo')?.addEventListener('click',()=>{removeLogo=true;pendingLogo=null;if($('#supplierProfileLogoFile'))$('#supplierProfileLogoFile').value='';$('#supplierProfileLogoPreview').innerHTML=`<b>${esc(initials(supplier?.name||'Proveedor'))}</b>`});
}

function bindCards(data){
  $$('[data-supplier-profile]').forEach(button=>button.onclick=()=>openSupplierProfile(data.suppliers.find(item=>String(item.id)===String(button.dataset.supplierProfile)),data).catch(error=>toast(error.message,'error')));
  $$('[data-supplier-delete-v94]').forEach(button=>button.onclick=async()=>{const supplier=data.suppliers.find(item=>String(item.id)===String(button.dataset.supplierDeleteV94));if(!supplier||!confirm(`¿Enviar “${supplier.name}” a la papelera?`))return;try{await api(`/api/suppliers/${encodeURIComponent(supplier.id)}`,{method:'DELETE'});toast('Proveedor enviado a la papelera');await renderSuppliersWorkspaceV94()}catch(error){toast(error.message,'error')}});
  hydrateProtectedImages($('#supplierV94Grid')||document).catch(()=>{});
}

export async function renderSuppliersWorkspaceV94(){
  if(busy)return;busy=true;injectStyles();state.view='suppliers';state.subview='';setActive();
  try{
    const data=await loadWorkspace();
    $('#mainContent').innerHTML=`<div class="supplier-v94"><div class="view-header"><div><span class="eyebrow">ABASTECIMIENTO</span><h2>Proveedores</h2><p>Cada proveedor concentra sus datos, condiciones de compra, pago pactado, logo y productos relacionados.</p></div>${canManage()?'<button class="btn primary" id="newSupplierV94" type="button">＋ Nuevo proveedor</button>':''}</div><div class="toolbar"><label class="field toolbar-search"><span>Buscar</span><input id="supplierSearchV94" placeholder="Nombre, RUT, contacto o condición de pago"></label></div><section class="supplier-v94-grid" id="supplierV94Grid">${cards(data.suppliers.filter(item=>item.active!==false),data)}</section></div>`;
    $('#newSupplierV94')?.addEventListener('click',()=>openSupplierProfile(null,data).catch(error=>toast(error.message,'error')));
    $('#supplierSearchV94')?.addEventListener('input',()=>{const query=normalize($('#supplierSearchV94').value),list=data.suppliers.filter(item=>item.active!==false&&(!query||normalize(`${item.name} ${item.legalName||''} ${item.rut||''} ${item.contactName||''} ${item.email||''} ${item.paymentTerms||''}`).includes(query)));$('#supplierV94Grid').innerHTML=cards(list,data);bindCards(data)});
    bindCards(data);
  }catch(error){$('#mainContent').innerHTML=`<section class="panel"><div class="empty-state"><h3>No se pudo cargar Proveedores</h3><p>${esc(error.message)}</p><button class="btn" id="retrySuppliersV94">Reintentar</button></div></section>`;$('#retrySuppliersV94')?.addEventListener('click',()=>renderSuppliersWorkspaceV94())}
  finally{busy=false}
}
