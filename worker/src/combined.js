import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index-v44.js';

// Compatibilidad acumulativa: v44 envuelve v43 y conserva emisión v42, operaciones v41 y toda la plataforma previa.
// Releases: v42 reliable emission · 2026.08.07.43 | v43 fast UX · 2026.08.07.44 | v44 Procurement OS · 2026.08.07.45
const PLATFORM_RELEASE='2026.08.07.45';
function rewritePath(request,pathname){const url=new URL(request.url);url.pathname=pathname;return new Request(url.toString(),request)}
function isAiRoute(pathname){return pathname==='/health'||pathname.startsWith('/v1/')}
function withPlatformRelease(response){const headers=new Headers(response.headers);headers.set('X-Nuvasto-Release',PLATFORM_RELEASE);headers.set('X-Pedidos-Pro-Release',PLATFORM_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(isAiRoute(url.pathname))return aiWorker.fetch(request,env,ctx);if(url.pathname==='/platform/health')return withPlatformRelease(await platformWorker.fetch(rewritePath(request,'/health'),env,ctx));return withPlatformRelease(await platformWorker.fetch(request,env,ctx))}};
