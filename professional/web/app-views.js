import {$,$$,esc,money,date,state,api,isAdmin,initials,roleNames} from './app-core.js';
import {bindDynamic} from './app-actions.js';

const viewMeta={
  dashboard:['OPERACIÓN','Resumen'],
  orders:['COMPRAS','Pedidos'],
  invoices:['DOCUMENTOS','Facturas'],
  catalog:['DATOS','Catálogo'],
  suppliers:['ABASTECIMIENTO','Proveedores'],
  team:['SEGURIDAD','Usuarios'],
  audit:['CONTROL','Auditoría'],
  settings:['ADMINISTRACIÓN','Configuración']
};

async function navigate(view){
  if(['team','audit'].includes(view)&&!isAdmin())return;
  state.view=view;
  $$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  const [eyebrow,title]=viewMeta[view]||viewMeta.dashboard;
  $('#pageEyebrow').textContent=eyebrow;
  $('#pageTitle').textContent=title;
  const action=$('#primaryAction');
  action.classList.toggle('hidden',!['dashboard','orders','invoices','catalog','suppliers','team'].includes(view));
  action.innerHTML=view==='invoices'
    ?'<span>⌁</span><span>Analizar factura</span>'
    :view==='catalog'
      ?'<span>＋</span><span>Nuevo producto</span>'
      :view==='suppliers'
        ?'<span>＋</span><span>Nuevo proveedor</span>'
        :view==='team'
          ?'<span>＋</span><span>Nuevo usuario</span>'
          :'<span>＋</span><span>Nuevo pedido</span>';
  $('#mainContent').innerHTML='<div class="panel"><div class="empty-state compact-empty">Cargando información…</div></div>';
  try{
    if(view==='dashboard')await renderDashboard();
    if(view==='orders')await renderOrders();
    if(view==='invoices')await renderInvoices();
    if(view==='catalog')await renderCatalog();
    if(view==='suppliers')await renderSuppliers();
    if(view==='team')await renderTeam();
    if(view==='audit')await renderAudit();
    if(view==='settings')await renderSettings();
  }catch(error){
    renderError(error);
  }
  $('#mainContent').focus({preventScroll:true});
}

function renderError(error){
  $('#mainContent').innerHTML=`<div class="panel"><div class="empty-state">
    <h3>No se pudo cargar esta sección</h3><p>${esc(error.message)}</p>
    <button class="btn" id="retryView">Reintentar</button>
  </div></div>`;
  $('#retryView')?.addEventListener('click',()=>navigate(state.view));
}

function metric(label,value,note,accent=''){
  return `<article class="metric-card ${accent}"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`;
}

const statusLabel=value=>({
  draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',
  sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',
  received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'
}[value]||value);

