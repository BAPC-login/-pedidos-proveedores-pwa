import platformWorker from './index-v40.js';
import {authenticate} from './auth.js';
import {ensureSchema} from './schema.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {ensureEnterpriseSchemaV41} from './api/schema-v41.js';
import {getDashboardAnalyticsV41} from './api/analytics-v41.js';
import {autoReconcileOrder} from './api/order-workflow.js';
import {listPaymentsCanonical,updatePaymentCanonical} from './api/payments.js';
import {
  addOrderCommentV41,
  assertBatchEmissionAllowedV41,
  closeReconciledOrdersV41,
  createInvoiceV41,
  createReceptionReturnV41,
  createReceptionV41,
  createSubstitutionV41,
  ensureApprovalsForBatchV41,
  getReceptionDifferenceReportV41,
  getSupplierPaymentTermsV41,
  globalSearchV41,
  listApprovalPoliciesV41,
  listApprovalsV41,
  listNotificationsV41,
  listOrderCollaborationV41,
  listOrderTemplatesV41,
  listPresenceV41,
  listReceptionWorkQueueV41,
  listSavedViewsV41,
  platformUsageV41,
  recordSupplierConfirmationV41,
  resolveApprovalV41,
  saveOrderTemplateV41,
  saveReportViewV41,
  supplierScorecardV41,
  syncLegacySupplierPaymentTermsV41,
  updateNotificationV41,
  updatePresenceV41,
  updateSupplierPaymentTermsV41,
  upsertApprovalPolicyV41,
  validateCommercialRulesV41
} from './api/operations-v41.js';

