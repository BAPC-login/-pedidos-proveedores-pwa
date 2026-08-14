import {HttpError,ROLES,assertMinimumRole,nowIso,optionalText,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
const DOCUMENT_STATUSES=new Set(['pending','scheduled','paid','disputed','cancelled']);
const cleanDate=value=>{const text=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:''};
const cleanStatus=(value,fallback='pending')=>DOCUMENT_STATUSES.has(String(value||''))?String(value):fallback;
const number=value=>Math.max(0,Math.round(Number(value||0)));

async function paymentMethod(env,actor,{id='',code='',kind='',activeOnly=false}={}){
  let item=null;
  if(id)item=await env.DB.prepare(`SELECT * FROM payment_methods WHERE id=? AND org_id=? ${activeOnly?'AND active=1':''}`).bind(id,actor.orgId).first();
  if(!item&&code)item=await env.DB.prepare(`SELECT * FROM payment_methods WHERE org_id=? AND code=? ${activeOnly?'AND active=1':''} ORDER BY active DESC LIMIT 1`).bind(actor.orgId,String(code)).first();
  if(!item&&kind)item=await env.DB.prepare(`SELECT * FROM payment_methods WHERE org_id=? AND kind=? ${activeOnly?'AND active=1':''} ORDER BY active DESC,sort_order,name LIMIT 1`).bind(actor.orgId,String(kind)).first();
  return item;
}

async function ensureInvoiceSchedule(env,actor,invoiceId){
  let schedule=await env.DB.prepare('SELECT * FROM payment_schedules WHERE invoice_id=? AND org_id=?').bind(invoiceId,actor.orgId).first();
  if(schedule)return schedule;
  const invoice=await env.DB.prepare('SELECT id,supplier_id,invoice_date,reporting_date,due_date,gross_total,payment_status FROM invoices WHERE id=? AND org_id=?').bind(invoiceId,actor.orgId).first();
  if(!invoice)throw new HttpError(404,'Factura no encontrada','invoice_not_found');
  const base=cleanDate(invoice.reporting_date)||cleanDate(invoice.invoice_date)||today(),due=cleanDate(invoice.due_date)||base,stamp=nowIso(),id=uuid();
  await env.DB.prepare('INSERT OR IGNORE INTO payment_schedules(id,org_id,invoice_id,supplier_id,base_date,due_date,amount,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,actor.orgId,invoice.id,invoice.supplier_id,base,due,number(invoice.gross_total),String(invoice.payment_status||'')==='paid'?'paid':'pending',stamp,stamp).run();
  schedule=await env.DB.prepare('SELECT * FROM payment_schedules WHERE invoice_id=? AND org_id=?').bind(invoiceId,actor.orgId).first();
  return schedule;
}

async function allocatedForInvoice(env,actor,invoiceId,{excludeDocumentId=''}={}){
  const item=await env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN pd.status NOT IN ('disputed','cancelled') THEN pa.allocated_amount ELSE 0 END),0) assigned,
    COALESCE(SUM(CASE WHEN pd.status='paid' THEN pa.allocated_amount ELSE 0 END),0) paid,
    COALESCE(SUM(CASE WHEN pd.status='scheduled' THEN pa.allocated_amount ELSE 0 END),0) scheduled
    FROM payment_allocations pa JOIN payment_documents pd ON pd.id=pa.payment_document_id AND pd.org_id=pa.org_id
    WHERE pa.org_id=? AND pa.invoice_id=? AND (?='' OR pd.id<>?)`).bind(actor.orgId,invoiceId,excludeDocumentId,excludeDocumentId).first();
  return{assigned:number(item?.assigned),paid:number(item?.paid),scheduled:number(item?.scheduled)};
}

async function refreshInvoicePaymentState(env,actor,invoiceId){
  const schedule=await ensureInvoiceSchedule(env,actor,invoiceId),totals=await allocatedForInvoice(env,actor,invoiceId),amount=number(schedule.amount);
  let status='pending';
  if(amount>0&&totals.paid>=amount)status='paid';
  else if(amount>0&&totals.paid+totals.scheduled>=amount)status='scheduled';
  const stamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE payment_schedules SET status=?,paid_amount=?,updated_at=? WHERE id=? AND org_id=?').bind(status,Math.min(amount,totals.paid),stamp,schedule.id,actor.orgId),
    env.DB.prepare('UPDATE invoices SET payment_status=?,updated_at=? WHERE id=? AND org_id=?').bind(status,stamp,invoiceId,actor.orgId)
  ]);
  return{status,amount,assigned:totals.assigned,paid:totals.paid,scheduled:totals.scheduled,outstanding:Math.max(0,amount-totals.assigned)};
}

async function supplierForScope(env,actor,{supplierId='',orderId=''}={}){
  if(supplierId){const supplier=await env.DB.prepare('SELECT id,name FROM suppliers WHERE id=? AND org_id=?').bind(supplierId,actor.orgId).first();if(!supplier)throw new HttpError(404,'Proveedor no encontrado','supplier_not_found');return supplier}
  if(orderId){
    let supplier=await env.DB.prepare(`SELECT DISTINCT i.supplier_id id,s.name FROM invoice_order_links iol JOIN invoices i ON i.id=iol.invoice_id AND i.org_id=iol.org_id JOIN suppliers s ON s.id=i.supplier_id AND s.org_id=i.org_id WHERE iol.org_id=? AND iol.order_id=? LIMIT 1`).bind(actor.orgId,orderId).first();
    if(!supplier){try{supplier=await env.DB.prepare('SELECT o.supplier_id id,s.name FROM orders o JOIN suppliers s ON s.id=o.supplier_id AND s.org_id=o.org_id WHERE o.id=? AND o.org_id=?').bind(orderId,actor.orgId).first()}catch{supplier=null}}
    if(!supplier)throw new HttpError(404,'El pedido todavía no tiene facturas de proveedor disponibles para pago','payment_scope_without_supplier');
    return supplier;
  }
  return null;
}

async function candidateInvoices(env,actor,supplierId,scopeOrderId=''){
  const result=await env.DB.prepare(`SELECT ps.id schedule_id,ps.amount,ps.status schedule_status,ps.due_date,
    i.id invoice_id,i.invoice_number,i.invoice_date,i.document_type,i.gross_total,i.payment_status,
    GROUP_CONCAT(DISTINCT iol.order_id) order_ids,GROUP_CONCAT(DISTINCT o.folio) order_folios
    FROM payment_schedules ps JOIN invoices i ON i.id=ps.invoice_id AND i.org_id=ps.org_id
    LEFT JOIN invoice_order_links iol ON iol.invoice_id=i.id AND iol.org_id=i.org_id
    LEFT JOIN orders o ON o.id=iol.order_id AND o.org_id=iol.org_id
    WHERE ps.org_id=? AND ps.supplier_id=?
    GROUP BY ps.id ORDER BY ps.due_date ASC,i.invoice_date ASC,i.invoice_number COLLATE NOCASE`).bind(actor.orgId,supplierId).all();
  const output=[];
  for(const item of rows(result)){
    const allocation=await allocatedForInvoice(env,actor,item.invoice_id),amount=number(item.amount||item.gross_total),orderIds=String(item.order_ids||'').split(',').filter(Boolean),orderFolios=String(item.order_folios||'').split(',').filter(Boolean),outstanding=Math.max(0,amount-allocation.assigned);
    output.push({scheduleId:item.schedule_id,invoiceId:item.invoice_id,invoiceNumber:item.invoice_number,invoiceDate:item.invoice_date,documentType:item.document_type,dueDate:item.due_date,amount,assignedAmount:allocation.assigned,paidAmount:allocation.paid,scheduledAmount:allocation.scheduled,outstandingAmount:outstanding,paymentStatus:item.payment_status||item.schedule_status||'pending',orderIds,orderFolios,linkedToScopeOrder:Boolean(scopeOrderId&&orderIds.includes(scopeOrderId))});
  }
  return output;
}

export async function listPaymentCandidatesCanonical(env,actor,url){
  assertMinimumRole(actor.role,ROLES.FINANCE);
  const supplierId=String(url.searchParams.get('supplierId')||'').trim(),orderId=String(url.searchParams.get('orderId')||'').trim();
  if(!supplierId&&!orderId){
    const result=await env.DB.prepare(`SELECT s.id,s.name,COUNT(DISTINCT ps.invoice_id) invoice_count,SUM(ps.amount) scheduled_total
      FROM payment_schedules ps JOIN suppliers s ON s.id=ps.supplier_id AND s.org_id=ps.org_id
      WHERE ps.org_id=? GROUP BY s.id,s.name ORDER BY s.name COLLATE NOCASE`).bind(actor.orgId).all(),suppliers=[];
    for(const item of rows(result)){const invoices=await candidateInvoices(env,actor,item.id),outstanding=invoices.reduce((sum,row)=>sum+row.outstandingAmount,0);if(outstanding>0)suppliers.push({id:item.id,name:item.name,invoiceCount:invoices.filter(row=>row.outstandingAmount>0).length,outstandingAmount:outstanding})}
    return{suppliers};
  }
  const supplier=await supplierForScope(env,actor,{supplierId,orderId}),invoices=await candidateInvoices(env,actor,supplier.id,orderId);
  return{supplier,scopeOrderId:orderId,invoices};
}

async function documentHeader(env,actor,id){
  return env.DB.prepare(`SELECT pd.*,s.name supplier_name,pm.kind payment_method_kind,pm.requirements_json payment_method_requirements,
    f.storage_key proof_key,f.file_name proof_name,f.content_type proof_content_type
    FROM payment_documents pd JOIN suppliers s ON s.id=pd.supplier_id AND s.org_id=pd.org_id
    LEFT JOIN payment_methods pm ON pm.id=pd.payment_method_id AND pm.org_id=pd.org_id
    LEFT JOIN files f ON f.id=pd.proof_file_id AND f.org_id=pd.org_id
    WHERE pd.id=? AND pd.org_id=?`).bind(id,actor.orgId).first();
}

async function documentAllocations(env,actor,id){
  const result=await env.DB.prepare(`SELECT pa.*,i.invoice_number,i.invoice_date,ps.amount invoice_amount,ps.due_date,
    GROUP_CONCAT(DISTINCT iol.order_id) order_ids,GROUP_CONCAT(DISTINCT o.folio) order_folios
    FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id AND i.org_id=pa.org_id
    JOIN payment_schedules ps ON ps.id=pa.payment_schedule_id AND ps.org_id=pa.org_id
    LEFT JOIN invoice_order_links iol ON iol.invoice_id=i.id AND iol.org_id=i.org_id
    LEFT JOIN orders o ON o.id=iol.order_id AND o.org_id=iol.org_id
    WHERE pa.org_id=? AND pa.payment_document_id=? GROUP BY pa.id ORDER BY i.invoice_date,i.invoice_number`).bind(actor.orgId,id).all();
  return rows(result).map(item=>({...item,allocated_amount:number(item.allocated_amount),invoice_amount:number(item.invoice_amount),orderIds:String(item.order_ids||'').split(',').filter(Boolean),orderFolios:String(item.order_folios||'').split(',').filter(Boolean)}));
}

function publicDocument(item,allocations=[]){
  if(!item)return null;
  const total=number(item.total_amount),allocated=allocations.reduce((sum,row)=>sum+number(row.allocated_amount),0),effective=cleanDate(item.cheque_collection_date)||cleanDate(item.payment_date),status=String(item.status||'pending'),overdue=status==='scheduled'&&Boolean(effective&&effective<today());
  return{...item,total_amount:total,cheque_amount:number(item.cheque_amount),allocated_amount:allocated,unallocated_amount:Math.max(0,total-allocated),allocations,effective_date:effective,overdue,metadata:safeJson(item.metadata_json,{})};
}

export async function getPaymentDocumentCanonical(env,actor,id){assertMinimumRole(actor.role,ROLES.FINANCE);const header=await documentHeader(env,actor,id);if(!header)throw new HttpError(404,'Documento de pago no encontrado','not_found');return publicDocument(header,await documentAllocations(env,actor,id))}

export async function listPaymentDocumentsCanonical(env,actor,url){
  assertMinimumRole(actor.role,ROLES.FINANCE);
  const supplierId=String(url.searchParams.get('supplierId')||'').trim(),orderId=String(url.searchParams.get('orderId')||'').trim(),status=String(url.searchParams.get('status')||'').trim();
  const result=await env.DB.prepare(`SELECT pd.*,s.name supplier_name,pm.kind payment_method_kind,f.storage_key proof_key,f.file_name proof_name
    FROM payment_documents pd JOIN suppliers s ON s.id=pd.supplier_id AND s.org_id=pd.org_id
    LEFT JOIN payment_methods pm ON pm.id=pd.payment_method_id AND pm.org_id=pd.org_id
    LEFT JOIN files f ON f.id=pd.proof_file_id AND f.org_id=pd.org_id
    WHERE pd.org_id=? AND (?='' OR pd.supplier_id=?) AND (?='' OR pd.status=?)
      AND (?='' OR EXISTS(SELECT 1 FROM payment_allocations pa JOIN invoice_order_links iol ON iol.invoice_id=pa.invoice_id AND iol.org_id=pa.org_id WHERE pa.org_id=pd.org_id AND pa.payment_document_id=pd.id AND iol.order_id=?))
    ORDER BY COALESCE(pd.cheque_collection_date,pd.payment_date,pd.created_at) DESC,pd.created_at DESC`).bind(actor.orgId,supplierId,supplierId,status,status,orderId,orderId).all();
  const output=[];for(const item of rows(result))output.push(publicDocument(item,await documentAllocations(env,actor,item.id)));return output;
}

async function validateProof(env,actor,proofFileId){if(!proofFileId)return;const file=await env.DB.prepare('SELECT id FROM files WHERE id=? AND org_id=?').bind(proofFileId,actor.orgId).first();if(!file)throw new HttpError(400,'El comprobante seleccionado no existe','invalid_payment_proof')}

async function normalizeDocumentInput(env,actor,body,{current=null}={}){
  const method=await paymentMethod(env,actor,{id:String(body.paymentMethodId??current?.payment_method_id??''),code:String(body.paymentMethodCode??body.paymentMethod??current?.payment_method_code??''),kind:String(body.methodKind??current?.payment_method_kind??''),activeOnly:!current});
  if(!method)throw new HttpError(400,'Selecciona un medio de pago válido','payment_method_required');
  const kind=String(method.kind||'other'),requirements=safeJson(method.requirements_json,{}),cheque=body.cheque&&typeof body.cheque==='object'?body.cheque:{},status=cleanStatus(body.status,current?.status||((kind==='cheque')?'scheduled':cleanDate(body.paymentDate)?'paid':'scheduled')),
    paymentDate=cleanDate(body.paymentDate??current?.payment_date),reference=optionalText(body.reference??current?.reference,{max:180}),proofFileId=String(body.proofFileId??current?.proof_file_id??'').trim()||null,note=optionalText(body.note??current?.note,{max:800}),
    chequeNumber=optionalText(body.chequeNumber??cheque.serialNumber??cheque.number??current?.cheque_number,{max:120}),chequeCollectionDate=cleanDate(body.chequeCollectionDate??cheque.collectionDate??cheque.paymentDate??current?.cheque_collection_date),chequePayee=optionalText(body.chequePayee??cheque.payee??current?.cheque_payee,{max:180}),chequeBank=optionalText(body.chequeBank??cheque.bank??current?.cheque_bank,{max:120});
  await validateProof(env,actor,proofFileId);
  if(requirements.reference&&status==='paid'&&!reference)throw new HttpError(400,'Ingresa la referencia de la operación','payment_reference_required');
  if(kind==='cheque'){
    if(requirements.chequeNumber!==false&&!chequeNumber)throw new HttpError(400,'Ingresa el número o serie del cheque','cheque_number_required');
    if(requirements.collectionDate!==false&&!chequeCollectionDate)throw new HttpError(400,'Ingresa la fecha de cobro del cheque','cheque_collection_date_required');
    if(requirements.payee!==false&&!chequePayee)throw new HttpError(400,'Ingresa el destinatario del cheque','cheque_payee_required');
  }
  return{method,kind,status,paymentDate,reference,proofFileId,note,chequeNumber,chequeCollectionDate,chequePayee,chequeBank};
}

async function validateAllocationSet(env,actor,allocations,{supplierId='',excludeDocumentId=''}={}){
  const normalized=(Array.isArray(allocations)?allocations:[]).map(item=>({invoiceId:String(item.invoiceId||'').trim(),amount:number(item.amount)})).filter(item=>item.invoiceId&&item.amount>0);
  if(!normalized.length)throw new HttpError(400,'Selecciona al menos una factura para aplicar el pago','payment_allocation_required');
  const unique=new Set(normalized.map(item=>item.invoiceId));if(unique.size!==normalized.length)throw new HttpError(400,'Una factura no puede repetirse dentro del mismo documento','duplicate_payment_allocation');
  let resolvedSupplier='';const output=[];
  for(const item of normalized){
    const invoice=await env.DB.prepare('SELECT id,supplier_id,invoice_number,gross_total FROM invoices WHERE id=? AND org_id=?').bind(item.invoiceId,actor.orgId).first();if(!invoice)throw new HttpError(404,'Una de las facturas seleccionadas no existe','invoice_not_found');
    if(!resolvedSupplier)resolvedSupplier=invoice.supplier_id;if(resolvedSupplier!==invoice.supplier_id)throw new HttpError(400,'Un documento de pago solo puede aplicarse a facturas del mismo proveedor','mixed_supplier_payment');if(supplierId&&supplierId!==invoice.supplier_id)throw new HttpError(400,'La factura no corresponde al proveedor seleccionado','supplier_payment_mismatch');
    const schedule=await ensureInvoiceSchedule(env,actor,item.invoiceId),existing=await allocatedForInvoice(env,actor,item.invoiceId,{excludeDocumentId}),available=Math.max(0,number(schedule.amount)-existing.assigned);
    if(item.amount>available)throw new HttpError(400,`El monto aplicado a la factura ${invoice.invoice_number} supera su saldo pendiente`,`allocation_exceeds_outstanding`);
    output.push({...item,scheduleId:schedule.id,invoiceNumber:invoice.invoice_number,available});
  }
  return{supplierId:resolvedSupplier,allocations:output,allocatedTotal:output.reduce((sum,item)=>sum+item.amount,0)};
}

async function savePaymentDocument(env,actor,body,request,{id='',sourceOverride=''}={}){
  const current=id?await documentHeader(env,actor,id):null;if(id&&!current)throw new HttpError(404,'Documento de pago no encontrado','not_found');
  const existingAllocations=current?await documentAllocations(env,actor,id):[],allocationInput=body.allocations===undefined?existingAllocations.map(item=>({invoiceId:item.invoice_id,amount:item.allocated_amount})):body.allocations,
    validated=await validateAllocationSet(env,actor,allocationInput,{supplierId:String(body.supplierId||current?.supplier_id||''),excludeDocumentId:id}),header=await normalizeDocumentInput(env,actor,body,{current}),allocatedTotal=validated.allocatedTotal,
    requestedTotal=number(body.totalAmount??body.amount??current?.total_amount),totalAmount=requestedTotal||allocatedTotal;
  if(totalAmount<allocatedTotal)throw new HttpError(400,'El monto del documento es menor que la suma aplicada a las facturas','payment_document_amount_too_low');
  let chequeAmount=number(body.chequeAmount??body.cheque?.amount??current?.cheque_amount);if(header.kind==='cheque'){if(!chequeAmount)chequeAmount=totalAmount;if(chequeAmount!==totalAmount)throw new HttpError(400,'El monto del cheque debe coincidir con el monto total del documento','cheque_total_mismatch')}
  const documentId=id||uuid(),stamp=nowIso(),metadata={...safeJson(current?.metadata_json,{}),...(body.metadata&&typeof body.metadata==='object'?body.metadata:{}),allocationMode:validated.allocations.length>1?'collective':'single',invoiceCount:validated.allocations.length},source=String(sourceOverride||body.source||current?.source||'manual').slice(0,40);
  const statements=[];
  if(current)statements.push(env.DB.prepare(`UPDATE payment_documents SET supplier_id=?,payment_method_id=?,payment_method_code=?,payment_method_name=?,status=?,payment_date=?,total_amount=?,reference=?,cheque_number=?,cheque_collection_date=?,cheque_payee=?,cheque_amount=?,cheque_bank=?,proof_file_id=?,note=?,source=?,metadata_json=?,updated_at=? WHERE id=? AND org_id=?`).bind(validated.supplierId,header.method.id,header.method.code,header.method.name,header.status,header.paymentDate||null,totalAmount,header.reference,header.chequeNumber,header.chequeCollectionDate||null,header.chequePayee,chequeAmount,header.chequeBank,header.proofFileId,header.note,source,JSON.stringify(metadata),stamp,documentId,actor.orgId));
  else statements.push(env.DB.prepare(`INSERT INTO payment_documents(id,org_id,supplier_id,payment_method_id,payment_method_code,payment_method_name,status,payment_date,total_amount,currency,reference,cheque_number,cheque_collection_date,cheque_payee,cheque_amount,cheque_bank,proof_file_id,note,source,metadata_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'CLP',?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(documentId,actor.orgId,validated.supplierId,header.method.id,header.method.code,header.method.name,header.status,header.paymentDate||null,totalAmount,header.reference,header.chequeNumber,header.chequeCollectionDate||null,header.chequePayee,chequeAmount,header.chequeBank,header.proofFileId,header.note,source,JSON.stringify(metadata),actor.userId,stamp,stamp));
  if(current)statements.push(env.DB.prepare('DELETE FROM payment_allocations WHERE payment_document_id=? AND org_id=?').bind(documentId,actor.orgId));
  for(const allocation of validated.allocations)statements.push(env.DB.prepare(`INSERT INTO payment_allocations(id,org_id,payment_document_id,invoice_id,payment_schedule_id,allocated_amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid(),actor.orgId,documentId,allocation.invoiceId,allocation.scheduleId,allocation.amount,stamp,stamp));
  await env.DB.batch(statements);
  const affected=new Set([...existingAllocations.map(item=>item.invoice_id),...validated.allocations.map(item=>item.invoiceId)]);for(const invoiceId of affected)await refreshInvoicePaymentState(env,actor,invoiceId);
  await writeAudit(env,actor,request,current?'payment_document.update':'payment_document.create','payment_document',documentId,{supplierId:validated.supplierId,status:header.status,method:header.method.code,totalAmount,allocatedTotal,unallocatedAmount:Math.max(0,totalAmount-allocatedTotal),invoiceIds:validated.allocations.map(item=>item.invoiceId),source});
  return getPaymentDocumentCanonical(env,actor,documentId);
}

export async function createPaymentDocumentCanonical(request,env,actor){assertMinimumRole(actor.role,ROLES.FINANCE);return savePaymentDocument(env,actor,await readJson(request),request)}
export async function updatePaymentDocumentCanonical(request,env,actor,id){assertMinimumRole(actor.role,ROLES.FINANCE);return savePaymentDocument(env,actor,await readJson(request),request,{id})}

export async function createPaymentDocumentFromInvoiceCanonical(env,actor,invoiceId,payment,request){
  if(!payment||payment.enabled===false)return null;assertMinimumRole(actor.role,ROLES.FINANCE);const schedule=await ensureInvoiceSchedule(env,actor,invoiceId),kind=String(payment.methodKind||payment.methodCode||payment.method||''),method=await paymentMethod(env,actor,{id:String(payment.methodId||''),code:String(payment.methodCode||payment.method||''),kind,activeOnly:true});if(!method)return null;
  const already=await allocatedForInvoice(env,actor,invoiceId),outstanding=Math.max(0,number(schedule.amount)-already.assigned);if(!outstanding)return null;const cheque=payment.cheque&&typeof payment.cheque==='object'?payment.cheque:{},requested=number(payment.amount||cheque.amount)||outstanding,allocation=Math.min(outstanding,requested),status=String(payment.status||'')||(method.kind==='cheque'?'scheduled':cleanDate(payment.paymentDate)?'paid':'scheduled');
  const body={supplierId:schedule.supplier_id,paymentMethodId:method.id,status,paymentDate:payment.paymentDate,totalAmount:requested,reference:payment.reference,chequeNumber:cheque.serialNumber||cheque.number,chequeCollectionDate:cheque.collectionDate||cheque.paymentDate||payment.paymentDate,chequePayee:cheque.payee,chequeAmount:cheque.amount||requested,chequeBank:cheque.bank,proofFileId:payment.proofFileId||payment.sourceFileId||'',allocations:[{invoiceId,amount:allocation}],metadata:{aiDetected:Boolean(payment.aiDetected),confidence:Number(payment.confidence||0),sourceFileId:String(payment.sourceFileId||'')},source:payment.aiDetected?'ai-reviewed':'invoice-entry'};
  return savePaymentDocument(env,actor,body,request,{sourceOverride:payment.aiDetected?'ai-reviewed':'invoice-entry'});
}

export async function listCollectiveChequeScheduleCanonical(env,actor,url){
  assertMinimumRole(actor.role,ROLES.FINANCE);const from=cleanDate(url.searchParams.get('from')),to=cleanDate(url.searchParams.get('to')),status=String(url.searchParams.get('status')||'');
  const result=await env.DB.prepare(`SELECT pd.*,s.name supplier_name,pm.kind payment_method_kind,f.storage_key proof_key,f.file_name proof_name
    FROM payment_documents pd JOIN suppliers s ON s.id=pd.supplier_id AND s.org_id=pd.org_id LEFT JOIN payment_methods pm ON pm.id=pd.payment_method_id AND pm.org_id=pd.org_id LEFT JOIN files f ON f.id=pd.proof_file_id AND f.org_id=pd.org_id
    WHERE pd.org_id=? AND COALESCE(pm.kind,pd.payment_method_code)='cheque' AND (?='' OR pd.cheque_collection_date>=?) AND (?='' OR pd.cheque_collection_date<=?) AND (?='' OR pd.status=?)
    ORDER BY CASE WHEN pd.status='scheduled' AND pd.cheque_collection_date<date('now') THEN 0 ELSE 1 END,pd.cheque_collection_date,pd.created_at DESC`).bind(actor.orgId,from,from,to,to,status,status).all();
  const output=[];for(const item of rows(result))output.push(publicDocument(item,await documentAllocations(env,actor,item.id)));return output;
}