function ordersTable(orders){
  if(!orders?.length)return `<div class="empty-state">
    <h3>Aún no hay pedidos</h3><p>La base está lista. Selecciona un proveedor y agrega cantidades.</p>
    <button class="btn primary" data-action="new-order">＋ Crear primer pedido</button>
  </div>`;
  return `<div class="responsive-table"><table class="data-table">
    <thead><tr><th>Folio</th><th>Proveedor</th><th>Local</th><th>Centro</th><th>Estado</th><th>Entrega</th><th>Total</th></tr></thead>
    <tbody>${orders.map(o=>`<tr data-order="${esc(o.id)}">
      <td data-label="Folio"><strong>${esc(o.folio)}</strong></td>
      <td data-label="Proveedor">${esc(o.supplierName)}</td>
      <td data-label="Local">${esc(o.locationName)}</td>
      <td data-label="Centro"><span class="cost-chip">${esc(o.costCenterName||'Barra')}</span></td>
      <td data-label="Estado"><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td>
      <td data-label="Entrega">${date(o.deliveryDate)}</td>
      <td data-label="Total">${money(o.grossTotal)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function renderDashboard(){
  const payload=await api('/api/dashboard');
  state.cache.dashboard=payload;
  const m=payload.metrics;
  $('#pendingCount').textContent=m.pendingOrders;
  const ready=m.products>0&&m.suppliers>0;
  $('#mainContent').innerHTML=`
    <div class="view-header compact-header">
      <div><h2>Resumen operativo</h2><p>${esc(state.me.organization.name)} · información centralizada y lista para trabajar.</p></div>
      <div class="view-actions"><button class="btn primary" data-action="new-order">＋ Pedido</button><button class="btn" data-action="analyze-invoice">⌁ Factura</button></div>
    </div>
    <section class="setup-status ${ready?'ready':'warning'}">
      <div><span class="setup-icon">${ready?'✓':'!'}</span><div><strong>${ready?'Base operativa disponible':'Configuración incompleta'}</strong>
      <p>${ready?`${m.products} productos y ${m.suppliers} proveedores cargados en la marca actual.`:'Revisa el catálogo y los proveedores antes de crear pedidos.'}</p></div></div>
      <button class="btn small" data-view-link="${ready?'catalog':'settings'}">${ready?'Ver catálogo':'Configurar'}</button>
    </section>
    <section class="metrics-grid compact-metrics">
      ${metric('Pedidos 30 días',m.orders30d,'Creados')}
      ${metric('Pendientes',m.pendingOrders,'Por gestionar')}
      ${metric('Compras 30 días',money(m.spend30d),'Facturado')}
      ${metric('Proveedores',m.suppliers,'Activos')}
      ${metric('Productos',m.products,'Catálogo')}
      ${metric('Documentos',m.archivedDocuments||0,'Archivados')}
    </section>
    <section class="table-card">
      <div class="panel-head table-head"><h3>Actividad reciente</h3><button class="btn small" data-view-link="orders">Ver todos</button></div>
      ${ordersTable(payload.recentOrders)}
    </section>`;
  bindDynamic();
}

async function renderOrders(){
  const [payload,centers,suppliers]=await Promise.all([api('/api/orders'),api('/api/cost-centers'),api('/api/suppliers')]);
  state.cache.orders=payload.orders;
  state.cache.costCenters=centers.costCenters;
  state.cache.suppliers=suppliers.suppliers;
  $('#mainContent').innerHTML=`
    <div class="view-header">
      <div><h2>Pedidos</h2><p>Un pedido corresponde a un proveedor, un local y un centro de costo.</p></div>
      <button class="btn primary" data-action="new-order">＋ Nuevo pedido</button>
    </div>
    <div class="toolbar">
      <label class="field toolbar-search"><span>Buscar</span><input id="orderSearch" placeholder="Folio, proveedor o centro"></label>
      <label class="field"><span>Centro de costo</span><select id="orderCenter"><option value="">Todos</option>${state.cache.costCenters.map(c=>`<option value="${esc(c.id)}">${esc(c.locationName)} · ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Estado</span><select id="orderStatus"><option value="">Todos</option>${['draft','requested','approved','sent','confirmed','partially_received','received','reconciled','closed','cancelled'].map(v=>`<option value="${v}">${statusLabel(v)}</option>`).join('')}</select></label>
    </div>
    <section class="table-card" id="ordersContainer">${ordersTable(payload.orders)}</section>`;
  $('#orderSearch').oninput=filterOrders;
  $('#orderStatus').onchange=filterOrders;
  $('#orderCenter').onchange=filterOrders;
  bindDynamic();
}

function filterOrders(){
  const q=$('#orderSearch').value.toLowerCase();
  const status=$('#orderStatus').value;
  const center=$('#orderCenter').value;
  const filtered=state.cache.orders.filter(o=>
    (!status||o.status===status)&&
    (!center||o.costCenterId===center)&&
    (!q||`${o.folio} ${o.supplierName} ${o.costCenterName}`.toLowerCase().includes(q))
  );
  $('#ordersContainer').innerHTML=ordersTable(filtered);
  bindDynamic();
}

async function openStoredDocument(key){
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){
    const payload=await response.json().catch(()=>({}));
    throw new Error(payload.error||'No se pudo abrir el documento');
  }
  const url=URL.createObjectURL(await response.blob());
  window.open(url,'_blank','noopener');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function bindStoredDocuments(){
  $$('[data-file-key]').forEach(button=>button.onclick=()=>openStoredDocument(button.dataset.fileKey).catch(error=>renderError(error)));
}

async function renderInvoices(){
  const [invoicePayload,supplierPayload,orderPayload]=await Promise.all([api('/api/invoices'),api('/api/suppliers'),api('/api/orders')]);
  state.cache.invoices=invoicePayload.invoices;
  state.cache.suppliers=supplierPayload.suppliers;
  state.cache.orders=orderPayload.orders;
  $('#mainContent').innerHTML=`
    <div class="view-header"><div><h2>Facturas</h2><p>Cotejo, precios finales y archivo original.</p></div><button class="btn primary" data-action="analyze-invoice">⌁ Analizar factura</button></div>
    <div class="toolbar"><label class="field toolbar-search"><span>Buscar</span><input id="invoiceSearch" placeholder="Número, proveedor o local"></label></div>
    <section class="table-card" id="invoiceContainer">${invoiceTable(invoicePayload.invoices)}</section>`;
  $('#invoiceSearch').oninput=()=>{
    const q=$('#invoiceSearch').value.toLowerCase();
    $('#invoiceContainer').innerHTML=invoiceTable(state.cache.invoices.filter(i=>`${i.invoiceNumber} ${i.supplierName} ${(i.locationNames||[]).join(' ')}`.toLowerCase().includes(q)));
    bindStoredDocuments();
  };
  bindDynamic();bindStoredDocuments();
}

function invoiceTable(invoices){
  if(!invoices?.length)return `<div class="empty-state"><h3>Aún no hay facturas</h3><p>Sube una imagen o PDF para cotejarlo con un pedido.</p><button class="btn primary" data-action="analyze-invoice">⌁ Analizar factura</button></div>`;
  return `<div class="responsive-table"><table class="data-table"><thead><tr><th>Documento</th><th>Proveedor</th><th>Local</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Archivo</th></tr></thead>
  <tbody>${invoices.map(i=>`<tr>
    <td data-label="Documento"><strong>${esc(i.invoiceNumber)}</strong></td><td data-label="Proveedor">${esc(i.supplierName)}</td>
    <td data-label="Local">${esc((i.locationNames||[]).join(', ')||'—')}</td><td data-label="Fecha">${date(i.invoiceDate)}</td>
    <td data-label="Estado"><span class="status ${esc(i.status)}">${esc(i.status)}</span></td><td data-label="Total"><strong>${money(i.grossTotal)}</strong></td>
    <td data-label="Archivo">${i.pdfKey?`<button class="btn small" data-file-key="${esc(i.pdfKey)}">Abrir</button>`:'—'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function productTable(products){
  if(!products.length)return `<div class="empty-state"><h3>Sin productos para este filtro</h3><p>Cambia el centro/proveedor o crea un nuevo producto.</p><button class="btn primary" data-action="new-product">＋ Producto</button></div>`;
  return `<div class="responsive-table"><table class="data-table">
    <thead><tr><th>Producto</th><th>Categoría</th><th>Formato</th><th>Centros</th><th>Proveedores</th><th></th></tr></thead>
    <tbody>${products.map(p=>{
      const primary=p.suppliers?.[0];
      const format=primary?`${primary.orderUnit}${Number(primary.unitsPerOrderUnit)>1?` (${primary.unitsPerOrderUnit})`:''}`:'Sin formato';
      return `<tr>
        <td data-label="Producto"><strong>${esc(p.name)}</strong><br><small>${esc([p.brand,p.variant].filter(Boolean).join(' · '))}</small></td>
        <td data-label="Categoría">${esc(p.categoryName||'Sin categoría')}</td>
        <td data-label="Formato"><span class="format-chip">${esc(format)}</span></td>
        <td data-label="Centros"><div class="chip-row">${(p.costCenters||[]).map(c=>`<span class="cost-chip">${esc(c.name)}</span>`).join('')||'—'}</div></td>
        <td data-label="Proveedores">${(p.suppliers||[]).map(s=>esc(s.supplierName)).join(', ')||'—'}</td>
        <td data-label="Acciones"><div class="row-actions"><button class="btn small" data-assign-cost-centers="${esc(p.id)}">Centros</button><button class="btn small" data-link-supplier="${esc(p.id)}">Proveedor</button></div></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

async function renderCatalog(){
  const [products,categories,suppliers,centers,locations]=await Promise.all([
    api('/api/products'),api('/api/categories'),api('/api/suppliers'),api('/api/cost-centers'),api('/api/locations')
  ]);
  state.cache.products=products.products;
  state.cache.categories=categories.categories;
  state.cache.suppliers=suppliers.suppliers;
  state.cache.costCenters=centers.costCenters;
  state.cache.locations=locations.locations;
  $('#mainContent').innerHTML=`
    <div class="view-header">
      <div><h2>Catálogo de compras</h2><p>${state.cache.products.length} productos disponibles. La base histórica está asignada a Barra.</p></div>
      <div class="view-actions"><button class="btn" data-action="new-cost-center">＋ Centro</button><button class="btn primary" data-action="new-product">＋ Producto</button></div>
    </div>
    <section class="catalog-summary">
      ${state.cache.costCenters.map(c=>`<button class="catalog-stat" data-center-filter="${esc(c.id)}"><strong>${c.productCount}</strong><span>${esc(c.name)}</span><small>${esc(c.locationName)}</small></button>`).join('')}
    </section>
    <div class="toolbar">
      <label class="field toolbar-search"><span>Buscar</span><input id="productSearch" placeholder="Producto, marca o código"></label>
      <label class="field"><span>Centro</span><select id="productCenter"><option value="">Todos los centros</option>${state.cache.costCenters.map(c=>`<option value="${esc(c.id)}">${esc(c.locationName)} · ${esc(c.name)} (${c.productCount})</option>`).join('')}</select></label>
      <label class="field"><span>Proveedor</span><select id="productSupplier"><option value="">Todos los proveedores</option>${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${s.productCount})</option>`).join('')}</select></label>
    </div>
    <section class="table-card" id="productGrid">${productTable(state.cache.products)}</section>`;
  const filter=()=>{
    const q=$('#productSearch').value.toLowerCase();
    const center=$('#productCenter').value;
    const supplier=$('#productSupplier').value;
    const list=state.cache.products.filter(p=>
      (!center||(p.costCenters||[]).some(c=>c.id===center))&&
      (!supplier||(p.suppliers||[]).some(s=>s.supplierId===supplier))&&
      (!q||`${p.name} ${p.brand} ${p.barcode} ${p.categoryName}`.toLowerCase().includes(q))
    );
    $('#productGrid').innerHTML=productTable(list);
    bindDynamic();
  };
  $('#productSearch').oninput=filter;
  $('#productCenter').onchange=filter;
  $('#productSupplier').onchange=filter;
  $$('[data-center-filter]').forEach(button=>button.onclick=()=>{$('#productCenter').value=button.dataset.centerFilter;filter()});
  bindDynamic();
}

async function renderSuppliers(){
  const payload=await api('/api/suppliers');
  state.cache.suppliers=payload.suppliers;
  $('#mainContent').innerHTML=`
    <div class="view-header"><div><h2>Proveedores</h2><p>${payload.suppliers.length} proveedores disponibles para generar pedidos.</p></div><button class="btn primary" data-action="new-supplier">＋ Nuevo proveedor</button></div>
    <div class="toolbar"><label class="field toolbar-search"><span>Buscar</span><input id="supplierSearch" placeholder="Proveedor o RUT"></label></div>
    <section class="cards-grid" id="supplierGrid">${supplierCards(payload.suppliers)}</section>`;
  $('#supplierSearch').oninput=()=>{$('#supplierGrid').innerHTML=supplierCards(state.cache.suppliers.filter(s=>`${s.name} ${s.rut}`.toLowerCase().includes($('#supplierSearch').value.toLowerCase())))};
  bindDynamic();
}

function supplierCards(suppliers){
  if(!suppliers.length)return `<div class="panel empty-state"><h3>Sin proveedores</h3><p>Crea uno para poder generar pedidos.</p><button class="btn primary" data-action="new-supplier">＋ Proveedor</button></div>`;
  return suppliers.map(s=>`<article class="entity-card supplier-card">
    <div class="entity-head"><span class="entity-logo">${esc(initials(s.name))}</span><span class="status ${s.active?'active':'inactive'}">${s.active?'Activo':'Inactivo'}</span></div>
    <h3>${esc(s.name)}</h3><p>${esc(s.contactName||s.email||s.rut||'Sin datos de contacto')}</p>
    <div class="entity-meta"><div><span>Productos</span><strong>${s.productCount}</strong></div><div><span>Entrega</span><strong>${s.leadDays||0} días</strong></div></div>
  </article>`).join('');
}

async function renderTeam(){
  const [payload,locationPayload]=await Promise.all([api('/api/users'),api('/api/locations')]);
  state.cache.users=payload.users;
  state.cache.locations=locationPayload.locations;
  const locationMap=new Map(state.cache.locations.map(location=>[location.id,location.name]));
  const scopeLabel=user=>user.role==='owner'||user.locationScope?.includes('*')
    ?'Todos los locales'
    :(user.locationScope||[]).map(id=>locationMap.get(id)||id).join(', ');
  $('#mainContent').innerHTML=`
    <div class="view-header"><div><h2>Usuarios y accesos</h2><p>Cada persona inicia sesión con su propio correo y contraseña.</p></div><button class="btn primary" data-action="new-user">＋ Nuevo usuario</button></div>
    <section class="security-note"><strong>Acceso independiente</strong><p>Al crear un usuario se define su rol y los locales visibles. La contraseña puede restablecerse en cualquier momento.</p></section>
    <section class="table-card"><div class="responsive-table"><table class="data-table">
      <thead><tr><th>Usuario</th><th>Rol</th><th>Locales</th><th>Sesiones</th><th>Estado</th><th></th></tr></thead>
      <tbody>${payload.users.map(u=>`<tr>
        <td data-label="Usuario"><strong>${esc(u.displayName)}</strong><br><small>${esc(u.email)}</small></td>
        <td data-label="Rol">${esc(roleNames[u.role]||u.role)}</td>
        <td data-label="Locales">${esc(scopeLabel(u))}</td>
        <td data-label="Sesiones">${u.activeSessions||0}</td>
        <td data-label="Estado"><span class="status ${u.active?'active':'inactive'}">${u.active?'Activo':'Revocado'}</span></td>
        <td data-label="Acciones"><div class="row-actions">
          <button class="btn small" data-reset-password="${esc(u.id)}">Contraseña</button>
          ${u.id!==state.me.user.id?`<button class="btn small ${u.active?'danger':''}" data-toggle-user="${esc(u.id)}" data-active="${u.active?'1':'0'}">${u.active?'Revocar':'Reactivar'}</button>`:''}
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div></section>`;
  bindDynamic();
}

async function renderAudit(){
  const payload=await api('/api/audit?limit=200');
  state.cache.audit=payload.events;
  $('#mainContent').innerHTML=`<div class="view-header"><div><h2>Auditoría</h2><p>Registro de acciones y cambios relevantes.</p></div></div>
  <section class="panel"><div class="activity-list">${payload.events.length?payload.events.map(e=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${esc(e.action)}</strong><small>${esc(e.actorEmail||'Sistema')} · ${esc(e.entityType)} ${esc(e.entityId||'')}</small></div><span class="activity-time">${date(e.createdAt)}</span></div>`).join(''):'<div class="empty-state"><h3>Sin actividad</h3></div>'}</div></section>`;
}

async function renderSettings(){
  const platformOwner=Boolean(state.me.user.isPlatformOwner);
  const requests=[api('/api/locations'),api('/api/cost-centers'),api('/api/sessions')];
  if(platformOwner)requests.push(api('/api/brands'));
  const results=await Promise.all(requests);
  state.cache.locations=results[0].locations;
  state.cache.costCenters=results[1].costCenters;
  state.cache.sessions=results[2].sessions;
  state.cache.brands=platformOwner?results[3].brands:[];

  $('#mainContent').innerHTML=`
    <div class="view-header">
      <div><h2>Administración</h2><p>Gestiona marcas, locales, seguridad y sesiones desde un solo lugar.</p></div>
      <div class="view-actions">${platformOwner?'<button class="btn primary" data-action="new-brand">＋ Marca</button>':''}<button class="btn" data-action="new-location">＋ Local</button></div>
    </div>
    ${platformOwner?`<section class="panel">
      <div class="panel-head"><div><h3>Marcas</h3><small>El selector solo está disponible para el owner principal.</small></div></div>
      <div class="brand-grid">${state.cache.brands.map(brand=>`<article class="brand-card ${brand.current?'current':''}">
        <div class="brand-card-head"><span class="entity-logo">${esc(initials(brand.name))}</span><span class="status ${brand.current?'active':''}">${brand.current?'Actual':brand.status}</span></div>
        <h3>${esc(brand.name)}</h3><p>${brand.locations.map(l=>esc(l.name)).join(', ')||'Sin locales'}</p>
        <div class="brand-card-foot"><small>${brand.locations.length} local${brand.locations.length===1?'':'es'} · ${esc(brand.plan)}</small>
        ${brand.current?'':`<button class="btn small" data-switch-brand="${esc(brand.id)}">Cambiar</button>`}</div>
      </article>`).join('')}</div>
    </section>`:''}
    <section class="panel-grid admin-grid">
      <article class="panel">
        <div class="panel-head"><div><h3>Locales y centros de costo</h3><small>${state.cache.locations.length} locales activos</small></div><button class="btn small" data-action="new-location">＋ Local</button></div>
        <div class="location-list">${state.cache.locations.map(location=>`<div class="location-row"><div><strong>${esc(location.name)}</strong><small>${esc(location.code)} · ${esc(location.timezone)}</small></div><div class="chip-row">${state.cache.costCenters.filter(c=>c.locationId===location.id).map(c=>`<span class="cost-chip">${esc(c.name)} · ${c.productCount}</span>`).join('')}</div></div>`).join('')}</div>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h3>Mi cuenta</h3><small>${esc(state.me.user.email)}</small></div></div>
        <div class="account-summary"><span class="user-avatar large-avatar">${esc(initials(state.me.user.displayName))}</span><div><strong>${esc(state.me.user.displayName)}</strong><p>${esc(roleNames[state.me.user.role]||state.me.user.role)}</p></div></div>
        <button class="btn wide-action" data-action="change-password">Cambiar mi contraseña</button>
        ${isAdmin()?'<button class="btn wide-action" data-view-link="team">Administrar usuarios</button>':''}
      </article>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Sesiones</h3><small>Dispositivos que han iniciado sesión en esta marca.</small></div></div>
      <div class="session-list">${state.cache.sessions.map(session=>`<div class="session-row"><div><strong>${esc(session.displayName)}</strong><small>${esc(session.userAgent||'Dispositivo')} · ${session.lastSeenAt?date(session.lastSeenAt):'Sin actividad'}</small></div><div>${session.current?'<span class="status active">Actual</span>':session.revokedAt?'<span class="status inactive">Revocada</span>':`<button class="btn small danger" data-revoke-session="${esc(session.id)}">Revocar</button>`}</div></div>`).join('')}</div>
    </section>`;
  bindDynamic();
}

export {navigate};
