import platformWorker from './index-v43.js';
import {authenticate} from './auth.js';
import {ensureSchema} from './schema.js';
import {ensureEnterpriseSchemaV41} from './api/schema-v41.js';
import {ensureProcurementSuiteV44} from './api/schema-v44.js';
import {updateMasterRecordV44} from './api/master-data-v44.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders,HttpError} from './core.js';
import {
  assertPermissionV44,bulkMasterDataV44,enqueueJobV44,financePlanningV44,getEffectivePermissionV44,getMasterListAssistV44,globalSearchV44,
  listJobsV44,listMasterDataV44,listPermissionsV44,listReceptionEvidenceV44,mergeMasterDataV44,procurementIntelligenceV44,procurementOsSummaryV44,
  recordCompletedJobV44,recordFailedJobV44,resolveBatchContextV44,resolveOrderContextV44,retryJobV44,runJobV44,saveReceptionEvidenceV44,
  setFavoriteV44,setMasterDataStatusV44,systemHealthV44,upsertPermissionV44
} from './api/procurement-os-v44.js';

const VERSION='44';
const RELEASE_VERSION='2.0.0-alpha.44';
function decorate(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);headers.set('X-Nuvasto-Version',VERSION);headers.set('X-Nuvasto-Procurement-OS','suite-v44');headers.set('X-Nuvasto-Master-Data','lifecycle-v44');headers.set('X-Nuvasto-Observability','jobs-health-v44');headers.set('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key,X-Bootstrap-Token,X-Pedidos-Client,X-Device-Id,X-Nuvasto-Device');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function prepare(env){await ensureSchema(env);await ensureEnterpriseSchemaV41(env);await ensureProcurementSuiteV44(env)}
async function auth(request,env){await prepare(env);return authenticate(request,env)}
async function payload(response){return response.clone().json().catch(()=>({}))}
function masterStatus(path){const match=path.match(/^\/api\/master-data-v44\/([^/]+)\/([^/]+)\/status$/);return match?{entity:decodeURIComponent(match[1]),id:decodeURIComponent(match[2])}:null}
function masterRecord(path){const match=path.match(/^\/api\/master-data-v44\/([^/]+)\/([^/]+)$/);return match?{entity:decodeURIComponent(match[1]),id:decodeURIComponent(match[2])}:null}
function permissionUser(path){const match=path.match(/^\/api\/permissions-v44\/([^/]+)$/);return match?decodeURIComponent(match[1]):''}
function favorite(path){const match=path.match(/^\/api\/master-list-favorites-v44\/([^/]+)$/);return match?decodeURIComponent(match[1]):''}
function jobAction(path){const match=path.match(/^\/api\/jobs-v44\/([^/]+)\/(retry|run)$/);return match?{id:decodeURIComponent(match[1]),action:match[2]}:null}
function isCatalogMutation(path,method){if(!['POST','PATCH','PUT','DELETE'].includes(method))return false;return /^\/api\/(products|categories|suppliers|cost-centers|locations)(\/|$)/.test(path)||path.startsWith('/api/catalog/import')}
async function delegateTracked(request,env,ctx,actor,{jobType,entityType='',entityId=''}){try{const response=await platformWorker.fetch(request,env,ctx);if(response.ok){const body=await payload(response);ctx?.waitUntil?.(recordCompletedJobV44(env,actor,{jobType,entityType,entityId,result:{status:response.status,ok:true,keys:Object.keys(body||{}).slice(0,12)}}).catch(()=>{}))}else ctx?.waitUntil?.(recordFailedJobV44(env,actor,{jobType,entityType,entityId,error:new Error(`HTTP ${response.status}`)}).catch(()=>{}));return response}catch(error){ctx?.waitUntil?.(recordFailedJobV44(env,actor,{jobType,entityType,entityId,error}).catch(()=>{}));throw error}}

