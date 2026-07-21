import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index.js';
import {ensureSchema} from '../../professional/worker/src/schema.js';

const PLATFORM_RELEASE = '2026.07.21.5';

function rewritePath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

function isAiRoute(pathname) {
  return pathname === '/health' || pathname.startsWith('/v1/');
}

function diagnosticResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preserve the existing Gemini contract used by the current PWA.
    if (isAiRoute(url.pathname)) {
      return aiWorker.fetch(request, env, ctx);
    }

    // Temporary deployment diagnostic. It exposes no credentials or user data.
    if (url.pathname === '/platform/diagnostics' || url.pathname === '/api/platform-diagnostics') {
      try {
        const schema = await ensureSchema(env);
        const [tableResult, userCount, organizationCount] = await Promise.all([
          env.DB.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM users').first(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM organizations').first()
        ]);
        return diagnosticResponse({
          ok: true,
          release: PLATFORM_RELEASE,
          databaseBinding: Boolean(env.DB),
          schema,
          users: Number(userCount?.total || 0),
          organizations: Number(organizationCount?.total || 0),
          tables: (tableResult.results || []).map(row => row.name)
        });
      } catch (error) {
        return diagnosticResponse({
          ok: false,
          release: PLATFORM_RELEASE,
          databaseBinding: Boolean(env.DB),
          name: String(error?.name || 'Error'),
          error: String(error?.message || error),
          stack: String(error?.stack || '').slice(0, 1800)
        }, 500);
      }
    }

    // Expose an independent health endpoint for the professional platform.
    if (url.pathname === '/platform/health') {
      return platformWorker.fetch(rewritePath(request, '/health'), env, ctx);
    }

    // Pedidos Pro Platform owns /api/* and the application shell/assets.
    return platformWorker.fetch(request, env, ctx);
  }
};
