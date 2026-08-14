import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeInvoiceAnalysis} from '../worker/src/invoice-normalizer.js';

const context={
  products:[
    {productId:'p-zero-591',description:'Coca Cola Zero 591 ml',catalogName:'Coca Cola Zero 591 ml',supplierProductName:'C/C ZERO PET 591CC',supplierSku:'SKU-Z591',barcode:'7801610005910',unit:'UNIDAD',orderedQty:12,unitsPerOrderUnit:1},
    {productId:'p-normal-591',description:'Coca Cola Original 591 ml',catalogName:'Coca Cola Original 591 ml',supplierProductName:'C/C NORMAL PET 591CC',supplierSku:'SKU-N591',barcode:'7801610015919',unit:'UNIDAD',orderedQty:12,unitsPerOrderUnit:1},
    {productId:'p-zero-1500',description:'Coca Cola Zero 1.5 L',catalogName:'Coca Cola Zero 1.5 L',supplierProductName:'C/C ZERO PET 1500CC',supplierSku:'SKU-Z1500',barcode:'7801610015001',unit:'DISPLAY (6)',orderedQty:2,unitsPerOrderUnit:6},
    {productId:'p-jw-black',description:'Johnnie Walker Black 750 ml',catalogName:'Johnnie Walker Black 750 ml',supplierProductName:'WHIS JW BLACK 750CC',supplierSku:'JWBL750',barcode:'5000267023602',unit:'CAJA (6)',orderedQty:1,unitsPerOrderUnit:6}
  ],
  aliases:[
    {productId:'p-zero-591',alias:'BEB COKE Z 591',confidence:.93,usageCount:5},
    {productId:'p-jw-black',alias:'JW BLK 750',confidence:.9,usageCount:3}
  ]
};

function one(line){
  const result=normalizeInvoiceAnalysis({invoice:{lines:[{invoiceQuantity:1,packSize:1,grossLineTotal:1000,...line}],warnings:[]}},context);
  return result.invoice.lines[0];
}

let line=one({code:'SKU-Z591',descriptionOriginal:'BEBIDA GASEOSA'});
assert.equal(line.productId,'p-zero-591','exact supplier SKU must resolve product');
assert.equal(line.matchMethod,'supplier-sku','SKU match must be explainable');

line=one({descriptionOriginal:'C/C ZERO PET 591CC'});
assert.equal(line.productId,'p-zero-591','supplier product name must resolve product');
assert.equal(line.matchMethod,'supplier-product-name','supplier naming must outrank generic fuzzy match');

line=one({descriptionOriginal:'BEB COKE Z 591'});
assert.equal(line.productId,'p-zero-591','historical supplier alias must resolve product');
assert.equal(line.matchMethod,'supplier-alias','historical alias must be identified');

line=one({descriptionOriginal:'COCA COLA NORMAL PET 591 ML'});
assert.equal(line.productId,'p-normal-591','variant conflict must prevent ZERO/normal crossover');

line=one({descriptionOriginal:'C/C ZERO PET 1500CC',invoiceQuantity:2,packSize:6});
assert.equal(line.productId,'p-zero-1500','volume must disambiguate same family');
assert.notEqual(line.productId,'p-zero-591','wrong volume must not win');

line=one({code:'JWBL750',descriptionOriginal:'WHIS IMPORTADO'});
assert.equal(line.productId,'p-jw-black','supplier SKU must rescue heavily abbreviated description');

line=one({descriptionOriginal:'JW BLK 750'});
assert.equal(line.productId,'p-jw-black','learned short alias must match canonical product');

const unmatched=one({descriptionOriginal:'PRODUCTO TOTALMENTE DESCONOCIDO 330 ML'});
assert.equal(unmatched.productId,'','unrelated line must stay unmatched');

