import platformWorker from './index-v28.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {analyzeInvoiceV29} from './api/invoice-analysis-v29.js';
import {renumberDraftBatchV29} from './api/order-checkout-v29.js';

const VERSION='29';
const RELEASE_VERSION='2.0.0-alpha.29';

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx);
  const payload=await response.clone().json().catch(()=>({}));
  return decorate(ok({...payload,version:RELEASE_VERSION,invoiceFlowVersion:29,invoiceAttemptTimeoutMs:84000,invoiceRetryAttempts:1,checkoutFlowVersion:29,folioRenumberingVersion:29,singleInvoiceProgress:true,postEmissionRoute:'dashboard'},request,env),request,env);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    const renumber=routeMatch(url.pathname,'/api/order-batches/:id/renumber');
    try{
      if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
      if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
        const actor=await authenticate(request,env);
        return decorate(ok({analysis:await analyzeInvoiceV29(request,env,actor)},request,env),request,env);
      }
      if(renumber&&method==='POST'){
        const actor=await authenticate(request,env);
        return decorate(ok(await renumberDraftBatchV29(request,env,actor,renumber.id),request,env),request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
