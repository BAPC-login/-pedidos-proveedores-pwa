import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [migration,schema,api,index,combined,entry,base,orders,catalog,enhancements,invoiceEntry,sw,pkg]=await Promise.all([
  readFile(new URL('../migrations/0010_professional_ux_v32.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/professional-v32.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v32.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-base.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-orders.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-catalog.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-enhancements.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-entry-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const table of ['procurement_policies','invoice_learning_rules','saved_filter_views','invoice_policy_events'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration,/extra_items_mode/);assert.match(migration,/learn_from_corrections/);
assert.match(schema,/SCHEMA_VERSION='32'/);assert.match(schema,/0010_professional_ux_v32\.sql/);assert.match(schema,/image_file_id/);assert.match(schema,/image_key/);
for(const feature of ['listCatalogMatrixV32','updateProductSuppliersV32','uploadProductPhotoV32','listAdvancedOrdersV32','analyzeInvoiceV32','learnFromInvoiceV32','prepareInvoicePayloadV32'])assert.match(api,new RegExp(feature));
assert.match(api,/nuvasto_learned_correction/);assert.match(api,/extra_items_rejected/);assert.match(api,/product_photo/);
assert.match(index,/2\.0\.0-alpha\.32/);assert.match(index,/\/api\/catalog\/matrix/);assert.match(index,/\/api\/orders\/advanced/);assert.match(index,/\/api\/procurement\/policies/);assert.match(index,/\/api\/learning\/rules/);
assert.match(combined,/index-v(?:32|33|34)\.js/);assert.match(combined,/2026\.08\.(?:05\.33|06\.(?:34|35))/);
assert.match(entry,/initializeOrdersHistoryV32/);assert.match(entry,/initializeCatalogV32/);assert.match(entry,/initializeEnhancementsV32/);
assert.match(base,/v32-drawer/);assert.match(base,/--v32-touch:44px/);assert.match(base,/focus-visible/);assert.match(base,/v32-file-preview/);
for(const filter of ['from','to','supplier','location','center','status','brand','category','invoice','reception'])assert.match(orders,new RegExp(`name=\\"${filter}\\"`));
assert.match(orders,/Total estimado/);assert.match(orders,/Total facturado/);assert.match(orders,/Subir factura/);
assert.match(catalog,/data-v32-suppliers/);assert.match(catalog,/data-v32-photo/);assert.match(catalog,/v32-matrix/);assert.match(catalog,/unitsPerOrderUnit/);assert.match(catalog,/capture=\"environment\"/);
assert.match(enhancements,/data-v32-reject-line/);assert.match(enhancements,/NuvastoV32RejectedIndices/);assert.match(enhancements,/Aprender de correcciones/);assert.match(enhancements,/v32InvoiceFilePreview/);assert.match(enhancements,/v32-master-photo/);
assert.match(invoiceEntry,/app-v32-entry\.js/);assert.match(sw,/nuvasto-v(?:32-professional-ux|33-history-documents|34-folio-invoice-visual)/);assert.match(sw,/app-v32-catalog\.js/);assert.match(pkg,/2\.0\.0-alpha\.(?:32|33|34)/);assert.match(pkg,/workflow-v32\.test\.mjs/);

console.log('workflow v32 professional UX compatibility under Nuvasto v34: OK');
