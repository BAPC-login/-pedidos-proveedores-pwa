import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [schema,migration,readiness,catalogV17,scoped,center,preview,enterprise,serviceWorker]=await Promise.all([
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0007_commercial_readiness_v17.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/readiness-v17.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/catalog-workbook-v17.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-scoped.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-readiness-v17.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-import-preview-v17.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-enterprise-v15.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(schema,/SCHEMA_VERSION='17'/);
assert.match(schema,/0007_commercial_readiness_v17\.sql/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS readiness_runs/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS onboarding_progress/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS catalog_import_snapshots/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS support_tickets/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS legal_documents/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS legal_acceptances/);

assert.match(readiness,/commercialReadinessV17/);
assert.match(readiness,/recordQaRunV17/);
assert.match(readiness,/runIsolationAuditV17/);
assert.match(readiness,/runInvoiceBenchmarkV17/);
assert.match(readiness,/saveOnboardingV17/);
assert.match(readiness,/manageSubscriptionV17/);
assert.match(readiness,/verifyRecoveryV17/);
assert.match(readiness,/createSupportTicketV17/);
assert.match(readiness,/saveLegalV17/);
assert.match(readiness,/acceptLegalV17/);
assert.match(readiness,/targetSample:100/);
assert.match(readiness,/targetScore:80/);

assert.match(catalogV17,/previewCatalogWorkbookV17/);
assert.match(catalogV17,/commitCatalogWorkbookV17/);
assert.match(catalogV17,/snapshotCatalog/);
assert.match(catalogV17,/restoreCatalogSnapshotV17/);
assert.match(catalogV17,/catalog_import_snapshots/);

assert.match(scoped,/\/api\/readiness\/qa/);
assert.match(scoped,/\/api\/readiness\/isolation/);
assert.match(scoped,/\/api\/readiness\/benchmark/);
assert.match(scoped,/\/api\/readiness\/onboarding/);
assert.match(scoped,/\/api\/readiness\/recovery/);
assert.match(scoped,/\/api\/readiness\/support/);
assert.match(scoped,/\/api\/readiness\/legal/);
assert.match(scoped,/\/api\/catalog\/import-workbook\/preview/);
assert.match(scoped,/catalogRestorePoints:true/);
assert.match(scoped,/commercialReadinessCenter:true/);

for(const label of ['PRUEBA INTEGRAL','IMPORTACIÓN SEGURA','BENCHMARK IA','MULTIEMPRESA','ONBOARDING','PLANES Y COBRO','RECUPERACIÓN','SOPORTE','DOCUMENTACIÓN LEGAL'])assert.match(center,new RegExp(label,'i'));
assert.match(center,/WebKit|userAgent/);
assert.match(center,/14 días/);
assert.match(preview,/Generar vista previa/);
assert.match(preview,/Crear respaldo y aplicar/);
assert.match(preview,/punto de recuperación automático/);
assert.match(enterprise,/Preparación comercial/);
assert.match(enterprise,/9 módulos/);
assert.match(serviceWorker,/(?:v17-readiness|v18-history-master-pdf)/);
assert.match(serviceWorker,/app-readiness-v17\.js/);
assert.match(serviceWorker,/app-import-preview-v17\.js/);

console.log('workflow v17 commercial readiness tests: OK');