// Regression based on Pisquera de Chile factura electrónica 23826680 (07/08/2026).
// The document prints discounted net line values and only invoice-level VAT / ILA totals.
// Deliberately wrong AI gross values below reproduce the bug seen in production; they must be ignored.
const liquorContext={products:[
  {productId:'fernet',description:'LICOR FERNET BRANCA',supplierProductName:'FERNET BRANCA 39GL 1000CC X 6',unit:'CAJA(6)',orderedQty:1,unitsPerOrderUnit:6},
  {productId:'nobel',description:'PISCO MISTRAL NOBEL',supplierProductName:'MISTRAL NOBEL VNR750CC X 06 TR',unit:'CAJA(6)',orderedQty:1,unitsPerOrderUnit:6},
  {productId:'mistral35',description:'PISCO MISTRAL 35',supplierProductName:'MISTRAL 35GL VNR1000CC-TR X 12',unit:'CAJA(12)',orderedQty:1,unitsPerOrderUnit:12},
  {productId:'ramazzotti',description:'LICOR RAMAZZOTTI',supplierProductName:'RAMAZZOTTI 15GL VNR700CC X 6',unit:'CAJA(6)',orderedQty:3,unitsPerOrderUnit:6}
],aliases:[]};
const realInvoice=normalizeInvoiceAnalysis({invoice:{totals:{net:259487,freight:12700,vat:49303,additionalTax:77738,other:0,total:386528},warnings:[],lines:[
  {code:'470017',matchedOrderProductId:'fernet',descriptionOriginal:'FERNET BRANCA 39GL 1000CC X 6',invoiceQuantity:1,packSize:6,netLineTotal:54652,grossLineTotal:69454,grossUnitPrice:11576},
  {code:'445696',matchedOrderProductId:'nobel',descriptionOriginal:'MISTRAL NOBEL VNR750CC X 06 TR',invoiceQuantity:1,packSize:6,netLineTotal:44118,grossLineTotal:75494,grossUnitPrice:12582},
  {code:'445761',matchedOrderProductId:'mistral35',descriptionOriginal:'MISTRAL 35GL VNR1000CC-TR X 12',invoiceQuantity:1,packSize:12,netLineTotal:51105,grossLineTotal:60395,grossUnitPrice:5033},
  {code:'442277',matchedOrderProductId:'ramazzotti',descriptionOriginal:'RAMAZZOTTI 15GL VNR700CC X 6',invoiceQuantity:3,packSize:6,netLineTotal:96912,grossLineTotal:181185,grossUnitPrice:10066}
]}},liquorContext);

const priced=realInvoice.invoice.lines;
assert.deepEqual(priced.map(item=>item.grossLineTotal),[82252,66398,76913,145852],'gross product totals must be reconstructed from printed net + allocated taxes');
assert.deepEqual(priced.map(item=>item.grossUnitPrice),[13709,11066,6409,8103],'final per-unit prices must match deterministic invoice arithmetic');
assert.deepEqual(priced.map(item=>item.readGrossLineTotal),[69454,75494,60395,181185],'AI gross guesses remain diagnostic only and cannot drive pricing');
assert.deepEqual(priced.map(item=>item.allocatedVat),[10384,8383,9710,18413],'VAT must be allocated over the taxable net base including freight');
assert.deepEqual(priced.map(item=>item.allocatedAdditionalTax),[17216,13897,16098,30527],'additional tax must be allocated over merchandise net');
assert.equal(realInvoice.invoice.pricingSummary.nonMerchandiseGross,15113,'freight plus its VAT must remain outside product prices');
assert.equal(realInvoice.invoice.pricingSummary.documentTotalComputed,386528,'reconstructed document must close to printed total');
assert.equal(realInvoice.invoice.pricingSummary.checksumDelta,0,'invoice checksum must close exactly');
assert.equal(realInvoice.invoice.pricingSummary.verified,true,'pricing must be marked verified only when document arithmetic closes');
assert.ok(priced.every(item=>item.priceSource==='invoice-total-tax-allocation'&&item.priceVerified),'all product prices must expose deterministic provenance');

const multiInvoiceSource=fs.readFileSync(new URL('../web/app-multi-invoice.js',import.meta.url),'utf8');
assert.ok(multiInvoiceSource.includes('orderId:queue.orderId'),'invoice analysis must send the already-selected order id to the server');
assert.ok(multiInvoiceSource.includes("String(item.folio||'').trim()===candidate"),'order resolver must support current folios such as MDRB00002');
assert.ok(!multiInvoiceSource.includes('/^[A-Z0-9]+-\\d{6}-\\d{3}$/i'),'invoice entry must not depend on the retired date-style folio format');
assert.ok(!multiInvoiceSource.includes("upload.append('orderFile'"),'invoice flow must not re-upload the order PDF when D1 already owns the canonical order context');
assert.ok(multiInvoiceSource.includes('Bruto final calculado')&&multiInvoiceSource.includes('Precio trazable desde la factura'),'review UI must explain calculated gross pricing');

console.log('reconciliation + invoice arithmetic regression tests: OK');
