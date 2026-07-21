import {$,$$,esc,money,date,state,api,isAdmin,initials,roleNames,setTheme} from './app-core.js';
import {bindDynamic} from './app-actions.js';
const viewMeta={dashboard:['OPERACIÓN','Resumen'],orders:['COMPRAS','Pedidos'],invoices:['DOCUMENTOS','Facturas'],catalog:['DATOS','Catálogo'],suppliers:['ABASTECIMIENTO','Proveedores'],team:['SEGURIDAD','Equipo'],audit:['CONTROL','Auditoría'],settings:['CUENTA','Configuración']};
async function navigate(view){
  if(['team','audit'].includes(view)&&!isAdmin())return;
  state.view=view;
  $$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  const [eyebrow,title]=viewMeta[view]||viewMeta.dashboard;
  $('#pageEyebrow').textContent=eyebrow;$('#pageTitle').textContent=title;
  const action=$('#primaryAction');
  action.classList.toggle('hidden',!['dashboard','orders','invoices','catalog','suppliers','team'].includes(view));
  action.innerHTML=view==='invoices'?'<span>⌁</span><span>Analizar factura</span>':view==='catalog'?'<span>＋</span><span>Nuevo producto</span>':view==='suppliers'?'<span>＋</span><span>Nuevo proveedor</span>':view==='team'?'<span>＋</span><span>Nuevo usuario</span>':'<span>＋</span><span>Nuevo pedido</span>';
  $('#mainContent').innerHTML='<div class="panel"><div class="empty-state">Cargando información…</div></div>';
  try{
    if(view==='dashboard')await renderDashboard();
    if(view==='orders')await renderOrders();
    if(view==='invoices')await renderInvoices();
    if(view==='catalog')await renderCatalog();
    if(view==='suppliers')await renderSuppliers();
    if(view==='team')await renderTeam();
    if(view==='audit')await renderAudit();
    if(view==='settings')await renderSettings();
  }catch(error){renderError(error)}
  $('#mainContent').focus({preventScroll:true});
}
function renderError(error){
  $('#mainContent').innerHTML=`<div class="panel"><div class="empty-state"><h3>No se pudo cargar esta sección</h3><p>${esc(error.message)}</p><button class="btn" id="retryView">Reintentar</button></div></div>`;
  $('#retryView')?.addEventListener('click',()=>navigate(state.view));
}

