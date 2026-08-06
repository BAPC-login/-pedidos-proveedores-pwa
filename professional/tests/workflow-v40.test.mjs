import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [analytics,operations,index,frontend,entry,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../worker/src/api/analytics-v40.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/operations-v40.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v40.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v40-operations.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const pattern of [/costCenterId/,/categoryId/,/supplierId/,/locationId/,/fromDate/,/toDate/,/costCenterSpend/,/categorySpend/,/monthDeltaPct/,/recommendations/])assert.match(analytics,pattern);
for(const pattern of [/prepareDraftFoliosV40/,/BORRADOR-/,/createOrderFileV40/,/emitOrderBatchV40/,/withFolioWriteLockV34/,/folio correlativo/,/revision=revision\+1/,/alreadyEmitted/])assert.match(`${operations}\n${index}`,pattern);
assert.match(index,/2\.0\.0-alpha\.40/);assert.match(index,/\/api\/dashboard\/analytics-v40/);assert.match(index,/foliosAssignedOnEmission|folioAssignedOnEmission/);assert.match(index,/simultaneousDeviceSafety:true/);
for(const pattern of [/v40-master-clear/,/Cantidades limpiadas/,/nth-child\(even\)/,/v40-matrix-toggle/,/toggleMatrix/,/ACCIONES RÁPIDAS/,/v40-notification-button/,/Centro de avisos/,/v40-dashboard-filters/,/analytics-v40/,/Gasto por centro de costo/,/v40-reception-summary/,/Recibir todo/,/Limpiar cantidades/,/bindDynamic/])assert.match(frontend,pattern);
assert.match(entry,/initializeOperationalUpgradeV40/);assert.match(entry,/app-v40-operations\.js/);assert.match(combined,/index-v40\.js/);assert.match(combined,/2026\.08\.06\.41/);assert.match(sw,/nuvasto-v40-professional-operations/);assert.match(sw,/app-v40-operations\.js/);assert.match(pkg,/workflow-v40\.test\.mjs/);assert.match(pkg,/app-v40-operations\.js/);assert.match(pkg,/index-v40\.js/);
for(const file of ['../worker/src/api/analytics-v40.js','../worker/src/api/operations-v40.js','../worker/src/index-v40.js','../web/app-v40-operations.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});

console.log('workflow v40 professional lists, filtered analytics, notifications, reception and emission-order folios: OK');
