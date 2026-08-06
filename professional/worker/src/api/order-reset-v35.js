import {nowIso,uuid} from '../core.js';

const RESET_KEY='orders-clean-slate-2026-08-05-v1';
const DEFAULT_ORG_ID='e73d2d6e-dae8-46c6-87df-43ae05ca81fa';
const rows=result=>result?.results||[];

async function ensureResetState(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_seed_state(
    seed_key TEXT PRIMARY KEY,
    item_count INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL
  )`).run();
}

async function targetOrganizations(env){
  const result=await env.DB.prepare(`
    SELECT id,name,slug FROM organizations
    WHERE id=? OR slug IN ('nuvasto','pedidos-pro') OR lower(name) LIKE '%madriguera%'
    ORDER BY created_at
  `).bind(DEFAULT_ORG_ID).all();
  return rows(result);
}

async function orderFiles(env,orgId){
  const result=await env.DB.prepare(`
    SELECT DISTINCT f.id,f.storage_key
    FROM files f
    WHERE f.org_id=?
      AND (
        f.purpose='order-pdf'
        OR EXISTS(
          SELECT 1 FROM document_links dl
          WHERE dl.file_id=f.id AND dl.org_id=? AND dl.entity_type='order'
        )
      )
      AND NOT EXISTS(
        SELECT 1 FROM document_links keep
        WHERE keep.file_id=f.id AND NOT(keep.org_id=? AND keep.entity_type='order')
      )
      AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.xml_file_id=f.id OR i.pdf_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM products p WHERE p.image_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM reception_quality_events q WHERE q.photo_file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM export_jobs e WHERE e.file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM workspace_backups b WHERE b.file_id=f.id)
  `).bind(orgId,orgId,orgId).all();
  return rows(result);
}

async function deleteOrderRows(env,orgId,fileRows){
  const timestamp=nowIso();
  const before=await env.DB.prepare('SELECT COUNT(*) AS total FROM orders WHERE org_id=?').bind(orgId).first();
  const statements=[
    env.DB.prepare(`DELETE FROM reconciliation_issues WHERE org_id=? AND(
      order_id IN(SELECT id FROM orders WHERE org_id=?)
      OR reception_id IN(SELECT id FROM receptions WHERE org_id=?)
      OR order_item_id IN(SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.org_id=?)
    )`).bind(orgId,orgId,orgId,orgId),
    env.DB.prepare(`DELETE FROM invoice_order_links WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM reconciliation_reviews WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM external_order_attempts WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM approval_requests WHERE org_id=? AND(
      order_id IN(SELECT id FROM orders WHERE org_id=?)
      OR batch_id IN(SELECT batch_id FROM orders WHERE org_id=? AND batch_id<>'')
    )`).bind(orgId,orgId,orgId),
    env.DB.prepare(`DELETE FROM document_links WHERE org_id=? AND entity_type='order'`).bind(orgId),
    env.DB.prepare(`DELETE FROM entity_snapshots WHERE org_id=? AND entity_type IN('order','reception')`).bind(orgId),
    env.DB.prepare(`DELETE FROM trash_items WHERE org_id=? AND entity_type='order'`).bind(orgId),
    env.DB.prepare(`DELETE FROM draft_autosaves WHERE org_id=? AND(
      lower(draft_key) LIKE '%order%' OR lower(draft_key) LIKE '%pedido%'
      OR payload_json LIKE '%\"folio\"%'
    )`).bind(orgId),
    env.DB.prepare(`DELETE FROM sync_mutations WHERE org_id=? AND entity_type IN('order','order_item','reception','reception_item')`).bind(orgId),
    env.DB.prepare(`DELETE FROM notification_queue WHERE org_id=? AND(
      lower(template_key) LIKE '%order%' OR lower(template_key) LIKE '%pedido%'
      OR payload_json LIKE '%\"orderId\"%'
    )`).bind(orgId),
    env.DB.prepare(`DELETE FROM audit_logs WHERE org_id=? AND(
      entity_type IN('order','order_batch','reception')
      OR action LIKE 'order.%' OR action LIKE 'order_%'
      OR action LIKE 'reception.%' OR action LIKE 'reception_%'
    )`).bind(orgId),
    env.DB.prepare(`DELETE FROM receptions WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM order_cost_centers WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM order_events WHERE org_id=? AND order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId,orgId),
    env.DB.prepare(`DELETE FROM order_items WHERE order_id IN(SELECT id FROM orders WHERE org_id=?)`).bind(orgId),
    env.DB.prepare('DELETE FROM orders WHERE org_id=?').bind(orgId),
    env.DB.prepare("DELETE FROM usage_counters WHERE org_id=? AND metric='orders_created'").bind(orgId),
    env.DB.prepare('DELETE FROM idempotency_keys WHERE org_id=?').bind(orgId),
    env.DB.prepare('DELETE FROM folio_operation_locks WHERE org_id=?').bind(orgId)
  ];
  for(const file of fileRows)statements.push(env.DB.prepare('DELETE FROM files WHERE id=? AND org_id=?').bind(file.id,orgId));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(
    id,org_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata_json,ip_hash,created_at
  ) VALUES(?,?,NULL,'system@nuvasto.local','system.orders_clean_slate','workspace',?,?,'',?)`).bind(
    uuid(),orgId,orgId,JSON.stringify({ordersDeleted:Number(before?.total||0),orderFilesDeleted:fileRows.length,resetKey:RESET_KEY}),timestamp
  ));
  await env.DB.batch(statements);
  if(env.FILES){
    for(const file of fileRows)await env.FILES.delete(file.storage_key).catch(error=>console.warn('order_reset_r2_delete_failed',file.storage_key,error?.message||error));
  }
  return{orgId,ordersDeleted:Number(before?.total||0),orderFilesDeleted:fileRows.length};
}

export async function ensureOrdersCleanSlateV35(env){
  await ensureResetState(env.DB);
  const completed=await env.DB.prepare('SELECT item_count,completed_at FROM data_seed_state WHERE seed_key=?').bind(RESET_KEY).first();
  if(completed)return{applied:true,alreadyCompleted:true,ordersDeleted:Number(completed.item_count||0),completedAt:completed.completed_at,resetKey:RESET_KEY};
  const organizations=await targetOrganizations(env);
  if(!organizations.length)return{applied:false,alreadyCompleted:false,ordersDeleted:0,completedAt:null,resetKey:RESET_KEY,reason:'target_workspace_not_found'};
  const results=[];
  for(const organization of organizations){
    const files=await orderFiles(env,organization.id);
    results.push(await deleteOrderRows(env,organization.id,files));
  }
  const total=results.reduce((sum,item)=>sum+item.ordersDeleted,0),completedAt=nowIso();
  await env.DB.prepare('INSERT INTO data_seed_state(seed_key,item_count,completed_at) VALUES(?,?,?)').bind(RESET_KEY,total,completedAt).run();
  return{applied:true,alreadyCompleted:false,ordersDeleted:total,completedAt,resetKey:RESET_KEY,organizations:results};
}

export async function ordersCleanSlateStatusV35(env){
  await ensureResetState(env.DB);
  const completed=await env.DB.prepare('SELECT item_count,completed_at FROM data_seed_state WHERE seed_key=?').bind(RESET_KEY).first();
  const organizations=await targetOrganizations(env),ids=organizations.map(item=>item.id);
  let remaining=0;
  for(const id of ids){const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM orders WHERE org_id=?').bind(id).first();remaining+=Number(count?.total||0)}
  return{applied:Boolean(completed),ordersDeleted:Number(completed?.item_count||0),ordersRemaining:remaining,completedAt:completed?.completed_at||null,resetKey:RESET_KEY,targetOrganizations:ids.length};
}
