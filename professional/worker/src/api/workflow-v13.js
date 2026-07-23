import {HttpError,ROLES,assertMinimumRole,monthKey,nowIso,optionalText,planFor,readJson,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';
import {listOrdersV2} from './orders-list-v2.js';
import {normalizeCategoryOrder,operationalNotifications} from '../workflow-rules.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}
function canAdmin(actor){return ['owner','admin'].includes(String(actor.role||''))}

export async function updateCategoryV13(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const current=await env.DB.prepare('SELECT id,name,source FROM categories WHERE id=? AND org_id=?').bind(categoryId,actor.orgId).first();
  if(!current)throw new HttpError(404,'Categoría no encontrada','not_found');
  const body=await readJson(request);
  const name=body.name===undefined?current.name:String(body.name||'').trim().slice(0,100);
  if(!name)throw new HttpError(400,'Escribe un nombre para la categoría','invalid_category_name');
  try{await env.DB.prepare("UPDATE categories SET name=?,source='user',active=1,updated_at=? WHERE id=? AND org_id=?").bind(name,nowIso(),categoryId,actor.orgId).run()}
  catch(error){if(/UNIQUE/i.test(String(error?.message||error)))throw new HttpError(409,'Ya existe una categoría con ese nombre','duplicate_category');throw error}
  await writeAudit(env,actor,request,'category.update','category',categoryId,{name});
  return {id:categoryId,name,source:'user',active:true};
}

export async function reorderCategoriesV13(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request);
  const existing=rows(await env.DB.prepare("SELECT id FROM categories WHERE org_id=? AND active=1 AND source='user' ORDER BY sort_order,name COLLATE NOCASE").bind(actor.orgId).all()).map(item=>item.id);
  const ordered=normalizeCategoryOrder(body.categoryIds,existing);
  const timestamp=nowIso();
  await env.DB.batch(ordered.map((id,index)=>env.DB.prepare('UPDATE categories SET sort_order=?,updated_at=? WHERE id=? AND org_id=?').bind(index,timestamp,id,actor.orgId)));
  await writeAudit(env,actor,request,'category.reorder','category','',{categoryIds:ordered});
  return {categoryIds:ordered};
}

export async function deleteCategoryV13(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const category=await env.DB.prepare('SELECT id,name,source FROM categories WHERE id=? AND org_id=?').bind(categoryId,actor.orgId).first();
  if(!category)throw new HttpError(404,'Categoría no encontrada','not_found');
  const timestamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE products SET category_id=NULL,updated_at=? WHERE org_id=? AND category_id=?').bind(timestamp,actor.orgId,categoryId),
    env.DB.prepare('DELETE FROM categories WHERE id=? AND org_id=?').bind(categoryId,actor.orgId)
  ]);
  await writeAudit(env,actor,request,'category.delete','category',categoryId,{name:category.name});
  return {deleted:true,id:categoryId,name:category.name};
}

export async function quickUpdateOrderV13(request,env,actor,orderId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const order=await env.DB.prepare('SELECT id,status,location_id,delivery_date,notes FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order||!locationAllowed(actor,order.location_id))throw new HttpError(404,'Pedido no encontrado','not_found');
  if(order.status!=='draft')throw new HttpError(409,'El pedido ya fue emitido y no se puede editar','already_emitted');
  const body=await readJson(request);
  const deliveryDate=body.deliveryDate===undefined?order.delivery_date:(/^\d{4}-\d{2}-\d{2}$/.test(String(body.deliveryDate||''))?String(body.deliveryDate):null);
  const notes=body.notes===undefined?order.notes:optionalText(body.notes,{max:2000});
  await env.DB.prepare('UPDATE orders SET delivery_date=?,notes=?,updated_at=? WHERE id=? AND org_id=?').bind(deliveryDate,notes,nowIso(),orderId,actor.orgId).run();
  await writeAudit(env,actor,request,'order.quick_update','order',orderId,{deliveryDate});
  return getOrder(env,actor,orderId);
}

export async function emitOrderBatchV13(request,env,actor,batchId,ctx){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const result=await env.DB.prepare(`SELECT id,status,location_id,folio FROM orders WHERE org_id=? AND batch_id=? ORDER BY created_at`).bind(actor.orgId,batchId).all();
  const orders=rows(result).filter(order=>locationAllowed(actor,order.location_id));
  if(!orders.length)throw new HttpError(404,'Archivo de pedidos no encontrado','not_found');
  const editable=orders.filter(order=>order.status==='draft');
  if(!editable.length)throw new HttpError(409,'Este archivo ya fue emitido','already_emitted');
  const timestamp=nowIso();
  const statements=[];
  for(const order of editable){
    statements.push(env.DB.prepare("UPDATE orders SET status='requested',emitted_at=?,sent_at=?,updated_at=? WHERE id=? AND org_id=? AND status='draft'").bind(timestamp,timestamp,timestamp,order.id,actor.orgId));
    statements.push(env.DB.prepare(`INSERT INTO order_events(id,org_id,order_id,actor_user_id,from_status,to_status,reason,created_at) VALUES(?,?,?,?, 'draft','requested','Archivo emitido',?)`).bind(uuid(),actor.orgId,order.id,actor.userId,timestamp));
  }
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'order_batch.emit','order_batch',batchId,{orders:editable.map(order=>order.id)});
  const task=Promise.allSettled(editable.map(async order=>archiveOrderPdf(env,actor,await getOrder(env,actor,order.id))));
  if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
  return {batchId,emitted:true,emittedAt:timestamp,orderIds:editable.map(order=>order.id)};
}

