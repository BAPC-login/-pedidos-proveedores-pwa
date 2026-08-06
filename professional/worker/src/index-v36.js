import platformWorker from './index-v34.js';
import {ok} from './core.js';

const VERSION='36';
const RELEASE_VERSION='2.0.0-alpha.36';

function decorate(response){
  const headers=new Headers(response.headers);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Invoice-Review','consistent-v36');
  headers.set('X-Nuvasto-Invoice-Save','fast-ack-v36');
  headers.set('X-Nuvasto-Mobile-Icons','aligned-v36');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health'){
      const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
      return decorate(ok({...payload,version:RELEASE_VERSION,invoiceReviewVersion:36,invoiceSaveAcknowledgementVersion:36,mobileNavigationIconVersion:36,currencyInputVersion:36},request,env));
    }
    return decorate(await platformWorker.fetch(request,env,ctx));
  }
};
