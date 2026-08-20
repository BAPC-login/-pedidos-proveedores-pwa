import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'').trim();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const host=new URL(base).hostname;
assert.match(host,/^pedidos-pro-ai-dev\./,'destructive E2E refuses to run outside Nuvasto DEV');
assert.ok(email&&password,'DEV E2E credentials are required');

const canonical=JSON.parse(fs.readFileSync('release.json','utf8'));
assert.ok(canonical.release&&canonical.generation,'canonical current release must be readable');

async function publicJson(path){
  const response=await fetch(`${base}${path}${path.includes('?')?'&':'?'}e2e=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}});
  assert.equal(response.ok,true,`public endpoint ${path}`);
  return response.json();
}
const [release,health]=await Promise.all([publicJson('/platform/release'),publicJson('/platform/health')]);
assert.equal(release.release,canonical.release,'DEV must expose the canonical current release');
assert.equal(health.environment,'development','destructive journey must run on development environment');
assert.equal(health.developmentEnvironment,true,'development safety flag');
assert.equal(health.receptionRequiredForClosure,true,'reception remains the only operational closure gate');
assert.equal(health.invoiceRequiredForClosure,false,'invoice must remain optional for closure');
assert.equal(health.paymentRequiredForClosure,false,'payment must remain optional for closure');
assert.equal(health.reconciliationRequiredForClosure,false,'reconciliation must remain optional for closure');

let token='';
async function call(path,{method='GET',json,headers={}}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):undefined});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}

const login=await call('/api/auth/login',{method:'POST',json:{email,password}});token=login.token;assert.ok(token,'DEV login token');
const stamp=Date.now().toString(36).toUpperCase();
const today=new Date().toISOString().slice(0,10);
const delivery=new Date(Date.now()+86400000).toISOString().slice(0,10);
const chequeDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);

const autosaveKey=`development-e2e-${stamp}`;
const draftMarker={marker:stamp,idempotencyKey:`dev-e2e-${stamp}`,selections:[{productId:'synthetic',quantity:'12'}]};
await call('/api/autosave',{method:'PUT',json:{key:autosaveKey,payload:draftMarker}});
let restored=await call(`/api/autosave?key=${encodeURIComponent(autosaveKey)}`);
assert.deepEqual(restored.draft?.payload,draftMarker,'server-backed draft round-trip');
const clearedMarker={...draftMarker,selections:[{productId:'synthetic',quantity:''}]};
await call('/api/autosave',{method:'PUT',json:{key:autosaveKey,payload:clearedMarker}});
restored=await call(`/api/autosave?key=${encodeURIComponent(autosaveKey)}`);
assert.equal(restored.draft?.payload?.selections?.[0]?.quantity,'','cleared master quantity persists');
await call(`/api/autosave?key=${encodeURIComponent(autosaveKey)}`,{method:'DELETE'});

const [me,locationsPayload,centersPayload,productsPayload,paymentMethodsPayload]=await Promise.all([
  call('/api/me'),call('/api/locations'),call('/api/cost-centers'),call('/api/products'),call('/api/finance/payment-methods')
]);
assert.equal(me.ok,true,'identity available');
const location=(locationsPayload.locations||[]).find(item=>item.active!==false);
const center=(centersPayload.costCenters||[]).find(item=>item.locationId===location?.id&&item.active!==false);
const chequeMethod=(paymentMethodsPayload.methods||[]).find(item=>item.kind==='cheque');
assert.ok(location&&center,'QA tenant has active location and cost center');
assert.ok(chequeMethod?.id,'QA tenant has cheque payment method');
const product=(productsPayload.products||[]).find(item=>item.active!==false&&(item.costCenters||[]).some(cc=>cc.id===center.id)&&(item.suppliers||[]).some(rel=>rel.id));
assert.ok(product,'QA tenant has active supplier-linked product');
const relation=product.suppliers.find(rel=>rel.id);
const unitPrice=Math.max(100,Number(relation.lastGrossUnitPrice||1000));

async function createEmittedOrder(suffix){
  const idempotencyKey=`dev-e2e-${stamp}-${suffix}`;
  const createPayload={locationId:location.id,costCenterId:center.id,deliveryMode:'all',deliveryDate:delivery,notes:`Synthetic DEV E2E ${stamp} ${suffix}`,items:[{supplierProductId:relation.id,quantity:1,orderUnit:relation.orderUnit||'UNIDAD',unitsPerOrderUnit:Number(relation.unitsPerOrderUnit||1)}]};
  const created=await call('/api/order-batches/v2',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},json:createPayload});
  const retried=await call('/api/order-batches/v2',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},json:createPayload});
  const batch=created.batch||created,retryBatch=retried.batch||retried,order=batch.orders?.[0];
  assert.ok(order?.id&&batch.batchId,'order batch created');
  assert.equal(retryBatch.batchId,batch.batchId,'idempotency prevents duplicated order batches');
  const emitted=await call(`/api/order-batches/${encodeURIComponent(batch.batchId)}/emit`,{method:'POST',json:{}});
  const emittedOrder=(emitted.orders||[]).find(item=>item.id===order.id),folio=emittedOrder?.folio||'';
  assert.match(folio,/^[A-Z0-9]+\d{5}$/,'emitted folio ends in five sequential digits');
  assert.ok(!/-\d{6}-/.test(folio),'folio contains no calendar date');
  return{id:order.id,batchId:batch.batchId,folio};
}

const first=await createEmittedOrder('A'),second=await createEmittedOrder('B');
assert.notEqual(first.id,second.id,'two separate orders created');
for(const current of [first,second]){
  const [active,history]=await Promise.all([call(`/api/orders/advanced?view=active&q=${encodeURIComponent(current.folio)}`),call(`/api/orders/advanced?view=history&q=${encodeURIComponent(current.folio)}`)]);
  assert.ok((active.orders||[]).some(item=>item.id===current.id),'emitted order appears in active Pedidos');
  assert.ok(!(history.orders||[]).some(item=>item.id===current.id),'active order does not leak into Historial');
}

const [firstPayload,secondPayload]=await Promise.all([call(`/api/orders/${encodeURIComponent(first.id)}`),call(`/api/orders/${encodeURIComponent(second.id)}`)]);
const firstOrder=firstPayload.order,secondOrder=secondPayload.order;
assert.equal(firstOrder.supplierId,secondOrder.supplierId,'collective payment orders share supplier');
assert.ok(firstOrder.items?.[0]?.id&&secondOrder.items?.[0]?.id,'order items persisted');
await call(`/api/orders/${encodeURIComponent(first.id)}/pdf`,{method:'POST',json:{}});
await call(`/api/orders/${encodeURIComponent(second.id)}/pdf`,{method:'POST',json:{}});

async function createInvoice(order,suffix){
  const result=await call('/api/invoices',{method:'POST',json:{supplierId:order.supplierId,invoiceNumber:`E2E-${stamp}-${suffix}`,documentType:'33',invoiceDate:today,locationId:location.id,orderIds:[order.id],currency:'CLP',totals:{net:Math.round(unitPrice/1.19),vat:unitPrice-Math.round(unitPrice/1.19),total:unitPrice},lines:[{productId:product.id,sourceDescription:`E2E ${product.name}`,packageQty:1,packSize:1,units:1,netLineTotal:Math.round(unitPrice/1.19),taxLineTotal:unitPrice-Math.round(unitPrice/1.19),grossLineTotal:unitPrice,grossUnitPrice:unitPrice,confidence:1,matchMethod:'synthetic-e2e'}]}});
  assert.ok(result.invoice?.id,'invoice associated');return result.invoice;
}
const invoiceA=await createInvoice(firstOrder,'A'),invoiceB=await createInvoice(secondOrder,'B');
assert.notEqual(invoiceA.id,invoiceB.id,'two separate invoices created');

const candidates=await call(`/api/finance/payment-candidates?orderId=${encodeURIComponent(first.id)}`);
assert.equal(candidates.supplier?.id,firstOrder.supplierId,'payment candidates preserve supplier');
assert.ok((candidates.invoices||[]).some(item=>item.invoiceId===invoiceA.id&&item.linkedToScopeOrder),'first invoice scoped to first order');
assert.ok((candidates.invoices||[]).some(item=>item.invoiceId===invoiceB.id&&!item.linkedToScopeOrder),'second invoice available for same-supplier collective payment');

const chequeNumber=`CHK-${stamp}`;
const collective=await call('/api/finance/payment-documents',{method:'POST',json:{supplierId:firstOrder.supplierId,paymentMethodId:chequeMethod.id,paymentMethodCode:chequeMethod.code,methodKind:'cheque',status:'scheduled',totalAmount:unitPrice*2,chequeNumber,chequeCollectionDate:chequeDate,chequePayee:'Nuvasto E2E',chequeAmount:unitPrice*2,chequeBank:'Banco E2E',allocations:[{invoiceId:invoiceA.id,amount:unitPrice},{invoiceId:invoiceB.id,amount:unitPrice}],note:'Synthetic collective payment'}});
const paymentDocument=collective.document;
assert.ok(paymentDocument?.id,'collective payment document created');
assert.equal(paymentDocument.allocations?.length,2,'payment document allocates both invoices');
assert.equal(Number(paymentDocument.unallocated_amount||0),0,'collective payment fully allocated');
const allocatedOrders=new Set((paymentDocument.allocations||[]).flatMap(item=>item.orderIds||[]));
assert.ok(allocatedOrders.has(first.id)&&allocatedOrders.has(second.id),'one payment document covers both orders');
const chequeSchedule=await call(`/api/finance/cheques?from=${encodeURIComponent(today)}&to=${encodeURIComponent(chequeDate)}`);
const matchingCheques=(chequeSchedule.cheques||[]).filter(item=>item.id===paymentDocument.id||item.cheque_number===chequeNumber);
assert.equal(matchingCheques.length,1,'collective cheque appears exactly once in schedule');

async function receiveAndClose(order){
  let full=(await call(`/api/orders/${encodeURIComponent(order.id)}`)).order;
  const item=full.items?.[0];assert.ok(item?.id,'order item available for reception');
  const reception=await call(`/api/orders/${encodeURIComponent(order.id)}/receptions`,{method:'POST',headers:{'Idempotency-Key':`dev-reception-${stamp}-${order.id}`},json:{receivedAt:today,deliveryNoteNumber:`E2E-${stamp}`,notes:'Synthetic DEV reception',expectedRevision:Number(full.revision||1),historicalDateConfirmed:false,items:[{orderItemId:item.id,quantityAccepted:1,quantityRejected:0}]}});
  assert.ok(reception.reception?.id,'reception recorded');
  full=(await call(`/api/orders/${encodeURIComponent(order.id)}`)).order;
  await call(`/api/orders/${encodeURIComponent(order.id)}/transition`,{method:'POST',json:{status:'closed',reason:'Synthetic DEV closure after reception',expectedRevision:Number(full.revision||1)}});
  const [active,history]=await Promise.all([call(`/api/orders/advanced?view=active&q=${encodeURIComponent(order.folio)}`),call(`/api/orders/advanced?view=history&q=${encodeURIComponent(order.folio)}`)]);
  assert.ok(!(active.orders||[]).some(item=>item.id===order.id),'closed order leaves Pedidos');
  assert.ok((history.orders||[]).some(item=>item.id===order.id),'closed order enters Historial');
}
await receiveAndClose(first);await receiveAndClose(second);

const [master,intelligence,planning,summary]=await Promise.all([call('/api/master-data-v44?entity=products&status=active'),call('/api/procurement-intelligence-v44'),call('/api/finance-planning-v44'),call('/api/procurement-os-v44/summary')]);
assert.ok(Array.isArray(master.items),'master data readable');
assert.ok(intelligence.intelligence,'procurement intelligence readable');
assert.ok(planning.planning,'finance planning readable');
assert.equal(summary.summary?.capabilities?.globalSearch,true,'platform summary exposes global search');

console.log(`development current E2E: OK · release ${canonical.release} · 2 pedidos + 2 facturas + 1 pago + recepción/cierre · ${first.folio} + ${second.folio}`);
