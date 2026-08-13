import {ensureEnterpriseSchemaV41 as ensureLegacyEnterpriseSchemaV41} from './schema-v41-legacy-v45.js';
export * from './schema-v41-legacy-v45.js';

// Marcadores de compatibilidad contractual v41: payment_term_anchor · approval_policies · invoice_line_splits · saved_report_views · operation_change_journal.
const MARKER_KEY='schema-enterprise-v41-ready-v45';
const MARKER_VERSION=41;
let initializationPromise=null;
const rows=result=>result?.results||[];
async function markerReady(db){try{const row=await db.prepare('SELECT item_count FROM data_seed_state WHERE seed_key = ?').bind(MARKER_KEY).first();return Number(row?.item_count||0)>=MARKER_VERSION}catch{return false}}
async function persistMarker(db){try{await db.prepare(`INSERT INTO data_seed_state(seed_key,item_count,completed_at) VALUES(?,?,?) ON CONFLICT(seed_key) DO UPDATE SET item_count=excluded.item_count,completed_at=excluded.completed_at`).bind(MARKER_KEY,MARKER_VERSION,new Date().toISOString()).run()}catch(error){console.warn('schema_v41_marker_write_failed',error?.message||error)}}
async function tableColumns(db,table){try{return new Set(rows(await db.prepare(`PRAGMA table_info(${table})`).all()).map(item=>item.name))}catch{return new Set()}}
async function ensureColumn(db,table,column,definition){const columns=await tableColumns(db,table);if(columns.has(column))return false;await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();return true}
async function repairApprovalPolicyDrift(db){
  const before=await tableColumns(db,'approval_policies');
  if(!before.size)return{repaired:false,reason:'table_missing'};
  const added={};
  added.costCenter=await ensureColumn(db,'approval_policies','cost_center_id','TEXT');
  added.threshold=await ensureColumn(db,'approval_policies','threshold_amount','INTEGER NOT NULL DEFAULT 0');
  added.requiredRole=await ensureColumn(db,'approval_policies','required_role',"TEXT NOT NULL DEFAULT 'approver'");
  added.active=await ensureColumn(db,'approval_policies','active','INTEGER NOT NULL DEFAULT 1');
  added.createdBy=await ensureColumn(db,'approval_policies','created_by','TEXT');
  const legacy=before;
  if(legacy.has('amount_threshold'))await db.prepare('UPDATE approval_policies SET threshold_amount=CASE WHEN threshold_amount=0 THEN COALESCE(amount_threshold,0) ELSE threshold_amount END').run();
  if(legacy.has('approver_role'))await db.prepare("UPDATE approval_policies SET required_role=CASE WHEN (required_role='' OR required_role='approver') AND COALESCE(approver_role,'')<>'' THEN approver_role ELSE required_role END").run();
  if(legacy.has('enabled'))await db.prepare('UPDATE approval_policies SET active=COALESCE(enabled,active,1)').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_v41_approval_policy_scope ON approval_policies(org_id,cost_center_id)').run();
  return{repaired:Object.values(added).some(Boolean),added};
}
async function enterpriseSchemaReady(db){
  try{
    const [supplier,orders,receptions,invoices,products,relations,approvals,paymentSchedules,orderApprovals,notifications]=await Promise.all([
      tableColumns(db,'suppliers'),tableColumns(db,'orders'),tableColumns(db,'receptions'),tableColumns(db,'invoices'),tableColumns(db,'products'),tableColumns(db,'supplier_products'),tableColumns(db,'approval_policies'),tableColumns(db,'payment_schedules'),tableColumns(db,'order_approvals'),tableColumns(db,'notification_events')
    ]);
    return supplier.has('payment_term_type')&&supplier.has('payment_term_anchor')&&orders.has('approval_status')&&orders.has('closed_at')&&orders.has('internal_revision')&&receptions.has('revision')&&receptions.has('quick_mode')&&invoices.has('payment_status')&&invoices.has('due_date')&&invoices.has('validation_status')&&products.has('normalized_key')&&relations.has('content_signature')&&approvals.has('cost_center_id')&&approvals.has('threshold_amount')&&approvals.has('required_role')&&approvals.has('active')&&paymentSchedules.has('due_date')&&paymentSchedules.has('status')&&orderApprovals.has('batch_id')&&notifications.has('status');
  }catch{return false}
}
export async function ensureEnterpriseSchemaV41(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{
    const marker=await markerReady(env.DB),healthy=marker?await enterpriseSchemaReady(env.DB):false;
    if(marker&&healthy)return{ready:true,added:{},fastPath:true,driftRepaired:false};
    const result=await ensureLegacyEnterpriseSchemaV41(env);
    const approvalRepair=await repairApprovalPolicyDrift(env.DB);
    const ready=await enterpriseSchemaReady(env.DB);
    if(!ready)throw new Error('Enterprise schema repair did not converge');
    await persistMarker(env.DB);
    return{...result,ready:true,fastPath:false,driftRepaired:true,approvalRepair};
  })().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
