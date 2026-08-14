import aiWorker from './index.js';
import platformWorker from '../../professional/worker/src/router.js';

const PLATFORM_RELEASE='2026.08.14.73';
function rewritePath(request,pathname){const url=new URL(request.url);url.pathname=pathname;return new Request(url.toString(),request)}
function isAiRoute(pathname){return pathname==='/health'||pathname.startsWith('/v1/')}
function withPlatformRelease(response){const headers=new Headers(response.headers);headers.set('X-Nuvasto-Release',PLATFORM_RELEASE);headers.set('X-Pedidos-Pro-Release',PLATFORM_RELEASE);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function releaseResponse(){return new Response(JSON.stringify({ok:true,service:'nuvasto-release',release:PLATFORM_RELEASE}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
export default{async fetch(request,env,ctx){const url=new URL(request.url);if(isAiRoute(url.pathname))return aiWorker.fetch(request,env,ctx);if(url.pathname==='/platform/release')return withPlatformRelease(releaseResponse());if(url.pathname==='/platform/health')return withPlatformRelease(await platformWorker.fetch(rewritePath(request,'/health'),env,ctx));return withPlatformRelease(await platformWorker.fetch(request,env,ctx))}};
