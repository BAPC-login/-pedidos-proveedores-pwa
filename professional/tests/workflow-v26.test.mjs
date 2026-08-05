import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeInvoiceAnalysis} from '../worker/src/invoice-normalizer-v26.js';

const [index,frontend,hotfix,combined,wrangler,sw,pkg]=await Promise.all([
  readFile(new URL('../worker/src/index-v26.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-r2-invoice-keyboard-v26.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-professional-hotfix-v24.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

const bottles=normalizeInvoiceAnalysis({invoice:{lines:[{sourceLine:'GIN LARÚ 48 BOTELLAS 750CC',invoiceQuantity:48,packSize:6,grossLineTotal:504000,productId:'gin-laru',confidence:.96}]}},{products:[{productId:'gin-laru',description:'GIN LARÚ',unit:'CAJA (6)',orderedQty:8,unitsPerOrderUnit:6}]});
const bottleLine=bottles.invoice.lines[0];
assert.equal(bottleLine.packSize,1);
assert.equal(bottleLine.units,48);
assert.equal(bottleLine.orderedFormatQty,8);
assert.equal(bottleLine.quantityStatus,'exact');
assert.match(bottleLine.conversionSummary,/48 unidades = 8 caja \(6\)/i);

const box=normalizeInvoiceAnalysis({invoice:{lines:[{sourceLine:'GIN LARÚ CAJA X6 750CC',invoiceQuantity:1,packSize:1,grossLineTotal:63000,productId:'gin-laru',confidence:.9}]}},{products:[{productId:'gin-laru',description:'GIN LARÚ',unit:'CAJA (6)',orderedQty:1,unitsPerOrderUnit:6}]});
assert.equal(box.invoice.lines[0].packSize,6);
assert.equal(box.invoice.lines[0].units,6);
assert.equal(box.invoice.lines[0].orderedFormatQty,1);

assert.match(index,/AI_ATTEMPTS=2/);
assert.match(index,/storeFile\(env,actor,file/);
assert.match(index,/purpose:'invoice-source'/);
assert.match(index,/normalizeInvoiceAnalysis/);
assert.match(index,/\/api\/storage\/r2\/verify/);
assert.match(index,/\/api\/storage\/r2\/status/);
assert.match(frontend,/function keepVisible/);
assert.match(frontend,/body\.scrollBy/);
assert.match(frontend,/v26-forced-open/);
assert.match(frontend,/Selecciona un folio emitido pendiente de factura/);
assert.match(frontend,/\/api\/storage\/migrate-r2/);
assert.match(frontend,/v26-conversion/);
assert.match(hotfix,/app-r2-invoice-keyboard-v26\.js/);
assert.match(combined,/index-v26\.js/);
assert.match(wrangler,/REQUIRE_R2 = "true"/);
assert.match(wrangler,/binding = "FILES"/);
assert.match(wrangler,/bucket_name = "nuvasto-files"/);
assert.match(sw,/nuvasto-v26-r2-invoice-keyboard/);
assert.match(sw,/app-r2-invoice-keyboard-v26\.js/);
assert.match(pkg,/2\.0\.0-alpha\.26/);
assert.match(pkg,/workflow-v26\.test\.mjs/);

console.log('workflow v26 R2, invoice normalization and keyboard: OK');
