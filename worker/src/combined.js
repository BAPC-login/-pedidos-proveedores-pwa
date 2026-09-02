import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/router.js';
import { PLATFORM_RELEASE, ARCHITECTURE_GENERATION } from './release.js';
import {
  INTEGRATION_CONTRACT_VERSION,
  PHASE14_RELEASE,
  PHASE15_RELEASE,
  integrationContractResponse
} from '../../professional/worker/src/phase14-contract.js';

export { RSystemProcurementEntrypoint } from '../../professional/worker/src/integration/r-system-entrypoint.js';

const CURRENT_SHELL_PATHS = new Set([
  '/',
  '/index.html',
  '/sw.js',
  '/sw-release.js',
  '/app-release.js',
  '/manifest.webmanifest'
]);

function rewritePath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

function isAiRoute(pathname) {
  return pathname === '/health' || pathname.startsWith('/v1/');
}

function withPlatformRelease(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Nuvasto-Release', PLATFORM_RELEASE);
  headers.set('X-Pedidos-Pro-Release', PLATFORM_RELEASE);
  headers.set('X-Nuvasto-Architecture', String(ARCHITECTURE_GENERATION));
  headers.set('X-Nuvasto-Phase', '15');
  headers.set('X-Nuvasto-Contract', INTEGRATION_CONTRACT_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function releaseResponse() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'nuvasto-release',
    release: PLATFORM_RELEASE,
    architectureGeneration: ARCHITECTURE_GENERATION,
    phase: 15,
    phaseRelease: PHASE15_RELEASE,
    integrationContractVersion: INTEGRATION_CONTRACT_VERSION
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}

async function currentShellResponse(request, env) {
  if (!env.ASSETS) return null;
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return withPlatformRelease(new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  }));
}

async function platformHealthResponse(request, env, ctx) {
  const response = await platformWorker.fetch(rewritePath(request, '/health'), env, ctx);
  const payload = await response.clone().json().catch(() => null);
  if (!response.ok || !payload) return withPlatformRelease(response);
  const r2Configured=Boolean(env.FILES);
  const r2Required = String(env.REQUIRE_R2 || '').toLowerCase() === 'true';
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return withPlatformRelease(new Response(JSON.stringify({
    ...payload,
    release: PLATFORM_RELEASE,
    architectureGeneration: ARCHITECTURE_GENERATION,
    phase: 15,
    phase14Release: PHASE14_RELEASE,
    phase14Stabilized: true,
    phase15Release: PHASE15_RELEASE,
    phase15NativeIntegration: true,
    integrationContractVersion: INTEGRATION_CONTRACT_VERSION,
    rSystemProcurementRpc: true,
    operationalRpcReady: true,
    ipHashSaltConfigured: Boolean(env.IP_HASH_SALT),
    defaultIpHashSaltDisabled: true,
    r2Configured,
    r2Required,
    r2Ready: r2Configured,
    storageBackend: r2Configured ? 'r2' : 'unavailable',
    catalogMemorySafetyV81: true,
    productInsightsV81: true,
    manualPriceIntegrityV81: true,
    financeDashboardV81:true
  }), {
    status: response.status,
    statusText: response.statusText,
    headers
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isAiRoute(url.pathname)) return aiWorker.fetch(request, env, ctx);
    if (url.pathname === '/platform/release') return withPlatformRelease(releaseResponse());
    if (url.pathname === '/platform/health') return platformHealthResponse(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/api/system/integration-contract') {
      return withPlatformRelease(integrationContractResponse());
    }
    if (request.method === 'GET' && CURRENT_SHELL_PATHS.has(url.pathname)) {
      const response = await currentShellResponse(request, env);
      if (response) return response;
    }
    return withPlatformRelease(await platformWorker.fetch(request, env, ctx));
  }
};
