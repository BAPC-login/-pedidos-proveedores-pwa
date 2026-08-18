import platformWorker from './index-v39.js';
import {authenticate} from './auth.js';
import {HttpError,corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {getDashboardAnalyticsV40} from './api/analytics-v40.js';
import {createOrderFileV40,emitOrderBatchV40} from './api/operations-v40.js';
import {migrateLegacyFoliosV67,withFolioWriteLockV34} from './api/folio-integrity-v34.js';
import {listOrdersCanonical} from './api/orders-query.js';
import {getOrder} from './api/orders.js';
import {createReceptionV13} from './api/reception-v13.js';

const VERSION='40';
const RELEASE_VERSION='2.0.0-alpha.40';
const rows=result=>result?.results||[];
let releaseDataPromise=null;
function decorate(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);headers.set('X-Nuvasto-Version',VERSION);headers.set('X-Nuvasto-Dashboard','filtered-professional-v40');headers.set('X-Nuvasto-Reception','professional-v40');headers.set('X-Nuvasto-Folio-Allocation','scoped-sequence-v67');headers.set('X-Nuvasto-Orders-Query','canonical-cursor-v80-ledger');headers.set('X-Nuvasto-Draft-Save','lock-free-v69');headers.set('X-Nuvasto-Closure-Rule','reception-only-v79');headers.set('X-Nuvasto-Order-Delete','draft-only-v80');headers.set('X-Nuvasto-Payment-Queue','actionable-only-v80');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function prepareOrders(){return null}
async function ensureReleaseDataV67(env){if(releaseDataPromise)return releaseDataPromise;releaseDataPromise=(async()=>{const organizations=rows(await env.DB.prepare('SELECT id FROM organizations ORDER BY created_at,id').all()),results=[];for(const organization of organizations){const migration=await withFolioWriteLockV34(env,organization.id,()=>migrateLegacyFoliosV67(env,organization.id));results.push({orgId:organization.id,...migration})}const migrated=results.reduce((sum,item)=>sum+Number(item.migrated||0),0),skipped=results.reduce((sum,item)=>sum+Number(item.skipped||0),0);return{ready:skipped===0,organizations:results.length,migrated,skipped,results}})().catch(error=>{releaseDataPromise=null;throw error});return releaseDataPromise}
async function schemaStatusV67(env){try{const[ordersInfo,tablesResult]=await Promise.all([env.DB.prepare('PRAGMA table_info(orders)').all(),env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('order_cost_centers','invoice_order_links','payment_schedules','notification_events')").all()]),columns=new Set(rows(ordersInfo).map(item=>item.name)),tables=new Set(rows(tablesResult).map(item=>item.name)),requiredColumns=['batch_id','emitted_at','closed_at'],requiredTables=['order_cost_centers','invoice_order_links','payment_schedules','notification_events'],missingColumns=requiredColumns.filter(name=>!columns.has(name)),missingTables=requiredTables.filter(name=>!tables.has(name));return{ready:!missingColumns.length&&!missingTables.length,missingColumns,missingTables,costCenterSource:'order_cost_centers'}}catch(error){return{ready:false,error:String(error?.message||error),missingColumns:[],missingTables:[]}}}

async function enforceClosure(env,actor,request,orderId){
  const body=await request.clone().json().catch(()=>({}));
  if(String(body.status||'')!=='closed')return;
  const order=await env.DB.prepare('SELECT status,folio FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order)throw new HttpError(404,'Pedido no encontrado','not_found');
  const reception=await env.DB.prepare("SELECT id FROM receptions WHERE order_id=? AND org_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1").bind(orderId,actor.orgId).first();
  if(!reception)throw new HttpError(409,`Antes de cerrar ${order.folio} debes registrar al menos una recepción.`,'reception_required',{status:order.status});
}
async function enforceDraftDelete(env,actor,orderId){
  const order=await env.DB.prepare('SELECT status,folio FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order)throw new HttpError(404,'Pedido no encontrado','not_found');
  if(String(order.status)!=='draft')throw new HttpError(409,`El pedido ${order.folio} ya fue emitido y no puede eliminarse. Anúlalo para conservar el folio y la trazabilidad.`,'issued_order_must_cancel',{status:order.status});
}
function requestWithBody(request,body){const headers=new Headers(request.headers);headers.set('Content-Type','application/json');return new Request(request.url,{method:'POST',headers,body:JSON.stringify(body)})}
function responseWithPayload(response,payload){const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers})}
function invoiceUnits(lines=[]){const totals=new Map();for(const line of lines){const productId=String(line?.productId||'');if(!productId)continue;const packageQuantity=Number(line?.packageQty??line?.invoiceQuantity??0),packSize=Number(line?.packSize??1),quantity=Number(line?.units??line?.totalUnits??(packageQuantity*packSize))||0;if(quantity<=0)continue;totals.set(productId,(totals.get(productId)||0)+quantity)}return totals}
async function receiveFromInvoice(request,env,actor,body){
  const orderIds=[...new Set((Array.isArray(body.orderIds)?body.orderIds:[]).map(String).filter(Boolean))];
  if(!orderIds.length)throw new HttpError(400,'La factura no tiene un pedido asociado para recepcionar','missing_order');
  const available=invoiceUnits(Array.isArray(body.lines)?body.lines:[]),receptions=[];
  for(const orderId of orderIds){
    const order=await getOrder(env,actor,orderId);
    if(['closed','cancelled'].includes(String(order.status||'')))continue;
    const items=[];
    for(const item of order.items||[]){
      const productId=String(item.productId||''),remaining=Math.max(0,Number(item.quantityOrdered||0)-Number(item.quantityReceived||0)),pack=Math.max(.001,Number(item.unitsPerOrderUnit||1)),units=Number(available.get(productId)||0);
      if(!productId||remaining<=0||units<=0)continue;
      const accepted=Math.min(remaining,units/pack);
      if(accepted<=0)continue;
      items.push({orderItemId:item.id,quantityAccepted:Number(accepted.toFixed(3)),quantityRejected:0,rejectionReason:'',lotNumber:'',expiresAt:null});
      available.set(productId,Math.max(0,units-(accepted*pack)));
    }
    if(!items.length)continue;
    const receivedAt=body.receptionDate?`${String(body.receptionDate).slice(0,10)}T12:00:00.000Z`:undefined;
    const receptionRequest=requestWithBody(request,{items,receivedAt,notes:`Recepción generada desde documento ${String(body.invoiceNumber||'').trim()}`});
    receptions.push(await createReceptionV13(receptionRequest,env,actor,orderId));
  }
  if(!receptions.length)throw new HttpError(409,'La factura no contiene cantidades vinculadas pendientes para recepcionar','invoice_reception_empty');
  return receptions;
}
async function actionablePaymentIds(env,actor){
  const result=await env.DB.prepare(`
    SELECT ps.id
    FROM payment_schedules ps
    LEFT JOIN (
      SELECT pa.invoice_id,COALESCE(SUM(pa.allocated_amount),0) AS covered
      FROM payment_allocations pa JOIN payment_documents pd ON pd.id=pa.payment_document_id AND pd.org_id=pa.org_id
      WHERE pa.org_id=? AND pd.status NOT IN ('disputed','cancelled')
      GROUP BY pa.invoice_id
    ) coverage ON coverage.invoice_id=ps.invoice_id
    WHERE ps.org_id=? AND ps.status NOT IN ('paid','disputed') AND COALESCE(coverage.covered,0)<COALESCE(ps.amount,0)
  `).bind(actor.orgId,actor.orgId).all();
  return new Set(rows(result).map(item=>String(item.id)));
}
async function filterDefaultPayments(response,env,actor){
  if(!response.ok)return response;
  const payload=await response.clone().json().catch(()=>null);if(!payload||!Array.isArray(payload.payments))return response;
  const ids=await actionablePaymentIds(env,actor);payload.payments=payload.payments.filter(item=>ids.has(String(item.id)));
  return responseWithPayload(response,payload);
}
async function createCanonicalBatchFromLegacy(request,env,actor,{single=false}={}){const body=await request.clone().json().catch(()=>({})),canonical=requestWithBody(request,{...body,deliveryMode:body.deliveryMode||'all'}),created=await createOrderFileV40(canonical,env,actor);if(single){const id=created.orders?.[0]?.id;if(!id)throw new HttpError(500,'No se pudo crear el borrador','order_creation_failed');return{order:await getOrder(env,actor,id),batchId:created.batchId,foliosAssignedOnEmission:true}}if(body.saveAsDraft===true)return created;const emitted=await withFolioWriteLockV34(env,actor.orgId,async()=>{await migrateLegacyFoliosV67(env,actor.orgId);return emitOrderBatchV40(requestWithBody(request,{}),env,actor,created.batchId,null)});return{...created,...emitted,status:'requested',publicState:'emitted',foliosAssignedOnEmission:true}}
async function canonicalOrderDetail(env,actor,orderId){await prepareOrders(env,actor);const[order,meta,alias,center]=await Promise.all([getOrder(env,actor,orderId),env.DB.prepare('SELECT batch_id,emitted_at,closed_at FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first(),env.DB.prepare('SELECT legacy_folio FROM order_folio_aliases WHERE org_id=? AND order_id=?').bind(actor.orgId,orderId).first(),env.DB.prepare('SELECT cost_center_id FROM order_cost_centers WHERE org_id=? AND order_id=?').bind(actor.orgId,orderId).first()]);return{...order,batchId:meta?.batch_id||'',emittedAt:meta?.emitted_at||null,closedAt:meta?.closed_at||null,costCenterId:order.costCenterId||center?.cost_center_id||'',legacyFolio:alias?.legacy_folio||''}}
export default{async fetch(request,env,ctx){const url=new URL(request.url),method=request.method.toUpperCase(),emit=routeMatch(url.pathname,'/api/order-batches/:id/emit'),transition=routeMatch(url.pathname,'/api/orders/:id/transition'),orderDetail=routeMatch(url.pathname,'/api/orders/:id');try{
  if(method==='GET'&&url.pathname==='/health'){const response=await platformWorker.fetch(request,env,ctx),payload=await response.clone().json().catch(()=>({}));if(!response.ok)return decorate(response,request,env);const[schema,migration]=await Promise.all([schemaStatusV67(env),ensureReleaseDataV67(env)]);return decorate(ok({...payload,version:RELEASE_VERSION,professionalDashboardVersion:40,stripedOperationalLists:true,interactiveSupplierMatrix:true,notificationCenter:true,professionalReceptionVersion:40,folioAssignedOnEmission:true,simultaneousDeviceSafety:true,scopedHistoricalFoliosV67:true,cursorOrdersV67:true,reconciliationRequiredForClosure:false,receptionRequiredForClosure:true,invoiceRequiredForClosure:false,paymentRequiredForClosure:false,invoiceReceptionV79:true,issuedOrderDeleteProtectedV80:true,actionablePaymentQueueV80:true,paymentLedgerOrderStateV80:true,legacyDateFoliosRetired:true,canonicalOrderDetailV67:true,readOnlyOrderQueriesV68:true,durableMasterDraftV69:true,draftSaveNoFolioLockV69:true,folioMigrationV67:migration.ready,folioMigrationDetails:migration,ordersSchemaV67:schema.ready,ordersSchemaDetails:schema},request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/dashboard/analytics-v40'){const actor=await authenticate(request,env);return decorate(ok({analytics:await getDashboardAnalyticsV40(env,actor,url)},request,env),request,env)}
  if(method==='POST'&&url.pathname==='/api/orders'){const actor=await authenticate(request,env);return decorate(ok(await createCanonicalBatchFromLegacy(request,env,actor,{single:true}),request,env),request,env)}
  if(method==='POST'&&url.pathname==='/api/order-batches'){const actor=await authenticate(request,env);return decorate(ok({batch:await createCanonicalBatchFromLegacy(request,env,actor)},request,env),request,env)}
  if(method==='POST'&&url.pathname==='/api/order-batches/v2'){const actor=await authenticate(request,env);return decorate(ok({batch:await createOrderFileV40(request,env,actor)},request,env),request,env)}
  if(emit&&method==='POST'){const actor=await authenticate(request,env);const result=await withFolioWriteLockV34(env,actor.orgId,async()=>{await migrateLegacyFoliosV67(env,actor.orgId);return emitOrderBatchV40(request,env,actor,emit.id,ctx)});return decorate(ok(result,request,env),request,env)}
  if(transition&&method==='POST'){const actor=await authenticate(request,env);await enforceClosure(env,actor,request,transition.id);return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(method==='POST'&&url.pathname==='/api/invoices'){
    const actor=await authenticate(request,env),body=await request.clone().json().catch(()=>({})),response=await platformWorker.fetch(request,env,ctx);
    if(!response.ok||body.markReceived!==true)return decorate(response,request,env);
    const payload=await response.clone().json().catch(()=>({}));
    try{payload.receptions=await receiveFromInvoice(request,env,actor,body);payload.reception=payload.receptions[0]||null;payload.receptionSource='invoice'}catch(error){payload.receptionError=String(error?.message||error);payload.receptionErrorCode=error?.code||'invoice_reception_failed'}
    return decorate(responseWithPayload(response,payload),request,env);
  }
  if(orderDetail&&method==='DELETE'){const actor=await authenticate(request,env);await enforceDraftDelete(env,actor,orderDetail.id);return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(orderDetail&&method==='GET'){const actor=await authenticate(request,env);return decorate(ok({order:await canonicalOrderDetail(env,actor,orderDetail.id)},request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/orders/advanced'){const actor=await authenticate(request,env);await prepareOrders(env,actor);return decorate(ok(await listOrdersCanonical(env,actor,url),request,env),request,env)}
  if(method==='GET'&&url.pathname==='/api/orders'){const actor=await authenticate(request,env);await prepareOrders(env,actor);return decorate(await platformWorker.fetch(request,env,ctx),request,env)}
  if(method==='GET'&&url.pathname==='/api/finance/payments'&&!url.searchParams.has('status')){const actor=await authenticate(request,env);const response=await platformWorker.fetch(request,env,ctx);return decorate(await filterDefaultPayments(response,env,actor),request,env)}
  return decorate(await platformWorker.fetch(request,env,ctx),request,env)
}catch(error){return decorate(errorResponse(error,request,env),request,env)}}};