export async function deleteOrderV13(request,env,actor,orderId,url){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const order=await env.DB.prepare('SELECT id,folio,status,location_id,batch_id FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId).first();
  if(!order||!locationAllowed(actor,order.location_id))throw new HttpError(404,'Pedido no encontrado','not_found');
  const force=String(url?.searchParams?.get('force')||'')==='1';
  if(order.status!=='draft'&&(!force||!canAdmin(actor)))throw new HttpError(409,'Solo un administrador puede eliminar un pedido emitido','admin_required');
  const [invoices,receptions]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM invoice_order_links WHERE org_id=? AND order_id=?').bind(actor.orgId,orderId).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM receptions WHERE org_id=? AND order_id=?').bind(actor.orgId,orderId).first()
  ]);
  if(Number(invoices?.total||0)||Number(receptions?.total||0))throw new HttpError(409,'No se puede eliminar porque ya tiene factura o recepción vinculada','order_linked');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM document_links WHERE org_id=? AND entity_type=? AND entity_id=?').bind(actor.orgId,'order',orderId),
    env.DB.prepare('DELETE FROM orders WHERE id=? AND org_id=?').bind(orderId,actor.orgId)
  ]);
  await writeAudit(env,actor,request,'order.delete','order',orderId,{folio:order.folio,status:order.status,force});
  return {deleted:true,id:orderId,folio:order.folio,batchId:order.batch_id};
}

export async function listNotificationsV13(env,actor){
  const orders=await listOrdersV2(env,actor,new URL('https://internal/api/orders'));
  return operationalNotifications(orders);
}

