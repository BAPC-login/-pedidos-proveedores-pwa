import platformWorker from './index-v39.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {getDashboardAnalyticsV40} from './api/analytics-v40.js';
import {createOrderFileV40,emitOrderBatchV40,prepareDraftFoliosV40} from './api/operations-v40.js';
import {migrateLegacyFoliosV67,withFolioWriteLockV34} from './api/folio-integrity-v34.js';
import {listOrdersCanonical} from './api/orders-query.js';

const VERSION='40';
const RELEASE_VERSION='2.0.0-alpha.40';
function decorate(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);headers.set('X-Nuvasto-Version',VERSION);headers.set('X-Nuvasto-Dashboard','filtered-professional-v40');headers.set('X-Nuvasto-Reception','professional-v40');headers.set('X-Nuvasto-Folio-Allocation','scoped-sequence-v67');headers.set('X-Nuvasto-Orders-Query','canonical-cursor-v67');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function prepareOrders(env,actor){return withFolioWriteLockV34(env,actor.orgId,async()=>{const migration=await migrateLegacyFoliosV67(env,actor.orgId);await prepareDraftFoliosV40(env,actor.orgId);return migration})}
export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),emit=routeMatch(url.pathname,'/api/order-batches/:id/emit');try{
  if(method==='GET'&&url.pathname==='/health'){const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));return decorate(ok({...payload,version:RELEASE_VERSION,professionalDashboardVersion:40,stripedOperationalLists:true,interactiveSupplierMatrix:true,notificationCenter:true,professionalReceptionVersion:40,folioAssignedOnEmission:true,simultaneousDeviceSafety:true,scopedHistoricalFoliosV67:true,cursorOrdersV67:true},request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/dashboard/analytics-v40'){const actor=await authenticate(request,env);return decorate(ok({analytics:await getDashboardAnalyticsV40(env,actor,url)},request,env),request,env)}
  if(method==='POST'&&url.pathname==='/api/order-batches/v2'){const actor=await authenticate(request,env);const batch=await withFolioWriteLockV34(env,actor.orgId,async()=>{await migrateLegacyFoliosV67(env,actor.orgId);return createOrderFileV40(request,env,actor)});return decorate(ok({batch},request,env),request,env)}
  if(emit&&method==='POST'){const actor=await authenticate(request,env);const result=await withFolioWriteLockV34(env,actor.orgId,async()=>{await migrateLegacyFoliosV67(env,actor.orgId);return emitOrderBatchV40(request,env,actor,emit.id,ctx)});return decorate(ok(result,request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/orders/advanced'){const actor=await authenticate(request,env);await prepareOrders(env,actor);return decorate(ok(await listOrdersCanonical(env,actor,url),request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/orders'){const actor=await authenticate(request,env);await prepareOrders(env,actor);return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  return decorate(await platformWorker.fetch(request,env,ctx),request,env)
}catch(error){return decorate(errorResponse(error,request,env),request,env)}}};
