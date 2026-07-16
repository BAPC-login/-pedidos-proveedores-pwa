(function(root){
  'use strict';
  const db=()=>root.PedidosDB,stateApi=()=>root.PedidosState,core=()=>root.PedidosCore;

  function status(order){
    const rows=order?.rows||[];if(!rows.length)return'pending';
    if(rows.every(row=>Number(row.receivedQty)>=Number(row.orderedQty)&&Number(row.orderedQty)>0))return'complete';
    if(rows.some(row=>Number(row.receivedQty)>0))return'partial';return'pending';
  }
  function refreshOrderMeta(order){
    order.rows=(order.rows||[]).filter(row=>Number(row.orderedQty)>0);
    order.providerIds=[...new Set(order.rows.map(row=>row.providerId).filter(Boolean))];
    order.providers=[...new Set(order.rows.map(row=>row.providerName).filter(Boolean))];
    order.totalItems=order.rows.length;order.status=status(order);order.updatedAt=new Date().toISOString();return order;
  }
  async function list(){return(await db().all('orders')).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
  async function get(folio){return db().get('orders',folio)}

  async function saveDraft(){
    const state=stateApi().value,rows=stateApi().draftRows();if(!rows.length)throw new Error('Agrega cantidades al pedido primero');
    const existingOrders=await list();let folio=state.currentOrderFolio,existing=folio?await get(folio):null;
    if(!folio||!existing){folio=core().allocateFolio(existingOrders.map(order=>order.folio),state.profile.folioPrefix||'MDR');existing=null}
    const previous=new Map((existing?.rows||[]).map(row=>[String(row.productId),row]));
    const snapshotRows=rows.map((row,index)=>{const old=previous.get(String(row.productId))||{};return{id:old.id||`${folio}-row-${index+1}`,...old,...row,receivedQty:Number(old.receivedQty)||0,receivedUnits:Number(old.receivedUnits)||0,reception:old.reception||'pending',unitPrice:Number(old.unitPrice)||0,grossValue:Number(old.grossValue)||0}});
    const order=refreshOrderMeta({...(existing||{}),folio,createdAt:existing?.createdAt||new Date().toISOString(),profileSnapshot:{...state.profile},rows:snapshotRows});
    await db().put('orders',order);state.currentOrderFolio=folio;stateApi().persist();return order;
  }

  async function save(order){refreshOrderMeta(order);await db().put('orders',order);return order}
  async function remove(folio){await db().deleteOrderCascade(folio);const state=stateApi().value;if(state.currentOrderFolio===folio){state.currentOrderFolio=null;state.draft={};stateApi().persist()}}

  function loadIntoDraft(order){
    const state=stateApi().value;state.draft={};for(const row of order.rows||[]){if(state.items.some(item=>item.id===row.productId))state.draft[row.productId]={qty:Number(row.orderedQty)||0,unit:row.unit||'UNIDAD'}}state.currentOrderFolio=order.folio;stateApi().persist()
  }

  async function updateProviderRows(folio,providerId,rows){
    const order=await get(folio);if(!order)throw new Error('Pedido no encontrado');
    const untouched=(order.rows||[]).filter(row=>row.providerId!==providerId),normalized=(rows||[]).filter(row=>Number(row.orderedQty)>0).map((row,index)=>({...row,id:row.id||`${folio}-${providerId}-${Date.now()}-${index}`,providerId,orderedQty:Number(row.orderedQty)||0}));
    order.rows=[...untouched,...normalized];await save(order);
    if(stateApi().value.currentOrderFolio===folio)loadIntoDraft(order);return order;
  }

  async function invoiceList(folio,providerId=''){const rows=await db().all('invoices');return rows.filter(row=>row.folio===folio&&(!providerId||row.providerId===providerId)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
  async function saveInvoice(invoice){return db().put('invoices',invoice)}
  async function deleteInvoice(invoiceId){
    const invoice=await db().get('invoices',Number(invoiceId));if(!invoice)return;
    const prices=(await db().all('prices')).filter(row=>String(row.invoiceId)===String(invoice.id));for(const price of prices)await db().remove('prices',price.id);
    await db().remove('invoices',invoice.id);await recomputeReception(invoice.folio,invoice.providerId);
  }

  async function replaceInvoicePrices(invoice,order){
    const old=(await db().all('prices')).filter(row=>String(row.invoiceId)===String(invoice.id));for(const price of old)await db().remove('prices',price.id);
    for(const line of invoice.lines||[]){
      if(!line.productId||!Number(line.grossUnitPrice))continue;
      const orderRow=(order.rows||[]).find(row=>row.productId===line.productId);
      await db().put('prices',{id:`price-${invoice.id}-${line.id||line.productId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber||'',folio:invoice.folio,providerId:invoice.providerId,provider:invoice.providerName,productId:line.productId,description:orderRow?.description||line.description||'',packSize:Number(line.packSize)||1,grossPackPrice:Number(line.grossPackPrice)||0,grossUnitPrice:Number(line.grossUnitPrice)||0,grossLineTotal:Number(line.grossLineTotal)||0,createdAt:invoice.invoiceDate||invoice.createdAt||new Date().toISOString()});
    }
  }

  async function recomputeReception(folio,providerId=''){
    const order=await get(folio);if(!order)return null;
    const invoices=(await invoiceList(folio,providerId)).filter(invoice=>invoice.status==='reviewed'||invoice.status==='read');
    const targetRows=(order.rows||[]).filter(row=>!providerId||row.providerId===providerId);
    for(const row of targetRows){
      let receivedQty=0,receivedUnits=0,grossValue=0,pricedUnits=0;
      for(const invoice of invoices){for(const line of invoice.lines||[]){if(line.productId!==row.productId)continue;receivedQty+=Number(line.receivedOrderQty)||0;receivedUnits+=Number(line.units)||0;grossValue+=Number(line.grossLineTotal)||0;pricedUnits+=Number(line.units)||0}}
      row.receivedQty=Number(receivedQty.toFixed(3));row.receivedUnits=Number(receivedUnits.toFixed(3));row.grossValue=Math.round(grossValue);row.unitPrice=pricedUnits?Math.round(grossValue/pricedUnits):0;row.reception=receivedQty<=0?'pending':receivedQty>=Number(row.orderedQty)?'complete':'partial';
    }
    await save(order);return order;
  }

  async function reviewInvoice(invoiceId,lines,metadata={}){
    const invoice=await db().get('invoices',Number(invoiceId));if(!invoice)throw new Error('Factura no encontrada');
    const order=await get(invoice.folio);if(!order)throw new Error('Pedido no encontrado');
    invoice.lines=(lines||[]).filter(line=>line.productId&&(Number(line.units)>0||Number(line.grossUnitPrice)>0)).map((line,index)=>({...line,id:line.id||`line-${index+1}`,packageQty:Number(line.packageQty)||1,packSize:Number(line.packSize)||1,units:Number(line.units)||Math.max(1,(Number(line.packageQty)||1)*(Number(line.packSize)||1)),grossUnitPrice:Math.round(Number(line.grossUnitPrice)||0),grossPackPrice:Math.round(Number(line.grossPackPrice)||0),grossLineTotal:Math.round(Number(line.grossLineTotal)||0),receivedOrderQty:Number(line.receivedOrderQty)||0}));
    Object.assign(invoice,metadata,{status:'reviewed',reviewedAt:new Date().toISOString()});await saveInvoice(invoice);await replaceInvoicePrices(invoice,order);await recomputeReception(invoice.folio,invoice.providerId);return invoice;
  }

  async function priceHistory(){return(await db().all('prices')).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}

  root.PedidosOrders={status,refreshOrderMeta,list,get,saveDraft,save,remove,loadIntoDraft,updateProviderRows,invoiceList,saveInvoice,deleteInvoice,recomputeReception,reviewInvoice,priceHistory};
})(globalThis);
