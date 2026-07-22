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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const scopedDashboard = method === 'GET' && url.pathname === '/api/dashboard';
    const scopedProducts = method === 'GET' && url.pathname === '/api/products';

    if (!scopedDashboard && !scopedProducts) {
      return platformWorker.fetch(request, env, ctx);
    }

    try {
      await ensureSchema(env);
      const actor = await authenticate(request, env);
      const payload = scopedDashboard
        ? await dashboard(env, actor)
        : {products: await listProducts(env, actor, url)};
      return addPlatformHeaders(ok(payload, request, env), request, env);
    } catch (error) {
      if (Number(error?.status || 500) >= 500) console.error('scoped_request_failed', error);
      return addPlatformHeaders(errorResponse(error, request, env), request, env);
    }
  }
};
