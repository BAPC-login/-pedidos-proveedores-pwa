import platformWorker from './index-v29.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {analyzeInvoiceV30,invoiceAnalysisMetricsV30} from './api/invoice-analysis-v30.js';

const VERSION='31';
const RELEASE_VERSION='2.0.0-alpha.31';

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Invoice-Engine','internal-v31');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function capabilities(actor){
  const role=String(actor.role||'readonly');
  const owner=role==='owner',admin=owner||role==='admin',purchaser=admin||role==='purchaser',approver=admin||role==='approver',receiver=admin||role==='receiver',finance=admin||role==='finance';
  return{
    role,
    orders:{view:true,create:purchaser,editDraft:purchaser,emit:purchaser||approver,share:true,duplicate:purchaser,deleteDraft:purchaser,deleteEmitted:admin},
    invoices:{view:true,upload:receiver||finance||purchaser,review:receiver||finance||purchaser,reconcile:receiver||finance||approver},
    reception:{view:true,register:receiver,quality:receiver},
    catalog:{view:true,manage:admin||purchaser,import:admin},
    administration:{users:admin,branding:admin,readiness:admin,audit:admin,billing:owner,legal:admin,integrations:admin}
  };
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx);
  const payload=await response.clone().json().catch(()=>({}));
  return decorate(ok({...payload,version:RELEASE_VERSION,invoiceFlowVersion:31,invoiceEngine:'internal-worker',invoiceFallbackReview:true,invoiceStorageLinkFix:true,brandSafeCopy:true,responsiveOperationalModals:true,capabilityMatrixVersion:30},request,env),request,env);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
      if(url.pathname.startsWith('/api/'))await ensureSchema(env);
      if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
        const actor=await authenticate(request,env);
        return decorate(ok({analysis:await analyzeInvoiceV30(request,env,actor)},request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/capabilities'){
        const actor=await authenticate(request,env);
        return decorate(ok({capabilities:capabilities(actor)},request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/operations/invoice-analysis-metrics'){
        const actor=await authenticate(request,env);
        return decorate(ok({metrics:await invoiceAnalysisMetricsV30(env,actor)},request,env),request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
