import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [schema,migration,access,professional,indexV20,combined,wrangler,r2Wrangler,ui,sso,historySemantic,app,navigation,serviceWorker,pkg]=await Promise.all([
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0008_professional_suite_v20.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/access-sso-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/professional-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.r2.toml',import.meta.url),'utf8'),
  readFile(new URL('../web/app-professional-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-sso-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-history-semantic-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-navigation-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(schema,/SCHEMA_VERSION='(?:20|21)'/);
assert.match(schema,/0008_professional_suite_v20\.sql/);
assert.match(schema,/professional-suite-v20/);
for(const table of ['approval_policies','approval_requests','supplier_connectors','external_order_attempts','security_settings','storage_validation_runs','operational_alert_rules','reconciliation_reviews','brand_workspaces'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));

assert.match(access,/Cf-Access-Jwt-Assertion/);
assert.match(access,/CF_Authorization/);
assert.match(access,/RSASSA-PKCS1-v1_5/);
assert.match(access,/CF_ACCESS_TEAM_DOMAIN/);
assert.match(access,/CF_ACCESS_AUD/);
assert.match(access,/cdn-cgi\/access\/certs/);
assert.match(access,/invalid_access_audience/);
assert.match(access,/access_user_not_provisioned/);

for(const fn of ['professionalOverviewV20','runStorageProbeV20','saveApprovalPolicyV20','emitOrderBatchWithApprovalV20','listApprovalRequestsV20','decideApprovalV20','saveConnectorV20','testConnectorV20','prepareExternalOrderV20','getSecuritySettingsV20','saveSecuritySettingsV20','listAlertRulesV20','reconciliationQueueV20','getBrandWorkspaceV20','saveBrandWorkspaceV20'])assert.match(professional,new RegExp(fn));
assert.match(professional,/automaticSubmission:false/);
assert.match(professional,/RPA permanece bloqueado/);
assert.match(professional,/Mi Carro|mi-carro/);
assert.match(professional,/Mi Embonor|mi-embonor/);
assert.match(professional,/Nuvasto/);

assert.match(indexV20,/\/api\/auth\/access/);
assert.match(indexV20,/\/api\/professional\/storage\/probe/);
assert.match(indexV20,/\/api\/professional\/approval-policy/);
assert.match(indexV20,/\/api\/professional\/connectors/);
assert.match(indexV20,/\/api\/professional\/security/);
assert.match(indexV20,/\/api\/professional\/brand/);
assert.match(indexV20,/approval_required/);
assert.match(indexV20,/professionalSuiteV20:true/);
assert.match(combined,/index-v(?:20|21|22)\.js/);
assert.match(combined,/2026\.07\.31\.(?:20|21|22)/);

assert.match(wrangler,/REQUIRE_R2 = "false"/);
assert.doesNotMatch(wrangler,/^\s*\[\[r2_buckets\]\]/m);
assert.match(wrangler,/CF_ACCESS_TEAM_DOMAIN/);
assert.match(wrangler,/CF_ACCESS_AUD/);
assert.match(r2Wrangler,/REQUIRE_R2 = "true"/);
assert.match(r2Wrangler,/\[\[r2_buckets\]\]/);
assert.match(r2Wrangler,/bucket_name = "(?:pedidos-pro-files|nuvasto-files)"/);

for(const label of ['Almacenamiento de archivos','Google y Cloudflare Access','Aprobación de compras','Conectores de proveedores','Conciliación financiera','Alertas operativas','Marca del producto','Onboarding de clientes'])assert.match(ui,new RegExp(label));
assert.match(ui,/npx wrangler r2 bucket create pedidos-pro-files/);
assert.match(ui,/Continuar con Google|Configurar SSO/);
assert.match(ui,/Modo asistido/);
assert.match(ui,/Definir marca/);
assert.match(sso,/\/api\/auth\/access/);
assert.match(sso,/Continuar con Google/);
assert.match(historySemantic,/Pendiente de factura/);
assert.match(historySemantic,/invoicedGrossTotal/);
assert.match(app,/initializeSsoV20/);
assert.match(app,/initializeProfessionalV20/);
assert.match(app,/initializeHistorySemanticV20/);
assert.match(navigation,/professional/);
assert.match(serviceWorker,/(?:v20-professional-sso|nuvasto-v21-brand-platform|nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard)/);
assert.match(serviceWorker,/app-professional-v20\.js/);
assert.match(serviceWorker,/app-sso-v20\.js/);
assert.match(serviceWorker,/app-history-semantic-v20\.js/);
assert.match(pkg,/2\.0\.0-alpha\.(?:20|21|22|23)/);
assert.match(pkg,/deploy:r2/);
assert.match(pkg,/workflow-v20\.test\.mjs/);

console.log('workflow v20 professional suite compatibility tests: OK');
