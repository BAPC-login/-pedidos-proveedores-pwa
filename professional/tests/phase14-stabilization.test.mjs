import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hashRequestIp } from '../worker/src/core.js';
import {
  evaluateHealthSamples,
  median,
  validateHealth,
  validateIntegrationContract,
  validateRelease
} from '../scripts/verify-production-health.mjs';
import {
  INTEGRATION_CONTRACT_VERSION,
  PHASE14_RELEASE,
  integrationContract,
  integrationContractResponse
} from '../worker/src/phase14-contract.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const contract = integrationContract();
assert.equal(PHASE14_RELEASE, 'phase-14-nuvasto-20260902-r1');
assert.equal(INTEGRATION_CONTRACT_VERSION, 'r-system-procurement-v1');
assert.equal(contract.phase, 14);
assert.equal(contract.module, 'procurement');
assert.equal(contract.source_of_truth.duplicated_in_r_system, false);
assert.equal(contract.tenancy.r_system_mapping_required, true);
assert.equal(contract.invariants.reception_is_operational_source_of_closure, true);
assert.equal(contract.invariants.invoice_required_for_reception_closure, false);
assert.equal(contract.invariants.payment_required_for_reception_closure, false);
assert.equal(contract.integration.entrypoint, 'RSystemProcurementEntrypoint');
assert.deepEqual(contract.integration.current_methods, ['status', 'contract']);
assert.equal(contract.integration.operational_rpc_begins_in_phase, 15);
assert.equal(contract.boundaries.phase15_integration_complete, false);
assert.equal(JSON.stringify(contract).includes('secret'), false);

const response = integrationContractResponse();
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
validateIntegrationContract(await response.json());

validateRelease({
  ok: true,
  release: '2026.09.02.98',
  phase: 14,
  phaseRelease: PHASE14_RELEASE,
  integrationContractVersion: INTEGRATION_CONTRACT_VERSION
});

const healthFixture = {
  ok: true,
  r2Configured: true,
  r2Ready: true,
  storageBackend: 'r2',
  nativePerformanceV45: true,
  requestCoalescingV45: true,
  redirectSafeNavigationV50: true,
  passkeyAuthV72: true,
  adaptiveInvoicePriceMatrixV78: true,
  paymentDocumentsV74: true,
  paymentLedgerV78: true,
  receptionRequiredForClosure: true,
  invoiceRequiredForClosure: false,
  paymentRequiredForClosure: false,
  productionStabilityV91: true,
  reservedOrdersAdvancedV91: true,
  transientInvoiceRetryV91: true,
  verifiedAiUsageV91: true,
  phase: 14,
  phase14Stabilized: true,
  integrationContractVersion: INTEGRATION_CONTRACT_VERSION,
  rSystemProcurementRpc: true,
  ipHashSaltConfigured: true,
  defaultIpHashSaltDisabled: true
};
validateHealth(healthFixture);
assert.throws(() => validateHealth({...healthFixture, ipHashSaltConfigured: false}), /privateIpHashSalt/);
assert.equal(median([9855, 2100, 2300]), 2300);
assert.deepEqual(
  evaluateHealthSamples([
    {ok: true, elapsedMs: 9855},
    {ok: true, elapsedMs: 2100},
    {ok: true, elapsedMs: 2300}
  ]),
  {ok: true, successes: 3, attempts: 3, medianMs: 2300, maxMs: 9855, degradedSamples: 1}
);
assert.throws(() => evaluateHealthSamples([
  {ok: true, elapsedMs: 6000},
  {ok: true, elapsedMs: 7000},
  {ok: false, elapsedMs: Infinity, error: 'timeout'}
]), /sustained latency/);

const hashedIp = await hashRequestIp(new Request('https://nuvasto.test', {headers: {'CF-Connecting-IP': '192.0.2.1'}}), {ENVIRONMENT: 'production', IP_HASH_SALT: 'private-test-salt'});
assert.match(hashedIp, /^[a-f0-9]{64}$/);
await assert.rejects(
  hashRequestIp(new Request('https://nuvasto.test', {headers: {'CF-Connecting-IP': '192.0.2.1'}}), {ENVIRONMENT: 'production'}),
  error => error?.code === 'ip_hash_salt_missing'
);

