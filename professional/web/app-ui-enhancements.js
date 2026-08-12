import {$,$$,esc,state,api,toast,setBusy} from './app-core.js';
import {openRoute} from './app-router-v14.js';
import {hydrateImages,loadMatrix,loadPolicy,setPolicy} from './app-v32-base.js';

let originalFetch=null;

function previewFile(file,target){
  if(!file||!target)return;const url=URL.createObjectURL(file),image=String(file.type||'').startsWith('image/');
  target.innerHTML=`<div class="v32-file-preview"><div class="v32-file-thumb">${image?`<img src="${url}" alt="Vista previa del documento">`:'PDF'}</div><div><strong>${esc(file.name)}</strong><small>${(file.size/1024/1024).toFixed(2)} MB · ${esc(file.type||'archivo')}</small></div><button class="btn" type="button" data-v32-replace>Reemplazar</button></div>`;
  target.querySelector('[data-v32-replace]')?.addEventListener('click',()=>target.previousElementSibling?.querySelector('input[type=file]')?.click());
}

function enhanceInvoiceUpload(root=document){
  const input=root.querySelector?.('#modalBody input[type=file][name=file],.modal-body input[type=file][name=file]');if(!input||input.dataset.v32Preview)return;
  input.dataset.v32Preview='1';const target=document.createElement('div');target.id='v32InvoiceFilePreview';input.closest('.field')?.insertAdjacentElement('afterend',target);input.addEventListener('change',()=>previewFile(input.files?.[0],target));input.closest('.modal-card,#modalFrame')?.setAttribute('aria-describedby','v32InvoiceFilePreview');
}

async function enhanceInvoiceReview(root=document){
  const lines=[...root.querySelectorAll?.('[data-invoice-line]')||[]];if(!lines.length||root.querySelector?.('#v32PolicySummary'))return;
  const config=await loadPolicy().catch(()=>({extraItemsMode:'review',learnFromCorrections:true})),body=root.querySelector('#modalBody,.modal-body');if(!body)return;
  const summary=document.createElement('section');summary.id='v32PolicySummary';summary.className='v32-policy-summary';summary.innerHTML=`<strong>Control de productos adicionales</strong><p>Excluye productos no solicitados. Al confirmar, Nuvasto aprende la relación entre proveedor, producto, descripción, formato y precio corregido.</p><label class="field"><span>Tratamiento del documento</span><select id="v32ExtraDecision"><option value="review">Revisar productos adicionales</option><option value="reject" ${config.extraItemsMode==='reject'?'selected':''}>Rechazar líneas marcadas</option><option value="allow" ${config.extraItemsMode==='allow'?'selected':''}>Permitir productos adicionales</option></select></label>`;body.prepend(summary);
  lines.forEach((row,index)=>{
    if(row.querySelector('[data-v32-reject-line]'))return;const select=row.querySelector('[name=productId]'),unmatched=!select?.value,box=document.createElement('div');box.className='v32-policy-line';box.innerHTML=`<label class="check-card"><input type="checkbox" data-v32-reject-line="${index}" ${unmatched&&config.extraItemsMode==='reject'?'checked':''}><span><strong>Excluir esta línea</strong><small>${unmatched?'No está vinculada a un producto del pedido.':'Actívalo cuando el proveedor haya agregado algo no solicitado.'}</small></span></label>`;row.append(box);const checkbox=box.querySelector('input'),paint=()=>box.classList.toggle('rejected',checkbox.checked);checkbox.onchange=paint;paint();select?.addEventListener('change',()=>{box.querySelector('small').textContent=select.value?'Actívalo cuando el proveedor haya agregado algo no solicitado.':'No está vinculada a un producto del pedido.'});
  });
  root.querySelector('#modalSubmit')?.setAttribute('aria-describedby','v32PolicySummary');
}

function installInvoiceRequestEnrichment(){
  if(originalFetch)return;originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    try{
      const url=typeof input==='string'?input:input.url,method=String(init.method||(typeof input!=='string'?input.method:'GET')||'GET').toUpperCase();
      if(method==='POST'&&new URL(url,location.origin).pathname==='/api/invoices'&&typeof init.body==='string'){
        const body=JSON.parse(init.body),indices=window.NuvastoV32RejectedIndices||[],decision=window.NuvastoV32ExtraDecision||'review';body.lines=(body.lines||[]).map((line,index)=>indices.includes(index)?{...line,policyAction:'reject',rejectedByPolicy:true,policyReason:'Producto no solicitado'}:line);body.extraItemsDecision=decision;init={...init,body:JSON.stringify(body)};
      }
    }catch(error){console.warn('v32_invoice_request_enrichment_failed',error)}
    return originalFetch(input,init);
  };
  document.addEventListener('click',event=>{
    const submit=event.target.closest?.('#modalSubmit');if(!submit||!document.querySelector('[data-invoice-line]'))return;
    const all=$$('[data-invoice-line]'),rejected=$$('[data-v32-reject-line]:checked').map(input=>Number(input.dataset.v32RejectLine));
    if(rejected.length===all.length){event.preventDefault();event.stopImmediatePropagation();toast('No puedes excluir todas las líneas del documento.','error');return}
    window.NuvastoV32RejectedIndices=rejected;window.NuvastoV32ExtraDecision=$('#v32ExtraDecision')?.value||'review';
  },true);
}

