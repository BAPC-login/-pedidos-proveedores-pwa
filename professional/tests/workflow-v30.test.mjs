import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [analysis,indexV30,runtime,invoice,orders,historyBridge,detail,detailWrapper,invoiceWrapper,entry,combined,sw,pkg,readiness]=await Promise.all([
  readFile(new URL('../worker/src/api/invoice-analysis-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-runtime-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-orders-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-history-bridge-v31.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-detail-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-detail.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoices.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-invoice-entry-v29.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/readiness-v17.js',import.meta.url),'utf8')
]);

assert.match(analysis,/import aiWorker from '\.\.\/\.\.\/\.\.\/\.\.\/worker\/src\/index\.js'/);assert.match(analysis,/aiWorker\.fetch/);assert.doesNotMatch(analysis,/AI_ENDPOINT/);assert.match(analysis,/degradedAnalysis/);assert.match(analysis,/manualReviewLines/);assert.match(analysis,/invoice\.analysis\.success/);assert.match(analysis,/invoice\.analysis\.degraded/);assert.match(analysis,/storeFile/);assert.match(analysis,/purpose:'invoice-source'/);assert.doesNotMatch(analysis,/entityType:'invoice-analysis'/);assert.match(analysis,/flowVersion:31/);assert.match(analysis,/invoice_usage_write_failed/);assert.match(analysis,/Nuvasto guardó el documento/);
assert.match(indexV30,/2\.0\.0-alpha\.31/);assert.match(indexV30,/invoiceFlowVersion:31/);assert.match(indexV30,/invoiceStorageLinkFix:true/);assert.match(indexV30,/\/api\/capabilities/);assert.match(indexV30,/\/api\/operations\/invoice-analysis-metrics/);assert.match(indexV30,/invoiceFallbackReview:true/);assert.match(indexV30,/responsiveOperationalModals:true/);
assert.match(runtime,/nuvasto-v30|v30-progress/);assert.match(runtime,/Guardando el documento en Nuvasto/);assert.match(runtime,/scrubBrand/);assert.match(runtime,/replace\(\/Gemini\/gi,'Nuvasto'\)/);assert.match(runtime,/responsive-table/);assert.match(runtime,/loadCapabilitiesV30/);
assert.match(invoice,/Nuvasto leerá el documento/);assert.doesNotMatch(invoice,/Gemini/);assert.match(invoice,/Revisión manual asistida/);assert.match(invoice,/openInvoiceAnalysisV30/);assert.match(invoice,/timeout:124000/);assert.match(invoice,/Producto del pedido/);
assert.match(orders,/registerRouteRenderer\('orders'/);assert.match(orders,/Subir factura/);assert.match(orders,/Registrar recepción/);assert.match(orders,/Compartir/);assert.match(orders,/loadCapabilitiesV30/);assert.match(orders,/Factura pendiente/);assert.match(orders,/Recepción pendiente/);assert.match(entry,/setTimeout\(\(\)=>initializeOrdersV30\(\),0\)/);
assert.match(historyBridge,/\[data-v18-detail\]/);assert.match(historyBridge,/openOrderDetail/);assert.match(historyBridge,/stopImmediatePropagation/);assert.match(entry,/app-history-bridge-v31\.js/);assert.match(entry,/app-v32-entry\.js/);
for(const pattern of [/v30-reception-card/,/Cantidad inferior al pedido/,/Conciliación incompleta/,/Registrar recepción/,/Subir factura/,/loadCapabilitiesV30/,/Editar pedido/,/Compartir PDF/])assert.match(detail,pattern);
assert.match(detailWrapper,/app-order-detail-v30\.js/);assert.match(invoiceWrapper,/app-invoice-v30\.js/);assert.match(entry,/app-runtime-v30\.js/);assert.match(entry,/openInvoiceAnalysisV30/);assert.match(entry,/app-orders-v30\.js/);
assert.match(combined,/index-v(?:32|33|34|36|38|39|40)\.js/);assert.match(combined,/2026\.08\.(?:05\.33|06\.(?:34|35|36|37|38|39|40|41))/);assert.match(sw,/nuvasto-v(?:32-professional-ux|33-history-documents|34-folio-invoice-visual|36-(?:invoice-review-save-icons|date-only-consistency)|38-multiple-invoices-per-order|39-multi-picker-cache-navigation|40-professional-operations)/);assert.match(sw,/app-runtime-v30\.js/);assert.match(sw,/app-order-detail-v30\.js/);assert.match(sw,/app-orders-v30\.js/);assert.match(sw,/app-history-bridge-v31\.js/);assert.match(pkg,/2\.0\.0-alpha\.(?:32|33|34|35|36)/);assert.match(pkg,/workflow-v30\.test\.mjs/);assert.match(pkg,/app-orders-v30\.js/);assert.match(pkg,/app-history-bridge-v31\.js/);
for(const feature of ['runInvoiceBenchmarkV17','runIsolationAuditV17','saveOnboardingV17','manageSubscriptionV17','verifyRecoveryV17','createSupportTicketV17','saveLegalV17'])assert.match(readiness,new RegExp(feature));

console.log('workflow v31 invoice storage and mobile reliability under Nuvasto v40: OK');
