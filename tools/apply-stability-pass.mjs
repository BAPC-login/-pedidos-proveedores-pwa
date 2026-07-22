import fs from 'node:fs';

function read(file){return fs.readFileSync(file,'utf8')}
function write(file,content){fs.writeFileSync(file,content,'utf8');console.log('updated',file)}
function replaceOnce(file,from,to,label=from.slice(0,80)){
  const source=read(file);
  if(!source.includes(from))throw new Error(`Missing patch target in ${file}: ${label}`);
  const output=source.replace(from,to);
  if(output===source)throw new Error(`Patch produced no change in ${file}: ${label}`);
  write(file,output);
}

replaceOnce('professional/worker/src/api/orders.js',
`    requestedBy: order.requested_by_name,
    approvedBy: order.approved_by_name,`,
`    requestedById: order.requested_by,
    requestedBy: order.requested_by_name,
    approvedBy: order.approved_by_name,`,
'order requester id');

replaceOnce('professional/web/app-actions.js',
`      <label class="field"><span>Nombre</span><input name="displayName" required autocomplete="name"></label>
      <label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label>`,
`      <label class="field"><span>Nombre y apellido</span><input name="displayName" required autocomplete="name"></label>
      <label class="field"><span>Cargo</span><input name="jobTitle" placeholder="Ej: Jefe de Barra"></label>
      <label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Teléfono</span><input name="phone" type="tel" autocomplete="tel"></label>
      <label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required autocomplete="new-password"></label>`,
'user profile fields');

replaceOnce('professional/web/app-actions.js',
`        password:form.get('password'),
        role,
        locationScope`,
`        password:form.get('password'),
        profile:{jobTitle:form.get('jobTitle'),phone:form.get('phone'),signatureName:form.get('displayName')},
        role,
        locationScope`,
'user profile payload');

replaceOnce('professional/web/app-actions.js',
`    subtitle:'Selecciona proveedor y cantidades. Los formatos vienen desde el catálogo.',`,
`    subtitle:'Cada pedido corresponde a un único proveedor. Selecciona cantidades y se generará su PDF independiente.',`,
'order independent supplier copy');

replaceOnce('professional/web/app-actions.js',
`    submitLabel:'Crear pedido y PDF',`,
`    submitLabel:'Crear pedido independiente y abrir PDF',`,
'order submit label');

replaceOnce('professional/web/app-actions.js',
`      if(!navigator.onLine){
        await queueMutation('/api/orders','POST',json);
        toast('Pedido guardado para sincronizar');
      }else{
        await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});
        toast('Pedido y PDF creados');
      }
      state.cache.orders=[];
      await navigate('orders');`,
`      let created=null;
      if(!navigator.onLine){
        await queueMutation('/api/orders','POST',json);
        toast('Pedido guardado para sincronizar');
      }else{
        created=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});
        toast('Pedido independiente y PDF creados');
      }
      state.cache.orders=[];
      await navigate('orders');
      if(created?.order?.id)setTimeout(()=>openProfessionalOrderDetail(created.order.id),0);`,
'open created order');

replaceOnce('professional/web/app-actions.js',
`  $$('[data-toggle-user]').forEach(node=>node.onclick=async()=>{
    const active=node.dataset.active==='1';
    const user=state.cache.users.find(item=>item.id===node.dataset.toggleUser);
    await api(\`/api/users/\${node.dataset.toggleUser}\`,{method:'PATCH',json:{active:!active,role:user?.role,locationScope:user?.locationScope||[]}});`,
`  $$('[data-toggle-user]').forEach(node=>node.onclick=async()=>{
    const active=node.dataset.active==='1';
    const user=state.cache.users.find(item=>item.id===node.dataset.toggleUser);
    if(user?.role==='owner')return toast('La cuenta propietaria está protegida','error');
    await api(\`/api/users/\${node.dataset.toggleUser}\`,{method:'PATCH',json:{active:!active,role:user?.role,locationScope:user?.locationScope||[]}});`,
'owner UI guard');

replaceOnce('professional/web/app-actions.js',
`    subtitle:\`\${state.me.user.displayName} · \${roleNames[state.me.user.role]||state.me.user.role}\`,`,
`    subtitle:\`\${state.me.user.displayName}\${state.me.user.profile?.jobTitle?\` · \${state.me.user.profile.jobTitle}\`:''} · \${roleNames[state.me.user.role]||state.me.user.role}\`,`,
'workspace profile subtitle');

replaceOnce('professional/web/app-views.js',
`        <td data-label="Usuario"><strong>\${esc(u.displayName)}</strong><br><small>\${esc(u.email)}</small></td>`,
`        <td data-label="Usuario"><strong>\${esc(u.displayName)}</strong>\${u.profile?.jobTitle?\`<span class="profile-title">\${esc(u.profile.jobTitle)}</span>\`:''}<br><small>\${esc(u.email)}</small></td>`,
'team profile display');

