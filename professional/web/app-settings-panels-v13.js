import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal} from './app-modal.js';
import {openCompanyLogoUploader} from './app-company-logo.js';

let initialized=false;

async function settings(){return api('/api/settings')}

async function openCompanyProfile(){
  const data=await settings(),business=data.organization.business||{};
  openModal({eyebrow:'EMPRESA',title:'Perfil de la empresa',subtitle:'Datos tributarios y de contacto que aparecen en los documentos.',size:'large',body:`<div class="form-grid"><label class="field full"><span>Nombre visible</span><input name="organizationName" value="${esc(data.organization.name)}" required></label><label class="field full"><span>Razón social</span><input name="legalName" value="${esc(business.legalName||'')}"></label><label class="field"><span>RUT</span><input name="rut" value="${esc(business.rut||'')}"></label><label class="field"><span>Correo</span><input name="email" type="email" value="${esc(business.email||'')}"></label><label class="field full"><span>Dirección</span><input name="address" value="${esc(business.address||'')}"></label><label class="field"><span>Comuna</span><input name="commune" value="${esc(business.commune||'')}"></label><label class="field"><span>Ciudad</span><input name="city" value="${esc(business.city||'')}"></label><label class="field"><span>Teléfono</span><input name="phone" value="${esc(business.phone||'')}"></label></div>`,submitLabel:'Guardar empresa',onSubmit:async form=>{await api('/api/settings',{method:'PATCH',json:{organizationName:form.get('organizationName'),business:{legalName:form.get('legalName'),rut:form.get('rut'),email:form.get('email'),address:form.get('address'),commune:form.get('commune'),city:form.get('city'),phone:form.get('phone')}}});toast('Perfil de empresa guardado')}});
}

async function openPalette(){
  const data=await settings(),branding=data.organization.branding||{};
  openModal({eyebrow:'APARIENCIA',title:'Paleta de colores',subtitle:'Cambia la aplicación y las cabeceras de los PDF sin tocar los demás datos.',body:`<div class="color-grid"><label class="color-control"><span>Color principal</span><input name="primaryColor" type="color" value="${esc(branding.primaryColor||'#6246EA')}"></label><label class="color-control"><span>Color secundario</span><input name="secondaryColor" type="color" value="${esc(branding.secondaryColor||'#8067FF')}"></label><label class="color-control"><span>Cabecera de tabla</span><input name="tableHeaderColor" type="color" value="${esc(branding.tableHeaderColor||'#48484C')}"></label></div><label class="field" style="margin-top:12px"><span>Texto al pie del PDF</span><input name="footerText" value="${esc(branding.footerText||'Documento generado por Pedidos Pro')}"></label>`,submitLabel:'Guardar colores',onSubmit:async form=>{const response=await api('/api/settings',{method:'PATCH',json:{branding:{primaryColor:form.get('primaryColor'),secondaryColor:form.get('secondaryColor'),tableHeaderColor:form.get('tableHeaderColor'),footerText:form.get('footerText')}}});const next=response.organization.branding;document.documentElement.style.setProperty('--primary',next.primaryColor);document.documentElement.style.setProperty('--primary2',next.secondaryColor);toast('Paleta actualizada')}});
}

async function openLocationEditor(){
  const data=await settings();if(!data.locations.length)return toast('No hay locales disponibles','error');
  let selected=data.locations[0];
  openModal({eyebrow:'LOCALES',title:'Datos de cada local',subtitle:'Edita la información específica que reemplaza los datos generales en los PDF.',size:'large',body:`<div class="form-grid"><label class="field full"><span>Local</span><select id="focusedLocation">${data.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label><label class="field full"><span>Razón social</span><input name="legalName"></label><label class="field"><span>RUT</span><input name="rut"></label><label class="field"><span>Contacto</span><input name="contactName"></label><label class="field full"><span>Dirección</span><input name="address"></label><label class="field"><span>Comuna</span><input name="commune"></label><label class="field"><span>Ciudad</span><input name="city"></label><label class="field"><span>Teléfono</span><input name="phone"></label><label class="field"><span>Correo</span><input name="email" type="email"></label></div>`,submitLabel:'Guardar local',onSubmit:async form=>{await api('/api/settings',{method:'PATCH',json:{location:{id:selected.id,details:{legalName:form.get('legalName'),rut:form.get('rut'),contactName:form.get('contactName'),address:form.get('address'),commune:form.get('commune'),city:form.get('city'),phone:form.get('phone'),email:form.get('email')}}}});toast('Datos del local guardados')}});
  const frame=$('#modalFrame');
  const fill=()=>{selected=data.locations.find(item=>item.id===$('#focusedLocation').value)||data.locations[0];const details=selected.details||{};['legalName','rut','contactName','address','commune','city','phone','email'].forEach(name=>frame.elements[name].value=details[name]||'')};
  $('#focusedLocation').onchange=fill;fill();
}

