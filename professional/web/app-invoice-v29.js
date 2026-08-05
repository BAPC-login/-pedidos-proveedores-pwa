import {$,$$,esc,state,api,toast,money,date} from './app-core.js';
import {openModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';

const DOCUMENT_TYPES=[['33','Factura electrónica'],['39','Boleta electrónica'],['52','Guía de despacho electrónica'],['61','Nota de crédito electrónica'],['34','Factura exenta'],['0','Otro documento']];
const eligible=order=>order.publicState==='emitted'&&Number(order.invoiceCount||0)===0&&!['received','reconciled','closed','cancelled'].includes(String(order.status||''));

async function sources(force=false){
  const requests=[];
  if(force||!state.cache.orders.length)requests.push(api('/api/orders',{fresh:true,timeout:20000}).then(payload=>state.cache.orders=payload.orders||[]));
  if(force||!state.cache.products.length)requests.push(api('/api/products',{fresh:force,timeout:20000}).then(payload=>state.cache.products=payload.products||[]));
  if(force||!state.cache.suppliers.length)requests.push(api('/api/suppliers',{fresh:force,timeout:20000}).then(payload=>state.cache.suppliers=payload.suppliers||[]));
  if(force||!state.cache.locations.length)requests.push(api('/api/locations',{fresh:force,timeout:20000}).then(payload=>state.cache.locations=payload.locations||[]));
  await Promise.all(requests);
}

async function orderPdf(orderId){
  try{
    let payload=await api(`/api/documents?entityType=order&entityId=${encodeURIComponent(orderId)}&kind=order_pdf`,{fresh:true,timeout:20000});
    let document=(payload.documents||[]).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0];
    if(!document?.key){await api(`/api/orders/${encodeURIComponent(orderId)}/pdf`,{method:'POST',json:{},timeout:30000});payload=await api(`/api/documents?entityType=order&entityId=${encodeURIComponent(orderId)}&kind=order_pdf`,{fresh:true,timeout:20000});document=(payload.documents||[]).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0]}
    if(!document?.key)return null;
    const response=await fetch(`/api/files/${encodeURIComponent(document.key)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'no-store'});
    if(!response.ok)return null;
    const blob=await response.blob();return new File([blob],document.name||'pedido.pdf',{type:blob.type||'application/pdf'});
  }catch(error){console.warn('order_pdf_optional_for_invoice',error);return null}
}

function typeOptions(selected){return DOCUMENT_TYPES.map(([value,label])=>`<option value="${value}" ${String(selected||'33')===value?'selected':''}>${esc(label)}</option>`).join('')}
function scoreLabel(value){const score=Number(value||0);return score>=.8?'Alta':score>=.55?'Media':'Revisar'}
function lineSource(line,index){return line.sourceLine||line.descriptionOriginal||line.description||`Línea ${index+1}`}
function conversion(line){
  if(line.conversionSummary)return line.conversionSummary;
  const qty=Number(line.packageQty??line.invoiceQuantity??0),pack=Number(line.packSize||1),units=Number(line.units||qty*pack),orderPack=Number(line.orderPackSize||1),equivalent=orderPack?units/orderPack:0;
  return orderPack>1?`Factura: ${units} unidades = ${equivalent} formatos de ${orderPack}`:`Factura: ${units} unidades`;
}

function reviewBody(analysis,lines){
  const invoice=analysis.invoice||{},totals=invoice.totals||{},today=new Date().toISOString().slice(0,10),matched=lines.filter(line=>line.productId).length,exact=lines.filter(line=>line.quantityStatus==='exact').length,warnings=invoice.warnings||analysis.warnings||[];
  return `${warnings.length?`<section class="security-note"><strong>Revisión necesaria</strong><p>${warnings.map(esc).join(' · ')}</p></section>`:''}<section class="v19-invoice-summary"><article><strong>${esc(invoice.invoiceNumber||'Pendiente')}</strong><small>Número</small></article><article><strong>${invoice.invoiceDate?date(invoice.invoiceDate):'Sin fecha'}</strong><small>Fecha</small></article><article><strong>${matched}/${lines.length}</strong><small>Vinculados</small></article><article><strong>${exact}/${lines.length}</strong><small>Cantidades exactas</small></article></section><div class="form-grid"><label class="field"><span>Tipo de documento</span><select name="documentType">${typeOptions(invoice.documentTypeCode||invoice.documentType||'33')}</select></label><label class="field"><span>Número de documento</span><input name="invoiceNumber" value="${esc(invoice.invoiceNumber||'')}" required></label><label class="field"><span>Fecha</span><input name="invoiceDate" type="date" value="${esc(invoice.invoiceDate||today)}" required></label><label class="field"><span>Neto</span><input name="net" type="number" min="0" value="${Number(totals.net||0)}"></label><label class="field"><span>IVA</span><input name="vat" type="number" min="0" value="${Number(totals.vat||totals.tax||0)}"></label><label class="field"><span>Impuesto adicional</span><input name="additionalTax" type="number" min="0" value="${Number(totals.additionalTax||0)}"></label><label class="field"><span>Total</span><input name="total" type="number" min="0" value="${Number(totals.total||0)}"></label></div><div class="v29-invoice-lines">${lines.map((line,index)=>`<article class="v29-invoice-line" data-invoice-line="${index}"><header><div><span class="eyebrow">LÍNEA ${index+1}</span><strong>${esc(lineSource(line,index))}</strong></div><span class="status ${Number(line.confidence||0)>=.55?'active':'requested'}">${scoreLabel(line.confidence)} · ${Math.round(Number(line.confidence||0)*100)}%</span></header><div class="v29-conversion ${['partial','excess'].includes(line.quantityStatus)?'review':''}">${esc(conversion(line))}</div><label class="field full"><span>Producto cotejado</span><select name="productId"><option value="">Sin vincular</option>${state.cache.products.map(product=>`<option value="${esc(product.id)}" ${String(product.id)===String(line.productId)?'selected':''}>${esc(product.name)}</option>`).join('')}</select></label><div class="v29-line-grid"><label class="field"><span>Cantidad leída</span><input name="packageQty" type="number" min="0" step="0.001" value="${Number(line.packageQty??line.invoiceQuantity??0)}" inputmode="decimal"></label><label class="field"><span>Unidades por formato leído</span><input name="packSize" type="number" min="0.001" step="0.001" value="${Number(line.packSize||1)}" inputmode="decimal"></label><label class="field"><span>Total unidades</span><output data-units>${Number(line.units||0)}</output></label><label class="field"><span>Total línea</span><input name="grossLineTotal" type="number" min="0" value="${Number(line.isFree?0:line.grossLineTotal||0)}" inputmode="numeric" ${line.isFree?'disabled':''}></label><label class="field"><span>Precio final por unidad</span><output data-price>${money(line.isFree?0:line.grossUnitPrice||0)}</output></label><label class="check-card"><input name="isFree" type="checkbox" ${line.isFree?'checked':''}><span><strong>Bonificado</strong><small>Precio $0</small></span></label></div><label class="field full"><span>Observación</span><input name="freeReason" value="${esc(line.freeReason||line.notes||'')}"></label></article>`).join('')}</div>`;
}

function bindLineMath(lines){
  const calculate=row=>{const qty=Number(row.querySelector('[name=packageQty]').value||0),pack=Number(row.querySelector('[name=packSize]').value||1),free=row.querySelector('[name=isFree]').checked,totalInput=row.querySelector('[name=grossLineTotal]');if(free){totalInput.value='0';totalInput.disabled=true}else totalInput.disabled=false;const units=qty*pack,total=free?0:Number(totalInput.value||0);row.querySelector('[data-units]').textContent=String(Math.round(units*1000)/1000);row.querySelector('[data-price]').textContent=money(units?Math.round(total/units):0)};
  $$('[data-invoice-line]').forEach((row,index)=>{row.querySelectorAll('[name=packageQty],[name=packSize],[name=grossLineTotal],[name=isFree]').forEach(input=>input.addEventListener('input',()=>calculate(row)));calculate(row);row.dataset.source=String(index)});
}

async function openReview(analysis,{supplierId,orderId,locationId,returnToHistory}){
  const invoice=analysis.invoice||{},lines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[];
  if(!lines.length)throw new Error('No se detectaron productos. Usa una foto completa, nítida y sin recortar la factura.');
  openModal({eyebrow:'CHECKOUT DE FACTURA',title:`${lines.length} línea${lines.length===1?'':'s'} detectada${lines.length===1?'':'s'}`,subtitle:'Confirma el producto, la conversión de formatos y el precio antes de guardar.',size:'large',body:reviewBody(analysis,lines),submitLabel:'Guardar factura y cotejo',onSubmit:async form=>{
    const reviewed=$$('[data-invoice-line]').map((row,index)=>{const original=lines[index],packageQty=Number(row.querySelector('[name=packageQty]').value||0),packSize=Number(row.querySelector('[name=packSize]').value||1),units=packageQty*packSize,isFree=row.querySelector('[name=isFree]').checked,grossLineTotal=isFree?0:Number(row.querySelector('[name=grossLineTotal]').value||0);return{...original,productId:row.querySelector('[name=productId]').value,sourceDescription:lineSource(original,index),packageQty,invoiceQuantity:packageQty,packSize,units,totalUnits:units,grossLineTotal,grossUnitPrice:isFree?0:(units?Math.round(grossLineTotal/units):0),isFree,freeReason:isFree?row.querySelector('[name=freeReason]').value:''}});
    if(!reviewed.some(line=>line.productId))throw new Error('Vincula al menos una línea con un producto del catálogo');
    const saved=await api('/api/invoices',{method:'POST',timeout:45000,json:{supplierId,locationId,orderIds:orderId?[orderId]:[],invoiceNumber:form.get('invoiceNumber'),invoiceDate:form.get('invoiceDate'),currency:'CLP',documentType:form.get('documentType'),totals:{net:Number(form.get('net')||0),vat:Number(form.get('vat')||0),additionalTax:Number(form.get('additionalTax')||0),total:Number(form.get('total')||0)},aiModel:analysis.model||'',sourceFileId:analysis.sourceFile?.id||'',aiConfidence:reviewed.filter(line=>line.productId).length/reviewed.length,lines:reviewed}});
    state.cache.orders=[];state.cache.invoices=[];toast('Factura, cotejo y precios guardados');await openRoute(returnToHistory||orderId?'history':'invoices','',{replace:true});return saved;
  }});
  bindLineMath(lines);
}

function pendingContext(orders){
  const supplierIds=[...new Set(orders.map(order=>order.supplierId))],suppliers=state.cache.suppliers.filter(item=>supplierIds.includes(item.id));
  return `<label class="field"><span>Proveedor</span><select name="supplierId" id="v29InvoiceSupplier">${suppliers.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Local</span><select name="locationId" id="v29InvoiceLocation"></select></label><label class="field full"><span>Pedido pendiente</span><select name="orderId" id="v29InvoiceOrder" required></select></label>`;
}

export async function openInvoiceAnalysisV29(options={}){
  await sources(true);
  let preset=null;if(options.orderId)preset=(await api(`/api/orders/${encodeURIComponent(options.orderId)}`,{fresh:true,timeout:20000})).order;
  const pending=state.cache.orders.filter(eligible);
  if(!preset&&!pending.length)return toast('No hay pedidos emitidos pendientes de factura','error');
  const context=preset?`<section class="security-note full"><strong>${esc(preset.folio)} · ${esc(preset.supplierName)}</strong><p>${esc(preset.locationName)} · ${esc(preset.costCenterName||'')} · la factura quedará vinculada a este pedido.</p></section><input type="hidden" name="supplierId" value="${esc(preset.supplierId)}"><input type="hidden" name="locationId" value="${esc(preset.locationId)}"><input type="hidden" name="orderId" value="${esc(preset.id)}">`:pendingContext(pending);
  openModal({eyebrow:'ETAPA 2 · DOCUMENTO',title:'Adjuntar documento al pedido',subtitle:'Gemini leerá la factura y la comparará con productos, cantidades, cajas y unidades del folio.',size:'large',closeOnSuccess:false,body:`<div class="form-grid">${context}<label class="field full"><span>Factura, boleta, guía o nota de crédito</span><input name="file" type="file" accept="application/pdf,image/*" required></label></div><section class="security-note"><strong>Lectura vinculada</strong><p>El archivo original se guarda en R2. Las equivalencias como 48 botellas = 8 cajas de 6 se calculan antes de mostrar el checkout.</p></section>`,submitLabel:'Leer y cotejar con IA',onSubmit:async form=>{
    const file=form.get('file');if(!(file instanceof File)||!file.size)throw new Error('Selecciona una imagen o PDF');
    const orderId=String(form.get('orderId')||''),supplierId=String(form.get('supplierId')||''),locationId=String(form.get('locationId')||'');
    const order=preset?.id===orderId?preset:(await api(`/api/orders/${encodeURIComponent(orderId)}`,{fresh:true,timeout:20000})).order;
    const products=order.items.map(item=>({productId:item.productId,description:item.description,unit:item.orderUnit,orderedQty:item.quantityOrdered,unitsPerOrderUnit:item.unitsPerOrderUnit}));
    const aliases=(await api(`/api/aliases?supplierId=${encodeURIComponent(supplierId)}`,{fresh:true,timeout:20000}).catch(()=>({aliases:[]}))).aliases||[];
    const upload=new FormData();upload.append('file',file,file.name);const pdf=await orderPdf(orderId);if(pdf)upload.append('orderFile',pdf,pdf.name);upload.append('context',JSON.stringify({providerName:order.supplierName,folio:order.folio,products,aliases:aliases.map(alias=>({productId:alias.productId,alias:alias.alias,confidence:alias.confidence,usageCount:alias.usageCount})),locationId,fileName:file.name}));
    const response=await api('/api/invoices/analyze',{method:'POST',body:upload,timeout:125000});
    await openReview(response.analysis,{supplierId,orderId,locationId,returnToHistory:options.returnToHistory!==false});
  }});
  if(!preset){const supplier=$('#v29InvoiceSupplier'),location=$('#v29InvoiceLocation'),order=$('#v29InvoiceOrder');const syncOrders=()=>{const list=pending.filter(item=>item.supplierId===supplier.value&&item.locationId===location.value);order.innerHTML=list.map(item=>`<option value="${esc(item.id)}">${esc(item.folio)} · ${esc(item.costCenterName||'Centro')} · ${Number(item.itemCount||0)} productos</option>`).join('');$('#modalSubmit').disabled=!list.length};const syncLocations=()=>{const list=pending.filter(item=>item.supplierId===supplier.value),locations=[...new Map(list.map(item=>[item.locationId,item.locationName])).entries()];location.innerHTML=locations.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');syncOrders()};supplier.onchange=syncLocations;location.onchange=syncOrders;syncLocations()}
}
