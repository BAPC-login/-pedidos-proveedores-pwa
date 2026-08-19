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
      return decorate(await legacyWorker.fetch(request,env,ctx));
    }catch(error){return decorate(errorResponse(error,request,env))}
  }
};
