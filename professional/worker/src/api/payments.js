import {HttpError,ROLES,assertMinimumRole,nowIso,optionalText,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
const MANAGER_ROLES=new Set(['owner','admin','finance']);
const KINDS=new Set(['transfer','cheque','cash','card','deposit','other']);
function assertPaymentManager(actor){if(!MANAGER_ROLES.has(String(actor.role||'')))throw new HttpError(403,'Tu rol no puede configurar medios de pago','forbidden')}
function cleanDate(value){const text=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:''}
function cleanCode(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)}
function normalizeKind(value){const kind=String(value||'').toLowerCase();return KINDS.has(kind)?kind:'other'}
function normalizeRequirements(value,kind){const source=value&&typeof value==='object'?value:{};return{reference:Boolean(source.reference),chequeNumber:kind==='cheque'?source.chequeNumber!==false:Boolean(source.chequeNumber),collectionDate:kind==='cheque'?source.collectionDate!==false:Boolean(source.collectionDate),payee:kind==='cheque'?source.payee!==false:Boolean(source.payee),amount:kind==='cheque'?source.amount!==false:Boolean(source.amount)}}
function publicMethod(item){return{id:item.id,code:item.code,name:item.name,kind:item.kind,active:Boolean(item.active),requirements:safeJson(item.requirements_json,{}),sortOrder:Number(item.sort_order||0),updatedAt:item.updated_at}}
async function methodByIdOrCode(env,actor,{id='',code='',kind='',activeOnly=false}={}){
  let row=null;
  if(id)row=await env.DB.prepare(`SELECT * FROM payment_methods WHERE id=? AND org_id=? ${activeOnly?'AND active=1':''}`).bind(id,actor.orgId).first();
  if(!row&&code)row=await env.DB.prepare(`SELECT * FROM payment_methods WHERE org_id=? AND code=? ${activeOnly?'AND active=1':''} ORDER BY active DESC LIMIT 1`).bind(actor.orgId,cleanCode(code)).first();
  if(!row&&kind)row=await env.DB.prepare(`SELECT * FROM payment_methods WHERE org_id=? AND kind=? ${activeOnly?'AND active=1':''} ORDER BY active DESC,sort_order,name LIMIT 1`).bind(actor.orgId,normalizeKind(kind)).first();
  return row;
}
function effectiveDate(item){return cleanDate(item.cheque_collection_date)||cleanDate(item.due_date)||cleanDate(item.payment_date)}
function publicPayment(item){const effective=effectiveDate(item),status=String(item.status||'pending'),overdue=!['paid','disputed'].includes(status)&&Boolean(effective&&effective<today());return{...item,amount:Number(item.amount||0),paid_amount:Number(item.paid_amount||0),cheque_amount:Number(item.cheque_amount||0),orderIds:String(item.order_ids||'').split(',').filter(Boolean),effective_due_date:effective,overdue}}

