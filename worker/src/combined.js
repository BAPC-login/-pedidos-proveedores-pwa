import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index.js';

const PLATFORM_RELEASE = '2026.07.21.11';

function rewritePath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

function isAiRoute(pathname) {
  return pathname === '/health' || pathname.startsWith('/v1/');
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
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

async function runStorageSelfTest(env) {
  if (!env.FILES) return jsonResponse({ok: false, release: PLATFORM_RELEASE, error: 'R2 binding unavailable'}, 500);
  const key = `system/selftest/${crypto.randomUUID()}.txt`;
  const expected = `pedidos-pro-storage-${crypto.randomUUID()}`;
  try {
    await env.FILES.put(key, expected, {
      httpMetadata: {contentType: 'text/plain; charset=utf-8'},
      customMetadata: {purpose: 'deployment-selftest'}
    });
    const object = await env.FILES.get(key);
    const actual = object ? await object.text() : '';
    const passed = actual === expected;
    return jsonResponse({
      ok: passed,
      release: PLATFORM_RELEASE,
      binding: true,
      put: true,
      get: Boolean(object),
      contentVerified: passed,
      deleted: true
    }, passed ? 200 : 500);
  } catch (error) {
    return jsonResponse({
      ok: false,
      release: PLATFORM_RELEASE,
      binding: true,
      name: String(error?.name || 'Error'),
      error: String(error?.message || error)
    }, 500);
  } finally {
    await env.FILES.delete(key).catch(error => console.error('storage_selftest_cleanup_failed', error));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preserve the existing Gemini contract used by the current PWA.
    if (isAiRoute(url.pathname)) {
      return aiWorker.fetch(request, env, ctx);
    }

    if (url.pathname === '/api/platform-storage-selftest' && request.method === 'POST') {
      return withPlatformRelease(await runStorageSelfTest(env));
    }

    // Independent health endpoint for the professional platform and D1.
    if (url.pathname === '/platform/health') {
      return withPlatformRelease(await platformWorker.fetch(rewritePath(request, '/health'), env, ctx));
    }

    // Pedidos Pro Platform owns /api/* and the application shell/assets.
    return withPlatformRelease(await platformWorker.fetch(request, env, ctx));
  }
};
