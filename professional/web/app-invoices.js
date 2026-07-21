import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function ensureSources(){
  if(!state.cache.suppliers.length)state.cache.suppliers=(await api('/api/suppliers')).suppliers;
  if(!state.cache.orders.length)state.cache.orders=(await api('/api/orders')).orders;
  if(!state.cache.products.length)state.cache.products=(await api('/api/products')).products;
}

async function openInvoiceReview(analysis,supplierId,orderId=''){
  const invoice=analysis.invoice||{};
  const lines=Array.isArray(invoice.lines)?invoice.lines:[];
  const today=new Date().toISOString().slice(0,10);
  openModal({
    eyebrow:'REVISIÓN DE FACTURA',title:`${lines.length} líneas detectadas`,
    subtitle:`Modelo ${analysis.model||'IA'} · confirma antes de guardar`,
    body:`<div class="form-grid"><label class="field"><span>Número de factura</span><input name="invoiceNumber" value="${esc(invoice.invoiceNumber||'')}" required></label><label class="field"><span>Fecha</span><input name="invoiceDate" type="date" value="${esc(invoice.invoiceDate||today)}" required></label><label class="field"><span>Neto</span><input name="net" type="number" min="0" value="${Number(invoice.totals?.net||0)}"></label><label class="field"><span>IVA</span><input name="vat" type="number" min="0" value="${Number(invoice.totals?.vat||invoice.totals?.tax||0)}"></label><label class="field"><span>Impuesto adicional</span><input name="additionalTax" type="number" min="0" value="${Number(invoice.totals?.additionalTax||0)}"></label><label class="field"><span>Total</span><input name="total" type="number" min="0" value="${Number(invoice.totals?.total||0)}"></label><div class="full table-card"><table class="data-table"><thead><tr><th>Texto leído</th><th>Producto</th><th>Cajas</th><th>Pack</th><th>Total línea</th></tr></thead><tbody>${lines.map((line,index)=>`<tr data-invoice-line="${index}"><td><strong>${esc(line.sourceLine||line.descriptionOriginal||line.description||`Línea ${index+1}`)}</strong></td><td><select class="input" name="productId"><option value="">Sin vincular</option>${state.cache.products.map(product=>`<option value="${esc(product.id)}" ${String(product.id)===String(line.productId)?'selected':''}>${esc(product.name)}</option>`).join('')}</select></td><td><input class="input" name="packageQty" type="number" min="0" step="0.001" value="${Number(line.packageQty??line.invoiceQuantity??0)}"></td><td><input class="input" name="packSize" type="number" min="0.001" step="0.001" value="${Number(line.packSize||1)}"></td><td><input class="input" name="grossLineTotal" type="number" min="0" value="${Number(line.grossLineTotal||0)}"></td></tr>`).join('')}</tbody></table></div></div>`,
    submitLabel:'Guardar factura',
    onSubmit:async form=>{
      const reviewedLines=$$('[data-invoice-line]').map((row,index)=>{
        const original=lines[index]||{};
        const packageQty=Number(row.querySelector('[name=packageQty]').value||0);
        const packSize=Number(row.querySelector('[name=packSize]').value||1);
        const grossLineTotal=Number(row.querySelector('[name=grossLineTotal]').value||0);
        const units=packageQty*packSize;
        return {
          ...original,
          productId:row.querySelector('[name=productId]').value,
          sourceDescription:original.sourceLine||original.descriptionOriginal||original.description||`Línea ${index+1}`,
          packageQty,packSize,units,grossLineTotal,
          grossUnitPrice:units?Math.round(grossLineTotal/units):0
        };
      });
      await api('/api/invoices',{method:'POST',json:{
        supplierId,orderIds:orderId?[orderId]:[],
        invoiceNumber:form.get('invoiceNumber'),invoiceDate:form.get('invoiceDate'),currency:'CLP',documentType:'33',
        totals:{net:Number(form.get('net')||0),vat:Number(form.get('vat')||0),additionalTax:Number(form.get('additionalTax')||0),total:Number(form.get('total')||0)},
        aiModel:analysis.model||'',
        sourceFileId:analysis.sourceFile?.id||'',
        aiConfidence:invoice.matchSummary?.matched&&lines.length?invoice.matchSummary.matched/lines.length:0,
        lines:reviewedLines
      }});
      toast('Factura guardada');
      await navigate('invoices');
    }
  });
}

export async function openInvoiceAnalysis(){
  await ensureSources();
  if(!state.cache.suppliers.length)return toast('Primero debes crear un proveedor','error');
  const eligibleOrders=state.cache.orders.filter(order=>!['draft','cancelled','closed'].includes(order.status));
  openModal({
    eyebrow:'LECTURA INTELIGENTE',title:'Analizar factura',
    subtitle:'La IA propone; tú confirmas antes de guardar.',
    body:`<div class="form-grid"><label class="field"><span>Proveedor</span><select name="supplierId">${state.cache.suppliers.map(supplier=>`<option value="${esc(supplier.id)}">${esc(supplier.name)}</option>`).join('')}</select></label><label class="field"><span>Pedido relacionado <small>opcional</small></span><select name="orderId"><option value="">Sin pedido</option>${eligibleOrders.map(order=>`<option value="${esc(order.id)}">${esc(order.folio)} · ${esc(order.supplierName)}</option>`).join('')}</select></label><label class="field full"><span>Factura PDF o imagen</span><input name="file" type="file" accept="application/pdf,image/*" required></label></div><div class="auth-note">El plan gratuito incluye una cuota mensual de análisis. El resultado siempre requiere revisión humana.</div>`,
    submitLabel:'Analizar documento',
    onSubmit:async form=>{
      const file=form.get('file');
      if(!(file instanceof File)||!file.size)throw new Error('Adjunta una factura');
      const supplierId=String(form.get('supplierId')||'');
      const orderId=String(form.get('orderId')||'');
      let products=state.cache.products.map(product=>({productId:product.id,description:product.name,unit:product.baseUnit||'unidad',orderedQty:0,unitsPerOrderUnit:1}));
      let providerName=state.cache.suppliers.find(supplier=>supplier.id===supplierId)?.name||'';
      let folio='';
      if(orderId){
        const order=(await api(`/api/orders/${orderId}`)).order;
        folio=order.folio;providerName=order.supplierName;
        products=order.items.map(item=>({productId:item.productId,description:item.description,unit:item.orderUnit,orderedQty:item.quantityOrdered,unitsPerOrderUnit:item.unitsPerOrderUnit}));
      }
      const upload=new FormData();
      upload.append('file',file,file.name);
      upload.append('context',JSON.stringify({providerName,folio,products}));
      const response=await api('/api/invoices/analyze',{method:'POST',body:upload});
      setTimeout(()=>openInvoiceReview(response.analysis,supplierId,orderId),0);
    }
  });
}