export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname,statusMatch=masterStatus(path),recordMatch=masterRecord(path),userId=permissionUser(path),favoriteId=favorite(path),job=jobAction(path),batchEmit=routeMatch(path,'/api/order-batches/:id/emit'),orderReception=routeMatch(path,'/api/orders/:id/receptions'),approval=routeMatch(path,'/api/approvals/:id/resolve');try{
  if(method==='GET'&&path==='/health'){await prepare(env);const response=await platformWorker.fetch(request,env,ctx),base=await payload(response);return decorate(ok({...base,version:RELEASE_VERSION,procurementOsV44:true,canonicalMasterDataV44:true,masterDataEditingV44:true,masterListAssistV44:true,procurementIntelligenceV44:true,financePlanningV44:true,receptionEvidenceV44:true,granularPermissionsV44:true,jobQueueV44:true,observabilityV44:true,globalSearchV44:true,productionE2EContractV44:true},request,env),request,env)}
  if(method==='GET'&&path==='/api/procurement-os-v44/summary'){const actor=await auth(request,env);return decorate(ok({summary:await procurementOsSummaryV44(env,actor)},request,env),request,env)}
  if(method==='GET'&&path==='/api/master-data-v44'){const actor=await auth(request,env);return decorate(ok(await listMasterDataV44(env,actor,url),request,env),request,env)}
  if(statusMatch&&method==='PATCH'){const actor=await auth(request,env);await assertPermissionV44(env,actor,'catalog');return decorate(ok({item:await setMasterDataStatusV44(request,env,actor,statusMatch.entity,statusMatch.id)},request,env),request,env)}
  if(recordMatch&&method==='PATCH'){const actor=await auth(request,env);await assertPermissionV44(env,actor,'catalog');return decorate(ok({item:await updateMasterRecordV44(request,env,actor,recordMatch.entity,recordMatch.id)},request,env),request,env)}
  if(method==='POST'&&path==='/api/master-data-v44/bulk'){const actor=await auth(request,env);await assertPermissionV44(env,actor,'catalog');return decorate(ok(await bulkMasterDataV44(request,env,actor),request,env),request,env)}
  if(method==='POST'&&path==='/api/master-data-v44/merge'){const actor=await auth(request,env);await assertPermissionV44(env,actor,'catalog');return decorate(ok({merge:await mergeMasterDataV44(request,env,actor)},request,env),request,env)}
  if(method==='GET'&&path==='/api/master-list-assist-v44'){const actor=await auth(request,env);return decorate(ok({assist:await getMasterListAssistV44(env,actor,url)},request,env),request,env)}
  if(favoriteId&&method==='PATCH'){const actor=await auth(request,env);return decorate(ok({favorite:await setFavoriteV44(request,env,actor,favoriteId)},request,env),request,env)}
  if(method==='GET'&&path==='/api/procurement-intelligence-v44'){const actor=await auth(request,env);return decorate(ok({intelligence:await procurementIntelligenceV44(env,actor,url)},request,env),request,env)}
  if(method==='GET'&&path==='/api/finance-planning-v44'){const actor=await auth(request,env);return decorate(ok({planning:await financePlanningV44(env,actor,url)},request,env),request,env)}
  if(method==='GET'&&path==='/api/permissions-v44'){const actor=await auth(request,env);return decorate(ok({permissions:await listPermissionsV44(env,actor)},request,env),request,env)}
  if(userId&&method==='PUT'){const actor=await auth(request,env);return decorate(ok({permission:await upsertPermissionV44(request,env,actor,userId)},request,env),request,env)}
  if(method==='GET'&&path==='/api/my-permissions-v44'){const actor=await auth(request,env);return decorate(ok({permission:await getEffectivePermissionV44(env,actor)},request,env),request,env)}
  if(method==='POST'&&path==='/api/reception-evidence-v44'){const actor=await auth(request,env);return decorate(ok({evidence:await saveReceptionEvidenceV44(request,env,actor)},request,env),request,env)}
  if(method==='GET'&&path==='/api/reception-evidence-v44'){const actor=await auth(request,env);return decorate(ok({evidence:await listReceptionEvidenceV44(env,actor,url)},request,env),request,env)}
  if(method==='GET'&&path==='/api/jobs-v44'){const actor=await auth(request,env);return decorate(ok({jobs:await listJobsV44(env,actor,url)},request,env),request,env)}
  if(method==='POST'&&path==='/api/jobs-v44'){const actor=await auth(request,env);if(!['owner','admin'].includes(actor.role))throw new HttpError(403,'Solo administración puede crear trabajos','forbidden');const body=await request.clone().json().catch(()=>({}));return decorate(ok({job:await enqueueJobV44(env,actor,{jobType:body.jobType,entityType:body.entityType,entityId:body.entityId,payload:body.payload,maxAttempts:body.maxAttempts})},request,env),request,env)}
  if(job&&method==='POST'){const actor=await auth(request,env);const result=job.action==='retry'?await retryJobV44(request,env,actor,job.id):await runJobV44(request,env,actor,job.id);return decorate(ok({job:result},request,env),request,env)}
  if(method==='GET'&&path==='/api/system-health-v44'){const actor=await auth(request,env);return decorate(ok({health:await systemHealthV44(env,actor,{persist:false})},request,env),request,env)}
  if(method==='POST'&&path==='/api/system-health-v44/snapshot'){const actor=await auth(request,env);return decorate(ok({health:await systemHealthV44(env,actor,{persist:true})},request,env),request,env)}
  if(method==='GET'&&path==='/api/global-search-v44'){const actor=await auth(request,env);return decorate(ok(await globalSearchV44(env,actor,url),request,env),request,env)}

  if(isCatalogMutation(path,method)){const actor=await auth(request,env);await assertPermissionV44(env,actor,'catalog');return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(method==='POST'&&path==='/api/order-batches/v2'){const actor=await auth(request,env),body=await request.clone().json().catch(()=>({}));await assertPermissionV44(env,actor,'create',{locationId:String(body.locationId||''),costCenterId:String(body.costCenterId||'')});return decorate(await delegateTracked(request,env,ctx,actor,{jobType:'order_file_create',entityType:'order_batch'}),request,env)}
  if(batchEmit&&method==='POST'){const actor=await auth(request,env),context=await resolveBatchContextV44(env,actor,batchEmit.id);await assertPermissionV44(env,actor,'emit',context);return decorate(await delegateTracked(request,env,ctx,actor,{jobType:'pdf_emission',entityType:'order_batch',entityId:batchEmit.id}),request,env)}
  if(orderReception&&method==='POST'){const actor=await auth(request,env),context=await resolveOrderContextV44(env,actor,orderReception.id);await assertPermissionV44(env,actor,'receive',context);return decorate(await delegateTracked(request,env,ctx,actor,{jobType:'reconciliation_refresh',entityType:'order',entityId:orderReception.id}),request,env)}
  if(method==='POST'&&path==='/api/invoices/analyze'){const actor=await auth(request,env);return decorate(await delegateTracked(request,env,ctx,actor,{jobType:'invoice_analysis',entityType:'invoice'}),request,env)}
  if(method==='GET'&&path.startsWith('/api/finance/')){const actor=await auth(request,env);await assertPermissionV44(env,actor,'finance');return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(approval&&method==='POST'){const actor=await auth(request,env);await assertPermissionV44(env,actor,'approve');return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(path.startsWith('/api/'))await prepare(env);return decorate(await platformWorker.fetch(request,env,ctx),request,env)
}catch(error){return decorate(errorResponse(error,request,env),request,env)}}};
