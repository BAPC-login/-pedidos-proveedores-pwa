import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [checkout,upgrade,invoice,entry,ui,analysis,renumber,indexV29,combined,app,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-checkout-invoice-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-checkout-upgrade-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-entry-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v29-ui.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/invoice-analysis-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-checkout-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const pattern of [/title:'Checkout pedidos'/,/Compartir seleccionados/,/data-v29-share/,/data-v29-edit/,/data-v29-delete/,/Emitir todo/,/Cancelar todo/,/openRoute\('dashboard'/,/order-batches\/\$\{encodeURIComponent\(deleted\.batchId\)\}\/renumber/,/blockLegacyRegistrations/,/interceptNewOrder/,/interceptBatchEmit/,/v29InvoiceProgress/])assert.match(checkout,pattern);
assert.doesNotMatch(checkout,/Guardar archivos/);assert.doesNotMatch(checkout,/ARCHIVO EMITIDO/);assert.match(upgrade,/v19EmitAll/);assert.match(upgrade,/data-v19-select/);assert.match(upgrade,/data-edit-file-order/);assert.match(upgrade,/NuvastoV29\?\.openCheckout/);
for(const pattern of [/timeout:125000/,/closeOnSuccess:false/,/48 botellas = 8 cajas de 6/,/conversionSummary/,/CHECKOUT DE FACTURA/,/No se detectaron productos/,/orderPdf\(orderId\)/])assert.match(invoice,pattern);
assert.match(entry,/data-v16-invoice/);assert.match(entry,/stopImmediatePropagation/);assert.match(entry,/app-checkout-upgrade-v29\.js/);assert.match(entry,/app-runtime-v30\.js/);assert.match(entry,/app-v32-entry\.js/);assert.match(ui,/v29-invoice-line/);assert.match(ui,/stopProgress/);
assert.match(analysis,/const AI_TIMEOUT_MS=84000/);assert.match(analysis,/X-Pedidos-Client':'nuvasto-v29/);assert.match(analysis,/invoice_lines_not_detected/);assert.match(analysis,/storeFile/);assert.match(analysis,/normalizationVersion:26/);assert.match(renumber,/TMP-\$\{uuid\(\)\}/);assert.match(renumber,/revision=revision\+1/);assert.match(renumber,/order_batch\.renumber/);assert.match(renumber,/batch_already_emitted/);
assert.match(indexV29,/2\.0\.0-alpha\.29/);assert.match(indexV29,/invoiceFlowVersion:29/);assert.match(indexV29,/checkoutFlowVersion:29/);assert.match(indexV29,/folioRenumberingVersion:29/);assert.match(combined,/index-v29\.js/);assert.match(combined,/index-v36\.js/);assert.match(combined,/2026\.08\.06\.(?:37|38)/);assert.match(app,/app-invoice-entry-v29\.js/);assert.match(app,/initializeCheckoutInvoiceV29/);assert.match(sw,/nuvasto-v36-(?:invoice-review-save-icons|date-only-consistency)/);assert.match(sw,/app-checkout-upgrade-v29\.js/);assert.match(pkg,/app-checkout-upgrade-v29\.js/);assert.match(pkg,/2\.0\.0-alpha\.36/);

console.log('workflow v29 checkout compatibility under Nuvasto v36 date hotfix: OK');
