import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [migration,folio,invoice,index,polish,entry,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../migrations/0011_folio_integrity_v34.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/folio-integrity-v34.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/invoice-analysis-v34.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v34.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v34-polish.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(migration,/folio_operation_locks/);assert.match(migration,/idx_orders_org_folio_lookup/);
assert.match(folio,/withFolioWriteLockV34/);assert.match(folio,/repairDuplicates/);assert.match(folio,/system\.folio_repair/);assert.match(folio,/CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_folio_unique/);assert.match(folio,/folio_allocation_busy/);
assert.match(invoice,/safeMultipartRequest/);assert.match(invoice,/headers\.delete\('content-type'\)/);assert.match(invoice,/headers\.delete\('content-length'\)/);assert.match(invoice,/analyzeInvoiceV30/);assert.match(invoice,/multipartBoundaryFixed/);assert.doesNotMatch(invoice,/headers:request\.headers/);
assert.match(index,/2\.0\.0-alpha\.34/);assert.match(index,/analyzeInvoiceV34/);assert.match(index,/needsFolioLock/);assert.match(index,/\/api\/operations\/folio-integrity/);assert.match(index,/folioUniqueIndex/);
assert.match(polish,/v34-upload-zone/);assert.match(polish,/v34-file-preview/);assert.match(polish,/v34-secondary-kpis/);assert.match(polish,/PERSONALIZAR INICIO/);assert.match(polish,/html\[data-theme=dark\]/);assert.match(polish,/v34-icon/);assert.match(polish,/El archivo sigue seleccionado/);
assert.match(entry,/initializePolishV34/);assert.match(entry,/initializeInvoiceReviewV36/);assert.match(combined,/index-v36\.js/);assert.match(combined,/2026\.08\.06\.(?:37|38)/);assert.match(sw,/nuvasto-v36-(?:invoice-review-save-icons|date-only-consistency)/);assert.match(sw,/app-v34-polish\.js/);assert.match(pkg,/2\.0\.0-alpha\.36/);assert.match(pkg,/workflow-v34\.test\.mjs/);assert.match(pkg,/index-v34\.js/);assert.match(pkg,/app-v34-polish\.js/);

console.log('workflow v34 unique folios, multipart-safe cotejo and visual compatibility under v36 date hotfix: OK');
