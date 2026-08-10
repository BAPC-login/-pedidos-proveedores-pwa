import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [workflow,pdf,storage,pdfApi,indexV19,combined,wrangler,r2Wrangler,app,runtime,serviceWorker]=await Promise.all([
  readFile(new URL('../web/app-workflow-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/pdf-order-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-pdf-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.r2.toml',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-runtime-current.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

for(const token of ['Pedidos por emitir','Compartir seleccionados','Emitir todo','Cancelar todo','eligibleInvoiceOrder','Solo se muestran proveedores y pedidos emitidos vigentes','order.required=true','Checkout de factura','Coincidencia alta por nombre y catálogo','Hoy para todos','Mañana para todos','syncGeneralDate','Siguiente ↵','visualViewport','bottom-nav'])assert.match(workflow,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(workflow,/registerRouteRenderer\('receiving',renderReceivingV19\)/);assert.match(workflow,/openRoute\('dashboard'/);
for(const token of ['createProfessionalOrderPdfV22','CENTRO DE COSTO','FECHA ENTREGA','FECHA EMISIÓN','PRODUCTOS','metaRow','supplierLogo','companyLogo'])assert.match(pdf,new RegExp(token));
assert.match(storage,/REQUIRE_R2/);assert.match(storage,/r2_required/);assert.match(storage,/createProfessionalOrderPdfV24/);assert.match(storage,/pdfVersion:24/);assert.match(pdfApi,/pdfVersion\|\|0\)>=24/);
assert.match(indexV19,/r2Ready:Boolean\(env\.FILES\)/);assert.match(indexV19,/invoicePendingOnly:true/);assert.match(indexV19,/pendingBatchWorkflowV19:true/);assert.match(indexV19,/outboundOrderApiReady:false/);
assert.match(combined,/index-v(?:20|21|22|26|27|28|29)\.js/);assert.match(combined,/2026\.(?:07\.31\.(?:20|21|22)|08\.(?:04\.26|05\.(?:27|28|29|30)))/);
assert.match(wrangler,/REQUIRE_R2 = "true"/);assert.match(wrangler,/\[\[r2_buckets\]\]/);assert.match(wrangler,/binding = "FILES"/);assert.match(wrangler,/bucket_name = "nuvasto-files"/);assert.match(r2Wrangler,/REQUIRE_R2 = "true"/);assert.match(r2Wrangler,/\[\[r2_buckets\]\]/);assert.match(r2Wrangler,/binding = "FILES"/);assert.match(r2Wrangler,/bucket_name = "(?:pedidos-pro-files|nuvasto-files)"/);
assert.match(app,/initializeCurrentRuntime/);assert.match(runtime,/initializeWorkflowV19/);
assert.match(serviceWorker,/(?:v19-workflow-r2|v20-professional-sso|nuvasto-v21-brand-platform|nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard|nuvasto-v26-r2-invoice-keyboard|v28-regression-suite|nuvasto-v29-invoice-checkout-r2)/);assert.match(serviceWorker,/app-workflow-v19\.js/);
console.log('workflow v19 compatibility resolved through current r60 runtime: OK');
