import platformWorker from './index-v42.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {setProductActiveV43} from './api/experience-v43.js';

const VERSION='43';
const RELEASE_VERSION='2.0.0-alpha.43';
function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Experience','fast-ux-v43');
  headers.set('X-Nuvasto-Navigation','process-navigation-v43');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function json(response){return response.clone().json().catch(()=>({}));}
function rewrite(request,target){const url=new URL(request.url),next=new URL(target,url.origin);url.pathname=next.pathname;url.search=next.search;return new Request(url.toString(),request)}
async function internal(platformRequest,env,ctx,target){
  const response=await platformWorker.fetch(rewrite(platformRequest,target),env,ctx),payload=await json(response);
  if(!response.ok||payload.ok===false)throw Object.assign(new Error(payload.error||`No se pudo cargar ${target}`),{status:response.status,code:payload.code||'bootstrap_dependency_failed'});
  return payload;
}
async function operationsBootstrap(request,env,ctx){
  await authenticate(request,env);
  const definitions=[
    ['/api/categories','/api/categories'],
    ['/api/cost-centers','/api/cost-centers'],
    ['/api/suppliers','/api/suppliers?active=all'],
    ['/api/products','/api/products'],
    ['/api/locations','/api/locations'],
    ['/api/supplier-assets','/api/supplier-assets']
  ];
  const settled=await Promise.allSettled(definitions.map(([,target])=>internal(request,env,ctx,target))),cache={},warnings=[];
  settled.forEach((result,index)=>{const[cacheKey,target]=definitions[index];if(result.status==='fulfilled')cache[cacheKey]=result.value;else warnings.push({target,message:String(result.reason?.message||result.reason||'Error de carga')})});
  const coreReady=Boolean(cache['/api/categories']&&cache['/api/cost-centers']&&cache['/api/products']);
  return{cache,warnings,coreReady,generatedAt:new Date().toISOString(),strategy:'single-roundtrip-bootstrap-v43'};
}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname,productStatus=routeMatch(path,'/api/products/:id/status');
  try{
    if(method==='GET'&&path==='/health'){
      const response=await platformWorker.fetch(request,env,ctx),base=await json(response);
      return decorate(ok({...base,version:RELEASE_VERSION,experienceV43:true,operationsBootstrapV43:true,productLifecycleV43:true,professionalDashboardV43:true,processNavigationV43:true,floatingOrderActionsV43:true,settingsPolicyDedupV43:true},request,env),request,env);
    }
    if(method==='GET'&&path==='/api/operations-bootstrap-v43')return decorate(ok(await operationsBootstrap(request,env,ctx),request,env),request,env);
    if(productStatus&&method==='PATCH'){
      const actor=await authenticate(request,env),product=await setProductActiveV43(request,env,actor,productStatus.id);
      return decorate(ok({product},request,env),request,env);
    }
    return decorate(await platformWorker.fetch(request,env,ctx),request,env);
  }catch(error){return decorate(errorResponse(error,request,env),request,env)}
}};
