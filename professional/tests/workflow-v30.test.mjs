import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [analysis,indexV30,runtime,invoice,detail,detailWrapper,invoiceWrapper,entry,combined,sw,pkg,readiness]=await Promise.all([
  readFile(new URL('../worker/src/api/invoice-analysis-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-runtime-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-detail-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-detail.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoices.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-entry-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/readiness-v17.js',import.meta.url),'utf8')
]);

assert.match(analysis,/import aiWorker from '\.\.\/\.\.\/\.\.\/\.\.\/worker\/src\/index\.js'/);
assert.match(analysis,/aiWorker\.fetch/);
assert.doesNotMatch(analysis,/AI_ENDPOINT/);
assert.match(analysis,/degradedAnalysis/);
assert.match(analysis,/manualReviewLines/);
assert.match(analysis,/invoice\.analysis\.success/);
assert.match(analysis,/invoice\.analysis\.degraded/);
assert.match(analysis,/storeFile/);
assert.match(analysis,/Nuvasto guardó el documento/);

assert.match(indexV30,/2\.0\.0-alpha\.30/);
assert.match(indexV30,/\/api\/capabilities/);
assert.match(indexV30,/\/api\/operations\/invoice-analysis-metrics/);
assert.match(indexV30,/invoiceFallbackReview:true/);
assert.match(indexV30,/responsiveOperationalModals:true/);

assert.match(runtime,/nuvasto-v30|v30-progress/);
assert.match(runtime,/Guardando el documento en Nuvasto/);
assert.match(runtime,/scrubBrand/);
assert.match(runtime,/replace\(\/Gemini\/gi,'Nuvasto'\)/);
assert.match(runtime,/responsive-table/);
assert.match(runtime,/loadCapabilitiesV30/);

assert.match(invoice,/Nuvasto leerá el documento/);
assert.doesNotMatch(invoice,/Gemini/);
assert.match(invoice,/Revisión manual asistida/);
assert.match(invoice,/openInvoiceAnalysisV30/);
assert.match(invoice,/timeout:124000/);
assert.match(invoice,/Producto del pedido/);

assert.match(detail,/v30-reception-card/);
assert.match(detail,/Cantidad inferior al pedido/);
assert.match(detail,/Conciliación incompleta/);
assert.match(detail,/Registrar recepción/);
assert.match(detail,/Subir factura/);
assert.match(detail,/loadCapabilitiesV30/);
assert.match(detail,/Editar pedido/);
assert.match(detail,/Compartir PDF/);
assert.match(detailWrapper,/app-order-detail-v30\.js/);
assert.match(invoiceWrapper,/app-invoice-v30\.js/);
assert.match(entry,/app-runtime-v30\.js/);
assert.match(entry,/openInvoiceAnalysisV30/);

assert.match(combined,/index-v30\.js/);
assert.match(combined,/2026\.08\.05\.31/);
assert.match(sw,/nuvasto-v30-reliability-mobile/);
assert.match(sw,/app-runtime-v30\.js/);
assert.match(sw,/app-order-detail-v30\.js/);
assert.match(pkg,/2\.0\.0-alpha\.30/);
assert.match(pkg,/workflow-v30\.test\.mjs/);

for(const feature of ['runInvoiceBenchmarkV17','runIsolationAuditV17','saveOnboardingV17','manageSubscriptionV17','verifyRecoveryV17','createSupportTicketV17','saveLegalV17'])assert.match(readiness,new RegExp(feature));

console.log('workflow v30 internal invoice fallback, mobile menus and role capabilities: OK');
