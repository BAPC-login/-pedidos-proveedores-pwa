import {$,$$,esc,state,api,toast,setBusy,showApp} from './app-core.js';
import {openModal} from './app-modal.js';

let settingsCache = null;
let currentLogoUrl = '';
let initialized = false;

function injectStyles(){
  if($('#brandingFeatureStyles'))return;
  const style=document.createElement('style');
  style.id='brandingFeatureStyles';
  style.textContent=`
    .identity-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,.8fr);gap:18px}
    .identity-preview{position:sticky;top:0;align-self:start;border:1px solid var(--line);border-radius:16px;background:#fff;color:#101828;padding:14px;overflow:hidden}
    .identity-preview-header{display:grid;grid-template-columns:72px 1fr;min-height:112px;border:1px solid #30333a}
    .identity-preview-header.position-right{grid-template-columns:1fr 72px}
    .identity-preview-header.position-top,.identity-preview-header.position-bottom{display:flex;flex-direction:column}
    .identity-preview-logo{min-height:78px;display:flex;padding:7px;border-right:1px solid #30333a;overflow:hidden}
    .position-right .identity-preview-logo{order:2;border-right:0;border-left:1px solid #30333a}
    .position-top .identity-preview-logo{order:-1;border-right:0;border-bottom:1px solid #30333a}
    .position-bottom .identity-preview-logo{order:2;border-right:0;border-top:1px solid #30333a}
    .identity-preview-logo img{display:block;max-width:100%;max-height:90px;object-fit:contain}
    .identity-preview-logo span{margin:auto;color:#667085;font-size:10px}
    .identity-preview-info{display:grid;align-content:start}
    .identity-preview-row{display:grid;grid-template-columns:38% 1fr;min-height:18px;border-bottom:1px solid #30333a;font-size:7px}
    .identity-preview-row:last-child{border-bottom:0}.identity-preview-row b,.identity-preview-row span{padding:4px}.identity-preview-row b{border-right:1px solid #30333a}
    .identity-preview-band{margin-top:8px;padding:7px;text-align:center;color:#fff;font-size:10px;font-weight:900}
    .identity-preview-table{display:grid;grid-template-columns:1fr 54px 62px;padding:6px 8px;color:#fff;font-size:8px;font-weight:900}
    .color-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.color-control{display:grid;gap:7px}.color-control input{height:46px;padding:4px}
    .logo-control{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.logo-remove{white-space:nowrap}
    .protected-owner{display:inline-flex;align-items:center;min-height:30px;padding:0 9px;border-radius:9px;background:color-mix(in srgb,var(--primary) 10%,var(--card));color:var(--primary);font-size:10px;font-weight:850}
    .profile-title{display:inline-block;margin-top:3px;color:var(--primary);font-size:10px;font-weight:800}
    .branding-summary{display:grid;gap:11px}.palette-swatch{height:46px;border-radius:12px;border:1px solid var(--line);background:linear-gradient(135deg,var(--primary2),var(--primary))}
    .order-builder,.order-context,.order-catalog,.order-product-list{min-width:0}.order-product{grid-template-columns:minmax(0,1fr) minmax(105px,145px)}
    dialog .modal-shell{max-width:calc(100vw - 16px)}
    @media(max-width:760px){
      .identity-grid{grid-template-columns:1fr}.identity-preview{position:relative}.color-grid{grid-template-columns:1fr}.logo-control{grid-template-columns:1fr}
      .order-product{grid-template-columns:minmax(0,1fr) 108px}.order-product-copy strong{overflow-wrap:anywhere}.order-quantity input{width:100%}
      #modalBody{overflow-x:hidden}.form-grid{min-width:0}.field{min-width:0}.field input,.field select,.field textarea{max-width:100%}
    }
  `;
  document.head.append(style);
}

function applyBranding(settings){
  const branding=settings?.organization?.branding||{};
  if(branding.primaryColor)document.documentElement.style.setProperty('--primary',branding.primaryColor);
  if(branding.secondaryColor)document.documentElement.style.setProperty('--primary2',branding.secondaryColor);
}

async function fetchLogoUrl(key){
  if(currentLogoUrl){URL.revokeObjectURL(currentLogoUrl);currentLogoUrl=''}
  if(!key)return '';
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok)return '';
  currentLogoUrl=URL.createObjectURL(await response.blob());
  return currentLogoUrl;
}

export async function refreshBranding(force=false){
  if(!state.token||!state.me)return null;
  if(settingsCache&&!force){applyBranding(settingsCache);return settingsCache}
  try{
    settingsCache=await api('/api/settings');
    applyBranding(settingsCache);
    if(settingsCache.user?.profile)state.me.user.profile=settingsCache.user.profile;
    if(settingsCache.user?.displayName)state.me.user.displayName=settingsCache.user.displayName;
    if(settingsCache.organization?.name)state.me.organization.name=settingsCache.organization.name;
    showApp();
    return settingsCache;
  }catch(error){
    console.warn('branding_load_failed',error);
    return null;
  }
}

