import {
  corsHeaders,
  errorResponse,
  HttpError,
  ok,
  routeMatch,
  securityHeaders
} from './core.js';
import {ensureSchema} from './schema.js';
import {
  authenticate,
  bootstrap,
  createUser,
  listSessions,
  listUsers,
  login,
  logout,
  me,
  resetPassword as changePassword,
  revokeSession,
  updateUser
} from './auth.js';
import {
  createLocation,
  createProduct,
  createSupplier,
  dashboard,
  linkSupplierProduct,
  listCategories,
  listLocations,
  listProducts,
  listSuppliers
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
  auditLog,
  createInvoice,
  getFile,
  listInvoices,
  uploadFile
} from './api/documents.js';
import {createBrand, listBrands, switchBrand} from './platform.js';
import {listDocuments} from './storage.js';

const APP_VERSION = '2.0.0-alpha.4';

function addPlatformHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin') || '';
  for (const [name, value] of Object.entries(corsHeaders(origin, env))) headers.set(name, value);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function preflightResponse(request, env) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {status: 204, headers: {...corsHeaders(origin, env), ...securityHeaders()}});
}

async function applyOptionalRateLimit(env, key) {
  if (!env.RATE_LIMITER?.limit) return;
  const result = await env.RATE_LIMITER.limit({key});
  if (!result.success) throw new HttpError(429, 'Demasiadas solicitudes. Intenta nuevamente.', 'rate_limited');
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return preflightResponse(request, env);
  const schema = await ensureSchema(env);

  if (method === 'GET' && path === '/health') {
    return ok({
      service: 'pedidos-pro-platform',
      version: APP_VERSION,
      databaseConfigured: Boolean(env.DB),
      databaseInitialized: true,
      schemaVersion: schema.version,
      storageConfigured: Boolean(env.FILES || env.DB),
      storageBackend: env.FILES ? 'r2' : 'd1-chunks',
      r2Configured: Boolean(env.FILES),
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

  if (method === 'GET' && path === '/api/brands') return ok({brands: await listBrands(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/brands') return ok({brand: await createBrand(request, env, actor)}, request, env);
  const brandParams = routeMatch(path, '/api/brands/:id/switch');
  if (brandParams && method === 'POST') return ok(await switchBrand(request, env, actor, brandParams.id), request, env);

  if (method === 'GET' && path === '/api/locations') return ok({locations: await listLocations(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/locations') return ok({location: await createLocation(request, env, actor)}, request, env);
  if (method === 'GET' && path === '/api/categories') return ok({categories: await listCategories(env, actor)}, request, env);
  if (method === 'GET' && path === '/api/suppliers') return ok({suppliers: await listSuppliers(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/suppliers') return ok({supplier: await createSupplier(request, env, actor)}, request, env);
  if (method === 'GET' && path === '/api/products') return ok({products: await listProducts(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/products') return ok({product: await createProduct(request, env, actor)}, request, env);
  const productSupplierParams = routeMatch(path, '/api/products/:id/suppliers');
  if (productSupplierParams && method === 'POST') return ok({supplierProduct: await linkSupplierProduct(request, env, actor, productSupplierParams.id)}, request, env);

  if (method === 'GET' && path === '/api/orders') return ok({orders: await listOrders(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/orders') return ok({order: await createOrder(request, env, actor)}, request, env);
  const orderParams = routeMatch(path, '/api/orders/:id');
  if (orderParams && method === 'GET') return ok({order: await getOrder(env, actor, orderParams.id)}, request, env);
  if (orderParams && method === 'PATCH') return ok({order: await updateOrder(request, env, actor, orderParams.id)}, request, env);
  const transitionParams = routeMatch(path, '/api/orders/:id/transition');
  if (transitionParams && method === 'POST') return ok({order: await transitionOrder(request, env, actor, transitionParams.id)}, request, env);
  const receptionParams = routeMatch(path, '/api/orders/:id/receptions');
  if (receptionParams && method === 'POST') return ok({reception: await createReception(request, env, actor, receptionParams.id)}, request, env);

  if (method === 'GET' && path === '/api/invoices') return ok({invoices: await listInvoices(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/invoices') return ok({invoice: await createInvoice(request, env, actor)}, request, env);
  if (method === 'POST' && path === '/api/invoices/analyze') return ok({analysis: await analyzeInvoice(request, env, actor)}, request, env);
  if (method === 'GET' && path === '/api/documents') return ok({documents: await listDocuments(env, actor, {entityType: String(url.searchParams.get('entityType') || ''), entityId: String(url.searchParams.get('entityId') || ''), kind: String(url.searchParams.get('kind') || '')})}, request, env);
  if (method === 'POST' && path === '/api/files') return ok({file: await uploadFile(request, env, actor, url)}, request, env);
  const fileParams = routeMatch(path, '/api/files/:key');
  if (fileParams && method === 'GET') return getFile(env, actor, fileParams.key);

  if (method === 'GET' && path === '/api/users') return ok({users: await listUsers(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/users') return ok({user: await createUser(request, env, actor)}, request, env);
  const userParams = routeMatch(path, '/api/users/:id');
  if (userParams && method === 'PATCH') return ok({user: await updateUser(request, env, actor, userParams.id)}, request, env);
  const passwordParams = routeMatch(path, '/api/users/:id/password');
  if (passwordParams && method === 'POST') return ok(await changePassword(request, env, actor, passwordParams.id), request, env);

  if (method === 'GET' && path === '/api/sessions') return ok({sessions: await listSessions(env, actor)}, request, env);
  const sessionParams = routeMatch(path, '/api/sessions/:id/revoke');
  if (sessionParams && method === 'POST') return ok(await revokeSession(request, env, actor, sessionParams.id), request, env);
  if (method === 'GET' && path === '/api/audit') return ok({events: await auditLog(env, actor, url)}, request, env);

  throw new HttpError(404, 'Ruta no encontrada', 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return addPlatformHeaders(await handleRequest(request, env, ctx), request, env);
    } catch (error) {
      if (Number(error?.status || 500) >= 500) console.error('request_failed', error);
      return errorResponse(error, request, env);
    }
  }
};
