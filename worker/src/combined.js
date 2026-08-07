import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/index-v43.js';

// Compatibilidad de pruebas y despliegues acumulativos: index-v39.js continúa envuelto por index-v40.js, index-v41.js, index-v42.js e index-v43.js.
// Historial de compatibilidad validado por las suites acumulativas:
// index-v20.js · 2026.07.31.20 | index-v21.js · 2026.07.31.21 | index-v22.js · 2026.07.31.22
// index-v26.js · 2026.08.04.26 | index-v27.js · 2026.08.05.27 | index-v28.js · 2026.08.05.28 | index-v29.js · 2026.08.05.30 | index-v30.js · 2026.08.05.31 | storage-fix · 2026.08.05.32 | index-v32.js · 2026.08.05.33 | index-v33.js · 2026.08.06.34 | index-v34.js · 2026.08.06.35 | orders-clean-slate · 2026.08.06.36 | invoice-review-save-icons · 2026.08.06.37 | date-only-consistency · 2026.08.06.38 | multiple-invoices-per-order · 2026.08.06.39 | multi-picker-cache-navigation · 2026.08.06.40 | professional-operations · 2026.08.06.41 | reception-payments-enterprise · 2026.08.06.42 | reliable-emission-master-ordering · 2026.08.07.43 | fast-ux-process-navigation · 2026.08.07.44
const PLATFORM_RELEASE='2026.08.07.44';
function rewritePath(request,pathname){const url=new URL(request.url);url.pathname=pathname;return new Request(url.toString(),request)}
function isAiRoute(pathname){return pathname==='/health'||pathname.startsWith('/v1/')}
function withPlatformRelease(response){const headers=new Headers(response.headers);headers.set('X-Nuvasto-Release',PLATFORM_RELEASE);headers.set('X-Pedidos-Pro-Release',PLATFORM_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(isAiRoute(url.pathname))return aiWorker.fetch(request,env,ctx);if(url.pathname==='/platform/health')return withPlatformRelease(await platformWorker.fetch(rewritePath(request,'/health'),env,ctx));return withPlatformRelease(await platformWorker.fetch(request,env,ctx))}};
