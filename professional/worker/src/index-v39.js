import platformWorker from './index-v38.js';
import {authenticate} from './auth.js';
import {ensureSchema} from './schema.js';
import {corsHeaders,errorResponse,ok,securityHeaders} from './core.js';
import {analyzeInvoiceV39} from './api/invoice-analysis-v39.js';

const VERSION='39';
const RELEASE_VERSION='2.0.0-alpha.39';
const MAX_DOCUMENT_BYTES=20*1024*1024;

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Multi-File-Picker','native-multiple-v39');
  headers.set('X-Nuvasto-Max-Document-Bytes',String(MAX_DOCUMENT_BYTES));
  headers.set('X-Nuvasto-Navigation-Stability','serialized-v39');
  headers.set('X-Nuvasto-Cache-Cutover','forced-v39');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
        await ensureSchema(env);const actor=await authenticate(request,env);
        return decorate(ok({analysis:await analyzeInvoiceV39(request,env,actor)},request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/health'){
        const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
        return decorate(ok({...payload,version:RELEASE_VERSION,multiFilePickerVersion:39,maxDocumentBytes:MAX_DOCUMENT_BYTES,maxDocumentSizeMb:20,forcedPwaRefreshVersion:39,navigationStabilityVersion:39,multipleInvoicesPerOrder:true,maxDocumentsPerUpload:5,supplierEvidenceReconciliationV75:true,serverOrderReconciliationContextV75:true,historicalInvoiceAliasMatchingV75:true},request,env),request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
