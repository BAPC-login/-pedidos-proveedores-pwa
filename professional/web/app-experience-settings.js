import {$,esc,state,api,isAdmin} from './app-core.js';
import {bindDynamic} from './app-actions.js';

let busy=false;
function card(icon,title,description,action,label='Abrir',extra=''){return `<article class="settings-menu-card"><span class="settings-card-icon">${icon}</span><div><h3>${esc(title)}</h3><p>${esc(description)}</p>${extra}</div><button class="btn small" type="button" ${action}>${esc(label)}</button></article>`}
function countLabel(value,singular,plural=`${singular}s`){return `${value} ${value===1?singular:plural}`}
export async function enhanceSettings(){
  if(state.view!=='settings'||busy||$('#settingsExperienceHub'))return;busy=true;
  try{
    const[settings,locationsData,centersData,sessionsData,notificationsData,accountData]=await Promise.all([
      api('/api/settings'),api('/api/locations'),api('/api/cost-centers'),api('/api/sessions'),
      api('/api/notifications').catch(()=>({notifications:[]})),api('/api/account/readiness').catch(()=>({account:null}))
    ]);
    if(state.view!=='settings')return;
    state.cache.locations=locationsData.locations||[];state.cache.costCenters=centersData.costCenters||[];state.cache.sessions=sessionsData.sessions||[];
    const business=settings.organization.business||{},branding=settings.organization.branding||{},alerts=notificationsData.notifications||[],account=accountData.account;
    $('#mainContent').innerHTML=`<div id="settingsExperienceHub">
      <div class="view-header ops-header"><div><span class="eyebrow">ADMINISTRACIÓN</span><h2>Configuración</h2><p>Empresa, operación y seguridad. El catálogo y su recorrido se administran desde Catálogo, no desde Configuración.</p></div></div>

      <section class="settings-section" id="settingsCompany"><div class="settings-section-head"><div><h3>Empresa</h3><p>Identidad corporativa y datos de cada local.</p></div></div><div class="settings-menu-grid">
        ${card('🏢','Datos de la empresa','Razón social, RUT, dirección y contacto.','data-settings-panel="company"','Editar empresa',`<div class="settings-inline-meta"><span>${esc(business.legalName||settings.organization.name)}</span><span>${esc(business.rut||'RUT pendiente')}</span></div>`)}
        ${card('◈','Logo corporativo y PDF','Carga el logo de empresa y define su tamaño y posición en documentos.','data-settings-panel="pdf"','Editar logo',`<div class="settings-inline-meta"><span>${branding.logoKey?'Logo corporativo cargado':'Sin logo corporativo'}</span><span>${Number(branding.logoSize||42)} mm</span></div>`)}
        ${card('⌂','Datos de locales','Dirección, RUT y contacto específico de cada local.','data-settings-panel="locations"','Editar locales',`<div class="settings-inline-meta"><span>${countLabel(state.cache.locations.length,'local','locales')}</span></div>`)}
        ${card('▣','Logos de locales','Carga o reemplaza la identidad visual propia de cada local.','data-location-identity','Editar logos',`<div class="settings-inline-meta"><span>${countLabel(state.cache.locations.length,'local','locales')}</span></div>`)}
        ${card('✺','Apariencia','Colores de la aplicación, tabla y texto al pie.','data-settings-panel="palette"','Editar apariencia',`<div class="settings-palette-preview"><i style="background:${esc(branding.primaryColor||'#6246EA')}"></i><i style="background:${esc(branding.secondaryColor||'#8067FF')}"></i><i style="background:${esc(branding.tableHeaderColor||'#48484C')}"></i></div>`)}
      </div></section>

      <section class="settings-section" id="settingsOperation"><div class="settings-section-head"><div><h3>Operación</h3><p>Estructura del negocio, proveedores y reglas operativas. El orden Bodega → Categoría → Producto permanece en Catálogo.</p></div><div class="view-actions"><button class="btn" data-action="new-location">＋ Local</button><button class="btn" data-action="new-cost-center">＋ Centro</button><button class="btn primary" data-action="new-supplier">＋ Proveedor</button></div></div><div class="settings-menu-grid">
        ${card('◇','Proveedores e identidad','Crea proveedores, edita sus datos y administra el logo de cada proveedor.','data-operations-tab="suppliers"','Administrar proveedores')}
        ${card('◎','Locales y centros de costo','Crea la estructura operativa. El recorrido y los formatos se configuran después desde Catálogo.','data-action="new-cost-center"','Nuevo centro',`<div class="settings-inline-meta"><span>${countLabel(state.cache.locations.length,'local','locales')}</span><span>${countLabel(state.cache.costCenters.length,'centro')}</span></div>`)}
        ${card('≠','Reglas de diferencias','Tolerancias de cantidad, precio, coincidencias y bonificaciones.','data-settings-panel="reconciliation"','Configurar reglas')}
        ${card('●','Notificaciones operativas',`${alerts.length} alerta${alerts.length===1?'':'s'} pendiente${alerts.length===1?'':'s'}.`,'data-settings-panel="notifications"','Ver alertas')}
      </div></section>

      <section class="settings-section" id="settingsSecurity"><div class="settings-section-head"><div><h3>Seguridad</h3><p>Usuarios, sesiones, continuidad y estado de la cuenta.</p></div></div><div class="settings-menu-grid">
        ${isAdmin()?card('👥','Usuarios y permisos','Correos individuales, roles y locales autorizados.','data-view-link="team"','Administrar usuarios'):''}
        ${card('◉','Mi perfil','Nombre, cargo, teléfono y firma del solicitante.',`data-user-profile="${esc(state.me.user.id)}"`,'Editar perfil')}
        ${card('⌁','Contraseña y sesiones',`${state.cache.sessions.length} sesión${state.cache.sessions.length===1?'':'es'} activa${state.cache.sessions.length===1?'':'s'}. Las sesiones inactivas expiran automáticamente.`,'data-action="change-password"','Abrir seguridad')}
        ${isAdmin()?card('◌','Diagnóstico','Estado de la aplicación, errores y métricas para soporte.','data-settings-panel="diagnostics"','Abrir diagnóstico'):''}
        ${isAdmin()?card('⇩','Respaldo y exportación','Exporta los datos de la organización para continuidad operativa.','data-settings-panel="backup"','Descargar respaldo'):''}
        ${isAdmin()?card('◇','Cuenta y plan',account?`Plan ${account.plan}. Uso, límites y módulos habilitados.`:'Estado comercial de la cuenta.','data-settings-panel="account"','Ver cuenta'):''}
      </div></section>
    </div>`;
    bindDynamic();
  }catch(error){console.warn('settings_hub_failed',error)}finally{busy=false}
}
