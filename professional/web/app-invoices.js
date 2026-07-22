import {$,$$,esc,state,api,toast,money} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';

const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function ensureSources(force=false){
  const requests=[];
  if(force||!state.cache.suppliers.length)requests.push(api('/api/suppliers').then(payload=>state.cache.suppliers=payload.suppliers||[]));
  if(force||!state.cache.orders.length)requests.push(api('/api/orders').then(payload=>state.cache.orders=payload.orders||[]));
  if(force||!state.cache.products.length)requests.push(api('/api/products').then(payload=>state.cache.products=payload.products||[]));
  if(force||!state.cache.locations.length)requests.push(api('/api/locations').then(payload=>state.cache.locations=payload.locations||[]));
  await Promise.all(requests);
}

async function archivedOrderPdf(orderId){
  let payload=await api(`/api/documents?entityType=order&entityId=${encodeURIComponent(orderId)}&kind=order_pdf`);
  let document=(payload.documents||[]).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0];
  if(!document?.key){
    await api(`/api/orders/${encodeURIComponent(orderId)}/pdf`,{method:'POST',json:{}});
    payload=await api(`/api/documents?entityType=order&entityId=${encodeURIComponent(orderId)}&kind=order_pdf`);
    document=(payload.documents||[]).sort((a,b)=>Number(b.revision||0)-Number(a.revision||0))[0];
  }
  if(!document?.key)return null;
  const response=await fetch(`/api/files/${encodeURIComponent(document.key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok)return null;
  return new File([await response.blob()],document.name||'pedido.pdf',{type:'application/pdf'});
}

function confidenceLabel(value){const score=Number(value||0);return score>=.8?'Alta':score>=.55?'Media':'Revisar'}

async function openInvoiceReview(analysis,supplierId,orderId='',locationId='',options={}){
  const invoice=analysis.invoice||{};
  const lines=Array.isArray(invoice.lines)?invoice.lines:[];
  const warnings=invoice.warnings||[];
  const today=new Date().toISOString().slice(0,10);
  openModal({
    eyebrow:'ETAPA 2 · COTEJO IA',
    title:`${lines.length} líneas detectadas`,
    subtitle:`Gemini ${analysis.model||''}${orderId?' · factura vinculada al pedido':''}. Revisa coincidencias, cajas y precios finales antes de guardar.`,
    size:'large',
    body:`${warnings.length?`<section class="security-note"><strong>Advertencias de lectura</strong><p>${warnings.map(esc).join(' · ')}</p></section>`:''}
      <div class="form-grid">
        <label class="field"><span>Número de factura</span><input name="invoiceNumber" value="${esc(invoice.invoiceNumber||'')}" required></label>
        <label class="field"><span>Fecha</span><input name="invoiceDate" type="date" value="${esc(invoice.invoiceDate||today)}" required></label>
        <label class="field"><span>Neto</span><input name="net" type="number" min="0" value="${Number(invoice.totals?.net||0)}"></label>
        <label class="field"><span>IVA</span><input name="vat" type="number" min="0" value="${Number(invoice.totals?.vat||invoice.totals?.tax||0)}"></label>
        <label class="field"><span>Impuesto adicional</span><input name="additionalTax" type="number" min="0" value="${Number(invoice.totals?.additionalTax||0)}"></label>
        <label class="field"><span>Total</span><input name="total" type="number" min="0" value="${Number(invoice.totals?.total||0)}"></label>
        <div class="full table-card"><div class="responsive-table"><table class="data-table"><thead><tr><th>Texto leído</th><th>Producto cotejado</th><th>Confianza</th><th>Cajas</th><th>Unid./caja</th><th>Unidades</th><th>Total línea</th><th>Precio final unit.</th></tr></thead><tbody>${lines.map((line,index)=>`<tr data-invoice-line="${index}"><td data-label="Texto leído"><strong>${esc(line.sourceLine||line.descriptionOriginal||line.description||`Línea ${index+1}`)}</strong><br><small>${esc(line.matchReason||'')}</small></td><td data-label="Producto"><select class="input" name="productId"><option value="">Sin vincular</option>${state.cache.products.map(product=>`<option value="${esc(product.id)}" ${String(product.id)===String(line.productId)?'selected':''}>${esc(product.name)}</option>`).join('')}</select></td><td data-label="Confianza"><span class="status ${Number(line.confidence||0)>=.55?'active':'requested'}">${confidenceLabel(line.confidence)} · ${Math.round(Number(line.confidence||0)*100)}%</span></td><td data-label="Cajas"><input class="input" name="packageQty" type="number" min="0" step="0.001" value="${Number(line.packageQty??line.invoiceQuantity??0)}" inputmode="decimal"></td><td data-label="Unid./caja"><input class="input" name="packSize" type="number" min="0.001" step="0.001" value="${Number(line.packSize||1)}" inputmode="decimal"></td><td data-label="Unidades" data-calculated-units>${Number(line.units||0)}</td><td data-label="Total línea"><input class="input" name="grossLineTotal" type="number" min="0" value="${Number(line.grossLineTotal||0)}" inputmode="numeric"></td><td data-label="Precio final" data-calculated-price>${money(line.grossUnitPrice||0)}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`,
    submitLabel:'Guardar factura y cotejo',
    onSubmit:async form=>{
      const reviewedLines=$$('[data-invoice-line]').map((row,index)=>{
        const original=lines[index]||{};
        const packageQty=Number(row.querySelector('[name=packageQty]').value||0);
        const packSize=Number(row.querySelector('[name=packSize]').value||1);
        const grossLineTotal=Number(row.querySelector('[name=grossLineTotal]').value||0);
        const units=packageQty*packSize;
        return {...original,productId:row.querySelector('[name=productId]').value,sourceDescription:original.sourceLine||original.descriptionOriginal||original.description||`Línea ${index+1}`,packageQty,packSize,units,grossLineTotal,grossUnitPrice:units?Math.round(grossLineTotal/units):0};
      });
      const saved=await api('/api/invoices',{method:'POST',json:{
        supplierId,locationId,orderIds:orderId?[orderId]:[],
        invoiceNumber:form.get('invoiceNumber'),invoiceDate:form.get('invoiceDate'),currency:'CLP',documentType:'33',
        totals:{net:Number(form.get('net')||0),vat:Number(form.get('vat')||0),additionalTax:Number(form.get('additionalTax')||0),total:Number(form.get('total')||0)},
        aiModel:analysis.model||'',sourceFileId:analysis.sourceFile?.id||'',
        aiConfidence:invoice.matchSummary?.matched&&lines.length?invoice.matchSummary.matched/lines.length:0,
        lines:reviewedLines
      }});
      toast('Factura, cotejo y precios históricos guardados');
      if(orderId&&options.returnToOrder){
        await navigate('orders');
        const {openOrderDetail}=await import('./app-order-detail.js');
        setTimeout(()=>openOrderDetail(orderId),80);
      }else await navigate('invoices');
      return saved;
    }
  });
  function recalculate(row){
    const boxes=Number(row.querySelector('[name=packageQty]').value||0);
    const pack=Number(row.querySelector('[name=packSize]').value||1);
    const total=Number(row.querySelector('[name=grossLineTotal]').value||0);
    const units=boxes*pack;
    row.querySelector('[data-calculated-units]').textContent=units;
    row.querySelector('[data-calculated-price]').textContent=money(units?Math.round(total/units):0);
  }
  $$('[data-invoice-line]').forEach(row=>row.querySelectorAll('[name=packageQty],[name=packSize],[name=grossLineTotal]').forEach(input=>input.oninput=()=>recalculate(row)));
}

