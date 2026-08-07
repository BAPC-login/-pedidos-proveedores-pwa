import v44 from './index-v44.js';
import v43 from './index-v43.js';
import v42 from './index-v42.js';
import v41 from './index-v41.js';
import v40 from './index-v40.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,securityHeaders} from './core.js';

const VERSION='45';
const RELEASE_VERSION='2.0.0-alpha.45';
const RELEASE='2026.08.07.46';

function decorate(response,request,env,startedAt,layer='core'){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  const duration=Math.max(0,Date.now()-startedAt),timing=headers.get('Server-Timing');
  headers.set('Server-Timing',[timing,`gateway;dur=${duration}`].filter(Boolean).join(', '));
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Release',RELEASE);
  headers.set('X-Nuvasto-Performance','native-fast-v45');
  headers.set('X-Nuvasto-Route-Layer',layer);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function rewrite(request,target){const url=new URL(request.url),next=new URL(target,url.origin);url.pathname=next.pathname;url.search=next.search;return new Request(url.toString(),request)}
async function internal(request,env,ctx,target){const response=await v40.fetch(rewrite(request,target),env,ctx),payload=await response.clone().json().catch(()=>({}));if(!response.ok||payload.ok===false)throw Object.assign(new Error(payload.error||`No se pudo cargar ${target}`),{status:response.status,code:payload.code||'bootstrap_dependency_failed'});return payload}
async function operationsBootstrap(request,env,ctx){
  await authenticate(request,env);
  const definitions=[['/api/categories','/api/categories'],['/api/cost-centers','/api/cost-centers'],['/api/suppliers','/api/suppliers?active=all'],['/api/products','/api/products'],['/api/locations','/api/locations'],['/api/supplier-assets','/api/supplier-assets']];
  const settled=await Promise.allSettled(definitions.map(([,target])=>internal(request,env,ctx,target))),cache={},warnings=[];
  settled.forEach((result,index)=>{const[cacheKey,target]=definitions[index];if(result.status==='fulfilled')cache[cacheKey]=result.value;else warnings.push({target,message:String(result.reason?.message||result.reason||'Error de carga')})});
  return{cache,warnings,coreReady:Boolean(cache['/api/categories']&&cache['/api/cost-centers']&&cache['/api/products']),generatedAt:new Date().toISOString(),strategy:'single-roundtrip-no-schema-hotpath-v45'};
}
function isCatalogMutation(path,method){return ['POST','PATCH','PUT','DELETE'].includes(method)&&(/^\/api\/(products|categories|suppliers|cost-centers|locations)(\/|$)/.test(path)||path.startsWith('/api/catalog/import'))}
function isV44(path,method){
  if(path==='/health'||path.startsWith('/api/procurement-os-v44')||path.startsWith('/api/master-data-v44')||path.startsWith('/api/master-list-assist-v44')||path.startsWith('/api/master-list-favorites-v44')||path.startsWith('/api/procurement-intelligence-v44')||path.startsWith('/api/finance-planning-v44')||path.startsWith('/api/permissions-v44')||path.startsWith('/api/my-permissions-v44')||path.startsWith('/api/reception-evidence-v44')||path.startsWith('/api/jobs-v44')||path.startsWith('/api/system-health-v44')||path.startsWith('/api/global-search-v44'))return true;
  if(isCatalogMutation(path,method))return true;
  if(method==='POST'&&path==='/api/order-batches/v2')return true;
  if(method==='POST'&&/^\/api\/order-batches\/[^/]+\/emit$/.test(path))return true;
  if(method==='POST'&&/^\/api\/orders\/[^/]+\/receptions$/.test(path))return true;
  if(method==='POST'&&path==='/api/invoices/analyze')return true;
  if(method==='GET'&&path.startsWith('/api/finance/'))return true;
  if(method==='POST'&&/^\/api\/approvals\/[^/]+\/resolve$/.test(path))return true;
  return false;
}
function isV42(path,method){return path==='/api/master-list-ordering-v42'||(method==='POST'&&/^\/api\/order-batches\/[^/]+\/regenerate-documents$/.test(path))}
function isV43(path,method){return (method==='GET'&&path==='/api/operations-bootstrap-v43')||(method==='PATCH'&&/^\/api\/products\/[^/]+\/status$/.test(path))}
function isV41(path,method){
  if(path==='/api/dashboard/analytics-v41'||path==='/api/receptions/work-queue'||path==='/api/finance/payments'||path==='/api/approvals'||path==='/api/approval-policies'||path==='/api/order-templates'||path==='/api/notifications-v41'||path==='/api/report-views'||path==='/api/presence'||path==='/api/global-search'||path==='/api/supplier-scorecards'||path==='/api/orders/close-reconciled'||path==='/api/platform/usage-v41')return true;
  if(/^\/api\/suppliers\/[^/]+\/payment-terms$/.test(path))return true;
  if(/^\/api\/receptions\/[^/]+\/(returns|difference-report)$/.test(path))return true;
  if(/^\/api\/finance\/payments\/[^/]+$/.test(path))return true;
  if(/^\/api\/notifications-v41\/[^/]+$/.test(path))return true;
  if(/^\/api\/orders\/[^/]+\/(collaboration|comments|supplier-confirmation|substitutions)$/.test(path))return true;
  if(method==='POST'&&path==='/api/invoices')return true;
  return false;
}

export default{async fetch(request,env,ctx){
  const startedAt=Date.now(),url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname;
  try{
    if(method==='GET'&&path==='/api/operations-bootstrap-v45')return decorate(ok(await operationsBootstrap(request,env,ctx),request,env),request,env,startedAt,'bootstrap-v45');
    let worker=v40,layer='core-v40';
    if(isV44(path,method)){worker=v44;layer='v44-guarded'}
    else if(isV42(path,method)){worker=v42;layer='v42-explicit'}
    else if(isV43(path,method)){worker=v43;layer='v43-explicit'}
    else if(isV41(path,method)){worker=v41;layer='v41-explicit'}
    const response=await worker.fetch(request,env,ctx);
    if(path==='/health'&&response.ok){const body=await response.clone().json().catch(()=>null);if(body)return decorate(ok({...body,version:RELEASE_VERSION,nativePerformanceV45:true,schemaOffCriticalPathV45:true,requestCoalescingV45:true,operationsBootstrapV45:true},request,env),request,env,startedAt,layer)}
    return decorate(response,request,env,startedAt,layer);
  }catch(error){return decorate(errorResponse(error,request,env),request,env,startedAt,'v45-error')}
}};
