import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index.js';

function rewritePath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

function isAiRoute(pathname) {
  return pathname === '/health' || pathname.startsWith('/v1/');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preserve the existing Gemini contract used by the current PWA.
    if (isAiRoute(url.pathname)) {
      return aiWorker.fetch(request, env, ctx);
    }

    // Expose an independent health endpoint for the professional platform.
    if (url.pathname === '/platform/health') {
      return platformWorker.fetch(rewritePath(request, '/health'), env, ctx);
    }

    // Pedidos Pro Platform owns /api/* and the application shell/assets.
    return platformWorker.fetch(request, env, ctx);
  }
};
