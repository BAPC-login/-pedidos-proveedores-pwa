import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [workflow,pdf,storage,pdfApi,indexV19,combined,wrangler,r2Wrangler,app,serviceWorker]=await Promise.all([
  readFile(new URL('../web/app-workflow-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/pdf-order-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-pdf-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.r2.toml',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(workflow,/Pedidos por emitir/);
assert.match(workflow,/Compartir seleccionados/);
assert.match(workflow,/Emitir todo/);
assert.match(workflow,/Cancelar todo/);
assert.match(workflow,/eligibleInvoiceOrder/);
assert.match(workflow,/Solo se muestran proveedores y pedidos emitidos vigentes/);
assert.match(workflow,/order\.required=true/);
assert.match(workflow,/Checkout de factura/);
assert.match(workflow,/Coincidencia alta por nombre y catálogo/);
assert.match(workflow,/Hoy para todos/);
assert.match(workflow,/Mañana para todos/);
assert.match(workflow,/syncGeneralDate/);
assert.match(workflow,/Siguiente ↵/);
assert.match(workflow,/visualViewport/);
assert.match(workflow,/bottom-nav/);
assert.match(workflow,/registerRouteRenderer\('receiving',renderReceivingV19\)/);
assert.match(workflow,/openRoute\('dashboard'/);

assert.match(pdf,/createProfessionalOrderPdfV22/);
assert.match(pdf,/CENTRO DE COSTO/);
assert.match(pdf,/FECHA ENTREGA/);
assert.match(pdf,/FECHA EMISIÓN/);
assert.match(pdf,/PRODUCTOS/);
assert.match(pdf,/metaRow/);
assert.match(pdf,/supplierLogo/);
assert.match(pdf,/companyLogo/);

assert.match(storage,/REQUIRE_R2/);
assert.match(storage,/r2_required/);
assert.match(storage,/createProfessionalOrderPdfV24/);
assert.match(storage,/pdfVersion:24/);
assert.match(pdfApi,/pdfVersion\|\|0\)>=24/);
assert.match(indexV19,/r2Ready:Boolean\(env\.FILES\)/);
assert.match(indexV19,/invoicePendingOnly:true/);
assert.match(indexV19,/pendingBatchWorkflowV19:true/);
assert.match(indexV19,/outboundOrderApiReady:false/);
assert.match(combined,/index-v(?:20|21|22|26|27|28|29)\.js/);
assert.match(combined,/2026\.(?:07\.31\.(?:20|21|22)|08\.(?:04\.26|05\.(?:27|28|29|30)))/);
assert.match(wrangler,/REQUIRE_R2 = "true"/);
assert.match(wrangler,/\[\[r2_buckets\]\]/);
assert.match(wrangler,/binding = "FILES"/);
assert.match(wrangler,/bucket_name = "nuvasto-files"/);
assert.match(r2Wrangler,/REQUIRE_R2 = "true"/);
assert.match(r2Wrangler,/\[\[r2_buckets\]\]/);
assert.match(r2Wrangler,/binding = "FILES"/);
assert.match(r2Wrangler,/bucket_name = "(?:pedidos-pro-files|nuvasto-files)"/);
assert.match(app,/initializeWorkflowV19/);
assert.match(serviceWorker,/(?:v19-workflow-r2|v20-professional-sso|nuvasto-v21-brand-platform|nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard|nuvasto-v26-r2-invoice-keyboard|v28-regression-suite|nuvasto-v29-invoice-checkout-r2)/);
assert.match(serviceWorker,/app-workflow-v19\.js/);

console.log('workflow v19 compatibility under Nuvasto direct deploy revision 30: OK');