async function renderDashboard(){
  const payload=await api('/api/dashboard');state.cache.dashboard=payload;
  const m=payload.metrics;
  $('#pendingCount').textContent=m.pendingOrders;
  $('#mainContent').innerHTML=`
    <section class="hero-panel">
      <article class="hero-card"><span class="eyebrow">CENTRO DE COMPRAS</span><h2>Controla lo que pides, recibes y pagas.</h2><p>Pedidos Pro conserva cada cambio, separa permisos y mantiene a tu equipo trabajando con una sola fuente de información.</p><div class="hero-actions"><button class="btn primary" data-action="new-order">Crear pedido</button><button class="btn" data-view-link="orders">Ver pendientes</button></div></article>
      <article class="panel"><div class="panel-head"><h3>Acciones rápidas</h3><small>Según tu rol</small></div><div class="stack"><button class="btn" data-action="new-supplier">＋ Proveedor</button><button class="btn" data-action="new-product">＋ Producto</button><button class="btn" data-view-link="audit">◷ Revisar actividad</button></div></article>
    </section>
    <section class="metrics-grid">
      ${metric('Pedidos 30 días',m.orders30d,'Órdenes creadas')}${metric('Pendientes',m.pendingOrders,'Requieren gestión')}${metric('Compras 30 días',money(m.spend30d),'Facturas registradas')}${metric('Proveedores',m.suppliers,'Activos')}${metric('Productos',m.products,'En catálogo')}${metric('Diferencias',m.openIssues,'Sin resolver')}
    </section>
    <section class="table-card"><div class="panel-head" style="padding:16px"><h3>Actividad reciente</h3><button class="btn small" data-view-link="orders">Todos los pedidos</button></div>${ordersTable(payload.recentOrders)}</section>`;
  bindDynamic();
}
function metric(label,value,note){return `<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`}
function ordersTable(orders){
  if(!orders?.length)return '<div class="empty-state"><h3>Aún no hay pedidos</h3><p>Crea el primero para comenzar a medir la operación.</p></div>';
  return `<table class="data-table"><thead><tr><th>Folio</th><th>Proveedor</th><th>Local</th><th>Estado</th><th>Entrega</th><th>Total</th></tr></thead><tbody>${orders.map(o=>`<tr data-order="${esc(o.id)}"><td><strong>${esc(o.folio)}</strong></td><td>${esc(o.supplierName)}</td><td>${esc(o.locationName)}</td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td><td>${date(o.deliveryDate)}</td><td>${money(o.grossTotal)}</td></tr>`).join('')}</tbody></table>`;
}
const statusLabel=value=>({draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'}[value]||value);

async function renderOrders(){
  const payload=await api('/api/orders');state.cache.orders=payload.orders;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">TRAZABILIDAD COMPLETA</span><h2>Pedidos</h2><p>Los documentos emitidos no se eliminan: se anulan con motivo y quedan auditados.</p></div><div class="view-actions"><button class="btn primary" data-action="new-order">＋ Nuevo pedido</button></div></div><div class="toolbar"><label class="field toolbar-search"><input id="orderSearch" placeholder="Buscar folio o proveedor"></label><label class="field"><select id="orderStatus"><option value="">Todos los estados</option>${['draft','requested','approved','sent','confirmed','partially_received','received','reconciled','closed','cancelled'].map(v=>`<option value="${v}">${statusLabel(v)}</option>`).join('')}</select></label></div><section class="table-card" id="ordersContainer">${ordersTable(payload.orders)}</section>`;
  $('#orderSearch').addEventListener('input',filterOrders);$('#orderStatus').addEventListener('change',filterOrders);bindDynamic();
}
function filterOrders(){
  const q=$('#orderSearch').value.toLowerCase(),status=$('#orderStatus').value;
  const filtered=state.cache.orders.filter(o=>(!status||o.status===status)&&(!q||`${o.folio} ${o.supplierName}`.toLowerCase().includes(q)));
  $('#ordersContainer').innerHTML=ordersTable(filtered);bindDynamic();
}

async function renderInvoices(){
  const [invoicePayload,supplierPayload,orderPayload]=await Promise.all([api('/api/invoices'),api('/api/suppliers'),api('/api/orders')]);
  state.cache.invoices=invoicePayload.invoices;state.cache.suppliers=supplierPayload.suppliers;state.cache.orders=orderPayload.orders;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">COTEJO Y PRECIOS</span><h2>Facturas</h2><p>Analiza documentos, revisa líneas y conserva el precio final por unidad.</p></div><button class="btn primary" data-action="analyze-invoice">⌁ Analizar factura</button></div><div class="toolbar"><label class="field toolbar-search"><input id="invoiceSearch" placeholder="Buscar número o proveedor"></label></div><section class="table-card" id="invoiceContainer">${invoiceTable(invoicePayload.invoices)}</section>`;
  $('#invoiceSearch').addEventListener('input',()=>{const q=$('#invoiceSearch').value.toLowerCase();$('#invoiceContainer').innerHTML=invoiceTable(state.cache.invoices.filter(i=>`${i.invoiceNumber} ${i.supplierName}`.toLowerCase().includes(q)))});bindDynamic();
}
function invoiceTable(invoices){
  if(!invoices?.length)return '<div class="empty-state"><h3>Aún no hay facturas</h3><p>Sube una imagen o PDF y revisa el cotejo antes de guardarla.</p><button class="btn primary" data-action="analyze-invoice">Analizar primera factura</button></div>';
  return `<table class="data-table"><thead><tr><th>Documento</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Neto</th><th>Impuestos</th><th>Total</th></tr></thead><tbody>${invoices.map(i=>`<tr><td><strong>${esc(i.invoiceNumber)}</strong><br><small>Tipo ${esc(i.documentType)}</small></td><td>${esc(i.supplierName)}</td><td>${date(i.invoiceDate)}</td><td><span class="status ${esc(i.status)}">${esc(i.status)}</span></td><td>${money(i.netTotal)}</td><td>${money(i.taxTotal)}</td><td><strong>${money(i.grossTotal)}</strong></td></tr>`).join('')}</tbody></table>`;
}

async function renderCatalog(){
  const [products,categories,suppliers]=await Promise.all([api('/api/products'),api('/api/categories'),api('/api/suppliers')]);
  state.cache.products=products.products;state.cache.categories=categories.categories;state.cache.suppliers=suppliers.suppliers;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">PRODUCTO INTERNO + OFERTA</span><h2>Catálogo profesional</h2><p>Un producto puede tener varios proveedores, formatos y precios.</p></div><button class="btn primary" data-action="new-product">＋ Nuevo producto</button></div><div class="toolbar"><label class="field toolbar-search"><input id="productSearch" placeholder="Buscar producto, marca o código"></label></div><section class="cards-grid" id="productGrid">${productCards(products.products)}</section>`;
  $('#productSearch').addEventListener('input',()=>{$('#productGrid').innerHTML=productCards(state.cache.products.filter(p=>`${p.name} ${p.brand} ${p.barcode}`.toLowerCase().includes($('#productSearch').value.toLowerCase())));bindDynamic()});bindDynamic();
}
function productCards(products){
  if(!products.length)return '<div class="panel empty-state"><h3>Catálogo vacío</h3><p>Agrega productos y luego vincula sus presentaciones por proveedor.</p></div>';
  return products.map(p=>`<article class="entity-card"><div class="entity-head"><span class="entity-logo">${esc(initials(p.brand||p.name))}</span><span class="status ${p.active?'active':'inactive'}">${p.active?'Activo':'Inactivo'}</span></div><h3>${esc(p.name)}</h3><p>${esc([p.brand,p.variant,p.contentValue?`${p.contentValue} ${p.contentUnit}`:''].filter(Boolean).join(' · ')||'Sin descripción adicional')}</p><div class="entity-meta"><div><span>Categoría</span><strong>${esc(p.categoryName||'Sin categoría')}</strong></div><div><span>Proveedores</span><strong>${p.suppliers.length}</strong></div></div><div class="entity-actions"><button class="btn small" data-link-supplier="${esc(p.id)}">Vincular proveedor</button></div></article>`).join('');
}

async function renderSuppliers(){
  const payload=await api('/api/suppliers');state.cache.suppliers=payload.suppliers;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">RED DE ABASTECIMIENTO</span><h2>Proveedores</h2><p>Contactos, condiciones, productos y cumplimiento en una sola ficha.</p></div><button class="btn primary" data-action="new-supplier">＋ Nuevo proveedor</button></div><div class="toolbar"><label class="field toolbar-search"><input id="supplierSearch" placeholder="Buscar proveedor o RUT"></label></div><section class="cards-grid" id="supplierGrid">${supplierCards(payload.suppliers)}</section>`;
  $('#supplierSearch').addEventListener('input',()=>{$('#supplierGrid').innerHTML=supplierCards(state.cache.suppliers.filter(s=>`${s.name} ${s.rut}`.toLowerCase().includes($('#supplierSearch').value.toLowerCase())))});bindDynamic();
}
function supplierCards(suppliers){
  if(!suppliers.length)return '<div class="panel empty-state"><h3>Sin proveedores</h3><p>Registra el primero para crear pedidos.</p></div>';
  return suppliers.map(s=>`<article class="entity-card"><div class="entity-head"><span class="entity-logo">${esc(initials(s.name))}</span><span class="status ${s.active?'active':'inactive'}">${s.active?'Activo':'Inactivo'}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.contactName||s.email||s.rut||'Sin contacto registrado')}</p><div class="entity-meta"><div><span>Productos</span><strong>${s.productCount}</strong></div><div><span>Entrega</span><strong>${s.leadDays||0} días</strong></div><div><span>Mínimo</span><strong>${money(s.minimumOrder)}</strong></div><div><span>Última factura</span><strong>${date(s.lastInvoiceDate)}</strong></div></div></article>`).join('');
}

async function renderTeam(){
  const payload=await api('/api/users');state.cache.users=payload.users;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">ACCESO REVOCABLE</span><h2>Equipo</h2><p>Las cuentas no expiran automáticamente. Puedes revocar usuarios y sesiones.</p></div><button class="btn primary" data-action="new-user">＋ Nuevo usuario</button></div><section class="table-card"><table class="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Sesiones</th><th>Último acceso</th><th></th></tr></thead><tbody>${payload.users.map(u=>`<tr><td><strong>${esc(u.displayName)}</strong><br><small>${esc(u.email)}</small></td><td>${esc(roleNames[u.role]||u.role)}</td><td><span class="status ${u.active?'active':'inactive'}">${u.active?'Activo':'Revocado'}</span></td><td>${u.activeSessions}</td><td>${date(u.lastSeenAt)}</td><td><button class="btn small ${u.active?'danger':''}" data-toggle-user="${esc(u.id)}" data-active="${u.active?'1':'0'}">${u.active?'Revocar':'Reactivar'}</button></td></tr>`).join('')}</tbody></table></section>`;bindDynamic();
}

async function renderAudit(){
  const payload=await api('/api/audit?limit=200');state.cache.audit=payload.events;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">REGISTRO INMUTABLE</span><h2>Auditoría</h2><p>Quién hizo qué, cuándo y sobre qué registro.</p></div></div><section class="panel"><div class="activity-list">${payload.events.length?payload.events.map(e=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${esc(e.action)}</strong><small>${esc(e.actorEmail||'Sistema')} · ${esc(e.entityType)} ${esc(e.entityId||'')}</small></div><span class="activity-time">${date(e.createdAt)}</span></div>`).join(''):'<div class="empty-state"><h3>Sin actividad</h3></div>'}</div></section>`;
}

async function renderSettings(){
  const sessions=(await api('/api/sessions')).sessions;
  const theme=document.documentElement.dataset.theme;
  $('#mainContent').innerHTML=`<div class="view-header"><div><span class="eyebrow">PREFERENCIAS Y SEGURIDAD</span><h2>Configuración</h2><p>Estado del plan, apariencia y dispositivos conectados.</p></div></div><section class="panel-grid"><article class="panel"><div class="panel-head"><h3>Apariencia</h3></div><label class="field"><span>Tema</span><select id="themeSelect"><option value="system">Usar sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label></article><article class="panel"><div class="panel-head"><h3>Plan ${esc(state.me.plan.name)}</h3></div><p style="color:var(--muted);font-size:11px;line-height:1.6">${state.me.plan.usage.orders_created||0} de ${state.me.plan.limits.ordersPerMonth} pedidos y ${state.me.plan.usage.ai_documents||0} de ${state.me.plan.limits.aiDocumentsPerMonth} análisis con IA este mes.</p></article></section><section class="table-card"><div class="panel-head" style="padding:16px"><h3>Sesiones</h3><small>No vencen, pero siempre pueden revocarse.</small></div><table class="data-table"><thead><tr><th>Usuario</th><th>Dispositivo</th><th>Creada</th><th>Último uso</th><th></th></tr></thead><tbody>${sessions.map(s=>`<tr><td>${esc(s.displayName)}${s.current?' · actual':''}</td><td>${esc((s.userAgent||'Dispositivo').slice(0,80))}</td><td>${date(s.createdAt)}</td><td>${date(s.lastSeenAt)}</td><td><button class="btn small danger" data-revoke-session="${esc(s.id)}">Revocar</button></td></tr>`).join('')}</tbody></table></section>`;
  $('#themeSelect').value=theme;$('#themeSelect').addEventListener('change',event=>setTheme(event.target.value));bindDynamic();
}

export {navigate,metric,statusLabel};
