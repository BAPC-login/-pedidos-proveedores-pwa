import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [ui,multi,stability,entry,core,router,analysisCore,analysis,indexV32,indexV36,indexV38,indexV39,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-v36-invoice-review.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-multi-invoice-v38.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v39-stability.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-router-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/invoice-analysis-core-v39.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/invoice-analysis-v39.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v32.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v36.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v38.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v39.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(ui,/removeLegacySummaries/);assert.match(ui,/#v26InvoiceSummary/);assert.match(ui,/numero de documento/);assert.match(ui,/v36-review-summary/);
assert.match(ui,/v36-money-input/);assert.match(ui,/money\(parseInteger\(raw\.value\)\)/);assert.match(ui,/raw\.type='hidden'/);
assert.match(ui,/M5 7h14M5 12h14M5 17h14/);assert.match(ui,/bottom-create/);assert.match(ui,/place-items:center/);
assert.match(ui,/Factura registrada/);assert.match(ui,/Factura N°/);assert.match(ui,/openRoute\('history'/);assert.match(ui,/clearResponseCache/);
assert.match(core,/calendar=text\.match/);assert.match(core,/new Date\(Number\(calendar\[1\]\),Number\(calendar\[2\]\)-1,Number\(calendar\[3\]\)\)/);assert.match(core,/Number\.isNaN\(parsed\.getTime\(\)\)/);
assert.match(entry,/app-multi-invoice-v38\.js/);assert.match(entry,/app-v39-stability\.js/);assert.match(entry,/initializeInvoiceReviewV36/);assert.match(indexV32,/ctx\?\.waitUntil/);assert.match(indexV32,/const learning=learnFromInvoiceV32/);
assert.match(indexV36,/2\.0\.0-alpha\.36/);assert.match(indexV36,/invoiceReviewVersion:36/);assert.match(indexV36,/invoiceSaveAcknowledgementVersion:36/);
for(const pattern of [/MAX_DOCUMENTS=5/,/multiple required/,/data-v38-kind/,/value=\"free\"/,/documentType:free\?'SC'/,/batchPosition/,/batchTotal/,/preV36Fetch/,/data-v38-order-documents/,/Agregar documentos/,/Subir documentos/,/reconcileLines/,/createInvoice\(payload\)/])assert.match(multi,pattern);
assert.doesNotMatch(multi,/invoiceCount\|\|0\)===0/);assert.match(indexV38,/2\.0\.0-alpha\.38/);assert.match(indexV38,/multipleInvoicesPerOrder:true/);assert.match(indexV38,/maxDocumentsPerUpload:5/);assert.match(indexV38,/independentFreeDocuments:true/);
for(const pattern of [/MAX_DOCUMENT_BYTES=20\*1024\*1024/,/input\.multiple=true/,/setAttribute\('multiple'/,/image\/\*,application\/pdf/,/upgradeLegacyInvoiceModal/,/Adjuntar documento al pedido/,/Máximo 5 documentos y 20 MB/])assert.match(stability,pattern);
assert.match(router,/while\(pending\)/);assert.match(router,/superseded:true/);assert.match(router,/activePromise&&activeKey===routeKey/);assert.match(router,/aria-busy/);
assert.match(analysisCore,/MAX_INVOICE_FILE_BYTES_V39=20\*1024\*1024/);assert.match(analysisCore,/El documento supera 20 MB/);assert.match(analysisCore,/storeFile/);assert.match(analysisCore,/flowVersion:39/);assert.match(analysis,/analyzeInvoiceCoreV39/);assert.match(analysis,/safeMultipartRequest/);assert.match(analysis,/maxFileBytes/);
assert.match(indexV39,/2\.0\.0-alpha\.39/);assert.match(indexV39,/maxDocumentSizeMb:20/);assert.match(indexV39,/native-multiple-v39/);assert.match(indexV39,/serialized-v39/);
assert.match(combined,/index-v(?:39|40)\.js/);assert.match(combined,/2026\.08\.06\.(?:40|41)/);assert.match(sw,/nuvasto-v(?:39-multi-picker-cache-navigation|40-professional-operations)/);assert.match(sw,/app-v39-stability\.js/);assert.match(sw,/clients\.matchAll/);assert.match(sw,/client\.navigate\(client\.url\)/);
assert.match(pkg,/2\.0\.0-alpha\.36/);assert.match(pkg,/workflow-v36\.test\.mjs/);assert.match(pkg,/index-v36\.js/);assert.match(pkg,/app-v36-invoice-review\.js/);
for(const file of ['../web/app-multi-invoice-v38.js','../web/app-v39-stability.js','../web/app-router-v14.js','../worker/src/api/invoice-analysis-core-v39.js','../worker/src/api/invoice-analysis-v39.js','../worker/src/index-v39.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});

console.log('workflow v39 native multi-picker, 20 MB documents, forced cache cutover and stable navigation under v40: OK');
