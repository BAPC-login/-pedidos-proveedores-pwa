import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [ui,entry,core,indexV32,indexV36,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-v36-invoice-review.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v32.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v36.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(ui,/removeLegacySummaries/);assert.match(ui,/#v26InvoiceSummary/);assert.match(ui,/numero de documento/);assert.match(ui,/v36-review-summary/);
assert.match(ui,/v36-money-input/);assert.match(ui,/money\(parseInteger\(raw\.value\)\)/);assert.match(ui,/raw\.type='hidden'/);
assert.match(ui,/M5 7h14M5 12h14M5 17h14/);assert.match(ui,/bottom-create/);assert.match(ui,/place-items:center/);
assert.match(ui,/Factura registrada/);assert.match(ui,/Factura N°/);assert.match(ui,/openRoute\('history'/);assert.match(ui,/clearResponseCache/);
assert.match(core,/calendar=text\.match/);assert.match(core,/new Date\(Number\(calendar\[1\]\),Number\(calendar\[2\]\)-1,Number\(calendar\[3\]\)\)/);assert.match(core,/Number\.isNaN\(parsed\.getTime\(\)\)/);
assert.match(entry,/initializeInvoiceReviewV36/);assert.match(indexV32,/ctx\?\.waitUntil/);assert.match(indexV32,/const learning=learnFromInvoiceV32/);
assert.match(indexV36,/2\.0\.0-alpha\.36/);assert.match(indexV36,/invoiceReviewVersion:36/);assert.match(indexV36,/invoiceSaveAcknowledgementVersion:36/);
assert.match(combined,/index-v36\.js/);assert.match(combined,/2026\.08\.06\.38/);assert.match(sw,/nuvasto-v36-date-only-consistency/);assert.match(sw,/app-v36-invoice-review\.js/);assert.match(sw,/app-core\.js/);
assert.match(pkg,/2\.0\.0-alpha\.36/);assert.match(pkg,/workflow-v36\.test\.mjs/);assert.match(pkg,/index-v36\.js/);assert.match(pkg,/app-v36-invoice-review\.js/);

console.log('workflow v36 invoice review, fast save, mobile icons and calendar-date consistency: OK');
