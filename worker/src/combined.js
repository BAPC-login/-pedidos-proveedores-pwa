import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index-v44.js';

// Compatibilidad acumulativa: index-v20.js · index-v21.js · index-v22.js · index-v26.js · index-v27.js · index-v28.js · index-v29.js · index-v30.js · index-v32.js · index-v33.js · index-v34.js · index-v36.js · index-v38.js · index-v39.js · index-v40.js · index-v41.js · index-v42.js · index-v43.js · index-v44.js.
// Releases: v42 reliable emission · 2026.08.07.43 | v43 fast UX · 2026.08.07.44 | v44 Procurement OS · 2026.08.07.45
const PLATFORM_RELEASE='2026.08.07.45';
function rewritePath(request,pathname){const url=new URL(request.url);url.pathname=pathname;return new Request(url.toString(),request)}
function isAiRoute(pathname){return pathname==='/health'||pathname.startsWith('/v1/')}
function withPlatformRelease(response){const headers=new Headers(response.headers);headers.set('X-Nuvasto-Release',PLATFORM_RELEASE);headers.set('X-Pedidos-Pro-Release',PLATFORM_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(isAiRoute(url.pathname))return aiWorker.fetch(request,env,ctx);if(url.pathname==='/platform/health')return withPlatformRelease(await platformWorker.fetch(rewritePath(request,'/health'),env,ctx));return withPlatformRelease(await platformWorker.fetch(request,env,ctx))}};
