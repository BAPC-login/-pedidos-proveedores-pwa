import assert from 'node:assert/strict';

const base=String(process.env.NUVASTO_BASE_URL||'').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'').trim();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
assert.match(new URL(base).hostname,/^pedidos-pro-ai-dev\./,'invoice reception E2E is allowed on isolated DEV only');
assert.equal(email,'e2e@nuvasto.dev','only reserved DEV QA identity can execute');
assert.ok(password,'DEV QA password missing');
let token='';
async function call(path,{method='GET',json,headers={}}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw Object.assign(new Error(method+' '+path+' · '+response.status+' · '+(data.error||'error')), {status:response.status});
  return data;
}
const health=await call('/platform/health');
assert.equal(health.environment,'development');
assert.equal(health.developmentEnvironment,true);
token=(await call('/api/auth/login',{method:'POST',json:{email,password}})).token;
const me=await call('/api/me');
assert.equal(me.organization?.name,'Nuvasto QA','must never create test data in an unknown organization');
const [locations,centers,products,suppliers]=await Promise.all([call('/api/locations'),call('/api/cost-centers'),call('/api/products'),call('/api/suppliers?active=all')]);
const location=locations.locations.find(x=>x.name==='Laboratorio');
const center=centers.costCenters.find(x=>x.locationId===location?.id&&x.name==='E2E');
const supplier=suppliers.suppliers.find(x=>x.name==='Proveedor E2E');
const ordered=products.products.find(x=>x.name==='Producto E2E');
const relation=ordered?.suppliers.find(x=>x.supplierId===supplier?.id);
assert.ok(location?.id&&center?.id&&supplier?.id&&relation?.id,'DEV QA seed must have synthetic sample products');
const suffix=Date.now().toString(36),today=new Date().toISOString().slice(0,10);
const newName='Unrequested Invoice Item QA '+suffix;
const created=(await call('/api/products',{method:'POST',json:{name:newName,baseUnit:'unidad',brand:'Nuvasto QA',contentValue:1,contentUnit:'un',costCenterIds:[center.id]}})).product;
assert.ok(created?.id,'create missing invoice product');
await call('/api/products/'+encodeURIComponent(created.id)+'/suppliers',{method:'POST',json:{supplierId:supplier.id,supplierProductName:newName,orderUnit:'UNIDAD',unitsPerOrderUnit:1,quantityMultiple:1}});
const related=(await call('/api/products?'+new URLSearchParams({supplierId:supplier.id}))).products.find(x=>x.id===created.id);
const extraRelation=related?.suppliers.find(x=>x.supplierId===supplier.id);
assert.ok(extraRelation?.id,'new product must be linked to supplier before receiving extra');
// A competing supplier has a previous invoice for the identical product.
const competitor=(await call('/api/suppliers',{method:'POST',json:{name:'Proveedor QA Comparador '+suffix,legalName:'Comparador QA',paymentTerms:'Contra entrega'}})).supplier;
assert.ok(competitor?.id,'QA competing supplier created');
await call('/api/products/'+encodeURIComponent(created.id)+'/suppliers',{method:'POST',json:{supplierId:competitor.id,supplierProductName:newName,orderUnit:'UNIDAD',unitsPerOrderUnit:1,quantityMultiple:1}});
const benchmark=await call('/api/invoices',{method:'POST',json:{supplierId:competitor.id,locationId:location.id,orderIds:[],documentType:'33',
  invoiceNumber:'QA-BASE-'+suffix,invoiceDate:today,currency:'CLP',totals:{net:1000,vat:190,total:1190},markReceived:false,
  aiModel:'qa-price-history',aiConfidence:1,lines:[{productId:created.id,sourceDescription:newName,packageQty:1,invoiceQuantity:1,packSize:1,units:1,totalUnits:1,netLineTotal:1000,grossLineTotal:1190,grossUnitPrice:1190,matchMethod:'qa-history'}]}}); 
