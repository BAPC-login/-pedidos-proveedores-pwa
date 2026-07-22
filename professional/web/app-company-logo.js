import {$,esc,state,api,toast} from './app-core.js';
import {openModal} from './app-modal.js';

let initialized=false;
let currentObjectUrl='';

function imageToJpeg(file){
  return new Promise((resolve,reject)=>{
    const source=URL.createObjectURL(file);const image=new Image();
    image.onload=()=>{try{const limit=1800;const scale=Math.min(1,limit/Math.max(image.naturalWidth||1,image.naturalHeight||1));const width=Math.max(1,Math.round(image.naturalWidth*scale));const height=Math.max(1,Math.round(image.naturalHeight*scale));const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);canvas.toBlob(blob=>{URL.revokeObjectURL(source);if(!blob)return reject(new Error('No se pudo convertir la imagen'));resolve({blob,width,height})},'image/jpeg',.92)}catch(error){URL.revokeObjectURL(source);reject(error)}};
    image.onerror=()=>{URL.revokeObjectURL(source);reject(new Error('El archivo no se puede leer. Usa JPG, PNG, WebP o una foto del iPhone.'))};image.src=source;
  });
}

async function protectedUrl(key){
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=''}
  if(!key)return '';
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok)return '';
  currentObjectUrl=URL.createObjectURL(await response.blob());return currentObjectUrl;
}

async function upload(file){
  if(!file||!file.size)throw new Error('Selecciona un logo');if(file.size>10*1024*1024)throw new Error('El logo supera 10 MB');const converted=await imageToJpeg(file);const form=new FormData();form.append('file',converted.blob,`${String(file.name||'logo').replace(/\.[^.]+$/,'')}.jpg`);const response=await fetch('/api/files?purpose=brand-logo',{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form});const payload=await response.json().catch(()=>({}));if(!response.ok||payload.ok===false)throw new Error(payload.error||'No se pudo cargar el logo');return {...payload.file,width:converted.width,height:converted.height};
}

export async function openCompanyLogoUploader(){
  const settings=await api('/api/settings');const branding=settings.organization.branding||{};let preview=await protectedUrl(branding.logoKey);let pendingFile=null;
  openModal({eyebrow:'LOGO CORPORATIVO',title:'Cargar logo de la empresa',subtitle:'Este acceso modifica solo el logo y su posición. No mezcla datos personales ni cambia el catálogo.',body:`<div class="stack"><div class="supplier-preview" id="companyLogoPreview">${preview?`<img src="${preview}" alt="Logo actual">`:'<span>Sin logo cargado</span>'}</div><label class="field"><span>Seleccionar imagen o fotografía</span><input id="companyLogoFile" type="file" accept="image/*,.heic,.heif"></label><div id="companyLogoStatus" class="auth-note">El logo se convertirá a JPG compatible antes de guardarlo.</div><div class="form-grid"><label class="field"><span>Tamaño</span><input name="logoSize" type="range" min="18" max="78" value="${Number(branding.logoSize||42)}"></label><label class="field"><span>Posición</span><select name="logoPosition"><option value="left">Izquierda</option><option value="right">Derecha</option><option value="top">Arriba</option><option value="bottom">Abajo</option></select></label><label class="field"><span>Alineación horizontal</span><select name="logoAlignX"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label><label class="field"><span>Alineación vertical</span><select name="logoAlignY"><option value="top">Arriba</option><option value="center">Centro</option><option value="bottom">Abajo</option></select></label></div><label class="check-card"><input name="removeLogo" type="checkbox"><span><strong>Quitar logo corporativo</strong><small>Mantiene colores, datos de empresa y documentos históricos</small></span></label></div>`,submitLabel:'Guardar logo corporativo',onSubmit:async form=>{let logo={key:branding.logoKey||'',name:branding.logoName||'',width:branding.logoWidth||0,height:branding.logoHeight||0};if(form.get('removeLogo')==='on')logo={key:'',name:'',width:0,height:0};if(pendingFile){const uploaded=await upload(pendingFile);logo={key:uploaded.key,name:uploaded.name,width:uploaded.width,height:uploaded.height}}await api('/api/settings',{method:'PATCH',json:{branding:{logoKey:logo.key,logoName:logo.name,logoWidth:logo.width,logoHeight:logo.height,logoSize:Number(form.get('logoSize')||42),logoPosition:form.get('logoPosition'),logoAlignX:form.get('logoAlignX'),logoAlignY:form.get('logoAlignY')}}});toast('Logo corporativo guardado y aplicado a los próximos PDF');const navigate=(await import('./app-views.js')).navigate;await navigate('settings')}});
  const frame=$('#modalFrame');frame.elements.logoPosition.value=branding.logoPosition||'left';frame.elements.logoAlignX.value=branding.logoAlignX||'center';frame.elements.logoAlignY.value=branding.logoAlignY||'center';
  $('#companyLogoFile').onchange=async()=>{pendingFile=$('#companyLogoFile').files?.[0]||null;if(!pendingFile)return;$('#companyLogoStatus').textContent='Procesando vista previa…';try{const converted=await imageToJpeg(pendingFile);preview=URL.createObjectURL(converted.blob);$('#companyLogoPreview').innerHTML=`<img src="${preview}" alt="Nuevo logo">`;$('#companyLogoStatus').textContent=`${pendingFile.name} listo para guardar · ${converted.width} × ${converted.height}px`}catch(error){pendingFile=null;$('#companyLogoStatus').textContent=error.message;toast(error.message,'error')}};
}

function enhance(){
  if(state.view!=='settings'||$('#companyLogoQuickButton'))return;const company=$('[data-branding-settings]')?.closest('.settings-purpose')||$('[data-branding-settings]')?.parentElement;if(!company)return;const button=document.createElement('button');button.id='companyLogoQuickButton';button.className='btn wide-action';button.type='button';button.textContent='Subir logo corporativo directamente';button.dataset.companyLogo='1';company.append(button);
}

export function initializeCompanyLogoUploader(){
  if(initialized)return;initialized=true;document.addEventListener('click',event=>{const target=event.target.closest('[data-company-logo]');if(!target)return;event.preventDefault();openCompanyLogoUploader().catch(error=>toast(error.message,'error'))});new MutationObserver(enhance).observe($('#appShell')||document.body,{subtree:true,childList:true});enhance();
}
