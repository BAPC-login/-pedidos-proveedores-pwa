import aiWorker from './index.js';
import platformWorker,{CURRENT_RELEASE} from '../../professional/worker/src/index-current.js';

// R60: un único dispatcher decide la implementación exacta por ruta.
// Las capas históricas quedan disponibles para contratos específicos, pero ya no se atraviesan en cadena en el hot path.
// Marcadores históricos para pruebas de compatibilidad solamente:
// index-v29.js · index-v39.js · index-v40.js · 2026.08.06.40 · 2026.08.06.41
// direct-share-runtime · 2026.08.07.47 | request-coalescing-hotfix · 2026.08.08.48 | stable-runtime · 2026.08.08.49 | safari-navigation-hotfix · 2026.08.08.50
const PLATFORM_RELEASE=CURRENT_RELEASE;
function rewritePath(request,pathname){const url=new URL(request.url);url.pathname=pathname;return new Request(url.toString(),request)}
function isAiRoute(pathname){return pathname==='/health'||pathname.startsWith('/v1/')}
function withPlatformRelease(response){const headers=new Headers(response.headers);headers.set('X-Nuvasto-Release',PLATFORM_RELEASE);headers.set('X-Pedidos-Pro-Release',PLATFORM_RELEASE);headers.set('X-Nuvasto-Runtime','consolidated-r60');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function releaseResponse(){return new Response(JSON.stringify({ok:true,service:'nuvasto-release',release:PLATFORM_RELEASE,runtime:'consolidated-r60'}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(isAiRoute(url.pathname))return aiWorker.fetch(request,env,ctx);if(url.pathname==='/platform/release')return withPlatformRelease(releaseResponse());if(url.pathname==='/platform/health')return withPlatformRelease(await platformWorker.fetch(rewritePath(request,'/health'),env,ctx));return withPlatformRelease(await platformWorker.fetch(request,env,ctx))}};
