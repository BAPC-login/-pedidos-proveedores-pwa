import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [migration,ordering,emission,index,ui,entry,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../migrations/0013_master_ordering_v42.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/master-ordering-v42.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/emission-v42.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v42.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v42-master-ordering.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const token of ['master_list_preferences','master_list_product_order','product_order_mode','category_id','sort_order'])assert.match(migration,new RegExp(token));
for(const token of ['getMasterOrderingV42','putMasterOrderingV42','alphabetical','custom','product_cost_centers','master_list_product_order'])assert.match(ordering,new RegExp(token));
for(const token of ['ensureBatchDocumentsV42','archiveOrderPdf','order_pdf_generation_failed','retryable:true','document_links'])assert.match(emission,new RegExp(token));
assert.match(index,/2\.0\.0-alpha\.42/);assert.match(index,/pdf-verified-v42/);assert.match(index,/master-list-ordering-v42/);assert.match(index,/platformWorker\.fetch\(request,env,undefined\)/);assert.match(index,/documentsReady:true/);
for(const token of ['Orden de productos','Alfabético A–Z','Personalizado','Ordenar productos por categoría','La emisión solo se confirma','master-list-ordering-v42'])assert.match(ui,new RegExp(token));
assert.match(entry,/initializeMasterOrderingV42/);assert.match(entry,/app-v42-master-ordering\.js/);
assert.match(combined,/index-v42\.js/);assert.match(combined,/2026\.08\.07\.43/);
assert.match(sw,/nuvasto-v42-reliable-emission-master-ordering/);assert.match(sw,/app-v42-master-ordering\.js/);
assert.match(pkg,/workflow-v42\.test\.mjs/);assert.match(pkg,/index-v42\.js/);assert.match(pkg,/app-v42-master-ordering\.js/);

for(const file of ['../worker/src/api/master-ordering-v42.js','../worker/src/api/emission-v42.js','../worker/src/index-v42.js','../web/app-v42-master-ordering.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow v42 reliable emission and per-category product ordering: OK');
