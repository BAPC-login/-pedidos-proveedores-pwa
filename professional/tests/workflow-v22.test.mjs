import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [ux,app,pdf,storage,orderCore,sw,pkg,indexV22,combined]=await Promise.all([
  readFile(new URL('../web/app-ux-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/pdf-order-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-core-v4.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8')
]);

assert.match(ux,/installNewOrderGuard/);
assert.match(ux,/if\(isNew\)return/);
assert.match(ux,/dialog\.append\(toolbar\)/);
assert.match(ux,/Enter ↵/);
assert.match(ux,/data-core-quantity/);
assert.match(ux,/Crear documento/);
assert.match(ux,/prepareBatchShare/);
assert.match(ux,/zipFiles/);
assert.match(ux,/navigator\.share/);
assert.match(ux,/v22Spin/);
assert.match(ux,/prefers-reduced-motion/);

assert.match(app,/initializeNuvastoUXV22/);
assert.ok(app.indexOf('initializeNuvastoUXV22()')<app.indexOf('initializeWorkflowV19()'),'v22 must wrap the legacy pending-order interceptor before workflow v19 registers it');

assert.match(pdf,/FECHA EMISIÓN/);
assert.match(pdf,/FECHA ENTREGA/);
assert.match(pdf,/CENTRO DE COSTO/);
assert.match(pdf,/PRODUCTOS/);
assert.match(pdf,/drawImageFit\(pdf,supplierLogo,x\+64,supplierY\+9,52/);
assert.match(pdf,/Documento generado por Nuvasto/);
assert.match(pdf,/createProfessionalOrderPdfV22/);
assert.match(storage,/pdf-order-v24\.js/);
assert.match(storage,/pdfVersion:24/);
assert.match(orderCore,/Number\(metadata\.pdfVersion\|\|0\)>=22/);
assert.match(sw,/(?:nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard|nuvasto-v26-r2-invoice-keyboard)/);
assert.match(sw,/app-ux-v22\.js/);
assert.match(pkg,/2\.0\.0-alpha\.(?:22|23|24|25|26)/);
assert.match(pkg,/index-v22\.js/);
assert.match(indexV22,/X-Nuvasto-Version','22'/);
assert.match(indexV22,/masterEnterNavigation:true/);
assert.match(indexV22,/batchShareZipFallback:true/);
assert.match(indexV22,/orderPdfVersion:22/);
assert.match(combined,/index-v(?:22|26)\.js/);
assert.match(combined,/2026\.(?:07\.31\.22|08\.04\.26)/);

console.log('workflow v22 UX compatibility with Nuvasto v26: OK');
