import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [migration,schema,api,index,ui,entry,navigation,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../migrations/0014_procurement_os_v44.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/schema-v44.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/procurement-os-v44.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v44.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v44-procurement-os.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-navigation-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const token of ['procurement_user_permissions','product_favorites','reception_evidence_v44','work_jobs_v44','master_data_merge_events_v44','system_health_snapshots_v44'])assert.match(migration,new RegExp(token));
for(const token of ['ensureProcurementSuiteV44','work_jobs_v44','procurement_user_permissions'])assert.match(schema,new RegExp(token));
for(const token of ['listMasterDataV44','mergeMasterDataV44','getMasterListAssistV44','procurementIntelligenceV44','financePlanningV44','listPermissionsV44','assertPermissionV44','saveReceptionEvidenceV44','listJobsV44','systemHealthV44','globalSearchV44'])assert.match(api,new RegExp(token));
for(const token of ['procurementOsV44:true','canonicalMasterDataV44:true','masterListAssistV44:true','procurementIntelligenceV44:true','financePlanningV44:true','receptionEvidenceV44:true','granularPermissionsV44:true','jobQueueV44:true','observabilityV44:true','globalSearchV44:true'])assert.match(index,new RegExp(token));
for(const token of ['Maestro de datos','Inteligencia de compras','Planificación financiera','Permisos por proceso','Salud del sistema','Favoritos','Copiar último pedido','Escanear producto','Foto / evidencia','beforeinstallprompt','prefers-reduced-motion','global-search-v44'])assert.match(ui,new RegExp(token));
assert.match(entry,/initializeProcurementOSV44/);assert.match(entry,/app-v44-procurement-os\.js/);
for(const route of ['masterdata','intelligence','planning','permissions','system'])assert.match(navigation,new RegExp(route));
assert.match(combined,/index-v44\.js/);assert.match(combined,/2026\.08\.07\.45/);
assert.match(sw,/nuvasto-v44-procurement-os-suite/);assert.match(sw,/app-v44-procurement-os\.js/);
assert.match(pkg,/workflow-v44\.test\.mjs/);

for(const file of ['../worker/src/api/schema-v44.js','../worker/src/api/procurement-os-v44.js','../worker/src/index-v44.js','../web/app-v44-procurement-os.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow v44 procurement OS suite: OK');
