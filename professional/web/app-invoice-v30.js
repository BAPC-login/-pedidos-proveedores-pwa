import {$,$$,esc,state,api,toast,money,date} from './app-core.js';
import {openModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';
import {beginNuvastoProgress,endNuvastoProgress,setNuvastoProgress,showNuvastoNotice} from './app-runtime-v30.js';

const DOCUMENT_TYPES=[['33','Factura electrónica'],['39','Boleta electrónica'],['52','Guía de despacho electrónica'],['61','Nota de crédito electrónica'],['34','Factura exenta'],['0','Otro documento']];
const eligible=order=>Number(order.invoiceCount||0)===0&&!['draft','reconciled','closed','cancelled'].includes(String(order.status||''));
const canQuickReceive=()=>['owner','admin','receiver'].includes(String(state.me?.user?.role||''));
let paymentMethods=[];

async function sources(force=false){
  const requests=[];
  if(force||!state.cache.orders.length)requests.push(api('/api/orders',{fresh:true,timeout:20000}).then(payload=>state.cache.orders=payload.orders||[]));
  if(force||!state.cache.products.length)requests.push(api('/api/products',{fresh:force,timeout:20000}).then(payload=>state.cache.products=payload.products||[]));
  if(force||!state.cache.suppliers.length)requests.push(api('/api/suppliers',{fresh:force,timeout:20000}).then(payload=>state.cache.suppliers=payload.suppliers||[]));
  if(force||!state.cache.locations.length)requests.push(api('/api/locations',{fresh:force,timeout:20000}).then(payload=>state.cache.locations=payload.locations||[]));
  if(force||!paymentMethods.length)requests.push(api('/api/finance/payment-methods',{fresh:force,timeout:15000}).then(payload=>paymentMethods=payload.methods||[]).catch(error=>{console.warn('payment_methods_invoice_load_failed',error);paymentMethods=[]}));
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
function norm(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()}
function tokens(value){return new Set(norm(value).split(' ').filter(token=>token.length>1&&!['DE','DEL','LA','EL','Y','CON','SIN','UNIDAD','CAJA','PACK','DISPLAY'].includes(token)))}
function similarity(left,right){const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let hits=0;for(const token of a)if(b.has(token)||[...b].some(other=>other.startsWith(token)||token.startsWith(other)))hits++;return hits/Math.max(a.size,b.size)}
function lineSource(line,index){return line.sourceLine||line.descriptionOriginal||line.description||`Línea ${index+1}`}
function scoreLabel(value){const score=Number(value||0);return score>=.8?'Coincidencia alta':score>=.55?'Coincidencia media':'Revisión manual'}
function conversion(line){if(line.conversionSummary)return line.conversionSummary;const qty=Number(line.packageQty??line.invoiceQuantity??0),pack=Number(line.packSize||1),units=Number(line.units||qty*pack),orderPack=Number(line.orderPackSize||1),equivalent=orderPack?units/orderPack:0;return orderPack>1?`Documento: ${units} unidades = ${Number(equivalent.toFixed(3))} formatos de ${orderPack}`:`Documento: ${units} unidades`}

function reconcileLineProducts(lines,order){
  const products=order.items.map(item=>({id:item.productId,name:item.description,orderUnit:item.orderUnit,pack:Number(item.unitsPerOrderUnit||1),ordered:Number(item.quantityOrdered||0)}));
  return lines.map((line,index)=>{
    if(line.productId&&products.some(product=>String(product.id)===String(line.productId)))return line;
    const ranked=products.map(product=>({product,score:similarity(lineSource(line,index),product.name)})).sort((a,b)=>b.score-a.score),best=ranked[0];
    if(!best||best.score<.42)return line;
    return{...line,productId:best.product.id,description:best.product.name,orderPackSize:best.product.pack,confidence:Math.max(Number(line.confidence||0),best.score),matchMethod:'nuvasto_local_catalog',matchReason:'Coincidencia local con el pedido'};
  });
}

function productOptions(order,selected=''){return order.items.map(item=>`<option value="${esc(item.productId)}" ${String(item.productId)===String(selected)?'selected':''}>${esc(item.description)} · ${esc(item.orderUnit)}</option>`).join('')}
function methodOptions(payment={}){const selected=paymentMethods.find(item=>item.kind===payment.methodKind)||paymentMethods.find(item=>item.code===payment.methodKind);return`<option value="">Sin medio asignado</option>${paymentMethods.map(item=>`<option value="${esc(item.id)}" data-kind="${esc(item.kind)}" ${item.id===selected?.id?'selected':''}>${esc(item.name)}</option>`).join('')}`}
function paymentSection(invoice){
  const payment=invoice.payment||{},cheque=payment.cheque||{},detected=Boolean(payment.detected),kind=String(payment.methodKind||''),selected=paymentMethods.find(item=>item.kind===kind),confidence=Math.round(Number(payment.confidence||0)*100),amount=Number(payment.amount||cheque.amount||invoice.totals?.total||0),paymentDate=String(payment.paymentDate||cheque.collectionDate||'');
  return `<section class="v30-section" id="v30PaymentSection"><label class="check-card"><input name="registerPayment" id="v30RegisterPayment" type="checkbox" ${detected?'checked':''}><span><strong>${detected?'Medio de pago detectado por IA':'Registrar medio de pago junto con la factura'}</strong><small>${detected?`${esc(selected?.name||payment.methodLabel||kind||'Pago')} · confianza ${confidence}% · confirma antes de guardar`:'Opcional. Puedes dejarlo pendiente y registrarlo después desde Finanzas.'}</small></span></label><div id="v30PaymentFields" class="v30-field-grid ${detected?'':'hidden'}"><label class="field full"><span>Medio de pago</span><select name="paymentMethodId" id="v30PaymentMethod">${methodOptions(payment)}</select></label><label class="field"><span>Fecha de pago / operación</span><input name="paymentDate" type="date" value="${esc(paymentDate)}"></label><label class="field"><span>Monto asociado</span><input name="paymentAmount" type="number" min="0" value="${amount}" inputmode="numeric"></label><label class="field full"><span>Referencia</span><input name="paymentReference" value="${esc(payment.reference||'')}" placeholder="Operación, voucher u otra referencia visible"></label></div><div id="v30ChequeFields" class="v30-field-grid ${kind==='cheque'&&detected?'':'hidden'}"><label class="field"><span>Número / serie del cheque</span><input name="chequeNumber" value="${esc(cheque.serialNumber||'')}"></label><label class="field"><span>Fecha programada de cobro</span><input name="chequeCollectionDate" type="date" value="${esc(cheque.collectionDate||paymentDate)}"></label><label class="field"><span>Destinatario</span><input name="chequePayee" value="${esc(cheque.payee||'')}"></label><label class="field"><span>Monto del cheque</span><input name="chequeAmount" type="number" min="0" value="${Number(cheque.amount||amount||0)}" inputmode="numeric"></label><label class="field full"><span>Banco</span><input name="chequeBank" value="${esc(cheque.bank||'')}"></label></div></section>`;
}

function reviewBody(analysis,lines,order){
  const invoice=analysis.invoice||{},totals=invoice.totals||{},todayValue=new Date().toISOString().slice(0,10),matched=lines.filter(line=>line.productId).length,warnings=[...(analysis.warnings||[]),...(invoice.warnings||[])];
  const quickReception=canQuickReceive()&&!['received','reconciled','closed'].includes(String(order.status||''))?`<section class="v30-section"><label class="check-card"><input name="markReceived" type="checkbox"><span><strong>Marcar también como recepcionado</strong><small>Opcional. Registra como recibidas las cantidades pendientes del pedido y actualiza ambos estados en una sola operación.</small></span></label><label class="field"><span>Fecha de recepción</span><input name="receptionDate" type="date" value="${todayValue}" max="${todayValue}"></label></section>`:'';
  return `${analysis.degraded?`<section class="v30-inline-notice"><strong>Revisión manual asistida</strong><p>Nuvasto guardó el archivo, pero no obtuvo una lectura automática confiable. Completa las cantidades y valores sobre los productos precargados del pedido.</p></section>`:''}${warnings.length?`<section class="v30-inline-notice"><strong>Observaciones de lectura</strong><p>${warnings.map(esc).join(' · ')}</p></section>`:''}<section class="v30-metrics"><article class="v30-metric"><strong>${esc(invoice.invoiceNumber||'Pendiente')}</strong><small>Número</small></article><article class="v30-metric"><strong>${invoice.invoiceDate?date(invoice.invoiceDate):'Sin fecha'}</strong><small>Fecha</small></article><article class="v30-metric"><strong>${matched}/${lines.length}</strong><small>Vinculados</small></article><article class="v30-metric"><strong>${analysis.elapsedMs?`${Math.round(analysis.elapsedMs/1000)} s`:'—'}</strong><small>Procesamiento</small></article></section><div class="v30-field-grid"><label class="field"><span>Tipo de documento</span><select name="documentType">${typeOptions(invoice.documentTypeCode||invoice.documentType||'33')}</select></label><label class="field"><span>Número de documento</span><input name="invoiceNumber" value="${esc(invoice.invoiceNumber||'')}" required></label><label class="field"><span>Fecha</span><input name="invoiceDate" type="date" value="${esc(invoice.invoiceDate||todayValue)}" required></label><label class="field"><span>Neto</span><input name="net" type="number" min="0" value="${Number(totals.net||0)}" inputmode="numeric"></label><label class="field"><span>IVA</span><input name="vat" type="number" min="0" value="${Number(totals.vat||totals.tax||0)}" inputmode="numeric"></label><label class="field"><span>Impuesto adicional</span><input name="additionalTax" type="number" min="0" value="${Number(totals.additionalTax||0)}" inputmode="numeric"></label><label class="field"><span>Total</span><input name="total" type="number" min="0" value="${Number(totals.total||0)}" inputmode="numeric"></label></div>${paymentSection(invoice)}${quickReception}<div class="v30-item-list" style="margin-top:12px">${lines.map((line,index)=>`<article class="v30-item-card" data-invoice-line="${index}"><header><div><span class="eyebrow">LÍNEA ${index+1}</span><h4>${esc(lineSource(line,index))}</h4></div><span class="v30-reconcile-status ${Number(line.confidence||0)>=.55?'ok':'review'}">${esc(scoreLabel(line.confidence))} · ${Math.round(Number(line.confidence||0)*100)}%</span></header><div class="v30-inline-notice"><strong>Conversión</strong><p>${esc(conversion(line))}</p></div><label class="field"><span>Producto del pedido</span><select name="productId"><option value="">Sin vincular</option>${productOptions(order,line.productId)}</select></label><div class="v30-field-grid"><label class="field"><span>Cantidad leída</span><input name="packageQty" type="number" min="0" step="0.001" value="${Number(line.packageQty??line.invoiceQuantity??0)}" inputmode="decimal"></label><label class="field"><span>Unidades por formato</span><input name="packSize" type="number" min="0.001" step="0.001" value="${Number(line.packSize||1)}" inputmode="decimal"></label><label class="field"><span>Total de unidades</span><output data-units>${Number(line.units||0)}</output></label><label class="field"><span>Total de la línea</span><input name="grossLineTotal" type="number" min="0" value="${Number(line.isFree?0:line.grossLineTotal||0)}" inputmode="numeric" ${line.isFree?'disabled':''}></label><label class="field"><span>Precio final por unidad</span><output data-price>${money(line.isFree?0:line.grossUnitPrice||0)}</output></label><label class="check-card"><input name="isFree" type="checkbox" ${line.isFree?'checked':''}><span><strong>Bonificado</strong><small>Precio $0</small></span></label><label class="field full"><span>Observación</span><input name="freeReason" value="${esc(line.freeReason||line.notes||'')}"></label></div></article>`).join('')}</div>`;
}

function bindLineMath(){
  const calculate=row=>{const qty=Number(row.querySelector('[name=packageQty]').value||0),pack=Number(row.querySelector('[name=packSize]').value||1),free=row.querySelector('[name=isFree]').checked,totalInput=row.querySelector('[name=grossLineTotal]');if(free){totalInput.value='0';totalInput.disabled=true}else totalInput.disabled=false;const units=qty*pack,total=free?0:Number(totalInput.value||0);row.querySelector('[data-units]').textContent=String(Math.round(units*1000)/1000);row.querySelector('[data-price]').textContent=money(units?Math.round(total/units):0)};
  $$('[data-invoice-line]').forEach(row=>{row.querySelectorAll('[name=packageQty],[name=packSize],[name=grossLineTotal],[name=isFree]').forEach(input=>input.addEventListener('input',()=>calculate(row)));calculate(row)});
}
function bindPaymentReview(){
  const enabled=$('#v30RegisterPayment'),fields=$('#v30PaymentFields'),chequeFields=$('#v30ChequeFields'),method=$('#v30PaymentMethod');if(!enabled||!fields||!chequeFields||!method)return;
  const sync=()=>{fields.classList.toggle('hidden',!enabled.checked);const option=method.selectedOptions?.[0],kind=String(option?.dataset?.kind||'');chequeFields.classList.toggle('hidden',!enabled.checked||kind!=='cheque')};
  enabled.addEventListener('change',sync);method.addEventListener('change',sync);sync();
}
function reviewedPayment(form,analysis){
  if(!form.get('registerPayment'))return undefined;const method=paymentMethods.find(item=>item.id===String(form.get('paymentMethodId')||''));if(!method)throw new Error('Selecciona el medio de pago detectado o desmarca su registro.');
  const isCheque=method.kind==='cheque',source=analysis.invoice?.payment||{};
  return{enabled:true,aiDetected:Boolean(source.detected),confidence:Number(source.confidence||0),sourceFileId:analysis.sourceFile?.id||'',methodId:method.id,methodCode:method.code,methodKind:method.kind,methodName:method.name,paymentDate:form.get('paymentDate')||'',amount:Number(form.get('paymentAmount')||0),reference:form.get('paymentReference')||'',cheque:isCheque?{serialNumber:form.get('chequeNumber')||'',collectionDate:form.get('chequeCollectionDate')||'',payee:form.get('chequePayee')||'',amount:Number(form.get('chequeAmount')||0),bank:form.get('chequeBank')||''}:undefined};
}

async function openReview(analysis,{supplierId,orderId,locationId,order}){
  const invoice=analysis.invoice||{},sourceLines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[],lines=reconcileLineProducts(sourceLines,order);
  if(!lines.length){showNuvastoNotice({title:'No se encontraron productos',message:'El documento quedó guardado. Prueba con una fotografía completa y tomada de frente.',type:'error'});return}
  openModal({eyebrow:'REVISIÓN DE DOCUMENTO',title:`${lines.length} línea${lines.length===1?'':'s'} para confirmar`,subtitle:'Revisa productos, formatos, cantidades, valores y cualquier medio de pago detectado antes de guardar.',size:'large',body:reviewBody(analysis,lines,order),submitLabel:'Guardar factura y cotejo',onSubmit:async form=>{
    const reviewed=$$('[data-invoice-line]').map((row,index)=>{const original=lines[index],packageQty=Number(row.querySelector('[name=packageQty]').value||0),packSize=Number(row.querySelector('[name=packSize]').value||1),units=packageQty*packSize,isFree=row.querySelector('[name=isFree]').checked,grossLineTotal=isFree?0:Number(row.querySelector('[name=grossLineTotal]').value||0);return{...original,productId:row.querySelector('[name=productId]').value,sourceDescription:lineSource(original,index),packageQty,invoiceQuantity:packageQty,packSize,units,totalUnits:units,grossLineTotal,grossUnitPrice:isFree?0:(units?Math.round(grossLineTotal/units):0),isFree,freeReason:isFree?row.querySelector('[name=freeReason]').value:''}});
    if(!reviewed.some(line=>line.productId))throw new Error('Vincula al menos una línea con un producto del pedido.');
    const markReceived=Boolean(form.get('markReceived')),payment=reviewedPayment(form,analysis);
    const saved=await api('/api/invoices',{method:'POST',timeout:60000,json:{supplierId,locationId,orderIds:orderId?[orderId]:[],invoiceNumber:form.get('invoiceNumber'),invoiceDate:form.get('invoiceDate'),currency:'CLP',documentType:form.get('documentType'),totals:{net:Number(form.get('net')||0),vat:Number(form.get('vat')||0),additionalTax:Number(form.get('additionalTax')||0),total:Number(form.get('total')||0)},aiModel:analysis.model||'nuvasto',sourceFileId:analysis.sourceFile?.id||'',aiConfidence:reviewed.filter(line=>line.productId).length/reviewed.length,lines:reviewed,payment,markReceived,receptionDate:form.get('receptionDate')||undefined}});
    state.cache.orders=[];state.cache.invoices=[];
    if(saved.payment?.payment_method_kind==='cheque'||saved.payment?.payment_method_code==='cheque')toast(`Cheque ${saved.payment.cheque_number||''} programado para ${date(saved.payment.cheque_collection_date)}`);
    else if(saved.receptionError)toast(`Factura guardada. No se pudo registrar recepción: ${saved.receptionError}`,'error');else if(markReceived)toast(saved.validation?.some?.(item=>item.matched)?'Factura y recepción registradas · pedido validado automáticamente':'Factura y recepción registradas · revisa diferencias si aparecen');else toast(saved.validation?.some?.(item=>item.matched)?'Factura guardada · pedido validado automáticamente':'Factura y precios guardados');
    await openRoute(orderId?'orders':'invoices','',{replace:true});return saved;
  }});
  bindLineMath();bindPaymentReview();
}

function pendingContext(orders){
  const supplierIds=[...new Set(orders.map(order=>order.supplierId))],suppliers=state.cache.suppliers.filter(item=>supplierIds.includes(item.id));
  return `<label class="field"><span>Proveedor</span><select name="supplierId" id="v30InvoiceSupplier">${suppliers.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Local</span><select name="locationId" id="v30InvoiceLocation"></select></label><label class="field full"><span>Pedido pendiente</span><select name="orderId" id="v30InvoiceOrder" required></select></label>`;
}

export async function openInvoiceAnalysisV30(options={}){
  await sources(true);
  let preset=null;if(options.orderId)preset=(await api(`/api/orders/${encodeURIComponent(options.orderId)}`,{fresh:true,timeout:20000})).order;
  const pending=state.cache.orders.filter(eligible);
  if(!preset&&!pending.length)return toast('No hay pedidos pendientes de factura','error');
  const context=preset?`<section class="v30-section full"><div><span class="eyebrow">PEDIDO VINCULADO</span><h3>${esc(preset.folio)} · ${esc(preset.supplierName)}</h3><p>${esc(preset.locationName)} · ${esc(preset.costCenterName||'Centro de costo')} · el documento quedará vinculado directamente.</p></div></section><input type="hidden" name="supplierId" value="${esc(preset.supplierId)}"><input type="hidden" name="locationId" value="${esc(preset.locationId)}"><input type="hidden" name="orderId" value="${esc(preset.id)}">`:pendingContext(pending);
  openModal({eyebrow:'ETAPA 2 · DOCUMENTO',title:'Adjuntar documento al pedido',subtitle:'Nuvasto leerá el documento, el medio de pago visible y lo comparará con productos, cantidades, cajas y unidades del folio.',size:'large',closeOnSuccess:false,body:`<div class="v30-field-grid">${context}<label class="field full"><span>Factura, boleta, guía o nota de crédito</span><input name="file" type="file" accept="application/pdf,image/*" required></label></div><section class="v30-section"><div><strong>Lectura vinculada</strong><p>El original se guarda en R2. Nuvasto coteja nombres, formatos, cantidades, impuestos y precios. Si ve un cheque u otro medio de pago, lo extrae para revisión; ningún dato financiero se registra sin tu confirmación.</p></div></section>`,submitLabel:'Procesar y cotejar',onSubmit:async form=>{
    const file=form.get('file');if(!(file instanceof File)||!file.size){showNuvastoNotice({title:'Falta el documento',message:'Selecciona una imagen o PDF antes de continuar.',type:'error'});return}
    const orderId=String(form.get('orderId')||''),supplierId=String(form.get('supplierId')||''),locationId=String(form.get('locationId')||'');
    let order;
    try{
      order=preset?.id===orderId?preset:(await api(`/api/orders/${encodeURIComponent(orderId)}`,{fresh:true,timeout:20000})).order;
      beginNuvastoProgress();
      const products=order.items.map(item=>({productId:item.productId,description:item.description,unit:item.orderUnit,orderedQty:item.quantityOrdered,unitsPerOrderUnit:item.unitsPerOrderUnit}));
      const aliases=(await api(`/api/aliases?supplierId=${encodeURIComponent(supplierId)}`,{fresh:true,timeout:20000}).catch(()=>({aliases:[]}))).aliases||[];
      setNuvastoProgress('Preparando el pedido para el cotejo…','Nuvasto está vinculando el documento con el folio seleccionado.');
      const upload=new FormData();upload.append('file',file,file.name);const pdf=await orderPdf(orderId);if(pdf)upload.append('orderFile',pdf,pdf.name);upload.append('context',JSON.stringify({providerName:order.supplierName,folio:order.folio,products,aliases:aliases.map(alias=>({productId:alias.productId,alias:alias.alias,confidence:alias.confidence,usageCount:alias.usageCount})),locationId,fileName:file.name}));
      setNuvastoProgress('Leyendo y cotejando el documento…','También se revisará si existe información de pago visible.');
      const response=await api('/api/invoices/analyze',{method:'POST',body:upload,timeout:124000});
      endNuvastoProgress();
      await openReview(response.analysis,{supplierId,orderId,locationId,order});
    }catch(error){console.error('nuvasto_invoice_analysis_failed',error);showNuvastoNotice({title:'No se pudo completar el cotejo',message:error?.code==='request_timeout'?'La lectura excedió el tiempo disponible. El documento puede volver a procesarse sin cambiar de pedido.':(error?.message||'Nuvasto no pudo procesar el documento.'),type:'error'})}
  }});
  if(!preset){const supplier=$('#v30InvoiceSupplier'),location=$('#v30InvoiceLocation'),order=$('#v30InvoiceOrder');const syncOrders=()=>{const list=pending.filter(item=>item.supplierId===supplier.value&&item.locationId===location.value);order.innerHTML=list.map(item=>`<option value="${esc(item.id)}">${esc(item.folio)} · ${esc(item.costCenterName||'Centro')} · ${Number(item.itemCount||0)} productos</option>`).join('');$('#modalSubmit').disabled=!list.length};const syncLocations=()=>{const list=pending.filter(item=>item.supplierId===supplier.value),locations=[...new Map(list.map(item=>[item.locationId,item.locationName])).entries()];location.innerHTML=locations.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');syncOrders()};supplier.onchange=syncLocations;location.onchange=syncOrders;syncLocations()}
}

export const openInvoiceAnalysisV29=openInvoiceAnalysisV30;