export async function recordClientEventV13(request,env,actor){
  const body=await readJson(request);
  const type=String(body.type||'client_event').replace(/[^a-z0-9_.-]/gi,'').slice(0,80)||'client_event';
  const message=optionalText(body.message,{max:1000});
  const metadata={path:String(body.path||'').slice(0,300),view:String(body.view||'').slice(0,80),device:String(body.device||'').slice(0,160),details:body.details&&typeof body.details==='object'?body.details:{}};
  await env.DB.prepare('INSERT INTO client_events(id,org_id,user_id,event_type,message,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(uuid(),actor.orgId,actor.userId,type,message,JSON.stringify(metadata),nowIso()).run();
  return {recorded:true};
}

export async function getDiagnosticsV13(env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  const [recent,summary]=await Promise.all([
    env.DB.prepare('SELECT event_type,message,metadata_json,created_at FROM client_events WHERE org_id=? ORDER BY created_at DESC LIMIT 60').bind(actor.orgId).all(),
    env.DB.prepare("SELECT event_type,COUNT(*) AS total FROM client_events WHERE org_id=? AND created_at>=datetime('now','-7 day') GROUP BY event_type ORDER BY total DESC").bind(actor.orgId).all()
  ]);
  return {summary:rows(summary).map(item=>({type:item.event_type,total:Number(item.total||0)})),events:rows(recent).map(item=>({type:item.event_type,message:item.message,metadata:safeJson(item.metadata_json,{}),createdAt:item.created_at}))};
}

export async function exportWorkspaceV13(request,env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  const tables=['organizations','locations','cost_centers','categories','suppliers','products','supplier_products','product_cost_centers','orders','order_items','order_cost_centers','receptions','reception_items','invoices','invoice_lines','invoice_order_links','files','document_links','memberships','users','audit_logs'];
  const data={};
  for(const table of tables){
    if(table==='users')data[table]=rows(await env.DB.prepare('SELECT id,email,display_name,active,profile_json,created_at,updated_at FROM users WHERE id IN (SELECT user_id FROM memberships WHERE org_id=?)').bind(actor.orgId).all());
    else if(table==='organizations')data[table]=rows(await env.DB.prepare('SELECT id,name,slug,plan,status,settings_json,created_at,updated_at FROM organizations WHERE id=?').bind(actor.orgId).all());
    else if(table==='memberships')data[table]=rows(await env.DB.prepare('SELECT id,org_id,user_id,role,location_scope,active,created_at,updated_at FROM memberships WHERE org_id=?').bind(actor.orgId).all());
    else data[table]=rows(await env.DB.prepare(`SELECT * FROM ${table} WHERE org_id=?`).bind(actor.orgId).all()).catch?.(()=>[])||[];
  }
  const backup={version:1,organizationId:actor.orgId,generatedAt:nowIso(),generatedBy:actor.userId,data};
  await writeAudit(env,actor,request,'workspace.export','organization',actor.orgId,{tables:Object.keys(data),rows:Object.values(data).reduce((sum,list)=>sum+list.length,0)});
  return backup;
}

export async function getReconciliationSettingsV13(env,actor){
  const org=await env.DB.prepare('SELECT settings_json FROM organizations WHERE id=?').bind(actor.orgId).first();
  const settings=safeJson(org?.settings_json,{}).reconciliation||{};
  return {quantityTolerancePct:Number(settings.quantityTolerancePct||0),priceTolerancePct:Number(settings.priceTolerancePct||1),requireProductMatch:settings.requireProductMatch!==false,flagFreeItems:settings.flagFreeItems!==false};
}

export async function updateReconciliationSettingsV13(request,env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  const body=await readJson(request),org=await env.DB.prepare('SELECT settings_json FROM organizations WHERE id=?').bind(actor.orgId).first();
  const current=safeJson(org?.settings_json,{});
  const reconciliation={quantityTolerancePct:Math.max(0,Math.min(100,Number(body.quantityTolerancePct||0))),priceTolerancePct:Math.max(0,Math.min(100,Number(body.priceTolerancePct||0))),requireProductMatch:body.requireProductMatch!==false,flagFreeItems:body.flagFreeItems!==false};
  await env.DB.prepare('UPDATE organizations SET settings_json=?,updated_at=? WHERE id=?').bind(JSON.stringify({...current,reconciliation}),nowIso(),actor.orgId).run();
  await writeAudit(env,actor,request,'reconciliation.settings','organization',actor.orgId,reconciliation);
  return reconciliation;
}

export async function getAccountReadinessV13(env,actor){
  const limits=planFor(actor.organization.plan),month=monthKey();
  const usageRows=rows(await env.DB.prepare('SELECT metric,quantity FROM usage_counters WHERE org_id=? AND month_key=?').bind(actor.orgId,month).all());
  const usage=Object.fromEntries(usageRows.map(item=>[item.metric,Number(item.quantity||0)]));
  const [locations,suppliers,products,users,documents]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total FROM locations WHERE org_id=? AND active=1').bind(actor.orgId).first(),env.DB.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE org_id=? AND active=1').bind(actor.orgId).first(),env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE org_id=? AND active=1').bind(actor.orgId).first(),env.DB.prepare('SELECT COUNT(*) AS total FROM memberships WHERE org_id=? AND active=1').bind(actor.orgId).first(),env.DB.prepare('SELECT COUNT(*) AS total FROM files WHERE org_id=?').bind(actor.orgId).first()
  ]);
  return {plan:actor.organization.plan,month,limits,usage,counts:{locations:Number(locations?.total||0),suppliers:Number(suppliers?.total||0),products:Number(products?.total||0),users:Number(users?.total||0),documents:Number(documents?.total||0)},features:{multiBrand:true,aiReconciliation:true,backups:true,notifications:true,observability:true,deviceQa:true,billingProviderConfigured:Boolean(env.BILLING_PROVIDER)}};
}
