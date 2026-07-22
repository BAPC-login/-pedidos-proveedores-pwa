import platformWorker from './index.js';
import {authenticate} from './auth.js';
import {corsHeaders, errorResponse, ok, securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {dashboard, listProducts} from './api/catalog-scoped.js';

function addPlatformHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin') || '';
  for (const [name, value] of Object.entries(corsHeaders(origin, env))) headers.set(name, value);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

async function health(env, schema) {
  const [products, suppliers, owners, locations] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE active = 1').first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE active = 1').first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM platform_owners').first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM locations WHERE active = 1').first()
  ]);
  return {
    service: 'pedidos-pro-platform',
    version: '2.0.0-alpha.5',
    databaseConfigured: Boolean(env.DB),
    databaseInitialized: true,
    schemaVersion: schema.version,
    catalogReady: Number(products?.total || 0) >= 194 && Number(suppliers?.total || 0) >= 12,
    catalogProducts: Number(products?.total || 0),
    catalogSuppliers: Number(suppliers?.total || 0),
    platformOwnerReady: Number(owners?.total || 0) > 0,
    activeLocations: Number(locations?.total || 0),
    storageConfigured: Boolean(env.FILES || env.DB),
    storageBackend: env.FILES ? 'r2' : 'd1-chunks',
    r2Configured: Boolean(env.FILES),
    aiEndpoint: Boolean(env.AI_ENDPOINT),
    environment: env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const scopedHealth = method === 'GET' && url.pathname === '/health';
    const scopedDashboard = method === 'GET' && url.pathname === '/api/dashboard';
    const scopedProducts = method === 'GET' && url.pathname === '/api/products';

    if (!scopedHealth && !scopedDashboard && !scopedProducts) return platformWorker.fetch(request, env, ctx);

    try {
      const schema = await ensureSchema(env);
      if (scopedHealth) return addPlatformHeaders(ok(await health(env, schema), request, env), request, env);
      const actor = await authenticate(request, env);
      const payload = scopedDashboard ? await dashboard(env, actor) : {products: await listProducts(env, actor, url)};
      return addPlatformHeaders(ok(payload, request, env), request, env);
    } catch (error) {
      if (Number(error?.status || 500) >= 500) console.error('scoped_request_failed', error);
      return addPlatformHeaders(errorResponse(error, request, env), request, env);
    }
  }
};
