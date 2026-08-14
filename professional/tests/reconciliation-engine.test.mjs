import assert from 'node:assert/strict';
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

console.log('reconciliation engine regression tests: OK');