function imageToJpeg(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.onload=()=>{
      try{
        const limit=1800;
        const scale=Math.min(1,limit/Math.max(image.naturalWidth||1,image.naturalHeight||1));
        const width=Math.max(1,Math.round((image.naturalWidth||1)*scale));
        const height=Math.max(1,Math.round((image.naturalHeight||1)*scale));
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
        canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(!blob)return reject(new Error('No se pudo procesar el logo'));resolve({blob,width,height})},'image/jpeg',.92);
      }catch(error){URL.revokeObjectURL(url);reject(error)}
    };
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('El archivo no es una imagen válida'))};
    image.src=url;
  });
}

async function uploadLogo(file){
  if(!file)return null;
  if(file.size>8*1024*1024)throw new Error('El logo supera 8 MB');
  const converted=await imageToJpeg(file);
  const form=new FormData();
  form.append('file',converted.blob,`${String(file.name||'logo').replace(/\.[^.]+$/,'')}.jpg`);
  const response=await fetch('/api/files?purpose=brand-logo',{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo subir el logo');
  return {...payload.file,width:converted.width,height:converted.height};
}

function localById(settings,id){return (settings.locations||[]).find(location=>location.id===id)||(settings.locations||[])[0]||null}

function previewRows(values){
  return [
    ['RAZÓN SOCIAL',values.legalName||values.organizationName||'—'],['RUT',values.rut||'—'],['DIRECCIÓN',values.address||'—'],
    ['LOCAL',values.locationName||'—'],['SOLICITADO POR',`${state.me?.user?.displayName||'Usuario'}${state.me?.user?.profile?.jobTitle?` · ${state.me.user.profile.jobTitle}`:''}`],['FOLIO','MDR-260722-001']
  ].map(row=>`<div class="identity-preview-row"><b>${esc(row[0])}</b><span>${esc(row[1])}</span></div>`).join('');
}

function updateIdentityPreview(logoUrl=''){
  const form=$('#modalFrame');if(!form)return;
  const position=$('#brandLogoPosition')?.value||'left';
  const alignX=$('#brandLogoAlignX')?.value||'center';
  const alignY=$('#brandLogoAlignY')?.value||'center';
  const size=Number($('#brandLogoSize')?.value||42);
  const currentLocation=localById(settingsCache,$('#brandLocation')?.value);
  const values={
    organizationName:form.elements.organizationName?.value,
    legalName:form.elements.legalName?.value||currentLocation?.details?.legalName,
    rut:form.elements.rut?.value||currentLocation?.details?.rut,
    address:[form.elements.address?.value||currentLocation?.details?.address,form.elements.commune?.value||currentLocation?.details?.commune,form.elements.city?.value||currentLocation?.details?.city].filter(Boolean).join(', '),
    locationName:currentLocation?.name
  };
  const preview=$('#identityPreview');if(!preview)return;
  const justify={left:'flex-start',center:'center',right:'flex-end'}[alignX]||'center';
  const align={top:'flex-start',center:'center',bottom:'flex-end'}[alignY]||'center';
  const logo=logoUrl?`<img src="${logoUrl}" alt="Logo" style="max-width:${size}mm;justify-self:${justify};align-self:${align}">`:'<span>Sin logo</span>';
  preview.innerHTML=`<div class="identity-preview-header position-${position}"><div class="identity-preview-logo" style="justify-content:${justify};align-items:${align}">${logo}</div><div class="identity-preview-info">${previewRows(values)}</div></div><div class="identity-preview-band" style="background:${form.elements.primaryColor.value}">PEDIDO A PROVEEDOR</div><div class="identity-preview-table" style="background:${form.elements.tableHeaderColor.value}"><span>DESCRIPCIÓN</span><span>CANTIDAD</span><span>FORMATO</span></div>`;
}

async function openBrandingSettings(){
  const settings=await refreshBranding(true);
  if(!settings)return toast('No se pudo cargar la configuración','error');
  const business=settings.organization.business||{};
  const branding=settings.organization.branding||{};
  const firstLocation=settings.locations[0];
  const logoUrl=await fetchLogoUrl(branding.logoKey);
  openModal({
    eyebrow:'IDENTIDAD VISUAL',title:'Empresa, local y documentos',subtitle:'Configura una sola vez los datos y el diseño que aparecerán en cada PDF.',size:'large',
    body:`<div class="identity-grid"><div class="stack">
      <div class="form-grid">
        <label class="field full"><span>Nombre visible de la marca</span><input name="organizationName" value="${esc(settings.organization.name)}" required></label>
        <label class="field full"><span>Razón social</span><input name="legalName" value="${esc(business.legalName||'')}"></label>
        <label class="field"><span>RUT empresa</span><input name="rut" value="${esc(business.rut||'')}"></label>
        <label class="field"><span>Correo comercial</span><input name="businessEmail" type="email" value="${esc(business.email||'')}"></label>
        <label class="field full"><span>Dirección general</span><input name="address" value="${esc(business.address||'')}"></label>
        <label class="field"><span>Comuna</span><input name="commune" value="${esc(business.commune||'')}"></label>
        <label class="field"><span>Ciudad</span><input name="city" value="${esc(business.city||'')}"></label>
        <label class="field"><span>Teléfono</span><input name="phone" value="${esc(business.phone||'')}"></label>
      </div>
      <div class="panel"><div class="panel-head"><div><h3>Datos específicos del local</h3><small>Reemplazan los datos generales en el PDF.</small></div></div>
        <div class="form-grid"><label class="field full"><span>Local</span><select id="brandLocation" name="locationId">${settings.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label>
        <label class="field full"><span>Razón social del local</span><input name="localLegalName"></label><label class="field"><span>RUT local</span><input name="localRut"></label><label class="field"><span>Contacto</span><input name="localContact"></label>
        <label class="field full"><span>Dirección del local</span><input name="localAddress"></label><label class="field"><span>Comuna</span><input name="localCommune"></label><label class="field"><span>Ciudad</span><input name="localCity"></label>
        <label class="field"><span>Teléfono local</span><input name="localPhone"></label><label class="field"><span>Correo local</span><input name="localEmail" type="email"></label></div>
      </div>
      <div class="panel"><div class="panel-head"><div><h3>Logo y paleta</h3><small>El logo se optimiza para que el PDF sea liviano y compatible.</small></div></div>
        <div class="logo-control"><label class="field"><span>Logo de la empresa (PNG, JPG o WebP)</span><input id="brandLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="btn danger logo-remove" type="button" id="removeBrandLogo">Quitar logo</button></div>
        <div class="color-grid" style="margin-top:12px"><label class="color-control"><span>Color principal</span><input name="primaryColor" type="color" value="${esc(branding.primaryColor||'#6246EA')}"></label><label class="color-control"><span>Color secundario</span><input name="secondaryColor" type="color" value="${esc(branding.secondaryColor||'#8067FF')}"></label><label class="color-control"><span>Cabecera de tabla</span><input name="tableHeaderColor" type="color" value="${esc(branding.tableHeaderColor||'#48484C')}"></label></div>
        <div class="form-grid" style="margin-top:12px"><label class="field"><span>Posición</span><select id="brandLogoPosition" name="logoPosition"><option value="left">Izquierda</option><option value="right">Derecha</option><option value="top">Arriba</option><option value="bottom">Abajo</option></select></label><label class="field"><span>Tamaño (mm)</span><input id="brandLogoSize" name="logoSize" type="range" min="18" max="78" value="${Number(branding.logoSize||42)}"></label><label class="field"><span>Alineación horizontal</span><select id="brandLogoAlignX" name="logoAlignX"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label><label class="field"><span>Alineación vertical</span><select id="brandLogoAlignY" name="logoAlignY"><option value="top">Arriba</option><option value="center">Centro</option><option value="bottom">Abajo</option></select></label><label class="field full"><span>Pie de página</span><input name="footerText" value="${esc(branding.footerText||'Documento generado por Pedidos Pro')}"></label></div>
      </div>
    </div><aside class="identity-preview" id="identityPreview"></aside></div>`,
    submitLabel:'Guardar identidad y diseño',
    onSubmit:async form=>{
      let logo={key:branding.logoKey||'',name:branding.logoName||'',width:branding.logoWidth||0,height:branding.logoHeight||0};
      const file=$('#brandLogoFile').files?.[0];
      if(file){const uploaded=await uploadLogo(file);logo={key:uploaded.key,name:uploaded.name,width:uploaded.width,height:uploaded.height}}
      if($('#removeBrandLogo').dataset.remove==='1')logo={key:'',name:'',width:0,height:0};
      const location=localById(settings,$('#brandLocation').value);
      settingsCache=await api('/api/settings',{method:'PATCH',json:{
        organizationName:form.get('organizationName'),
        business:{legalName:form.get('legalName'),rut:form.get('rut'),address:form.get('address'),commune:form.get('commune'),city:form.get('city'),phone:form.get('phone'),email:form.get('businessEmail')},
        branding:{primaryColor:form.get('primaryColor'),secondaryColor:form.get('secondaryColor'),tableHeaderColor:form.get('tableHeaderColor'),logoKey:logo.key,logoName:logo.name,logoWidth:logo.width,logoHeight:logo.height,logoSize:Number(form.get('logoSize')),logoPosition:form.get('logoPosition'),logoAlignX:form.get('logoAlignX'),logoAlignY:form.get('logoAlignY'),footerText:form.get('footerText')},
        location:location?{id:location.id,details:{legalName:form.get('localLegalName'),rut:form.get('localRut'),address:form.get('localAddress'),commune:form.get('localCommune'),city:form.get('localCity'),phone:form.get('localPhone'),email:form.get('localEmail'),contactName:form.get('localContact')}}:null
      }});
      applyBranding(settingsCache);state.me.organization.name=settingsCache.organization.name;showApp();toast('Identidad visual y PDF actualizados');
      const navigate=(await import('./app-views.js')).navigate;await navigate('settings');
    }
  });
  $('#brandLogoPosition').value=branding.logoPosition||'left';$('#brandLogoAlignX').value=branding.logoAlignX||'center';$('#brandLogoAlignY').value=branding.logoAlignY||'center';
  let previewLogo=logoUrl;
  const fillLocation=()=>{
    const location=localById(settings,$('#brandLocation').value);const details=location?.details||{};
    const map={localLegalName:'legalName',localRut:'rut',localAddress:'address',localCommune:'commune',localCity:'city',localPhone:'phone',localEmail:'email',localContact:'contactName'};
    for(const [field,key] of Object.entries(map))$('#modalFrame').elements[field].value=details[key]||'';
    updateIdentityPreview(previewLogo);
  };
  $('#brandLocation').onchange=fillLocation;fillLocation();
  $('#brandLogoFile').onchange=async()=>{const file=$('#brandLogoFile').files?.[0];if(!file)return;const converted=await imageToJpeg(file);if(previewLogo&&previewLogo!==logoUrl)URL.revokeObjectURL(previewLogo);previewLogo=URL.createObjectURL(converted.blob);$('#removeBrandLogo').dataset.remove='0';updateIdentityPreview(previewLogo)};
  $('#removeBrandLogo').onclick=()=>{$('#removeBrandLogo').dataset.remove='1';previewLogo='';$('#brandLogoFile').value='';updateIdentityPreview('')};
  $$('#modalFrame input,#modalFrame select').forEach(input=>{if(input.id!=='brandLogoFile')input.addEventListener('input',()=>updateIdentityPreview(previewLogo))});
  updateIdentityPreview(previewLogo);
}

async function openProfileSettings(userId=state.me?.user?.id){
  let user;
  if(userId===state.me?.user?.id){
    const settings=await refreshBranding(true);user={...settings.user,role:state.me.user.role};
  }else{
    const payload=await api('/api/users');user=(payload.users||[]).find(entry=>entry.id===userId);
  }
  if(!user)return toast('Usuario no encontrado','error');
  const profile=user.profile||{};
  openModal({eyebrow:'PERFIL PERSONAL',title:user.displayName,subtitle:'Estos datos identifican a la persona que solicita y emite cada pedido.',body:`<div class="form-grid"><label class="field full"><span>Nombre y apellido</span><input name="displayName" value="${esc(user.displayName||'')}" required></label><label class="field full"><span>Cargo</span><input name="jobTitle" value="${esc(profile.jobTitle||'')}" placeholder="Ej: Jefe de Barra"></label><label class="field"><span>Teléfono</span><input name="phone" type="tel" value="${esc(profile.phone||'')}"></label><label class="field"><span>Nombre para firma</span><input name="signatureName" value="${esc(profile.signatureName||'')}"></label><label class="field full"><span>Correo de acceso</span><input value="${esc(user.email||'')}" disabled></label></div>`,submitLabel:'Guardar perfil',onSubmit:async form=>{
    const updated=await api(`/api/users/${user.id}/profile`,{method:'PATCH',json:{displayName:form.get('displayName'),profile:{jobTitle:form.get('jobTitle'),phone:form.get('phone'),signatureName:form.get('signatureName')}}});
    if(user.id===state.me.user.id){state.me.user.displayName=updated.user.displayName;state.me.user.profile=updated.user.profile;showApp();settingsCache=null}
    toast('Perfil actualizado');const navigate=(await import('./app-views.js')).navigate;await navigate(state.view==='team'?'team':'settings');
  }});
}

export function initializeBrandingFeatures(){
  if(initialized)return;initialized=true;injectStyles();
  document.addEventListener('click',event=>{
    const branding=event.target.closest('[data-branding-settings]');if(branding){event.preventDefault();openBrandingSettings();return}
    const profile=event.target.closest('[data-user-profile]');if(profile){event.preventDefault();openProfileSettings(profile.dataset.userProfile||state.me?.user?.id)}
  });
}

export {openBrandingSettings,openProfileSettings};
