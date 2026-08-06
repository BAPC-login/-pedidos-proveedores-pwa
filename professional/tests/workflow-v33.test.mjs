import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [index,documents,orders,entry,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../worker/src/index-v33.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v33-documents.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-orders.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(index,/2\.0\.0-alpha\.33/);assert.match(index,/listOrdersV2/);assert.match(index,/\/api\/orders\/advanced/);assert.match(index,/\/api\/documents\/archive/);assert.match(index,/document\.rename/);assert.match(index,/document\.delete/);assert.match(index,/document_locked/);assert.match(index,/physicalFileDeleted/);assert.match(index,/invoice_status/);assert.match(index,/image_file_id=''/);assert.match(index,/locationAllowed/);
assert.match(orders,/loadOrdersPayload/);assert.match(orders,/advanced_orders_fallback/);assert.match(orders,/api\('\/api\/orders'/);assert.match(orders,/Referencia:/);assert.match(orders,/servicio de respaldo/);
assert.match(documents,/registerRouteRenderer\('documents'/);assert.match(documents,/Renombrar/);assert.match(documents,/Eliminar/);assert.match(documents,/previewDocument/);assert.match(documents,/shareDocument/);assert.match(documents,/downloadDocument/);assert.match(documents,/data-dashboard-kpi=\"documents\"/);assert.match(documents,/vínculos sin precio/);assert.match(documents,/bottom-nav/);assert.match(documents,/routeBack/);
assert.match(entry,/initializeDocumentsV33/);assert.match(entry,/documents/);assert.match(combined,/index-v33\.js/);assert.match(combined,/2026\.08\.06\.34/);assert.match(sw,/nuvasto-v33-history-documents/);assert.match(sw,/app-v33-documents\.js/);assert.match(pkg,/2\.0\.0-alpha\.33/);assert.match(pkg,/workflow-v33\.test\.mjs/);assert.match(pkg,/index-v33\.js/);assert.match(pkg,/app-v33-documents\.js/);

console.log('workflow v33 resilient history, editable archive and mobile polish: OK');
