import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index.js';
import {ensureSchema} from '../../professional/worker/src/schema.js';

const PLATFORM_RELEASE = '2026.07.21.15';

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
  headers.set('X-Pedidos-Pro-Release', PLATFORM_RELEASE);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function diagnostic(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Pedidos-Pro-Release': PLATFORM_RELEASE}
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isAiRoute(url.pathname)) return aiWorker.fetch(request, env, ctx);

    if (url.pathname === '/api/platform-diagnostics') {
      try {
        const schema = await ensureSchema(env);
        const tables = await env.DB.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
        return diagnostic({ok: true, release: PLATFORM_RELEASE, schema, tables: (tables.results || []).map(row => row.name)});
      } catch (error) {
        return diagnostic({ok: false, release: PLATFORM_RELEASE, name: String(error?.name || 'Error'), error: String(error?.message || error), stack: String(error?.stack || '').slice(0, 1800)}, 500);
      }
    }

    if (url.pathname === '/platform/health') {
      return withPlatformRelease(await platformWorker.fetch(rewritePath(request, '/health'), env, ctx));
    }

    return withPlatformRelease(await platformWorker.fetch(request, env, ctx));
  }
};
