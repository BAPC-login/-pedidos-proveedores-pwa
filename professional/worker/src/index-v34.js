import platformWorker from './index-v33.js';
import {authenticate} from './auth.js';
import {ROLES,assertMinimumRole,corsHeaders,errorResponse,ok,securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {analyzeInvoiceV34} from './api/invoice-analysis-v34.js';
import {ensureFolioIntegrityV34,folioIntegrityStatusV34,withFolioWriteLockV34} from './api/folio-integrity-v34.js';

const VERSION='34';
const RELEASE_VERSION='2.0.0-alpha.34';

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Invoice-Engine','multipart-safe-v34');
  headers.set('X-Nuvasto-Folio-Integrity','unique-v34');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function needsFolioLock(method,pathname){
  if(method!=='POST')return false;
  return pathname==='/api/orders'||pathname==='/api/order-batches'||pathname==='/api/order-batches/v2'
    ||/^\/api\/orders\/[^/]+\/duplicate$/.test(pathname)
    ||/^\/api\/order-batches\/[^/]+\/renumber$/.test(pathname)
    ||/^\/api\/trash\/[^/]+\/restore$/.test(pathname);
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
  let folios={duplicates:null,uniqueIndex:false};
  try{await ensureSchema(env);await ensureFolioIntegrityV34(env);folios=await folioIntegrityStatusV34(env)}catch(error){folios={duplicates:null,uniqueIndex:false,error:error?.code||error?.message||'folio_check_failed'}}
  return decorate(ok({...payload,version:RELEASE_VERSION,schemaVersion:34,invoiceFlowVersion:34,invoiceMultipartFixVersion:34,
    invoiceFallbackReview:true,folioIntegrityVersion:34,folioUniqueIndex:Boolean(folios.uniqueIndex),duplicateFolios:folios.duplicates,
    mobileVisualVersion:34,dashboardCustomizationVersion:34},request,env),request,env);
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
      if(url.pathname.startsWith('/api/')){
        await ensureSchema(env);
        await ensureFolioIntegrityV34(env);
      }
      if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
        const actor=await authenticate(request,env);
        return decorate(ok({analysis:await analyzeInvoiceV34(request,env,actor)},request,env),request,env);
      }
      if(url.pathname==='/api/operations/folio-integrity'&&['GET','POST'].includes(method)){
        const actor=await authenticate(request,env);assertMinimumRole(actor.role,ROLES.ADMIN);
        if(method==='POST')await ensureFolioIntegrityV34(env,{force:true});
        return decorate(ok({integrity:await folioIntegrityStatusV34(env)},request,env),request,env);
      }
      if(needsFolioLock(method,url.pathname)){
        const actor=await authenticate(request,env);
        const response=await withFolioWriteLockV34(env,actor.orgId,()=>platformWorker.fetch(request,env,ctx));
        return decorate(response,request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
