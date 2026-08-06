import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [migration,schema,operations,analytics,index,ui,entry,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../migrations/0012_enterprise_operations_v41.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/schema-v41.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/operations-v41.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/analytics-v41.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v41.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v41-enterprise.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

for(const token of ['payment_term_type','payment_term_days','historical_entry','reporting_date','payment_schedules','order_approvals','reception_return_events','notification_events','record_presence'])assert.match(migration,new RegExp(token));
for(const token of ['ensureEnterpriseSchemaV41','payment_term_anchor','approval_policies','invoice_line_splits','saved_report_views','operation_change_journal'])assert.match(schema,new RegExp(token));
for(const token of ['historical_date_confirmation_required','receivedAt','payment_term_days','createReceptionReturnV41','invoice_math_confirmation_required','credit_original_required','ensureApprovalsForBatchV41','recordSupplierConfirmationV41','listNotificationsV41','supplierScorecardV41'])assert.match(operations,new RegExp(token));
assert.match(analytics,/periodBasis:'reception_date'/);assert.match(analytics,/receptions\.received_at|r\.received_at/);assert.match(analytics,/payment_schedules/);assert.match(analytics,/cost_center_budgets/);assert.match(analytics,/variationVsPrevious/);
assert.match(index,/2\.0\.0-alpha\.41/);assert.match(index,/reportingPeriodBasis:'reception_date'/);assert.match(index,/historicalReceptionEntry:true/);assert.match(index,/normalizedSupplierPaymentTerms:true/);assert.match(index,/barcodeScanning:false/);assert.match(index,/driverSignature:false/);
for(const token of ['PERÍODO POR RECEPCIÓN','Registro histórico','Contra entrega','Crédito a días','Bandeja de recepciones','Calendario financiero','Aprobaciones','supplier-confirmation','initializeEnterpriseV41'])assert.match(ui,new RegExp(token));
assert.doesNotMatch(ui,/Escanear código de barras|Firma del chofer/);
assert.match(entry,/initializeEnterpriseV41/);assert.match(entry,/app-v41-enterprise\.js/);
assert.match(combined,/index-v41\.js/);assert.match(combined,/2026\.08\.06\.42/);
assert.match(sw,/nuvasto-v41-reception-payments-enterprise/);assert.match(sw,/app-v41-enterprise\.js/);
assert.match(pkg,/workflow-v41\.test\.mjs/);assert.match(pkg,/index-v41\.js/);assert.match(pkg,/app-v41-enterprise\.js/);

for(const file of ['../worker/src/api/schema-v41.js','../worker/src/api/operations-v41.js','../worker/src/api/analytics-v41.js','../worker/src/index-v41.js','../web/app-v41-enterprise.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow v41 reception-date reporting, payment terms and enterprise operations: OK');
