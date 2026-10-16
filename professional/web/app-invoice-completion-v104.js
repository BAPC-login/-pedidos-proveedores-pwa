import {$,esc,api,toast,money,date} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';
import {openInvoicePriceImpactV104} from './app-finance-v104.js';

function signedMoney(value){const n=Number(value||0);return(n>0?'+':n<0?'-':'')+money(Math.abs(n))}
function signedPct(value){const n=Number(value||0);return(n>0?'+':'')+n.toLocaleString('es-CL',{maximumFractionDigits:2})+'%'}
function comp(label,record){
  const history=Boolean(record?.hasHistory),change=Number(record?.delta||0);
  return '<div class="v104-finish-compare"><small>'+esc(label)+(history&&record.supplierName?' · '+esc(record.supplierName):'')+'</small>'+
    '<span>Anterior '+money(record?.previousPrice||0)+'</span><strong class="'+(change>0?'up':change<0?'down':'flat')+'">'+
    signedMoney(record?.delta||0)+' / '+signedPct(record?.percent||0)+'</strong>'+
    (!history?'<small>Sin historial · variación 0</small>':'')+'</div>';
}
function invoiceReport(saved,impact){
  const partial=Boolean(saved.receptionError);
  const receipt=saved.received?'Recepción registrada':partial?'Recepción pendiente de revisión':'Solo factura registrada';
  let rows='';
  if(impact?.lines?.length)rows='<div class="v104-finish-lines">'+impact.lines.map(line=>
    '<div class="v104-finish-row"><div class="v104-finish-product"><strong>'+esc(line.description||'Producto')+'</strong><small>Precio actual por unidad: '+money(line.currentPrice||0)+'</small></div>'+
    '<div class="v104-finish-grid">'+comp('Mismo proveedor',line.sameSupplier)+comp('Otros proveedores',line.otherSupplier)+'</div></div>').join('')+'</div>';
  else rows='<p class="v104-finish-warning">No se pudieron consultar los precios históricos; la factura permanece guardada. Revisa el informe desde Finanzas.</p>';
  return '<section class="v104-finish-invoice"><header><div><strong>Factura '+esc(saved.number||impact?.invoiceNumber||'')+'</strong><small>'+esc(impact?.supplierName||saved.supplierName||'Proveedor')+' · '+esc(receipt)+'</small></div>'+
    '<span>'+money(impact?.grossTotal||0)+'</span></header>'+
    (partial?'<p class="v104-finish-warning">Atención: '+esc(saved.receptionError)+'</p>':'')+rows+
    (saved.id?'<button class="btn small" type="button" data-v104-full-impact="'+esc(saved.id)+'">Abrir informe completo</button>':'')+'</section>';
}
export async function showInvoiceCompletionV104({saved=[],skipped=[],orderId=''}) {
  const items=await Promise.all(saved.map(async item=>{
    try{const response=await api('/api/invoices/'+encodeURIComponent(item.id)+'/price-impact',{fresh:true,timeout:22000});return{item,impact:response.impact,error:''}}
    catch(error){return{item,impact:null,error:error.message||'Error en historial'}}
  }));
  const errors=items.filter(({item})=>item.receptionError).length;
  const success=items.filter(({item})=>item.received).length;
  openModal({eyebrow:'PROCESO FINALIZADO',title:'Facturas procesadas',subtitle:saved.length+' guardadas · '+success+' recepcionadas'+
    (errors?' · '+errors+' recepción(es) pendientes':'')+(skipped.length?' · '+skipped.length+' archivos omitidos':''),size:'large',hideSubmit:true,
    body:'<div class="v104-finish-overview"><span class="v104-finish-icon" aria-hidden="true">✓</span><div><strong>Registro de documentos completado</strong>'+
    '<p>Resumen de variación de precios por producto, proveedor actual y compras en otros proveedores. Se compara precio final por unidad física.</p></div></div>'+
    (errors?'<div class="v104-finish-warning">Algunas recepciones no se completaron. La factura sí quedó registrada; revisa esas líneas antes de volver a recepcionar.</div>':'')+
    items.map(({item,impact})=>invoiceReport(item,impact)).join('')+
    '<div class="v104-finish-actions"><button type="button" class="btn primary" id="v104GoFinance">Ver en Finanzas</button>'+
    (orderId?'<button type="button" class="btn" id="v104GoOrder">Volver al pedido</button>':'')+
    '<button type="button" class="btn" data-modal-close>Cerrar</button></div>'});
  $('#v104GoFinance')?.addEventListener('click',()=>{closeModal('finance');openRoute('finance').catch(error=>toast(error.message,'error'))});
  $('#v104GoOrder')?.addEventListener('click',()=>{closeModal('order');import('./app-order-detail-v30.js').then(mod=>mod.openOrderDetail(orderId)).catch(error=>toast(error.message,'error'))});
  document.querySelectorAll('[data-v104-full-impact]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;try{await openInvoicePriceImpactV104(button.dataset.v104FullImpact)}
    catch(error){toast(error.message,'error')}finally{button.disabled=false}
  }));
  return items;
}