async function enhanceSettings(){
  if(state.view!=='settings'||$('#v32PolicySettings'))return;const root=$('#mainContent');if(!root)return;
  const[config,rulesPayload]=await Promise.all([loadPolicy(true),api('/api/learning/rules',{fresh:true,timeout:20000}).catch(()=>({rules:[]}))]),rules=rulesPayload.rules||[],section=document.createElement('section');section.id='v32PolicySettings';section.className='v32-settings-section';
  section.innerHTML=`<header><span class="eyebrow">DOCUMENTOS Y APRENDIZAJE</span><h3>Políticas de facturas</h3><p>Define cómo tratar productos no solicitados y cómo aprende Nuvasto de las correcciones confirmadas.</p></header><div class="v32-filter-grid"><label class="field"><span>Productos adicionales</span><select id="v32PolicyExtra"><option value="allow" ${config.extraItemsMode==='allow'?'selected':''}>Permitir</option><option value="review" ${config.extraItemsMode==='review'?'selected':''}>Revisar</option><option value="reject" ${config.extraItemsMode==='reject'?'selected':''}>Rechazar</option></select></label><label class="field"><span>Alerta de variación de precio</span><input id="v32PolicyVariance" type="number" min="1" max="200" value="${Number(config.priceVarianceWarningPct||12)}"><small>Porcentaje</small></label><label class="check-card"><input id="v32PolicyPreview" type="checkbox" ${config.requireInvoicePreview?'checked':''}><span><strong>Vista previa obligatoria</strong><small>Revisar el archivo antes de guardar</small></span></label><label class="check-card"><input id="v32PolicyLearning" type="checkbox" ${config.learnFromCorrections?'checked':''}><span><strong>Aprender de correcciones</strong><small>Producto, formato y precio por proveedor</small></span></label></div><button class="btn primary" id="v32SavePolicy">Guardar política</button><div><h3 style="margin-top:8px">Aprendizaje reciente</h3><p>${rules.length} regla${rules.length===1?'':'s'} aprendida${rules.length===1?'':'s'}.</p><div class="v32-learning-list">${rules.slice(0,10).map(rule=>`<article class="v32-learning-row"><div><strong>${esc(rule.productName)} · ${esc(rule.supplierName)}</strong><small>${esc(rule.sourceDescription)} · formato ${rule.learnedPackSize} · ${rule.correctionCount} confirmación${rule.correctionCount===1?'':'es'} · último precio $${Number(rule.lastConfirmedUnitPrice||0).toLocaleString('es-CL')}</small></div><span class="v32-chip ok">${Math.round(rule.confidence*100)}%</span></article>`).join('')||'<div class="v32-empty"><p>Las reglas aparecerán al confirmar correcciones en facturas.</p></div>'}</div></div><button class="btn" id="v32OpenMatrix">Abrir matriz de productos y proveedores</button>`;root.append(section);
  $('#v32SavePolicy').onclick=async()=>{const button=$('#v32SavePolicy');setBusy(button,true,'Guardando…');try{const response=await api('/api/procurement/policies',{method:'PUT',json:{extraItemsMode:$('#v32PolicyExtra').value,requireInvoicePreview:$('#v32PolicyPreview').checked,learnFromCorrections:$('#v32PolicyLearning').checked,priceVarianceWarningPct:Number($('#v32PolicyVariance').value||12)}});setPolicy(response.policy);toast('Política actualizada')}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
  $('#v32OpenMatrix').onclick=()=>openRoute('catalog');
}

async function enhanceMasterPhotos(){
  const data=await loadMatrix().catch(()=>null);if(!data)return;const byId=new Map((data.products||[]).map(item=>[item.id,item]));
  for(const row of $$('[data-order-product]')){if(row.querySelector('.v32-master-photo'))continue;const product=byId.get(row.dataset.orderProduct);if(!product?.imageKey)continue;const title=row.querySelector('.order-file-product strong,.order-file-product');if(!title)continue;const holder=document.createElement('span');holder.className='v32-master-photo';holder.dataset.v32ImageKey=product.imageKey;holder.dataset.v32ImageAlt=product.name;title.prepend(holder)}hydrateImages(document);
}

function normalizeVisibleCopy(){
  document.querySelectorAll('[data-action="analyze-invoice"],#v18AttachInvoice,#attachInvoice,#v18AttachInvoiceBottom').forEach(button=>{if(/IA/i.test(button.textContent||''))button.textContent=button.textContent.replace(/\s*y cotejar IA|\s*IA/gi,'').trim()||'Procesar factura'});
  document.querySelectorAll('.toast.error,[data-error-message]').forEach(node=>node.setAttribute('role','alert'));
}

function enhanceAll(){normalizeVisibleCopy();enhanceInvoiceUpload(document);enhanceInvoiceReview(document).catch(()=>{});enhanceMasterPhotos().catch(()=>{});if(state.view==='settings')enhanceSettings().catch(error=>console.warn('v32_settings_failed',error))}

export function initializeEnhancementsV32(){
  installInvoiceRequestEnrichment();document.addEventListener('pedidos:view-rendered',()=>setTimeout(enhanceAll,20));window.addEventListener('nuvasto:v32-matrix',()=>enhanceMasterPhotos().catch(()=>{}));new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))requestAnimationFrame(enhanceAll)}).observe(document.body,{subtree:true,childList:true});enhanceAll();
}
