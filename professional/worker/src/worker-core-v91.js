import legacyWorker from './worker-core.js';
import {authenticate} from './auth.js';
import {errorResponse,ok} from './core.js';
import {listOrdersCanonical} from './api/orders-query.js';

function decorate(response){
  const headers=new Headers(response.headers);
  headers.set('X-Nuvasto-Orders-Query','canonical-cursor-v91-reserved-route');
  headers.set('X-Nuvasto-Production-Stability','v91');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function healthResponse(response,request,env){
  if(!response.ok)return response;
  const payload=await response.clone().json().catch(()=>null);
  if(!payload)return response;
  const environment=String(env.ENVIRONMENT||'production').trim().toLowerCase()||'production';
  return ok({...payload,environment,developmentEnvironment:environment==='development',productionStabilityV91:true,reservedOrdersAdvancedV91:true,transientInvoiceRetryV91:true,verifiedAiUsageV91:true},request,env);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      // Reserved collection endpoints must be resolved before /api/orders/:id.
      // worker-core.js currently computes routeMatch('/api/orders/:id') first, so
      // "advanced" can otherwise be interpreted as an order id and return 404.
      if(method==='GET'&&url.pathname==='/api/orders/advanced'){
        const actor=await authenticate(request,env);
        return decorate(ok(await listOrdersCanonical(env,actor,url),request,env));
      }
      let response=await legacyWorker.fetch(request,env,ctx);
      if(method==='GET'&&(url.pathname==='/health'||url.pathname==='/platform/health'))response=await healthResponse(response,request,env);
      return decorate(response);
    }catch(error){return decorate(errorResponse(error,request,env))}
  }
};