replaceOnce('professional/web/app-views.js',
`        <td data-label="Acciones"><div class="row-actions">
          <button class="btn small" data-reset-password="\${esc(u.id)}">Contraseña</button>
          \${u.id!==state.me.user.id?\`<button class="btn small \${u.active?'danger':''}" data-toggle-user="\${esc(u.id)}" data-active="\${u.active?'1':'0'}">\${u.active?'Revocar':'Reactivar'}</button>\`:''}
        </div></td>`,
`        <td data-label="Acciones"><div class="row-actions">
          <button class="btn small" data-user-profile="\${esc(u.id)}">Perfil</button>
          \${u.role==='owner'&&u.id!==state.me.user.id?'':\`<button class="btn small" data-reset-password="\${esc(u.id)}">Contraseña</button>\`}
          \${u.role==='owner'?'<span class="protected-owner">Propietario protegido</span>':u.id!==state.me.user.id?\`<button class="btn small \${u.active?'danger':''}" data-toggle-user="\${esc(u.id)}" data-active="\${u.active?'1':'0'}">\${u.active?'Revocar':'Reactivar'}</button>\`:''}
        </div></td>`,
'protected owner actions');

replaceOnce('professional/web/app-views.js',
`        <div class="account-summary"><span class="user-avatar large-avatar">\${esc(initials(state.me.user.displayName))}</span><div><strong>\${esc(state.me.user.displayName)}</strong><p>\${esc(roleNames[state.me.user.role]||state.me.user.role)}</p></div></div>
        <button class="btn wide-action" data-action="change-password">Cambiar mi contraseña</button>`,
`        <div class="account-summary"><span class="user-avatar large-avatar">\${esc(initials(state.me.user.displayName))}</span><div><strong>\${esc(state.me.user.displayName)}</strong><p>\${esc(state.me.user.profile?.jobTitle||roleNames[state.me.user.role]||state.me.user.role)}</p></div></div>
        <button class="btn wide-action" data-user-profile="\${esc(state.me.user.id)}">Editar mi perfil</button>
        <button class="btn wide-action" data-action="change-password">Cambiar mi contraseña</button>`,
'account profile button');

replaceOnce('professional/web/app-views.js',
`    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Sesiones</h3><small>Dispositivos que han iniciado sesión en esta marca.</small></div></div>`,
`    </section>
    <section class="panel-grid admin-grid">
      <article class="panel"><div class="panel-head"><div><h3>Identidad visual y PDF</h3><small>Logo, razón social, datos del local, paleta, posición y tamaño.</small></div></div><div class="branding-summary"><div class="palette-swatch"></div><p>Los cambios se aplican a la interfaz y a cada nuevo PDF por proveedor, sin alterar el catálogo ni los pedidos existentes.</p><button class="btn primary wide-action" data-branding-settings>Configurar empresa, local y documentos</button></div></article>
      <article class="panel"><div class="panel-head"><div><h3>Perfil del emisor</h3><small>Nombre y cargo visibles en los informes emitidos.</small></div></div><div class="account-summary"><span class="user-avatar large-avatar">\${esc(initials(state.me.user.displayName))}</span><div><strong>\${esc(state.me.user.displayName)}</strong><p>\${esc(state.me.user.profile?.jobTitle||'Cargo sin completar')}</p></div></div><button class="btn wide-action" data-user-profile="\${esc(state.me.user.id)}">Completar mi perfil</button></article>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h3>Sesiones</h3><small>Dispositivos que han iniciado sesión en esta marca.</small></div></div>`,
'branding settings panels');

replaceOnce('professional/web/app-views.js',
`<div>\${session.current?'<span class="status active">Actual</span>':session.revokedAt?'<span class="status inactive">Revocada</span>':\`<button class="btn small danger" data-revoke-session="\${esc(session.id)}">Revocar</button>\`}</div>`,
`<div>\${session.current?'<span class="status active">Actual</span>':session.revokedAt?'<span class="status inactive">Revocada</span>':session.role==='owner'?'<span class="protected-owner">Propietario protegido</span>':\`<button class="btn small danger" data-revoke-session="\${esc(session.id)}">Revocar</button>\`}</div>`,
'protect owner sessions');

replaceOnce('worker/src/combined.js',
`const PLATFORM_RELEASE = '2026.07.22.21';`,
`const PLATFORM_RELEASE = '2026.07.22.22';`,
'release bump');

replaceOnce('professional/worker/src/index-scoped.js',
`    version: '2.0.0-alpha.5',`,
`    version: '2.0.0-alpha.6',`,
'health version');

const packageFile='professional/package.json';
const pkg=JSON.parse(read(packageFile));
pkg.version='2.0.0-alpha.6';
pkg.scripts.check='node --check worker/src/core.js && node --check worker/src/password.js && node --check worker/src/schema.js && node --check worker/src/auth.js && node --check worker/src/pdf.js && node --check worker/src/api/catalog.js && node --check worker/src/api/orders.js && node --check worker/src/api/documents.js && node --check worker/src/api/settings.js && node --check worker/src/index.js && node --check ../worker/src/combined.js && node --check web/app-core.js && node --check web/app-views.js && node --check web/app-actions.js && node --check web/app-modal.js && node --check web/app-order-detail.js && node --check web/app-invoices.js && node --check web/app-branding.js && node --check web/app.js && node --check web/sw.js';
write(packageFile,JSON.stringify(pkg,null,2)+'\n');
