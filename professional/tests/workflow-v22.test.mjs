import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [ux,app,runtime,pdf,storage,orderCore,sw,pkg,indexV22,combined]=await Promise.all([
  readFile(new URL('../web/app-ux-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-runtime-current.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/pdf-order-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-core-v4.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8')
]);

for(const token of ['installNewOrderGuard','dialog.append(toolbar)','Enter ↵','data-core-quantity','Crear documento','prepareBatchShare','zipFiles','navigator.share','v22Spin','prefers-reduced-motion'])assert.match(ux,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(ux,/if\(isNew\)return/);
assert.match(app,/initializeCurrentRuntime/);assert.match(runtime,/initializeNuvastoUXV22/);assert.ok(runtime.indexOf('initializeNuvastoUXV22')<runtime.indexOf('initializeWorkflowV19'),'v22 must initialize before workflow v19 in current runtime');
for(const token of ['FECHA EMISIÓN','FECHA ENTREGA','CENTRO DE COSTO','PRODUCTOS','Documento generado por Nuvasto','createProfessionalOrderPdfV22'])assert.match(pdf,new RegExp(token));
assert.match(pdf,/drawImageFit\(pdf,supplierLogo,x\+64,supplierY\+9,52/);assert.match(storage,/pdf-order-v24\.js/);assert.match(storage,/pdfVersion:24/);assert.match(orderCore,/Number\(metadata\.pdfVersion\|\|0\)>=22/);
assert.match(sw,/(?:nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard|nuvasto-v26-r2-invoice-keyboard)/);assert.match(sw,/app-ux-v22\.js/);assert.match(pkg,/2\.0\.0-alpha\.(?:22|23|24|25|26)/);assert.match(pkg,/index-v22\.js/);assert.match(indexV22,/X-Nuvasto-Version','22'/);assert.match(indexV22,/masterEnterNavigation:true/);assert.match(indexV22,/batchShareZipFallback:true/);assert.match(indexV22,/orderPdfVersion:22/);assert.match(combined,/index-v(?:22|26)\.js/);assert.match(combined,/2026\.(?:07\.31\.22|08\.04\.26)/);
console.log('workflow v22 UX compatibility resolved through current r60 runtime: OK');
