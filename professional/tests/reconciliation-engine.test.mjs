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
// CCU/Pisquera/VSPT documents print a far-right "Total x Unidad" value that already includes
// discounts, taxes and prorated charges such as freight. That printed unit value is authoritative.
const liquorContext={products:[
  {productId:'fernet',description:'LICOR FERNET BRANCA',supplierProductName:'FERNET BRANCA 39GL 1000CC X 6',unit:'CAJA(6)',orderedQty:1,unitsPerOrderUnit:6},
  {productId:'nobel',description:'PISCO MISTRAL NOBEL',supplierProductName:'MISTRAL NOBEL VNR750CC X 06 TR',unit:'CAJA(6)',orderedQty:1,unitsPerOrderUnit:6},
  {productId:'mistral35',description:'PISCO MISTRAL 35',supplierProductName:'MISTRAL 35GL VNR1000CC-TR X 12',unit:'CAJA(12)',orderedQty:1,unitsPerOrderUnit:12},
  {productId:'ramazzotti',description:'LICOR RAMAZZOTTI',supplierProductName:'RAMAZZOTTI 15GL VNR700CC X 6',unit:'CAJA(6)',orderedQty:3,unitsPerOrderUnit:6}
],aliases:[]};
const realInvoice=normalizeInvoiceAnalysis({invoice:{supplierName:'COMPAÑIA PISQUERA DE CHILE S.A.',totals:{net:259487,freight:12700,vat:49303,additionalTax:77738,other:0,total:386528},warnings:[],lines:[
  {code:'470017',matchedOrderProductId:'fernet',descriptionOriginal:'FERNET BRANCA 39GL 1000CC X 6',invoiceQuantity:1,packSize:6,netLineTotal:54652,finalUnitPrice:14105.2,finalUnitPriceRaw:'14.105,2',finalUnitPriceHeader:'Total x Unidad'},
  {code:'445696',matchedOrderProductId:'nobel',descriptionOriginal:'MISTRAL NOBEL VNR750CC X 06 TR',invoiceQuantity:1,packSize:6,netLineTotal:44118,finalUnitPrice:11462.8,finalUnitPriceRaw:'11.462,8',finalUnitPriceHeader:'Total x Unidad'},
  {code:'445761',matchedOrderProductId:'mistral35',descriptionOriginal:'MISTRAL 35GL VNR1000CC-TR X 12',invoiceQuantity:1,packSize:12,netLineTotal:51105,finalUnitPrice:6677.2,finalUnitPriceRaw:'6.677,2',finalUnitPriceHeader:'Total x Unidad'},
  {code:'442277',matchedOrderProductId:'ramazzotti',descriptionOriginal:'RAMAZZOTTI 15GL VNR700CC X 6',invoiceQuantity:3,packSize:6,netLineTotal:96912,finalUnitPrice:8499.7,finalUnitPriceRaw:'8.499,7',finalUnitPriceHeader:'Total x Unidad'}
]}},liquorContext);

const priced=realInvoice.invoice.lines;
assert.deepEqual(priced.map(item=>item.grossUnitPrice),[14105.2,11462.8,6677.2,8499.7],'printed Total x Unidad must become the final base-unit cost without reconstruction');
assert.deepEqual(priced.map(item=>item.grossLineTotal),[84631,68777,80126,152995],'line extensions must be derived from printed final unit price only for checksum purposes');
assert.ok(priced.every(item=>item.priceSource==='printed-final-unit'&&item.taxAllocationMethod==='supplier-total-x-unidad'),'printed supplier pricing must expose explicit provenance');
assert.equal(realInvoice.invoice.pricingSummary.method,'printed-final-unit-column','printed final-unit column must outrank proportional tax reconstruction');
assert.equal(realInvoice.invoice.pricingSummary.extendedExact,386529,'decimal printed unit prices reproduce the invoice total within supplier rounding');
assert.equal(realInvoice.invoice.pricingSummary.checksumDelta,-1,'one-peso rounding delta is acceptable for the printed supplier column');
assert.equal(realInvoice.invoice.pricingSummary.verified,true,'printed final-unit pricing is verified when the extended total closes within rounding tolerance');

// If a document does not expose Total x Unidad, retain the deterministic invoice-level fallback.
const fallbackInvoice=normalizeInvoiceAnalysis({invoice:{totals:{net:1000,vat:190,additionalTax:0,other:0,total:1190},warnings:[],lines:[{matchedOrderProductId:'fernet',descriptionOriginal:'FERNET BRANCA 39GL 1000CC X 6',invoiceQuantity:1,packSize:6,netLineTotal:1000}]}},liquorContext);
assert.equal(fallbackInvoice.invoice.lines[0].priceSource,'invoice-total-tax-allocation','documents without printed final-unit price must keep deterministic fallback');
assert.equal(fallbackInvoice.invoice.lines[0].grossLineTotal,1190);

const multiInvoiceSource=fs.readFileSync(new URL('../web/app-multi-invoice.js',import.meta.url),'utf8');
assert.ok(multiInvoiceSource.includes('orderId:queue.orderId'),'invoice analysis must send the already-selected order id to the server');
assert.ok(multiInvoiceSource.includes("String(item.folio||'').trim()===candidate"),'order resolver must support current folios such as MDRB00002');
assert.ok(!multiInvoiceSource.includes('/^[A-Z0-9]+-\\d{6}-\\d{3}$/i'),'invoice entry must not depend on the retired date-style folio format');
assert.ok(!multiInvoiceSource.includes("upload.append('orderFile'"),'invoice flow must not re-upload the order PDF when D1 already owns the canonical order context');
assert.ok(multiInvoiceSource.includes('Precio final impreso · Total x Unidad')&&multiInvoiceSource.includes('incluido flete'),'review UI must explain supplier-printed final-unit provenance');
assert.ok(multiInvoiceSource.includes('data-printed-final-unit')&&multiInvoiceSource.includes('printedFinalUnitPrice'),'review/save flow must preserve the printed decimal unit price');

console.log('reconciliation + invoice arithmetic regression tests: OK');