async function openReconciliation(){
  const payload=await api('/api/reconciliation/settings'),value=payload.settings||{};
  openModal({eyebrow:'CONCILIACIÓN',title:'Control profesional de diferencias',subtitle:'Define cuándo una diferencia de cantidad o precio requiere revisión.',body:`<div class="form-grid"><label class="field"><span>Tolerancia de cantidad (%)</span><input name="quantityTolerancePct" type="number" min="0" max="100" step="0.1" value="${Number(value.quantityTolerancePct||0)}"></label><label class="field"><span>Tolerancia de precio (%)</span><input name="priceTolerancePct" type="number" min="0" max="100" step="0.1" value="${Number(value.priceTolerancePct||1)}"></label><label class="check-card full"><input name="requireProductMatch" type="checkbox" ${value.requireProductMatch!==false?'checked':''}><span><strong>Exigir producto vinculado</strong><small>Las líneas sin coincidencia quedan para revisión.</small></span></label><label class="check-card full"><input name="flagFreeItems" type="checkbox" ${value.flagFreeItems!==false?'checked':''}><span><strong>Marcar productos sin cargo</strong><small>Las bonificaciones se separan del historial de precios.</small></span></label></div>`,submitLabel:'Guardar reglas',onSubmit:async form=>{await api('/api/reconciliation/settings',{method:'PATCH',json:{quantityTolerancePct:Number(form.get('quantityTolerancePct')||0),priceTolerancePct:Number(form.get('priceTolerancePct')||0),requireProductMatch:form.get('requireProductMatch')==='on',flagFreeItems:form.get('flagFreeItems')==='on'}});toast('Reglas de conciliación guardadas')}});
}

async function openNotifications(){
  const payload=await api('/api/notifications'),items=payload.notifications||[];
  openModal({eyebrow:'ALERTAS',title:'Notificaciones operativas',subtitle:'Pedidos que requieren una acción concreta.',size:'large',hideSubmit:true,body:`<div class="focused-list">${items.length?items.map(item=>`<article class="focused-row ${esc(item.severity)}"><div><strong>${esc(item.title)}</strong><small>${esc(item.type.replaceAll('_',' '))}</small></div><span>${item.severity==='critical'?'Urgente':item.severity==='warning'?'Revisar':'Pendiente'}</span></article>`).join(''):'<div class="empty-state compact-empty">No hay alertas pendientes.</div>'}</div>`});
}

function saveJson(payload,name){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
async function exportBackup(){const payload=await api('/api/backups/export');saveJson(payload.backup,`pedidos-pro-respaldo-${new Date().toISOString().slice(0,10)}.json`);toast('Respaldo completo descargado')}

async function openDiagnostics(){
  const payload=await api('/api/telemetry/diagnostics'),value=payload.diagnostics||{summary:[],events:[]};
  openModal({eyebrow:'OBSERVABILIDAD',title:'Diagnóstico de la aplicación',subtitle:'Errores y eventos recientes registrados desde los dispositivos.',size:'large',hideSubmit:true,body:`<div class="ops-master-summary">${value.summary.slice(0,4).map(item=>`<article><strong>${item.total}</strong><span>${esc(item.type)}</span></article>`).join('')||'<article><strong>0</strong><span>Errores recientes</span></article>'}</div><div class="focused-list" style="margin-top:12px">${value.events.map(item=>`<article class="focused-row"><div><strong>${esc(item.type)}</strong><small>${esc(item.message||'Sin detalle')}</small></div><span>${new Date(item.createdAt).toLocaleString('es-CL')}</span></article>`).join('')||'<div class="empty-state compact-empty">Sin eventos registrados.</div>'}</div>`});
}

async function openAccount(){
  const payload=await api('/api/account/readiness'),account=payload.account;
  openModal({eyebrow:'SAAS',title:'Plan y preparación comercial',subtitle:'Uso, límites y módulos necesarios para operar como servicio.',size:'large',hideSubmit:true,body:`<div class="account-plan-card"><span>Plan actual</span><strong>${esc(account.plan)}</strong><small>Mes ${esc(account.month)}</small></div><div class="ops-master-summary" style="margin-top:10px"><article><strong>${account.counts.locations}</strong><span>Locales</span></article><article><strong>${account.counts.users}</strong><span>Usuarios</span></article><article><strong>${account.counts.products}</strong><span>Productos</span></article><article><strong>${account.counts.documents}</strong><span>Archivos</span></article></div><div class="feature-readiness">${Object.entries(account.features).map(([name,enabled])=>`<div><span>${enabled?'✓':'○'}</span><strong>${esc(name.replace(/([A-Z])/g,' $1'))}</strong><small>${enabled?'Disponible':'Requiere proveedor externo'}</small></div>`).join('')}</div>`});
}

export function initializeSettingsPanelsV13(){
  if(initialized)return;initialized=true;
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-settings-panel]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
    const actions={company:openCompanyProfile,pdf:openCompanyLogoUploader,palette:openPalette,locations:openLocationEditor,reconciliation:openReconciliation,notifications:openNotifications,backup:exportBackup,diagnostics:openDiagnostics,account:openAccount};
    const action=actions[button.dataset.settingsPanel];if(action)Promise.resolve(action()).catch(error=>toast(error.message,'error'));
  },true);
}
