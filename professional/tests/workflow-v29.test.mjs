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

assert.match(checkout,/title:'Checkout pedidos'/);
assert.match(checkout,/Compartir seleccionados/);
assert.match(checkout,/data-v29-share/);
assert.match(checkout,/data-v29-edit/);
assert.match(checkout,/data-v29-delete/);
assert.match(checkout,/Emitir todo/);
assert.match(checkout,/Cancelar todo/);
assert.match(checkout,/openRoute\('dashboard'/);
assert.doesNotMatch(checkout,/Guardar archivos/);
assert.doesNotMatch(checkout,/ARCHIVO EMITIDO/);
assert.match(checkout,/order-batches\/\$\{encodeURIComponent\(deleted\.batchId\)\}\/renumber/);
assert.match(checkout,/blockLegacyRegistrations/);
assert.match(checkout,/interceptNewOrder/);
assert.match(checkout,/interceptBatchEmit/);
assert.match(checkout,/v29InvoiceProgress/);
assert.match(upgrade,/v19EmitAll/);
assert.match(upgrade,/data-v19-select/);
assert.match(upgrade,/data-edit-file-order/);
assert.match(upgrade,/NuvastoV29\?\.openCheckout/);

assert.match(invoice,/timeout:125000/);
assert.match(invoice,/closeOnSuccess:false/);
assert.match(invoice,/48 botellas = 8 cajas de 6/);
assert.match(invoice,/conversionSummary/);
assert.match(invoice,/CHECKOUT DE FACTURA/);
assert.match(invoice,/No se detectaron productos/);
assert.match(invoice,/orderPdf\(orderId\)/);
assert.match(entry,/data-v16-invoice/);
assert.match(entry,/stopImmediatePropagation/);
assert.match(entry,/app-checkout-upgrade-v29\.js/);
assert.match(ui,/v29-invoice-line/);
assert.match(ui,/stopProgress/);

assert.match(analysis,/const AI_TIMEOUT_MS=84000/);
assert.match(analysis,/X-Pedidos-Client':'nuvasto-v29/);
assert.match(analysis,/invoice_lines_not_detected/);
assert.match(analysis,/storeFile/);
assert.match(analysis,/normalizationVersion:26/);
assert.match(renumber,/TMP-\$\{uuid\(\)\}/);
assert.match(renumber,/revision=revision\+1/);
assert.match(renumber,/order_batch\.renumber/);
assert.match(renumber,/batch_already_emitted/);

assert.match(indexV29,/2\.0\.0-alpha\.29/);
assert.match(indexV29,/invoiceFlowVersion:29/);
assert.match(indexV29,/checkoutFlowVersion:29/);
assert.match(indexV29,/folioRenumberingVersion:29/);
assert.match(combined,/index-v29\.js/);
assert.match(combined,/2026\.08\.05\.30/);
assert.match(app,/app-invoice-entry-v29\.js/);
assert.match(app,/initializeCheckoutInvoiceV29/);
assert.match(sw,/nuvasto-v29-invoice-checkout-r2/);
assert.match(sw,/app-invoice-v29\.js/);
assert.match(sw,/app-checkout-upgrade-v29\.js/);
assert.match(pkg,/app-checkout-upgrade-v29\.js/);
assert.match(pkg,/2\.0\.0-alpha\.29/);

console.log('workflow v29 invoice, checkout upgrade, R2 and folio renumbering: OK');
