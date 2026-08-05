import platformWorker from './index-v30.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {
  analyzeInvoiceV32,deleteProductPhotoV32,getProcurementPolicyV32,learnFromInvoiceV32,listAdvancedOrdersV32,
  listCatalogMatrixV32,listLearningSummaryV32,prepareInvoicePayloadV32,saveProcurementPolicyV32,
  updateProductSuppliersV32,uploadProductPhotoV32
} from './api/professional-v32.js';

const VERSION='32';
const RELEASE_VERSION='2.0.0-alpha.32';

function decorate(response,request,env){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-UX','professional-v32');
  headers.set('X-Nuvasto-Learning','supplier-product-v32');
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));
  return decorate(ok({...payload,version:RELEASE_VERSION,schemaVersion:32,professionalUxVersion:32,advancedFilters:true,supplierProductMatrix:true,productPhotos:true,invoiceCorrectionLearning:true,extraItemsPolicy:true,accessibleMobileUi:true},request,env),request,env);
}

function routeId(pathname,pattern){const match=pathname.match(pattern);return match?decodeURIComponent(match[1]):''}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      if(method==='GET'&&url.pathname==='/health')return health(request,env,ctx);
      if(url.pathname.startsWith('/api/'))await ensureSchema(env);
      if(method==='POST'&&url.pathname==='/api/invoices/analyze'){
        const actor=await authenticate(request,env);return decorate(ok({analysis:await analyzeInvoiceV32(request,env,actor)},request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/catalog/matrix'){
        const actor=await authenticate(request,env);return decorate(ok(await listCatalogMatrixV32(env,actor),request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/orders/advanced'){
        const actor=await authenticate(request,env);return decorate(ok(await listAdvancedOrdersV32(env,actor),request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/procurement/policies'){
        const actor=await authenticate(request,env);return decorate(ok({policy:await getProcurementPolicyV32(env,actor)},request,env),request,env);
      }
      if(method==='PUT'&&url.pathname==='/api/procurement/policies'){
        const actor=await authenticate(request,env);return decorate(ok({policy:await saveProcurementPolicyV32(request,env,actor)},request,env),request,env);
      }
      if(method==='GET'&&url.pathname==='/api/learning/rules'){
        const actor=await authenticate(request,env);return decorate(ok({rules:await listLearningSummaryV32(env,actor)},request,env),request,env);
      }
      const supplierProductId=routeId(url.pathname,/^\/api\/products\/([^/]+)\/suppliers$/);
      if(supplierProductId&&method==='PUT'){
        const actor=await authenticate(request,env);return decorate(ok(await updateProductSuppliersV32(request,env,actor,supplierProductId),request,env),request,env);
      }
      const photoProductId=routeId(url.pathname,/^\/api\/products\/([^/]+)\/photo$/);
      if(photoProductId&&method==='POST'){
        const actor=await authenticate(request,env);return decorate(ok({photo:await uploadProductPhotoV32(request,env,actor,photoProductId)},request,env),request,env);
      }
      if(photoProductId&&method==='DELETE'){
        const actor=await authenticate(request,env);return decorate(ok(await deleteProductPhotoV32(request,env,actor,photoProductId),request,env),request,env);
      }
      if(method==='POST'&&url.pathname==='/api/invoices'){
        const actor=await authenticate(request,env),body=await request.json(),prepared=await prepareInvoicePayloadV32(env,actor,body),downstream=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(prepared.body)}),response=await platformWorker.fetch(downstream,env,ctx);
        if(response.ok){const payload=await response.clone().json().catch(()=>({})),invoiceId=payload.invoice?.id||payload.id||payload.result?.id||'';await learnFromInvoiceV32(env,actor,{requestBody:prepared.body,invoiceId,extras:prepared.extras,rejected:prepared.rejected}).catch(error=>console.warn('invoice_learning_failed',error?.message||error))}
        return decorate(response,request,env);
      }
      return decorate(await platformWorker.fetch(request,env,ctx),request,env);
    }catch(error){return decorate(errorResponse(error,request,env),request,env)}
  }
};