export async function openInvoiceAnalysis(options={}){
  await ensureSources(Boolean(options.orderId));
  if(!state.cache.suppliers.length)return toast('Primero debes crear un proveedor','error');
  if(!state.cache.locations.length)return toast('Primero debes crear un local','error');

  let presetOrder=null;
  if(options.orderId)presetOrder=(await api(`/api/orders/${encodeURIComponent(options.orderId)}`)).order;
  const eligibleOrders=state.cache.orders.filter(order=>!['cancelled'].includes(order.status));

  const contextFields=presetOrder
    ?`<section class="security-note full"><strong>${esc(presetOrder.folio)} · ${esc(presetOrder.supplierName)}</strong><p>${esc(presetOrder.locationName)} · ${esc(presetOrder.costCenterName||'')} · la factura quedará vinculada directamente a este pedido.</p></section><input type="hidden" name="supplierId" value="${esc(presetOrder.supplierId)}"><input type="hidden" name="locationId" value="${esc(presetOrder.locationId)}"><input type="hidden" name="orderId" value="${esc(presetOrder.id)}">`
    :`<label class="field"><span>Proveedor</span><select name="supplierId" id="invoiceSupplier">${state.cache.suppliers.map(supplier=>`<option value="${esc(supplier.id)}">${esc(supplier.name)}</option>`).join('')}</select></label><label class="field"><span>Local</span><select name="locationId" id="invoiceLocation">${state.cache.locations.map(location=>`<option value="${esc(location.id)}">${esc(location.name)}</option>`).join('')}</select></label><label class="field full"><span>Pedido relacionado</span><select name="orderId" id="invoiceOrder"><option value="">Sin pedido específico: cotejar con catálogo</option></select></label>`;

  openModal({
    eyebrow:'ETAPA 2 · FACTURA',
    title:presetOrder?'Adjuntar factura al pedido':'Analizar factura con Gemini',
    subtitle:presetOrder?'La IA comparará la factura con los productos, cantidades y formatos de este folio.':'Selecciona un pedido o coteja la factura contra el catálogo del proveedor.',
    size:'large',
    body:`<div class="core-order-intro"><div class="core-order-step"><b>1</b><span>Pedido y proveedor</span></div><div class="core-order-step"><b>2</b><span>Adjunta PDF o fotografía</span></div><div class="core-order-step"><b>3</b><span>Revisa el cotejo y guarda precios</span></div></div><div class="form-grid">${contextFields}<label class="field full"><span>Factura PDF o imagen</span><input name="file" type="file" accept="application/pdf,image/*" required></label></div><section class="security-note"><strong>Información que quedará almacenada</strong><p>Factura original, pedido relacionado, cantidades por caja/display, unidades totales, precio final por unidad, nivel de coincidencia e historial de precios.</p></section>`,
    submitLabel:'Leer y cotejar con IA',
    onSubmit:async form=>{
      const file=form.get('file');
      if(!(file instanceof File)||!file.size)throw new Error('Adjunta una factura');
      const supplierId=String(form.get('supplierId')||'');
      const orderId=String(form.get('orderId')||'');
      let locationId=String(form.get('locationId')||'');
      let products=state.cache.products.filter(product=>(product.suppliers||[]).some(relation=>relation.supplierId===supplierId)).map(product=>{
        const relation=(product.suppliers||[]).find(item=>item.supplierId===supplierId);
        return {productId:product.id,description:product.name,unit:relation?.orderUnit||product.baseUnit||'unidad',orderedQty:0,unitsPerOrderUnit:Number(relation?.unitsPerOrderUnit||1)};
      });
      let providerName=state.cache.suppliers.find(supplier=>supplier.id===supplierId)?.name||'';
      let folio='';
      let orderFile=null;
      if(orderId){
        const order=presetOrder?.id===orderId?presetOrder:(await api(`/api/orders/${encodeURIComponent(orderId)}`)).order;
        folio=order.folio;providerName=order.supplierName;locationId=order.locationId;
        products=order.items.map(item=>({productId:item.productId,description:item.description,unit:item.orderUnit,orderedQty:item.quantityOrdered,unitsPerOrderUnit:item.unitsPerOrderUnit}));
        orderFile=await archivedOrderPdf(orderId);
      }
      const upload=new FormData();
      upload.append('file',file,file.name);
      if(orderFile)upload.append('orderFile',orderFile,orderFile.name);
      upload.append('context',JSON.stringify({providerName,folio,products,locationId}));
      const response=await api('/api/invoices/analyze',{method:'POST',body:upload});
      setTimeout(()=>openInvoiceReview(response.analysis,supplierId,orderId,locationId,options),0);
    }
  });

  if(!presetOrder){
    function refreshOrders(){
      const supplierId=$('#invoiceSupplier').value;
      const locationId=$('#invoiceLocation').value;
      const orders=eligibleOrders.filter(order=>order.supplierId===supplierId&&(!locationId||order.locationId===locationId));
      $('#invoiceOrder').innerHTML='<option value="">Sin pedido específico: cotejar con catálogo</option>'+orders.map(order=>`<option value="${esc(order.id)}">${esc(order.folio)} · ${esc(order.status)} · ${esc(order.costCenterName||'')}</option>`).join('');
    }
    $('#invoiceSupplier').onchange=refreshOrders;
    $('#invoiceLocation').onchange=refreshOrders;
    refreshOrders();
  }
}
