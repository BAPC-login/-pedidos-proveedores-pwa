import base from './index-v39.js';
import v40 from './index-v40.js';
import v41 from './index-v41.js';
import v42 from './index-v42.js';
import v43 from './index-v43.js';
import v44 from './index-v44.js';
import v45 from './index-v45.js';
import {corsHeaders,securityHeaders} from './core.js';

export const CURRENT_RELEASE='2026.08.10.60';
export const CURRENT_VERSION='60';

function decorate(response,request,env,startedAt,layer){
  const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';
  for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);
  for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);
  headers.set('X-Nuvasto-Version',CURRENT_VERSION);
  headers.set('X-Nuvasto-Release',CURRENT_RELEASE);
  headers.set('X-Nuvasto-Runtime','consolidated-r60');
  headers.set('X-Nuvasto-Route-Layer',layer);
  const elapsed=Math.max(0,Date.now()-startedAt),existing=headers.get('Server-Timing');
  headers.set('Server-Timing',[existing,`runtime;dur=${elapsed}`].filter(Boolean).join(', '));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function isCatalogMutation(path,method){
  return ['POST','PATCH','PUT','DELETE'].includes(method)&&(/^\/api\/(products|categories|suppliers|cost-centers|locations)(\/|$)/.test(path)||path.startsWith('/api/catalog/import'));
}
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
function choose(path,method){
  // r52/r45 endpoints remain implemented in their current module, but ordinary hot reads bypass all newer wrappers.
  if(path==='/api/operations-bootstrap-v45'||path==='/api/operations-bootstrap-v43'||path==='/api/screen-bootstrap-v52'||path==='/api/files/direct-v45')return[v45,'current-special'];
  if(isV44(path,method))return[v44,'v44-feature'];
  if(path==='/api/master-list-ordering-v42'||(method==='POST'&&/^\/api\/order-batches\/[^/]+\/regenerate-documents$/.test(path)))return[v42,'v42-feature'];
  if(method==='PATCH'&&/^\/api\/products\/[^/]+\/status$/.test(path))return[v43,'v43-feature'];
  if(isV41(path,method))return[v41,'v41-feature'];
  if(path==='/api/dashboard/analytics-v40'||method==='POST'&&path==='/api/order-batches/v2'||method==='POST'&&/^\/api\/order-batches\/[^/]+\/emit$/.test(path))return[v40,'v40-feature'];
  if(method==='GET'&&(path==='/api/orders'||path==='/api/orders/advanced'))return[v40,'orders-hotpath'];
  // Core reads and ordinary order/document detail now go straight to the canonical legacy core instead of traversing v40-v45.
  return[base,'core-hotpath'];
}

export default{async fetch(request,env,ctx){
  const startedAt=Date.now(),url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname;
  const[worker,layer]=choose(path,method);
  const response=await worker.fetch(request,env,ctx);
  return decorate(response,request,env,startedAt,layer);
}};
