import platformWorker from './index-v40.js';
import {authenticate} from './auth.js';
import {ensureSchema} from './schema.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {ensureEnterpriseSchemaV41} from './api/schema-v41.js';
import {createReceptionV13} from './api/reception-v13.js';
import {getDashboardAnalyticsV41} from './api/analytics-v41.js';
import {listFinanceInvoicesV104,getInvoicePriceImpactV104} from './api/invoice-finance-v104.js';
import {autoReconcileOrder} from './api/order-workflow.js';
import {createPaymentMethodCanonical,listPaymentMethodsCanonical,listPaymentsCanonical,updatePaymentCanonical,updatePaymentMethodCanonical} from './api/payments.js';
import {createPaymentDocumentCanonical,createPaymentDocumentFromInvoiceCanonical,getPaymentDocumentCanonical,listCollectiveChequeScheduleCanonical,listPaymentCandidatesCanonical,listPaymentDocumentsCanonical,updatePaymentDocumentCanonical} from './api/payment-documents.js';
import {analyzePaymentProofCanonical} from './api/payment-proof-ai.js';
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
async function quickReceiveFromInvoice(request,env,actor,orderId,body,ctx,invoiceId=''){
  // Canonical invoice-led receiving. Never receive the entire pending order on
  // behalf of the user: only accepted/rejected amounts explicitly reviewed on
  // each invoice line become a receipt. Works for unrequested supplier products.
  const order=await env.DB.prepare('SELECT id,status,supplier_id FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order)return null;
  if(['received','reconciled','closed','cancelled'].includes(order.status))return{alreadyReceived:true,orderId};
  const orderItems=rows(await env.DB.prepare('SELECT id,product_id,quantity_ordered,quantity_received,units_per_order_unit FROM order_items WHERE order_id=? ORDER BY sort_order').bind(orderId).all());
  const byProduct=new Map(orderItems.filter(item=>item.product_id).map(item=>[String(item.product_id),item]));
  const grouped=new Map();
  for(const line of Array.isArray(body.lines)?body.lines:[]){
    const productId=String(line?.productId||'');
    if(!productId)continue;
    const physical=Math.max(0,Number(line?.units??line?.totalUnits??((Number(line?.packageQty??line?.invoiceQuantity??0)||0)*(Number(line?.packSize||1)||1)))||0);
    const accepted=Number(line?.receivedUnits??physical),rejected=Number(line?.rejectedUnits||0);
    if(!Number.isFinite(accepted)||!Number.isFinite(rejected)||accepted<0||rejected<0||accepted+rejected>physical+0.001)
      throw new Error('Cantidades de recepción inválidas respecto de la factura');
    if(accepted<=0&&rejected<=0)continue;
    const record=grouped.get(productId)||{productId,accepted:0,rejected:0,extra:false,supplierProductId:'',description:'',qualityType:'',qualityNote:'',lotNumber:'',expiresAt:null};
    record.accepted+=accepted;record.rejected+=rejected;
    record.extra=record.extra||line?.extraAccepted===true||(!byProduct.has(productId)&&rejected>0);
    record.supplierProductId=String(line?.supplierProductId||record.supplierProductId||'');
    record.description=String(line?.sourceDescription||line?.sourceLine||line?.description||record.description||'');
    record.qualityType=String(line?.qualityType||record.qualityType||'');
    record.qualityNote=String(line?.qualityNote||record.qualityNote||'');
    record.lotNumber=String(line?.lotNumber||record.lotNumber||'');
    record.expiresAt=line?.expiresAt||record.expiresAt||null;
    grouped.set(productId,record);
  }
  const items=[],extraItems=[];
  for(const record of grouped.values()){
    const matched=byProduct.get(record.productId);
    if(matched){
      const pack=Math.max(.001,Number(matched.units_per_order_unit||1));
      const remaining=Math.max(0,Number(matched.quantity_ordered||0)-Number(matched.quantity_received||0));
      const accepted=Number((record.accepted/pack).toFixed(3));
      const rejected=Number((record.rejected/pack).toFixed(3));
      if(accepted>remaining+.001&&record.qualityType!=='overage')throw new Error('La recepción supera lo pendiente en el pedido');
      items.push({orderItemId:matched.id,quantityAccepted:accepted,quantityRejected:rejected,
        rejectionReason:[record.qualityType,record.qualityNote].filter(Boolean).join(' · '),
        lotNumber:record.lotNumber,expiresAt:record.expiresAt});
    }else if(record.extra){
      extraItems.push({productId:record.productId,supplierProductId:record.supplierProductId,
        sourceInvoiceId:invoiceId||null,sourceDescription:record.description,
        quantityAccepted:Number(record.accepted.toFixed(3)),quantityRejected:Number(record.rejected.toFixed(3)),
        notes:['Producto fuera del pedido',record.qualityType,record.qualityNote].filter(Boolean).join(' · ')});
    }else throw new Error('Producto no solicitado requiere confirmación explícita del catálogo del proveedor');
  }
  if(!items.length&&!extraItems.length)throw new Error('No se confirmaron cantidades para la recepción');
  const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
  const receptionDate=String(body.receptionDate||today());
  const synthetic=new Request(request.url,{method:'POST',headers,body:JSON.stringify({
    items,extraItems,receivedAt:receptionDate,deliveryNoteNumber:String(body.deliveryNoteNumber||''),
    notes:'Recepción conciliada desde factura '+String(body.invoiceNumber||''),quickMode:true
  })});
  return createReceptionV13(synthetic,env,actor,orderId);
}
export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname,
  supplierTerms=routeMatch(path,'/api/suppliers/:id/payment-terms'),orderReception=routeMatch(path,'/api/orders/:id/receptions'),receptionReturn=routeMatch(path,'/api/receptions/:id/returns'),receptionReport=routeMatch(path,'/api/receptions/:id/difference-report'),payment=routeMatch(path,'/api/finance/payments/:id'),paymentMethod=routeMatch(path,'/api/finance/payment-methods/:id'),paymentDocument=routeMatch(path,'/api/finance/payment-documents/:id'),approval=routeMatch(path,'/api/approvals/:id/resolve'),orderCollaboration=routeMatch(path,'/api/orders/:id/collaboration'),orderComment=routeMatch(path,'/api/orders/:id/comments'),orderConfirmation=routeMatch(path,'/api/orders/:id/supplier-confirmation'),orderSubstitution=routeMatch(path,'/api/orders/:id/substitutions'),notification=routeMatch(path,'/api/notifications-v41/:id'),batchEmit=routeMatch(path,'/api/order-batches/:id/emit');
  try{
    if(method==='GET'&&path==='/health'){await prepare(env);const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));return decorate(ok({...payload,version:RELEASE_VERSION,reportingPeriodBasis:'reception_date',historicalReceptionEntry:true,normalizedSupplierPaymentTerms:true,paymentSchedule:true,paymentEvidence:true,paymentMethods:true,configurablePaymentMethods:true,chequeSchedule:true,invoiceChequeExtraction:true,paymentDocumentsV74:true,collectivePaymentAllocationV74:true,sameSupplierPaymentV74:true,invoiceQuickReception:true,automaticOrderValidation:true,partialReceptionV41:true,receptionReturns:true,differenceReports:true,invoiceDuplicateGuard:true,invoiceMathValidation:true,creditNotes:true,invoiceLineSplits:true,approvalPolicies:true,supplierConfirmations:true,orderCollaboration:true,orderTemplates:true,persistentNotifications:true,savedReportViews:true,recordPresence:true,optimisticReceptionLocking:true,globalSearch:true,supplierScorecards:true,barcodeScanning:false,driverSignature:false},request,env),request,env)}
    if(method==='GET'&&path==='/api/finance/invoice-register'){const actor=await auth(request,env);return decorate(ok(await listFinanceInvoicesV104(env,actor,url),request,env),request,env)}
    const invoicePriceMatch=routeMatch(path,'/api/invoices/:id/price-impact');
    if(method==='GET'&&invoicePriceMatch){const actor=await auth(request,env);return decorate(ok({impact:await getInvoicePriceImpactV104(env,actor,invoicePriceMatch.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/dashboard/analytics-v41'){const actor=await auth(request,env);return decorate(ok({analytics:await getDashboardAnalyticsV41(env,actor,url)},request,env),request,env)}
    if(supplierTerms&&method==='GET'){const actor=await auth(request,env);return decorate(ok({paymentTerms:await getSupplierPaymentTermsV41(env,actor,supplierTerms.id)},request,env),request,env)}
    if(supplierTerms&&['PATCH','PUT'].includes(method)){const actor=await auth(request,env);return decorate(ok({paymentTerms:await updateSupplierPaymentTermsV41(request,env,actor,supplierTerms.id)},request,env),request,env)}
    if(orderReception&&method==='POST'){const actor=await auth(request,env),reception=await createReceptionV41(request,env,actor,orderReception.id,ctx),validation=await autoReconcileOrder(env,actor,orderReception.id);return decorate(ok({reception,validation},request,env),request,env)}
    if(method==='GET'&&path==='/api/receptions/work-queue'){const actor=await auth(request,env);return decorate(ok({orders:await listReceptionWorkQueueV41(env,actor,url)},request,env),request,env)}
    if(receptionReturn&&method==='POST'){const actor=await auth(request,env);return decorate(ok({event:await createReceptionReturnV41(request,env,actor,receptionReturn.id)},request,env),request,env)}
    if(receptionReport&&method==='GET'){const actor=await auth(request,env);return decorate(ok({report:await getReceptionDifferenceReportV41(env,actor,receptionReport.id)},request,env),request,env)}
    if(method==='POST'&&path==='/api/invoices'){
      const actor=await auth(request,env),body=await request.clone().json().catch(()=>({})),invoice=await createInvoiceV41(request,env,actor),orderIds=(body.orderIds||[]).map(String).filter(Boolean);let reception=null,receptionError='',paymentResult=null;
      if(body.payment){paymentResult=await createPaymentDocumentFromInvoiceCanonical(env,actor,invoice.id,body.payment,request)}
      if(body.markReceived&&orderIds.length===1){try{reception=await quickReceiveFromInvoice(request,env,actor,orderIds[0],body,ctx,invoice.id)}catch(error){receptionError=String(error?.message||error)}}
      const validation=[];for(const orderId of orderIds)validation.push({orderId,...await autoReconcileOrder(env,actor,orderId)});
      return decorate(ok({invoice,payment:paymentResult,reception,receptionError,extraReceivedCount:Number(reception?.extraItemCount||0),receptionSource:reception?.id?'invoice':null,validation},request,env),request,env)
    }
    if(method==='GET'&&path==='/api/finance/payment-methods'){const actor=await auth(request,env);return decorate(ok({methods:await listPaymentMethodsCanonical(env,actor,url)},request,env),request,env)}
    if(method==='POST'&&path==='/api/finance/payment-methods'){const actor=await auth(request,env);return decorate(ok({method:await createPaymentMethodCanonical(request,env,actor)},request,env),request,env)}
    if(paymentMethod&&method==='PATCH'){const actor=await auth(request,env);return decorate(ok({method:await updatePaymentMethodCanonical(request,env,actor,paymentMethod.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/finance/payment-candidates'){const actor=await auth(request,env);return decorate(ok(await listPaymentCandidatesCanonical(env,actor,url),request,env),request,env)}
    if(method==='POST'&&path==='/api/finance/payment-proof-analysis'){const actor=await auth(request,env),body=await request.json().catch(()=>({}));return decorate(ok({analysis:await analyzePaymentProofCanonical(env,actor,body.fileId)},request,env),request,env)}
    if(method==='GET'&&path==='/api/finance/payment-documents'){const actor=await auth(request,env);return decorate(ok({documents:await listPaymentDocumentsCanonical(env,actor,url)},request,env),request,env)}
    if(method==='POST'&&path==='/api/finance/payment-documents'){const actor=await auth(request,env);return decorate(ok({document:await createPaymentDocumentCanonical(request,env,actor)},request,env),request,env)}
    if(paymentDocument&&method==='GET'){const actor=await auth(request,env);return decorate(ok({document:await getPaymentDocumentCanonical(env,actor,paymentDocument.id)},request,env),request,env)}
    if(paymentDocument&&method==='PATCH'){const actor=await auth(request,env);return decorate(ok({document:await updatePaymentDocumentCanonical(request,env,actor,paymentDocument.id)},request,env),request,env)}
    if(method==='GET'&&path==='/api/finance/cheques'){const actor=await auth(request,env);return decorate(ok({cheques:await listCollectiveChequeScheduleCanonical(env,actor,url)},request,env),request,env)}
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