export async function listPaymentMethodsCanonical(env,actor,url){
  const active=String(url.searchParams.get('active')||'active');
  const result=await env.DB.prepare(`SELECT * FROM payment_methods WHERE org_id=? AND (?='all' OR active=1) ORDER BY active DESC,sort_order,name COLLATE NOCASE`).bind(actor.orgId,active).all();
  return rows(result).map(publicMethod);
}
export async function createPaymentMethodCanonical(request,env,actor){
  assertPaymentManager(actor);const body=await readJson(request),name=optionalText(body.name,{max:100});if(!name)throw new HttpError(400,'Ingresa el nombre del medio de pago','validation_error');
  const kind=normalizeKind(body.kind),code=cleanCode(body.code||name);if(!code)throw new HttpError(400,'El código del medio de pago no es válido','validation_error');
  const existing=await env.DB.prepare('SELECT id FROM payment_methods WHERE org_id=? AND code=?').bind(actor.orgId,code).first();if(existing)throw new HttpError(409,'Ya existe un medio de pago con ese código','payment_method_exists');
  const id=uuid(),stamp=nowIso(),requirements=normalizeRequirements(body.requirements,kind),sortOrder=Math.max(0,Math.round(Number(body.sortOrder||100)));
  await env.DB.prepare(`INSERT INTO payment_methods(id,org_id,code,name,kind,active,requirements_json,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,actor.orgId,code,name,kind,body.active===false?0:1,JSON.stringify(requirements),sortOrder,actor.userId,stamp,stamp).run();
  await writeAudit(env,actor,request,'payment_method.create','payment_method',id,{code,name,kind,requirements});
  return publicMethod(await env.DB.prepare('SELECT * FROM payment_methods WHERE id=? AND org_id=?').bind(id,actor.orgId).first());
}
export async function updatePaymentMethodCanonical(request,env,actor,id){
  assertPaymentManager(actor);const current=await env.DB.prepare('SELECT * FROM payment_methods WHERE id=? AND org_id=?').bind(id,actor.orgId).first();if(!current)throw new HttpError(404,'Medio de pago no encontrado','not_found');
  const body=await readJson(request),name=optionalText(body.name??current.name,{max:100});if(!name)throw new HttpError(400,'Ingresa el nombre del medio de pago','validation_error');
  const kind=normalizeKind(body.kind??current.kind),requirements=normalizeRequirements(body.requirements??safeJson(current.requirements_json,{}),kind),active=body.active===undefined?Boolean(current.active):Boolean(body.active),sortOrder=Math.max(0,Math.round(Number(body.sortOrder??current.sort_order??100))),stamp=nowIso();
  await env.DB.prepare('UPDATE payment_methods SET name=?,kind=?,active=?,requirements_json=?,sort_order=?,updated_at=? WHERE id=? AND org_id=?').bind(name,kind,active?1:0,JSON.stringify(requirements),sortOrder,stamp,id,actor.orgId).run();
  await writeAudit(env,actor,request,'payment_method.update','payment_method',id,{name,kind,active,requirements,sortOrder});
  return publicMethod(await env.DB.prepare('SELECT * FROM payment_methods WHERE id=? AND org_id=?').bind(id,actor.orgId).first());
}

export async function listPaymentsCanonical(env,actor,url){
  assertMinimumRole(actor.role,ROLES.FINANCE);const status=String(url.searchParams.get('status')||'');
  const result=await env.DB.prepare(`SELECT ps.*,i.invoice_number,i.invoice_date,i.document_type,i.payment_status,s.name supplier_name,f.storage_key proof_key,f.file_name proof_name,f.content_type proof_content_type,pm.kind payment_method_kind,pm.requirements_json payment_method_requirements,GROUP_CONCAT(DISTINCT iol.order_id) AS order_ids FROM payment_schedules ps JOIN invoices i ON i.id=ps.invoice_id JOIN suppliers s ON s.id=ps.supplier_id LEFT JOIN files f ON f.id=ps.proof_file_id AND f.org_id=ps.org_id LEFT JOIN payment_methods pm ON pm.id=ps.payment_method_id AND pm.org_id=ps.org_id LEFT JOIN invoice_order_links iol ON iol.invoice_id=ps.invoice_id AND iol.org_id=ps.org_id WHERE ps.org_id=? AND (?='' OR ps.status=?) GROUP BY ps.id ORDER BY CASE WHEN COALESCE(ps.cheque_collection_date,ps.due_date)<date('now') AND ps.status NOT IN ('paid','disputed') THEN 0 ELSE 1 END,COALESCE(ps.cheque_collection_date,ps.due_date) ASC,ps.created_at DESC`).bind(actor.orgId,status,status).all();
  return rows(result).map(publicPayment);
}
export async function listChequeScheduleCanonical(env,actor,url){
  assertMinimumRole(actor.role,ROLES.FINANCE);const from=cleanDate(url.searchParams.get('from')),to=cleanDate(url.searchParams.get('to')),status=String(url.searchParams.get('status')||'');
  const result=await env.DB.prepare(`SELECT ps.*,i.invoice_number,i.invoice_date,s.name supplier_name,pm.name payment_method_display_name,pm.kind payment_method_kind,GROUP_CONCAT(DISTINCT iol.order_id) AS order_ids FROM payment_schedules ps JOIN invoices i ON i.id=ps.invoice_id JOIN suppliers s ON s.id=ps.supplier_id LEFT JOIN payment_methods pm ON pm.id=ps.payment_method_id AND pm.org_id=ps.org_id LEFT JOIN invoice_order_links iol ON iol.invoice_id=ps.invoice_id AND iol.org_id=ps.org_id WHERE ps.org_id=? AND COALESCE(pm.kind,ps.payment_method_code)='cheque' AND (?='' OR ps.cheque_collection_date>=?) AND (?='' OR ps.cheque_collection_date<=?) AND (?='' OR ps.status=?) GROUP BY ps.id ORDER BY CASE WHEN ps.status NOT IN ('paid','disputed') AND ps.cheque_collection_date<date('now') THEN 0 ELSE 1 END,ps.cheque_collection_date ASC,ps.created_at DESC`).bind(actor.orgId,from,from,to,to,status,status).all();
  return rows(result).map(publicPayment);
}

async function persistPayment(env,actor,current,body,request,{sourceOverride=''}={}){
  const method=await methodByIdOrCode(env,actor,{id:String(body.paymentMethodId??current.payment_method_id??''),code:String(body.paymentMethod??body.paymentMethodCode??current.payment_method_code??''),kind:String(body.methodKind||''),activeOnly:false});
  let status=['pending','scheduled','paid','overdue','disputed'].includes(String(body.status))?String(body.status):String(current.status||'pending');
  const paymentMethodId=method?.id||null,paymentMethodCode=method?.code||cleanCode(body.paymentMethod||current.payment_method_code||''),paymentMethodName=method?.name||String(body.paymentMethodName||current.payment_method_name||''),kind=method?.kind||normalizeKind(body.methodKind||paymentMethodCode),requirements=method?safeJson(method.requirements_json,{}):normalizeRequirements({},kind),stamp=nowIso();
  const cheque=body.cheque&&typeof body.cheque==='object'?body.cheque:{};
  const chequeNumber=optionalText(body.chequeNumber??cheque.serialNumber??cheque.number??current.cheque_number,{max:120}),chequeCollectionDate=cleanDate(body.chequeCollectionDate??cheque.collectionDate??cheque.paymentDate??current.cheque_collection_date),chequePayee=optionalText(body.chequePayee??cheque.payee??current.cheque_payee,{max:180}),chequeAmount=Math.max(0,Math.round(Number(body.chequeAmount??cheque.amount??current.cheque_amount??0))),chequeBank=optionalText(body.chequeBank??cheque.bank??current.cheque_bank,{max:120});
  const reference=optionalText(body.reference??current.reference,{max:180}),note=optionalText(body.note??current.note,{max:800}),proofFileId=String(body.proofFileId??current.proof_file_id??'').trim()||null,paidAmount=Math.max(0,Math.round(Number(body.paidAmount??body.amount??current.paid_amount??current.amount??0))),paymentDate=cleanDate(body.paymentDate??current.payment_date)||(status==='paid'?today():'');
  if(kind==='cheque'&&status==='pending'&&chequeCollectionDate)status='scheduled';
  if(status==='paid'&&!paymentMethodId&&!paymentMethodCode)throw new HttpError(400,'Selecciona la forma de pago','payment_method_required');
  if(kind==='cheque'){
    if(requirements.chequeNumber!==false&&!chequeNumber)throw new HttpError(400,'Ingresa el número o serie del cheque','cheque_number_required');
    if(requirements.collectionDate!==false&&!chequeCollectionDate)throw new HttpError(400,'Ingresa la fecha de cobro del cheque','cheque_collection_date_required');
    if(requirements.payee!==false&&!chequePayee)throw new HttpError(400,'Ingresa el destinatario del cheque','cheque_payee_required');
    if(requirements.amount!==false&&!chequeAmount)throw new HttpError(400,'Ingresa el monto del cheque','cheque_amount_required');
  }
  if(requirements.reference&&!reference&&status==='paid')throw new HttpError(400,'Ingresa la referencia de la operación','payment_reference_required');
  if(proofFileId){const file=await env.DB.prepare('SELECT id FROM files WHERE id=? AND org_id=?').bind(proofFileId,actor.orgId).first();if(!file)throw new HttpError(400,'El comprobante seleccionado no existe','invalid_payment_proof')}
  const metadata={...safeJson(current.payment_metadata_json,{}),...(body.metadata&&typeof body.metadata==='object'?body.metadata:{}),methodKind:kind};
  const paymentSource=String(sourceOverride||body.paymentSource||current.payment_source||'manual').slice(0,40);
  await env.DB.prepare(`UPDATE payment_schedules SET status=?,scheduled_at=?,paid_at=?,reference=?,note=?,responsible_user_id=?,updated_at=?,payment_method_id=?,payment_method_code=?,payment_method_name=?,payment_date=?,cheque_number=?,cheque_collection_date=?,cheque_payee=?,cheque_amount=?,cheque_bank=?,proof_file_id=?,paid_amount=?,payment_metadata_json=?,payment_source=? WHERE id=? AND org_id=?`).bind(status,status==='scheduled'?(current.scheduled_at||stamp):current.scheduled_at,status==='paid'?(current.paid_at||stamp):null,reference,note,body.responsibleUserId||actor.userId,stamp,paymentMethodId,paymentMethodCode,paymentMethodName,paymentDate||null,chequeNumber,chequeCollectionDate||null,chequePayee,chequeAmount,chequeBank,proofFileId,paidAmount,JSON.stringify(metadata),paymentSource,current.id,actor.orgId).run();
  await env.DB.prepare('UPDATE invoices SET payment_status=?,updated_at=? WHERE id=? AND org_id=?').bind(status,stamp,current.invoice_id,actor.orgId).run();
  await writeAudit(env,actor,request,'payment.update','payment_schedule',current.id,{status,paymentMethodId,paymentMethodCode,kind,paymentDate,chequeNumber,chequeCollectionDate,chequePayee,chequeAmount,reference,proofFileId,paidAmount,paymentSource});
  const result=await env.DB.prepare(`SELECT ps.*,i.invoice_number,i.invoice_date,s.name supplier_name,f.storage_key proof_key,f.file_name proof_name,pm.kind payment_method_kind,GROUP_CONCAT(DISTINCT iol.order_id) AS order_ids FROM payment_schedules ps JOIN invoices i ON i.id=ps.invoice_id JOIN suppliers s ON s.id=ps.supplier_id LEFT JOIN files f ON f.id=ps.proof_file_id AND f.org_id=ps.org_id LEFT JOIN payment_methods pm ON pm.id=ps.payment_method_id AND pm.org_id=ps.org_id LEFT JOIN invoice_order_links iol ON iol.invoice_id=ps.invoice_id AND iol.org_id=ps.org_id WHERE ps.id=? AND ps.org_id=? GROUP BY ps.id`).bind(current.id,actor.orgId).first();
  return publicPayment(result);
}
export async function updatePaymentCanonical(request,env,actor,id){
  assertMinimumRole(actor.role,ROLES.FINANCE);const current=await env.DB.prepare('SELECT * FROM payment_schedules WHERE id=? AND org_id=?').bind(id,actor.orgId).first();if(!current)throw new HttpError(404,'Pago no encontrado','not_found');
  return persistPayment(env,actor,current,await readJson(request),request);
}
export async function applyInvoicePaymentMetadata(env,actor,invoiceId,payment,request){
  if(!payment||payment.enabled===false)return null;const current=await env.DB.prepare('SELECT * FROM payment_schedules WHERE invoice_id=? AND org_id=?').bind(invoiceId,actor.orgId).first();if(!current)return null;
  const cheque=payment.cheque&&typeof payment.cheque==='object'?payment.cheque:{},kind=normalizeKind(payment.methodKind||payment.methodCode||payment.method),method=await methodByIdOrCode(env,actor,{id:String(payment.methodId||''),code:String(payment.methodCode||payment.method||''),kind,activeOnly:true});
  if(!method&&!payment.methodCode&&!payment.method&&!payment.methodKind)return null;
  const status=String(payment.status||'')||((method?.kind||kind)==='cheque'?'scheduled':cleanDate(payment.paymentDate)?'paid':'scheduled');
  return persistPayment(env,actor,current,{status,paymentMethodId:method?.id||'',paymentMethod:method?.code||payment.methodCode||payment.method||kind,paymentMethodName:method?.name||payment.methodName||'',methodKind:method?.kind||kind,paymentDate:payment.paymentDate,paidAmount:payment.amount,reference:payment.reference,chequeNumber:cheque.serialNumber||cheque.number,chequeCollectionDate:cheque.collectionDate||cheque.paymentDate||payment.paymentDate,chequePayee:cheque.payee,chequeAmount:cheque.amount||payment.amount,chequeBank:cheque.bank,metadata:{aiDetected:Boolean(payment.aiDetected),confidence:Number(payment.confidence||0),sourceFileId:String(payment.sourceFileId||'')},paymentSource:payment.aiDetected?'ai-reviewed':'invoice-entry'},request,{sourceOverride:payment.aiDetected?'ai-reviewed':'invoice-entry'});
}
