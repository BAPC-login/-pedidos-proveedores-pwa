export const PUBLIC_ORDER_STATES=Object.freeze({
  draft:'editing',requested:'emitted',approved:'emitted',rejected:'editing',sent:'emitted',confirmed:'emitted',partially_received:'emitted',received:'received',reconciled:'received',closed:'received',cancelled:'cancelled'
});

export function publicOrderState(status){return PUBLIC_ORDER_STATES[String(status||'')]||'emitted'}

export function normalizedDeliveryDate(value){
  const text=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:null;
}

export function deliveryDateForSupplier(body,supplierId){
  const dates=body?.deliveryDates&&typeof body.deliveryDates==='object'?body.deliveryDates:{};
  return normalizedDeliveryDate(dates[supplierId])||normalizedDeliveryDate(body?.deliveryDate);
}

export function normalizeCategoryOrder(ids,allowedIds){
  const allowed=new Set((allowedIds||[]).map(String));
  const seen=new Set();
  const ordered=[];
  for(const raw of Array.isArray(ids)?ids:[]){const id=String(raw||'');if(!id||seen.has(id)||!allowed.has(id))continue;seen.add(id);ordered.push(id)}
  for(const id of allowed){if(!seen.has(id))ordered.push(id)}
  return ordered;
}

export function reconciliationAssessment({ordered=0,invoiced=0,expectedPrice=0,invoicedPrice=0,quantityTolerancePct=0,priceTolerancePct=0}={}){
  const orderedQty=Number(ordered||0),invoiceQty=Number(invoiced||0),expected=Number(expectedPrice||0),actual=Number(invoicedPrice||0);
  const quantityDelta=invoiceQty-orderedQty;
  const priceDelta=actual-expected;
  const quantityDeltaPct=orderedQty?Math.abs(quantityDelta)/Math.abs(orderedQty)*100:(invoiceQty?100:0);
  const priceDeltaPct=expected?Math.abs(priceDelta)/Math.abs(expected)*100:(actual?100:0);
  const quantityIssue=quantityDeltaPct>Number(quantityTolerancePct||0);
  const priceIssue=priceDeltaPct>Number(priceTolerancePct||0);
  return {quantityDelta,priceDelta,quantityDeltaPct,priceDeltaPct,quantityIssue,priceIssue,status:quantityIssue||priceIssue?'review':'matched'};
}

export function operationalNotifications(orders=[],today=new Date().toISOString().slice(0,10)){
  const notifications=[];
  const batches=new Map();
  for(const order of orders){
    const state=publicOrderState(order.status);
    if(state==='editing'){
      const key=order.batchId||order.id;
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key).push(order);
    }
    if(state==='emitted'&&!order.deliveryDate)notifications.push({type:'missing_delivery',severity:'warning',orderId:order.id,title:`${order.supplierName}: falta fecha de entrega`,action:'set_delivery'});
    if(state==='emitted'&&order.deliveryDate&&order.deliveryDate<today&&Number(order.receptionCount||0)===0)notifications.push({type:'late_order',severity:'critical',orderId:order.id,title:`${order.supplierName}: entrega atrasada`,action:'open_order'});
    if(state==='emitted'&&Number(order.invoiceCount||0)===0)notifications.push({type:'missing_invoice',severity:'info',orderId:order.id,title:`${order.supplierName}: factura pendiente`,action:'attach_invoice'});
  }
  for(const [batchId,items] of batches)notifications.unshift({type:'draft_batch',severity:'info',batchId,title:`Archivo en preparación: ${items.length} proveedor${items.length===1?'':'es'}`,action:'open_batch'});
  return notifications.slice(0,100);
}
