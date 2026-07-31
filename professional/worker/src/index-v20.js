import platformWorker from './index-v19.js';
import {authenticate} from './auth.js';
import {accessSsoStatus,loginWithCloudflareAccess} from './access-sso-v20.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {emitOrderBatchV13} from './api/workflow-v13.js';
import {
  decideApprovalV20,
  emitOrderBatchWithApprovalV20,
  getApprovalPolicyV20,
  getBrandWorkspaceV20,
  getSecuritySettingsV20,
  listAlertRulesV20,
  listApprovalRequestsV20,
  listConnectorsV20,
  prepareExternalOrderV20,
  professionalOverviewV20,
  reconciliationQueueV20,
  runStorageProbeV20,
  saveAlertRuleV20,
  saveApprovalPolicyV20,
  saveBrandWorkspaceV20,
  saveConnectorV20,
  saveSecuritySettingsV20,
  testConnectorV20
} from './api/professional-v20.js';

function addHeaders(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function healthV20(request,env,ctx){const response=await platformWorker.fetch(request,env,ctx);if(!response.ok)return response;const payload=await response.clone().json().catch(()=>({})),sso=accessSsoStatus(env);return addHeaders(ok({...payload,version:'2.0.0-alpha.20',schemaTarget:20,storageFallback:env.FILES?'r2':'d1-chunks-temporary',r2Ready:Boolean(env.FILES),r2SubscriptionRequiredToBind:true,cloudflareAccessSso:sso.configured,cloudflareAccessTeamDomain:sso.teamDomain,googleIdentityProviderReady:sso.configured,approvalWorkflow:true,supplierConnectorCenter:true,officialApiRequiredForAutomaticPurchase:true,assistedPortalOrders:true,operationalAlerts:true,reconciliationQueue:true,brandWorkspace:true,securityCenter:true,professionalSuiteV20:true},request,env),request,env)}

export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname;
  if(method==='GET'&&path==='/health')return healthV20(request,env,ctx);
  try{
    if(method==='POST'&&path==='/api/auth/access'){await ensureSchema(env);return addHeaders(ok(await loginWithCloudflareAccess(request,env),request,env),request,env)}
    const approvalDecision=routeMatch(path,'/api/professional/approvals/:id/decision'),connectorTest=routeMatch(path,'/api/professional/connectors/:id/test'),connectorPrepare=routeMatch(path,'/api/professional/connectors/:id/orders/:orderId/prepare'),alertRule=routeMatch(path,'/api/professional/alerts/:id'),batchEmit=routeMatch(path,'/api/order-batches/:id/emit');
    const professional=path==='/api/professional'||path.startsWith('/api/professional/');
    if(!professional&&!(batchEmit&&method==='POST'))return platformWorker.fetch(request,env,ctx);
    await ensureSchema(env);const actor=await authenticate(request,env);let payload;
    if(batchEmit&&method==='POST')payload=await emitOrderBatchWithApprovalV20(request,env,actor,batchEmit.id,ctx,emitOrderBatchV13);
    else if(path==='/api/professional'&&method==='GET')payload=await professionalOverviewV20(env,actor);
    else if(path==='/api/professional/storage/probe'&&method==='POST')payload={run:await runStorageProbeV20(request,env,actor)};
    else if(path==='/api/professional/approval-policy'&&method==='GET')payload={policy:await getApprovalPolicyV20(env,actor)};
    else if(path==='/api/professional/approval-policy'&&method==='PUT')payload={policy:await saveApprovalPolicyV20(request,env,actor)};
    else if(path==='/api/professional/approvals'&&method==='GET')payload={requests:await listApprovalRequestsV20(env,actor)};
    else if(approvalDecision&&method==='POST')payload={request:await decideApprovalV20(request,env,actor,approvalDecision.id)};
    else if(path==='/api/professional/connectors'&&method==='GET')payload={connectors:await listConnectorsV20(env,actor)};
    else if(path==='/api/professional/connectors'&&method==='POST')payload={connector:await saveConnectorV20(request,env,actor)};
    else if(connectorTest&&method==='POST')payload={result:await testConnectorV20(request,env,actor,connectorTest.id)};
    else if(connectorPrepare&&method==='POST')payload={attempt:await prepareExternalOrderV20(request,env,actor,connectorPrepare.id,connectorPrepare.orderId)};
    else if(path==='/api/professional/security'&&method==='GET')payload={settings:await getSecuritySettingsV20(env,actor)};
    else if(path==='/api/professional/security'&&method==='PUT')payload={settings:await saveSecuritySettingsV20(request,env,actor)};
    else if(path==='/api/professional/alerts'&&method==='GET')payload={rules:await listAlertRulesV20(env,actor)};
    else if(alertRule&&method==='PATCH')payload={rule:await saveAlertRuleV20(request,env,actor,alertRule.id)};
    else if(path==='/api/professional/reconciliation'&&method==='GET')payload=await reconciliationQueueV20(env,actor);
    else if(path==='/api/professional/brand'&&method==='GET')payload={brand:await getBrandWorkspaceV20(env,actor)};
    else if(path==='/api/professional/brand'&&method==='PUT')payload={brand:await saveBrandWorkspaceV20(request,env,actor)};
    else throw new Error('Ruta profesional v20 no implementada');
    return addHeaders(ok(payload,request,env),request,env)
  }catch(error){if(Number(error?.status||500)>=500)console.error('v20_request_failed',error);return addHeaders(errorResponse(error,request,env),request,env)}
}};
