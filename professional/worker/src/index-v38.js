import platformWorker from './index-v36.js';
import {ok} from './core.js';

const VERSION='38';
const RELEASE_VERSION='2.0.0-alpha.38';

function decorate(response){
  const headers=new Headers(response.headers);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Multi-Invoice','per-order-v38');
  headers.set('X-Nuvasto-Document-Queue','five-independent-v38');
  headers.set('X-Nuvasto-Free-Documents','independent-v38');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health'){
      const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
      return decorate(ok({...payload,version:RELEASE_VERSION,multipleInvoicesPerOrder:true,maxDocumentsPerUpload:5,independentDocumentReview:true,independentFreeDocuments:true,multiInvoiceFlowVersion:38},request,env));
    }
    return decorate(await platformWorker.fetch(request,env,ctx));
  }
};
