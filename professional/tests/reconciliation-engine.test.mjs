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
// The source "Total x Unidad" remains auditable, but the final costing matrix must also
// absorb the supplier's one-peso rounding so Σ(cantidad × precio final) equals the official total.
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
assert.deepEqual(priced.map(item=>item.grossUnitPrice),[14105.167,11462.833,6677.167,8499.667],'canonical physical-unit cost must include the deterministic supplier rounding adjustment');
assert.deepEqual(priced.map(item=>item.sourcePrintedFinalUnitPrice),[14105.2,11462.8,6677.2,8499.7],'literal supplier prices must remain auditable separately from canonical product cost');
assert.deepEqual(priced.map(item=>item.grossLineTotal),[84631,68777,80126,152994],'effective line totals must absorb only the supplier rounding needed to close the official total');
assert.ok(priced.every(item=>item.priceSource==='printed-final-unit'&&item.taxAllocationMethod==='supplier-total-x-unidad'),'printed supplier pricing must expose explicit provenance');
assert.ok(priced.every(item=>item.finalQuantityBasis==='physical_units'),'Pisquera Total x Unidad must be validated against physical units');
assert.equal(realInvoice.invoice.pricingSummary.method,'printed-final-unit-column','printed final-unit column must outrank proportional tax reconstruction');
assert.equal(realInvoice.invoice.pricingSummary.sourceExtendedRounded,386529,'the source printed prices remain auditable before rounding reconciliation');
assert.equal(realInvoice.invoice.pricingSummary.sourceChecksumDelta,-1,'the source supplier prices differ by one peso because of supplier rounding');
assert.equal(realInvoice.invoice.pricingSummary.formulaExtendedTotal,386528,'the effective product-cost formula must equal the official invoice total');
assert.equal(realInvoice.invoice.pricingSummary.checksumDelta,0,'final product checksum must be exact after deterministic rounding allocation');
assert.equal(realInvoice.invoice.pricingSummary.verified,true,'printed final-unit pricing is verified only when the effective product matrix closes');
assert.equal(Math.round(priced.reduce((sum,item)=>sum+item.finalQuantity*item.finalUnitPrice,0)),386528,'Σ(cantidad × precio final) must equal invoice total');

// If a document does not expose Total x Unidad, retain deterministic invoice-level allocation.
const fallbackInvoice=normalizeInvoiceAnalysis({invoice:{totals:{net:1000,vat:190,additionalTax:0,other:0,total:1190},warnings:[],lines:[{matchedOrderProductId:'fernet',descriptionOriginal:'FERNET BRANCA 39GL 1000CC X 6',invoiceQuantity:1,packSize:6,netLineTotal:1000}]}},liquorContext);
assert.equal(fallbackInvoice.invoice.lines[0].priceSource,'invoice-total-tax-allocation','documents without printed final-unit price must keep deterministic fallback');
assert.equal(fallbackInvoice.invoice.lines[0].grossLineTotal,1190);
assert.equal(fallbackInvoice.invoice.pricingSummary.formulaExtendedTotal,1190);

// VCT-style headers can express a final price per billed quantity/case instead of per bottle.
// The backup source field survives the legacy normalizer and the matrix selects invoice_quantity.
const vctLike=normalizeInvoiceAnalysis({invoice:{totals:{total:285257},warnings:[],lines:[
  {descriptionOriginal:'LICOR PISCO MAL PASO ICONO 40° 06U',invoiceQuantity:1,packSize:6,sourcePrintedFinalUnitPrice:93600,sourceFinalUnitPriceHeader:'Precio Unit Bruto Final'},
  {descriptionOriginal:'VINO CLOS DE PIRQUE CAB.SAUV 6 TPK',invoiceQuantity:1,packSize:6,sourcePrintedFinalUnitPrice:25335,sourceFinalUnitPriceHeader:'Precio Unit Bruto Final'},
  {descriptionOriginal:'VINO MARQUES BLUE CARMENERE',invoiceQuantity:2,packSize:6,sourcePrintedFinalUnitPrice:83161,sourceFinalUnitPriceHeader:'Precio Unit Bruto Final'}
]}},{products:[],aliases:[]});
assert.equal(vctLike.invoice.pricingSummary.sourceFinalPriceBasis,'invoice_quantity','source final-price basis must be discovered mathematically, not by supplier name');
assert.equal(vctLike.invoice.pricingSummary.finalQuantityBasis,'physical_units','canonical product cost must always end as physical-unit quantity × physical-unit price');
assert.equal(vctLike.invoice.pricingSummary.formulaExtendedTotal,285257);
assert.equal(vctLike.invoice.pricingSummary.verified,true);
assert.equal(vctLike.invoice.lines[0].sourcePrintedFinalUnitPrice,93600,'literal billed-unit price must survive normalization for audit');
assert.equal(vctLike.invoice.lines[0].printedFinalUnitPrice,15600,'current review UI must receive the reconciled physical-unit cost, not a case price labeled as unit price');
assert.equal(vctLike.invoice.lines[0].finalUnitPriceHeader,'Precio Unit Bruto Final','source final-price header must remain literal');

const multiInvoiceSource=fs.readFileSync(new URL('../web/app-multi-invoice.js',import.meta.url),'utf8');
assert.ok(multiInvoiceSource.includes('orderId:queue.orderId'),'invoice analysis must send the already-selected order id to the server');
assert.ok(multiInvoiceSource.includes("String(item.folio||'').trim()===candidate"),'order resolver must support current folios such as MDRB00002');
assert.ok(!multiInvoiceSource.includes('/^[A-Z0-9]+-\\d{6}-\\d{3}$/i'),'invoice entry must not depend on the retired date-style folio format');
assert.ok(!multiInvoiceSource.includes("upload.append('orderFile'"),'invoice flow must not re-upload the order PDF when D1 already owns the canonical order context');
assert.ok(multiInvoiceSource.includes('Precio final impreso · Total x Unidad')&&multiInvoiceSource.includes('documento cierra matemáticamente'),'review UI must explain that the printed supplier value is accepted only after deterministic closure');
assert.ok(multiInvoiceSource.includes('data-printed-final-unit')&&multiInvoiceSource.includes('printedFinalUnitPrice'),'review/save flow must preserve the printed decimal unit price');

console.log('reconciliation + invoice arithmetic regression tests: OK');
