import {$,esc,state,api,isAdmin} from './app-core.js';
import {bindDynamic} from './app-actions.js';
import {protectedAssetUrl} from './app-assets-v13.js';

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
    const companyLogoUrl=branding.logoKey?await protectedAssetUrl(branding.logoKey):'';
    if(state.view!=='settings')return;
    $('#mainContent').innerHTML=`<div id="settingsExperienceHub">
      <div class="view-header ops-header"><div><span class="eyebrow">ADMINISTRACIÓN</span><h2>Configuración</h2><p>Perfil de empresa, estructura operativa y seguridad. Proveedores y catálogo se administran desde sus propios menús.</p></div></div>

      <section class="settings-section" id="settingsCompany"><div class="settings-section-head"><div><h3>Empresa</h3><p>Una sola ficha para toda la identidad corporativa.</p></div></div><div class="settings-menu-grid">
        ${card('🏢','Perfil de empresa','Información legal y comercial, logo corporativo, paleta de colores y diseño de documentos.','data-company-profile-v94','Abrir perfil',`<div class="settings-company-logo" data-company-logo-preview>${companyLogoUrl?`<img src="${companyLogoUrl}" alt="Logo de ${esc(settings.organization.name)}">`:'<span>Sin logo corporativo</span>'}</div><div class="settings-inline-meta"><span>${esc(business.legalName||settings.organization.name)}</span><span>${esc(business.rut||'RUT pendiente')}</span></div><div class="settings-palette-preview"><i style="background:${esc(branding.primaryColor||'#24344b')}"></i><i style="background:${esc(branding.secondaryColor||'#60728a')}"></i><i style="background:${esc(branding.tableHeaderColor||'#48484c')}"></i></div>`)}
      </div></section>

      <section class="settings-section" id="settingsOperation"><div class="settings-section-head"><div><h3>Operación</h3><p>Locales, centros de costo y reglas comunes. El recorrido Bodega → Categoría → Producto permanece en Catálogo.</p></div><div class="view-actions"><button class="btn" data-action="new-location">＋ Local</button><button class="btn primary" data-action="new-cost-center">＋ Centro</button></div></div><div class="settings-menu-grid">
        ${card('⌂','Perfil de local','Datos tributarios, contacto, dirección y logo propio de cada local en una sola ficha.','data-location-profile','Abrir perfil',`<div class="settings-inline-meta"><span>${countLabel(state.cache.locations.length,'local','locales')}</span></div>`)}
        ${card('◎','Centros de costo','Crea la estructura operativa. Bodegas, categorías y recorrido se ordenan después desde Catálogo.','data-action="new-cost-center"','Nuevo centro',`<div class="settings-inline-meta"><span>${countLabel(state.cache.costCenters.length,'centro')}</span></div>`)}
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