assert.ok(benchmark.invoice?.id,'baseline from another supplier recorded');
const idempotency='qa-unified-'+suffix;
const createdBatch=await call('/api/order-batches/v2',{method:'POST',headers:{'Idempotency-Key':idempotency},json:{locationId:location.id,costCenterId:center.id,deliveryMode:'all',deliveryDate:today,notes:'Synthetic DEV unified invoice reception '+suffix,items:[{supplierProductId:relation.id,quantity:1,orderUnit:relation.orderUnit||'UNIDAD',unitsPerOrderUnit:Number(relation.unitsPerOrderUnit||1)}]}});
const batch=createdBatch.batch||createdBatch;
const orderId=batch.orders?.[0]?.id;
assert.ok(orderId&&batch.batchId,'created QA order');
await call('/api/order-batches/'+encodeURIComponent(batch.batchId)+'/emit',{method:'POST',json:{}});
const physical=Math.max(.001,Number(relation.unitsPerOrderUnit||1)),number='QA-UNIFIED-'+suffix,net=2000,vat=380,total=2380;
const invoice=await call('/api/invoices',{method:'POST',json:{
  supplierId:supplier.id,locationId:location.id,orderIds:[orderId],documentType:'33',invoiceNumber:number,invoiceDate:today,
  currency:'CLP',totals:{net,vat,total,freight:0,additionalTax:0},markReceived:true,receptionDate:today,aiModel:'qa-e2e-not-ai',aiConfidence:1,
  lines:[
    {productId:ordered.id,supplierProductId:relation.id,sourceDescription:ordered.name,packageQty:1,invoiceQuantity:1,packSize:physical,units:physical,totalUnits:physical,netLineTotal:1000,grossLineTotal:1190,grossUnitPrice:Math.round(1190/physical),receivedUnits:physical,rejectedUnits:0,extraAccepted:false,matchMethod:'qa-confirmed'},
    {productId:created.id,supplierProductId:extraRelation.id,sourceDescription:newName,packageQty:2,invoiceQuantity:2,packSize:1,units:2,totalUnits:2,netLineTotal:1000,grossLineTotal:1190,grossUnitPrice:595,receivedUnits:1,rejectedUnits:1,qualityType:'damaged',qualityNote:'QA: one extra item rejected',extraAccepted:true,matchMethod:'qa-catalog-created'}
  ]
}});
assert.ok(invoice.invoice?.id,'invoice saved');
assert.ok(!invoice.receptionError,'invoice reception must not return a partial-save error: '+String(invoice.receptionError||''));
assert.ok(invoice.reception?.id,'invoice-derived reception persisted');
assert.equal(Number(invoice.reception?.extraItemCount??invoice.extraReceivedCount),1,'extra product must be recorded independently from ordered items');
const impact=(await call('/api/invoices/'+encodeURIComponent(invoice.invoice.id)+'/price-impact')).impact;
assert.equal(impact.invoiceId,invoice.invoice.id,'price impact belongs to the saved invoice');
const priceExtra=impact.lines.find(line=>line.productId===created.id);
assert.ok(priceExtra,'new extra product appears in price report');
assert.equal(priceExtra.currentPrice,595,'current price per physical unit');
assert.equal(priceExtra.sameSupplier.previousPrice,0,'no history at same supplier means zero');
assert.equal(priceExtra.sameSupplier.delta,0,'no supplier history shows zero CLP difference');
assert.equal(priceExtra.sameSupplier.percent,0,'no supplier history shows zero percent');
assert.equal(priceExtra.otherSupplier.supplierId,competitor.id,'same product is compared to a different supplier');
assert.equal(priceExtra.otherSupplier.previousPrice,1190,'previous competing supplier unit price');
assert.equal(priceExtra.otherSupplier.delta,-595,'cross supplier delta in CLP');
assert.equal(priceExtra.otherSupplier.percent,-50,'cross supplier difference in percent');
const ledger=await call('/api/finance/invoice-register?'+new URLSearchParams({supplierId:supplier.id,from:today,to:today,invoiceNumber:number}));
assert.ok(ledger.invoices.some(item=>item.id===invoice.invoice.id),'invoice is present in finance register');
assert.ok(ledger.invoices.every(item=>item.supplierId===supplier.id),'supplier filter isolates provider');
assert.ok(ledger.invoices.every(item=>item.invoiceNumber.includes(number)),'invoice number filter');
assert.ok(ledger.invoices.every(item=>item.invoiceDate===today),'date range filter');
const detail=(await call('/api/orders/'+encodeURIComponent(orderId))).order;
assert.ok(['received','reconciled'].includes(detail.status),'order records reception and may automatically reconcile a balanced invoice');
assert.equal(Number(detail.items.find(x=>x.productId===ordered.id)?.quantityReceived),1,'invoice accepted physical units normalized to order units');
const linked=await call('/api/orders/'+encodeURIComponent(orderId)+'/invoices');
assert.ok(linked.invoices?.some(x=>x.id===invoice.invoice.id),'linked invoice visible in order');
const finished=await call('/api/orders/'+encodeURIComponent(orderId)+'/finalize',{method:'POST',json:{notes:'QA unified invoice receipt success'}});
assert.equal(finished.status,'closed','order closes directly after invoice-driven reception');
assert.equal(finished.invoicePending,false);
console.log('DEV unified invoice reception v100: OK · ordered product, created supplier extra, accepted/rejected amounts, linked invoice and closure');