const [combined, rpc, auth, platform, passkeys, access, invoiceAi, rootWrangler, productionDeploy, developmentDeploy, backupWorkflow, healthWorkflow, invoiceUi, developmentE2e, aiCanary, release] = await Promise.all([
  read('../../worker/src/combined.js'),
  read('../worker/src/integration/r-system-entrypoint.js'),
  read('../worker/src/auth.js'),
  read('../worker/src/platform.js'),
  read('../worker/src/api/passkeys.js'),
  read('../worker/src/access-sso-v20.js'),
  read('../worker/src/api/invoice-ai-fast-v88.js'),
  read('../../worker/wrangler.jsonc'),
  read('../../.github/workflows/deploy-cloudflare.yml'),
  read('../../.github/workflows/deploy-development.yml'),
  read('../../.github/workflows/d1-backup.yml'),
  read('../../.github/workflows/production-health.yml'),
  read('../web/app-multi-invoice.js'),
  read('./development-e2e-current.mjs'),
  read('./development-ai-canary-v92.mjs'),
  read('../release.json')
]);

assert.match(combined, /export \{ RSystemProcurementEntrypoint \}/);
assert.match(combined, /\/api\/system\/integration-contract/);
assert.match(combined, /phase14Stabilized: true/);
assert.match(rpc, /class RSystemProcurementEntrypoint extends WorkerEntrypoint/);
assert.match(rpc, /operational_methods_deferred_until_tenant_mapping: true/);
assert.doesNotMatch(rpc, /async (?:create|update|delete|emit|receive)/);

for (const source of [auth, platform, passkeys, access]) {
  assert.doesNotMatch(source, /IP_HASH_SALT\s*\|\|\s*['"]pedidos-pro/);
}
assert.doesNotMatch(rootWrangler, /"IP_HASH_SALT"\s*:/);
assert.match(productionDeploy, /Ensure private IP hash salt/);
assert.match(developmentDeploy, /Ensure private DEV IP hash salt/);
assert.match(productionDeploy, /secret put IP_HASH_SALT/);
assert.match(productionDeploy, /secret list --config wrangler\.toml --format json/);
assert.match(developmentDeploy, /secret list --config wrangler\.develop\.toml --format json/);
assert.doesNotMatch(productionDeploy, /secret list[^\n]*--json/);
assert.doesNotMatch(developmentDeploy, /secret list[^\n]*--json/);
assert.match(backupWorkflow, /D1 Nuvasto resuelta automáticamente por firma de esquema y entorno/);
assert.match(backupWorkflow, /production_matches=\(\)/);
assert.match(backupWorkflow, /dev\|development\|staging\|test\|qa/);
assert.doesNotMatch(backupWorkflow, /if:\s*\$\{\{[^\n]*NUVASTO_D1_DATABASE/);
assert.match(backupWorkflow, /workflow_run:/);
assert.match(backupWorkflow, /workflows: \['Deploy Nuvasto to Cloudflare'\]/);
assert.match(backupWorkflow, /workflow_run\.conclusion == 'success'/);
assert.match(healthWorkflow, /verify-production-health\.mjs/);
assert.match(invoiceUi, /function pricingMethodLabel/);
assert.doesNotMatch(invoiceUi, /Método: \$\{esc\(String\(line\.taxAllocationMethod/);
assert.match(developmentE2e, /timeZone:'America\/Santiago'/);
assert.doesNotMatch(developmentE2e, /const today=new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
assert.match(aiCanary, /MAX_CANARY_ATTEMPTS=3/);
assert.match(aiCanary, /if\(analysis\.degraded===false\)break/);
assert.match(aiCanary, /RETRYABLE_CANARY_ERRORS\.has/);
assert.match(aiCanary, /'gemini_http_503'/);
assert.match(aiCanary, /'analysis_timeout'/);
assert.match(invoiceAi, /code:'ai_timeout'/);
assert.match(invoiceAi, /error\?\.name==='AbortError'\|\|Number\(error\?\.code\)===20/);
assert.match(release, /"release": "2026\.09\.02\.98"/);
assert.match(release, /"generation": 98/);

console.log('Phase 14 stabilization: OK · contract, private salt, backup, health and hand-off verified');
