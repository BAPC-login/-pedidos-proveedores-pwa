import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index.js';
import {hashPassword} from '../../professional/worker/src/password.js';

const PLATFORM_RELEASE = '2026.07.21.7';
const DEFAULT_ORG_ID = 'e73d2d6e-dae8-46c6-87df-43ae05ca81fa';

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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function runAuthenticationSelfTest(request, env, ctx) {
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const email = `selftest-${suffix}@pedidospro.local`;
  const password = `${crypto.randomUUID()}!Aa9`;
  const passwordData = await hashPassword(password);
  const timestamp = new Date().toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO users
          (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at)
        VALUES (?, ?, 'Authentication Self Test', ?, ?, ?, 1, ?, ?)
      `).bind(userId, email, passwordData.salt, passwordData.hash, passwordData.algorithm, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO memberships
          (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
        VALUES (?, ?, ?, 'readonly', '["*"]', 1, ?, ?)
      `).bind(membershipId, DEFAULT_ORG_ID, userId, timestamp, timestamp)
    ]);

    const loginUrl = new URL(request.url);
    loginUrl.pathname = '/api/auth/login';
    const loginRequest = new Request(loginUrl.toString(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password, organizationSlug: 'pedidos-pro'})
    });
    const loginResponse = await platformWorker.fetch(loginRequest, env, ctx);
    const loginPayload = await loginResponse.clone().json().catch(() => ({}));
    const passed = loginResponse.status === 200 && loginPayload.ok === true && Boolean(loginPayload.token) && loginPayload.user?.email === email;

    return new Response(JSON.stringify({
      ok: passed,
      release: PLATFORM_RELEASE,
      loginHttp: loginResponse.status,
      sessionIssued: Boolean(loginPayload.token),
      userResolved: loginPayload.user?.email === email
    }), {
      status: passed ? 200 : 500,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}
    });
  } finally {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM memberships WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
    ]).catch(error => console.error('auth_selftest_cleanup_failed', error));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preserve the existing Gemini contract used by the current PWA.
    if (isAiRoute(url.pathname)) {
      return aiWorker.fetch(request, env, ctx);
    }

    if (url.pathname === '/api/platform-auth-selftest' && request.method === 'POST') {
      return withPlatformRelease(await runAuthenticationSelfTest(request, env, ctx));
    }

    // Independent health endpoint for the professional platform and D1.
    if (url.pathname === '/platform/health') {
      return withPlatformRelease(await platformWorker.fetch(rewritePath(request, '/health'), env, ctx));
    }

    // Pedidos Pro Platform owns /api/* and the application shell/assets.
    return withPlatformRelease(await platformWorker.fetch(request, env, ctx));
  }
};
