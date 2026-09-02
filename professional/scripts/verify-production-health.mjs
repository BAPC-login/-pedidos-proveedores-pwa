import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://pedidos-pro-ai.botreservasmultilocal.workers.dev';
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_LATENCY_BUDGET_MS = 5000;

export function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return Infinity;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function validateRelease(payload = {}) {
  const required = {
    ok: payload.ok === true,
    release: Boolean(payload.release),
    phase: payload.phase === 14,
    phaseRelease: payload.phaseRelease === 'phase-14-nuvasto-20260902-r1',
    contract: payload.integrationContractVersion === 'r-system-procurement-v1'
  };
  assertChecks('release', required);
  return payload;
}

export function validateIntegrationContract(payload = {}) {
  const required = {
    ok: payload.ok === true,
    service: payload.service === 'nuvasto',
    module: payload.module === 'procurement',
    phase: payload.phase === 14,
    contract: payload.contract_version === 'r-system-procurement-v1',
    sourceOfTruth: payload.source_of_truth?.duplicated_in_r_system === false,
    rpc: payload.integration?.entrypoint === 'RSystemProcurementEntrypoint',
    phase15Boundary: payload.integration?.operational_rpc_begins_in_phase === 15
  };
  assertChecks('integration contract', required);
  return payload;
}

export function validateHealth(payload = {}) {
  const required = {
    ok: payload.ok === true,
    r2: payload.r2Configured === true && payload.r2Ready === true && payload.storageBackend === 'r2',
    runtime: payload.nativePerformanceV45 === true && payload.requestCoalescingV45 === true && payload.redirectSafeNavigationV50 === true,
    auth: payload.passkeyAuthV72 === true,
    invoice: payload.adaptiveInvoicePriceMatrixV78 === true,
    payments: payload.paymentDocumentsV74 === true && payload.paymentLedgerV78 === true,
    closure: payload.receptionRequiredForClosure === true && payload.invoiceRequiredForClosure === false && payload.paymentRequiredForClosure === false,
    stability: payload.productionStabilityV91 === true && payload.reservedOrdersAdvancedV91 === true && payload.transientInvoiceRetryV91 === true && payload.verifiedAiUsageV91 === true,
    phase14: payload.phase === 14 && payload.phase14Stabilized === true,
    integration: payload.integrationContractVersion === 'r-system-procurement-v1' && payload.rSystemProcurementRpc === true,
    privateIpHashSalt: payload.ipHashSaltConfigured === true && payload.defaultIpHashSaltDisabled === true
  };
  assertChecks('health', required);
  return payload;
}

export function evaluateHealthSamples(samples = [], options = {}) {
  const attempts = Math.max(1, Number(options.attempts || DEFAULT_ATTEMPTS));
  const latencyBudgetMs = Math.max(1, Number(options.latencyBudgetMs || DEFAULT_LATENCY_BUDGET_MS));
  const successes = samples.filter(sample => sample?.ok === true && Number.isFinite(sample.elapsedMs));
  const minimumSuccesses = Math.floor(attempts / 2) + 1;
  if (successes.length < minimumSuccesses) {
    const errors = samples.filter(sample => !sample?.ok).map(sample => sample?.error || 'unknown_error');
    throw new Error(`Production health availability failed: ${successes.length}/${attempts} successful · ${errors.join(' | ')}`);
  }
  const latencies = successes.map(sample => sample.elapsedMs);
  const medianMs = median(latencies);
  if (medianMs > latencyBudgetMs) {
    throw new Error(`Production health sustained latency ${medianMs}ms exceeds ${latencyBudgetMs}ms median budget · samples ${latencies.join(',')}`);
  }
  return {
    ok: true,
    successes: successes.length,
    attempts,
    medianMs,
    maxMs: Math.max(...latencies),
    degradedSamples: latencies.filter(value => value > latencyBudgetMs).length
  };
}

function assertChecks(name, checks) {
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);
  if (failed.length) throw new Error(`Production ${name} contract failed: ${failed.join(', ')}`);
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(`HTTP ${response.status}`);
    return { payload, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const baseUrl = String(process.env.NUVASTO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const attempts = Math.max(1, Number(process.env.NUVASTO_HEALTH_ATTEMPTS || DEFAULT_ATTEMPTS));
  const latencyBudgetMs = Math.max(1, Number(process.env.NUVASTO_HEALTH_BUDGET_MS || DEFAULT_LATENCY_BUDGET_MS));

  const release = await fetchJson(`${baseUrl}/platform/release?monitor=${Date.now()}`);
  validateRelease(release.payload);

  const contract = await fetchJson(`${baseUrl}/api/system/integration-contract?monitor=${Date.now()}`);
  validateIntegrationContract(contract.payload);

  const samples = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await fetchJson(`${baseUrl}/platform/health?monitor=${Date.now()}-${attempt}`);
      validateHealth(result.payload);
      samples.push({ ok: true, elapsedMs: result.elapsedMs });
    } catch (error) {
      samples.push({ ok: false, elapsedMs: Infinity, error: String(error?.message || error) });
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 250));
  }

  const health = evaluateHealthSamples(samples, { attempts, latencyBudgetMs });
  console.log(JSON.stringify({
    ok: true,
    release: release.payload.release,
    phaseRelease: release.payload.phaseRelease,
    contract: contract.payload.contract_version,
    releaseLatencyMs: release.elapsedMs,
    contractLatencyMs: contract.elapsedMs,
    health
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  run().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