const VERSION='41';
const RELEASE_VERSION='2.0.0-alpha.41';
const rows=result=>result?.results||[];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
function decorate(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);headers.set('X-Nuvasto-Version',VERSION);headers.set('X-Nuvasto-Reporting-Period','reception-date-v41');headers.set('X-Nuvasto-Payment-Terms','normalized-v41');headers.set('X-Nuvasto-Enterprise-Suite','operations-finance-sync-v41');headers.set('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key,X-Bootstrap-Token,X-Pedidos-Client,X-Device-Id,X-Nuvasto-Device');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function prepare(env){await ensureSchema(env);await ensureEnterpriseSchemaV41(env)}
async function auth(request,env){await prepare(env);return authenticate(request,env)}
async function platformJson(response){if(!response.ok)return null;return response.clone().json().catch(()=>null)}
async function quickReceiveFromInvoice(request,env,actor,orderId,body,ctx){
  const order=await env.DB.prepare('SELECT id,status,revision FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order)return null;
  const pending=rows(await env.DB.prepare('SELECT id,quantity_ordered,quantity_received FROM order_items WHERE order_id=? ORDER BY sort_order').bind(orderId).all()).map(item=>({orderItemId:item.id,quantityAccepted:Math.max(0,Number(item.quantity_ordered||0)-Number(item.quantity_received||0)),quantityRejected:0})).filter(item=>item.quantityAccepted>0);
  if(!pending.length)return{alreadyReceived:true,orderId};
  const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
  const receptionDate=String(body.receptionDate||today());
  const synthetic=new Request(request.url,{method:'POST',headers,body:JSON.stringify({items:pending,receivedAt:receptionDate,deliveryNoteNumber:String(body.deliveryNoteNumber||''),notes:'Recepción registrada junto con la factura',historicalDateConfirmed:receptionDate<today(),expectedRevision:Number(order.revision||1),quickMode:true})});
  return createReceptionV41(synthetic,env,actor,orderId,ctx);
}

export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname,
  supplierTerms=routeMatch(path,'/api/suppliers/:id/payment-terms'),orderReception=routeMatch(path,'/api/orders/:id/receptions'),receptionReturn=routeMatch(path,'/api/receptions/:id/returns'),receptionReport=routeMatch(path,'/api/receptions/:id/difference-report'),payment=routeMatch(path,'/api/finance/payments/:id'),approval=routeMatch(path,'/api/approvals/:id/resolve'),orderCollaboration=routeMatch(path,'/api/orders/:id/collaboration'),orderComment=routeMatch(path,'/api/orders/:id/comments'),orderConfirmation=routeMatch(path,'/api/orders/:id/supplier-confirmation'),orderSubstitution=routeMatch(path,'/api/orders/:id/substitutions'),notification=routeMatch(path,'/api/notifications-v41/:id'),batchEmit=routeMatch(path,'/api/order-batches/:id/emit');
  try{
    if(method==='GET'&&path==='/health'){await prepare(env);const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));return decorate(ok({...payload,version:RELEASE_VERSION,reportingPeriodBasis:'reception_date',historicalReceptionEntry:true,normalizedSupplierPaymentTerms:true,paymentSchedule:true,paymentEvidence:true,paymentMethods:true,invoiceQuickReception:true,automaticOrderValidation:true,partialReceptionV41:true,receptionReturns:true,differenceReports:true,invoiceDuplicateGuard:true,invoiceMathValidation:true,creditNotes:true,invoiceLineSplits:true,approvalPolicies:true,supplierConfirmations:true,orderCollaboration:true,orderTemplates:true,persistentNotifications:true,savedReportViews:true,recordPresence:true,optimisticReceptionLocking:true,globalSearch:true,supplierScorecards:true,barcodeScanning:false,driverSignature:false},request,env),request,env)}
    if(method==='GET'&&path==='/api/dashboard/analytics-v41'){const actor=await auth(request,env);return decorate(ok({analytics:await getDashboardAnalyticsV41(env,actor,url)},request,env),request,env)}
    if(supplierTerms&&method==='GET'){const actor=await auth(request,env);return decorate(ok({paymentTerms:await getSupplierPaymentTermsV41(env,actor,supplierTerms.id)},request,env),request,env)}
    if(supplierTerms&&['PATCH','PUT'].includes(method)){const actor=await auth(request,env);return decorate(ok({paymentTerms:await updateSupplierPaymentTermsV41(request,env,actor,supplierTerms.id)},request,env),request,env)}
    if(orderReception&&method==='POST'){const actor=await auth(request,env),reception=await createReceptionV41(request,env,actor,orderReception.id,ctx),validation=await autoReconcileOrder(env,actor,orderReception.id);return decorate(ok({reception,validation},request,env),request,env)}
    if(method==='GET'&&path==='/api/receptions/work-queue'){const actor=await auth(request,env);return decorate(ok({orders:await listReceptionWorkQueueV41(env,actor,url)},request,env),request,env)}
    if(receptionReturn&&method==='POST'){const actor=await auth(request,env);return decorate(ok({event:await createReceptionReturnV41(request,env,actor,receptionReturn.id)},request,env),request,env)}
    if(receptionReport&&method==='GET'){const actor=await auth(request,env);return decorate(ok({report:await getReceptionDifferenceReportV41(env,actor,receptionReport.id)},request,env),request,env)}
    if(method==='POST'&&path==='/api/invoices'){
      const actor=await auth(request,env),body=await request.clone().json().catch(()=>({})),invoice=await createInvoiceV41(request,env,actor),orderIds=(body.orderIds||[]).map(String).filter(Boolean);let reception=null,receptionError='';
      if(body.markReceived&&orderIds.length===1){try{reception=await quickReceiveFromInvoice(request,env,actor,orderIds[0],body,ctx)}catch(error){receptionError=String(error?.message||error)}}
      const validation=[];for(const orderId of orderIds)validation.push({orderId,...await autoReconcileOrder(env,actor,orderId)});
      return decorate(ok({invoice,reception,receptionError,validation},request,env),request,env)
    }
    if(method==='GET'&&path==='/api/finance/payments'){const actor=await auth(request,env);return decorate(ok({payments:await listPaymentsCanonical(env,actor,url)},request,env),request,env)}
    if(payment&&method==='PATCH'){const actor=await auth(request,env);return decorate(ok({payment:await updatePaymentCanonical(request,env,actor,payment.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/approvals'){const actor=await auth(request,env);return decorate(ok({approvals:await listApprovalsV41(env,actor,url)},request,env),request,env)}
    if(approval&&method==='POST'){const actor=await auth(request,env);return decorate(ok({approval:await resolveApprovalV41(request,env,actor,approval.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/approval-policies'){const actor=await auth(request,env);return decorate(ok({policies:await listApprovalPoliciesV41(env,actor)},request,env),request,env)}
    if(method==='PUT'&&path==='/api/approval-policies'){const actor=await auth(request,env);return decorate(ok({policy:await upsertApprovalPolicyV41(request,env,actor)},request,env),request,env)}
    if(orderCollaboration&&method==='GET'){const actor=await auth(request,env);return decorate(ok(await listOrderCollaborationV41(env,actor,orderCollaboration.id),request,env),request,env)}
    if(orderComment&&method==='POST'){const actor=await auth(request,env);return decorate(ok({comment:await addOrderCommentV41(request,env,actor,orderComment.id)},request,env),request,env)}
    if(orderConfirmation&&method==='POST'){const actor=await auth(request,env);return decorate(ok({confirmation:await recordSupplierConfirmationV41(request,env,actor,orderConfirmation.id)},request,env),request,env)}
    if(orderSubstitution&&method==='POST'){const actor=await auth(request,env);return decorate(ok({substitution:await createSubstitutionV41(request,env,actor,orderSubstitution.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/order-templates'){const actor=await auth(request,env);return decorate(ok({templates:await listOrderTemplatesV41(env,actor)},request,env),request,env)}
    if(method==='POST'&&path==='/api/order-templates'){const actor=await auth(request,env);return decorate(ok({template:await saveOrderTemplateV41(request,env,actor)},request,env),request,env)}
    if(method==='GET'&&path==='/api/notifications-v41'){const actor=await auth(request,env);return decorate(ok({notifications:await listNotificationsV41(env,actor,url)},request,env),request,env)}
    if(notification&&method==='PATCH'){const actor=await auth(request,env);return decorate(ok({notification:await updateNotificationV41(request,env,actor,notification.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/report-views'){const actor=await auth(request,env);return decorate(ok({views:await listSavedViewsV41(env,actor,url)},request,env),request,env)}
    if(method==='POST'&&path==='/api/report-views'){const actor=await auth(request,env);return decorate(ok({view:await saveReportViewV41(request,env,actor)},request,env),request,env)}
    if(method==='GET'&&path==='/api/presence'){const actor=await auth(request,env);return decorate(ok({presence:await listPresenceV41(env,actor,url)},request,env),request,env)}
    if(method==='POST'&&path==='/api/presence'){const actor=await auth(request,env);return decorate(ok({presence:await updatePresenceV41(request,env,actor)},request,env),request,env)}
    if(method==='GET'&&path==='/api/global-search'){const actor=await auth(request,env);return decorate(ok(await globalSearchV41(env,actor,url),request,env),request,env)}
    if(method==='GET'&&path==='/api/supplier-scorecards'){const actor=await auth(request,env);return decorate(ok({scorecards:await supplierScorecardV41(env,actor,url)},request,env),request,env)}
    if(method==='POST'&&path==='/api/orders/close-reconciled'){const actor=await auth(request,env);return decorate(ok(await closeReconciledOrdersV41(request,env,actor),request,env),request,env)}
    if(method==='GET'&&path==='/api/platform/usage-v41'){const actor=await auth(request,env);return decorate(ok({usage:await platformUsageV41(env,actor)},request,env),request,env)}
    if(method==='POST'&&path==='/api/order-batches/v2'){const actor=await authenticate(request,env),commercial=await validateCommercialRulesV41(request,env,actor),response=await platformWorker.fetch(request,env,ctx);if(!response.ok)return decorate(response,request,env);const payload=await platformJson(response),batch=payload?.batch||payload?.orderFile||null,approvals=batch?await ensureApprovalsForBatchV41(env,actor,batch):[];return decorate(ok({...payload,commercialValidation:commercial,approvals},request,env),request,env)}
    if(batchEmit&&method==='POST'){const actor=await auth(request,env);await assertBatchEmissionAllowedV41(env,actor,batchEmit.id);return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
    if(method==='POST'&&path==='/api/suppliers'){const actor=await auth(request,env),body=await request.clone().json().catch(()=>({})),response=await platformWorker.fetch(request,env,ctx);if(!response.ok)return decorate(response,request,env);const payload=await platformJson(response),supplier=payload?.supplier;if(supplier?.id&&body.paymentTerms)payload.paymentTerms=await syncLegacySupplierPaymentTermsV41(env,actor,supplier.id,body.paymentTerms);return decorate(ok(payload||{},request,env),request,env)}
    if(path.startsWith('/api/'))await prepare(env);
    return decorate(await platformWorker.fetch(request,env,ctx),request,env)
  }catch(error){return decorate(errorResponse(error,request,env),request,env)}}};
