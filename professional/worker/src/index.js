import {
  APP_VERSION,
  HttpError,
  errorResponse,
  json,
  ok,
  routeMatch,
  securityHeaders,
  corsHeaders
} from './core.js';
import {
  authenticate,
  bootstrap,
  createUser,
  listSessions,
  listUsers,
  login,
  logout,
  me,
  resetPassword,
  revokeSession,
  updateUser
} from './auth.js';
import {
  createCategory,
  createLocation,
  createProduct,
  createSupplier,
  dashboard,
  linkSupplierProduct,
  listCategories,
  listLocations,
  listProducts,
  listSuppliers,
  updateSupplier
} from './api/catalog.js';
import {
  createOrder,
  createReception,
  getOrder,
  listOrders,
  transitionOrder,
  updateOrder
} from './api/orders.js';
import {
  analyzeInvoice,
  createInvoice,
  auditLog,
  getFile,
  listInvoices,
  uploadFile
} from './api/documents.js';

async function applyOptionalRateLimit(env, key) {
  if (!env.RATE_LIMITER?.limit) return;
  const result = await env.RATE_LIMITER.limit({key});
  if (!result.success) throw new HttpError(429, 'Demasiadas solicitudes. Intenta nuevamente en un momento.', 'rate_limited');
}

async function apiRouter(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/health') {
    return ok({
      service: 'pedidos-pro-platform',
      version: APP_VERSION,
      databaseConfigured: Boolean(env.DB),
      storageConfigured: Boolean(env.FILES),
      aiEndpoint: Boolean(env.AI_ENDPOINT),
      environment: env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString()
    }, request, env);
  }

  if (method === 'POST' && path === '/api/bootstrap') {
    await applyOptionalRateLimit(env, `bootstrap:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
    return ok(await bootstrap(request, env), request, env);
  }

  if (method === 'POST' && path === '/api/auth/login') {
    await applyOptionalRateLimit(env, `login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
    return ok(await login(request, env), request, env);
  }

  const actor = await authenticate(request, env);
  await applyOptionalRateLimit(env, `user:${actor.userId}`);

  if (method === 'POST' && path === '/api/auth/logout') return ok(await logout(request, env, actor), request, env);
  if (method === 'GET' && path === '/api/me') return ok(await me(env, actor), request, env);
  if (method === 'GET' && path === '/api/dashboard') return ok(await dashboard(env, actor), request, env);

  if (method === 'GET' && path === '/api/users') return ok({users: await listUsers(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/users') return ok({user: await createUser(request, env, actor)}, request, env);
  let params = routeMatch(path, '/api/users/:id');
  if (params && method === 'PATCH') return ok({user: await updateUser(request, env, actor, params.id)}, request, env);
  params = routeMatch(path, '/api/users/:id/password');
  if (params && method === 'POST') return ok(await resetPassword(request, env, actor, params.id), request, env);

  if (method === 'GET' && path === '/api/sessions') return ok({sessions: await listSessions(env, actor)}, request, env);
  params = routeMatch(path, '/api/sessions/:id/revoke');
  if (params && method === 'POST') return ok(await revokeSession(request, env, actor, params.id), request, env);

  if (method === 'GET' && path === '/api/locations') return ok({locations: await listLocations(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/locations') return ok({location: await createLocation(request, env, actor)}, request, env);

  if (method === 'GET' && path === '/api/suppliers') return ok({suppliers: await listSuppliers(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/suppliers') return ok({supplier: await createSupplier(request, env, actor)}, request, env);
  params = routeMatch(path, '/api/suppliers/:id');
  if (params && method === 'PATCH') return ok({supplier: await updateSupplier(request, env, actor, params.id)}, request, env);

  if (method === 'GET' && path === '/api/categories') return ok({categories: await listCategories(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/categories') return ok({category: await createCategory(request, env, actor)}, request, env);

  if (method === 'GET' && path === '/api/products') return ok({products: await listProducts(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/products') return ok({product: await createProduct(request, env, actor)}, request, env);
  params = routeMatch(path, '/api/products/:id/suppliers');
  if (params && method === 'POST') return ok({relation: await linkSupplierProduct(request, env, actor, params.id)}, request, env);

  if (method === 'GET' && path === '/api/orders') return ok({orders: await listOrders(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/orders') return ok({order: await createOrder(request, env, actor)}, request, env);
  params = routeMatch(path, '/api/orders/:id');
  if (params && method === 'GET') return ok({order: await getOrder(env, actor, params.id)}, request, env);
  if (params && method === 'PATCH') return ok({order: await updateOrder(request, env, actor, params.id)}, request, env);
  params = routeMatch(path, '/api/orders/:id/transition');
  if (params && method === 'POST') return ok({order: await transitionOrder(request, env, actor, params.id)}, request, env);
  params = routeMatch(path, '/api/orders/:id/receptions');
  if (params && method === 'POST') return ok({reception: await createReception(request, env, actor, params.id)}, request, env);

  if (method === 'GET' && path === '/api/invoices') return ok({invoices: await listInvoices(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/invoices') return ok({invoice: await createInvoice(request, env, actor)}, request, env);
  if (method === 'POST' && path === '/api/invoices/analyze') return ok({analysis: await analyzeInvoice(request, env, actor)}, request, env);

  if (method === 'POST' && path === '/api/files') return ok({file: await uploadFile(request, env, actor, url)}, request, env);
  if (method === 'GET' && path.startsWith('/api/files/')) {
    const key = decodeURIComponent(path.slice('/api/files/'.length));
    return getFile(env, actor, key);
  }

  if (method === 'GET' && path === '/api/audit') return ok({events: await auditLog(env, actor, url)}, request, env);

  throw new HttpError(404, 'Ruta no encontrada', 'not_found');
}

async function serveAsset(request, env) {
  if (!env.ASSETS) return new Response('Pedidos Pro Platform', {status: 200, headers: securityHeaders()});
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  if (request.url.endsWith('/sw.js')) headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  else if (response.headers.get('Content-Type')?.includes('text/html')) headers.set('Cache-Control', 'no-cache');
  else headers.set('Cache-Control', 'public, max-age=3600');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: {...corsHeaders(request.headers.get('Origin') || '', env), ...securityHeaders()}});
    }
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return await apiRouter(request, env);
      return await serveAsset(request, env);
    } catch (error) {
      console.error('request_failed', error);
      return errorResponse(error, request, env);
    }
  }
};
