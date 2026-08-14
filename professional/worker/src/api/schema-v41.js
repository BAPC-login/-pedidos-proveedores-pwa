import {ensureEnterpriseSchemaV41 as ensureLegacyEnterpriseSchemaV41} from './schema-v41-legacy-v45.js';
export * from './schema-v41-legacy-v45.js';

// Canonical enterprise schema guard. Historical compatibility remains behind one public owner.
const MARKER_KEY='schema-enterprise-v41-ready-v45';
const MARKER_VERSION=41;
let initializationPromise=null;
const rows=result=>result?.results||[];
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
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
  if(before.has('amount_threshold'))await db.prepare('UPDATE approval_policies SET threshold_amount=CASE WHEN threshold_amount=0 THEN COALESCE(amount_threshold,0) ELSE threshold_amount END').run();
  if(before.has('approver_role'))await db.prepare("UPDATE approval_policies SET required_role=CASE WHEN (required_role='' OR required_role='approver') AND COALESCE(approver_role,'')<>'' THEN approver_role ELSE required_role END").run();
  if(before.has('enabled'))await db.prepare('UPDATE approval_policies SET active=COALESCE(enabled,active,1)').run();
  await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_v41_approval_policy_scope ON approval_policies(org_id,cost_center_id)').run();
  return{repaired:Object.values(added).some(Boolean),added};
}

const PAYMENT_METHOD_DEFAULTS=[
  ['transfer','Transferencia bancaria','transfer',{reference:true}],
  ['cheque','Cheque','cheque',{chequeNumber:true,collectionDate:true,payee:true,amount:true}],
  ['cash','Efectivo','cash',{}],
  ['card','Tarjeta','card',{reference:true}],
  ['deposit','Depósito bancario','deposit',{reference:true}],
  ['other','Otro','other',{}]
];

async function migrateLegacyPaymentSchedules(db){
  const legacy=rows(await db.prepare(`SELECT ps.* FROM payment_schedules ps
    WHERE (COALESCE(ps.payment_method_id,'')<>'' OR COALESCE(ps.payment_method_code,'')<>'' OR COALESCE(ps.proof_file_id,'')<>'' OR COALESCE(ps.cheque_number,'')<>'' OR COALESCE(ps.paid_amount,0)>0)
    AND NOT EXISTS(SELECT 1 FROM payment_allocations pa WHERE pa.org_id=ps.org_id AND pa.payment_schedule_id=ps.id)`).all());
  if(!legacy.length)return{migrated:0};
  let migrated=0;
  for(const item of legacy){
    const method=item.payment_method_id?await db.prepare('SELECT id,code,name,kind FROM payment_methods WHERE id=? AND org_id=?').bind(item.payment_method_id,item.org_id).first():await db.prepare('SELECT id,code,name,kind FROM payment_methods WHERE org_id=? AND (code=? OR kind=?) ORDER BY active DESC,sort_order LIMIT 1').bind(item.org_id,item.payment_method_code||'',item.payment_method_code||'').first();
    const id=crypto.randomUUID(),stamp=item.updated_at||item.created_at||new Date().toISOString(),amount=Math.max(0,Math.round(Number(item.amount||0))),documentTotal=Math.max(0,Math.round(Number(item.cheque_amount||item.paid_amount||item.amount||0))),allocated=Math.min(amount,documentTotal||amount),status=item.status==='overdue'?'scheduled':String(item.status||'pending'),metadata={...safeJson(item.payment_metadata_json,{}),legacyScheduleId:item.id,migratedR74:true};
    if(!allocated)continue;
    await db.batch([
      db.prepare(`INSERT INTO payment_documents(id,org_id,supplier_id,payment_method_id,payment_method_code,payment_method_name,status,payment_date,total_amount,currency,reference,cheque_number,cheque_collection_date,cheque_payee,cheque_amount,cheque_bank,proof_file_id,note,source,metadata_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'CLP',?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,item.org_id,item.supplier_id,method?.id||item.payment_method_id||null,method?.code||item.payment_method_code||'',method?.name||item.payment_method_name||'',status,item.payment_date||null,documentTotal||allocated,item.reference||'',item.cheque_number||'',item.cheque_collection_date||null,item.cheque_payee||'',Math.max(0,Math.round(Number(item.cheque_amount||0))),item.cheque_bank||'',item.proof_file_id||null,item.note||'',item.payment_source||'legacy-migration',JSON.stringify(metadata),item.responsible_user_id||null,item.created_at||stamp,stamp),
      db.prepare(`INSERT INTO payment_allocations(id,org_id,payment_document_id,invoice_id,payment_schedule_id,allocated_amount,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),item.org_id,id,item.invoice_id,item.id,allocated,item.created_at||stamp,stamp)
    ]);
    migrated++;
  }
  return{migrated};
}

async function ensurePaymentSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_methods(
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'other',
    active INTEGER NOT NULL DEFAULT 1,requirements_json TEXT NOT NULL DEFAULT '{}',sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,code)
  )`).run();
  const added={};
  added.methodId=await ensureColumn(db,'payment_schedules','payment_method_id','TEXT');
  added.methodCode=await ensureColumn(db,'payment_schedules','payment_method_code',"TEXT NOT NULL DEFAULT ''");
  added.methodName=await ensureColumn(db,'payment_schedules','payment_method_name',"TEXT NOT NULL DEFAULT ''");
  added.paymentDate=await ensureColumn(db,'payment_schedules','payment_date','TEXT');
  added.chequeNumber=await ensureColumn(db,'payment_schedules','cheque_number',"TEXT NOT NULL DEFAULT ''");
  added.chequeCollection=await ensureColumn(db,'payment_schedules','cheque_collection_date','TEXT');
  added.chequePayee=await ensureColumn(db,'payment_schedules','cheque_payee',"TEXT NOT NULL DEFAULT ''");
  added.chequeAmount=await ensureColumn(db,'payment_schedules','cheque_amount','INTEGER NOT NULL DEFAULT 0');
  added.chequeBank=await ensureColumn(db,'payment_schedules','cheque_bank',"TEXT NOT NULL DEFAULT ''");
  added.proof=await ensureColumn(db,'payment_schedules','proof_file_id','TEXT');
  added.paidAmount=await ensureColumn(db,'payment_schedules','paid_amount','INTEGER NOT NULL DEFAULT 0');
  added.metadata=await ensureColumn(db,'payment_schedules','payment_metadata_json',"TEXT NOT NULL DEFAULT '{}'");
  added.source=await ensureColumn(db,'payment_schedules','payment_source',"TEXT NOT NULL DEFAULT 'manual'");
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_documents(
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL,supplier_id TEXT NOT NULL,payment_method_id TEXT,payment_method_code TEXT NOT NULL DEFAULT '',payment_method_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',payment_date TEXT,total_amount INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'CLP',reference TEXT NOT NULL DEFAULT '',
    cheque_number TEXT NOT NULL DEFAULT '',cheque_collection_date TEXT,cheque_payee TEXT NOT NULL DEFAULT '',cheque_amount INTEGER NOT NULL DEFAULT 0,cheque_bank TEXT NOT NULL DEFAULT '',
    proof_file_id TEXT,note TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',metadata_json TEXT NOT NULL DEFAULT '{}',created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_allocations(
    id TEXT PRIMARY KEY,org_id TEXT NOT NULL,payment_document_id TEXT NOT NULL,invoice_id TEXT NOT NULL,payment_schedule_id TEXT NOT NULL,allocated_amount INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    UNIQUE(payment_document_id,invoice_id)
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON payment_methods(org_id,active,sort_order,name)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_cheque_collection ON payment_schedules(org_id,payment_method_code,cheque_collection_date,status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_documents_org_supplier ON payment_documents(org_id,supplier_id,status,created_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_documents_cheque ON payment_documents(org_id,payment_method_code,cheque_collection_date,status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_allocations_document ON payment_allocations(org_id,payment_document_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(org_id,invoice_id,payment_schedule_id)').run();
  const orgs=rows(await db.prepare("SELECT id FROM organizations WHERE status='active'").all()),stamp=new Date().toISOString();
  for(const org of orgs)for(let index=0;index<PAYMENT_METHOD_DEFAULTS.length;index++){
    const[code,name,kind,requirements]=PAYMENT_METHOD_DEFAULTS[index];
    await db.prepare(`INSERT OR IGNORE INTO payment_methods(id,org_id,code,name,kind,active,requirements_json,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?)`).bind(crypto.randomUUID(),org.id,code,name,kind,JSON.stringify(requirements),index*10,stamp,stamp).run();
  }
  const legacyMigration=await migrateLegacyPaymentSchedules(db);
  return{ready:true,added,legacyMigration};
}

async function enterpriseSchemaReady(db){
  try{
    const [supplier,orders,receptions,invoices,products,relations,approvals,paymentSchedules,paymentMethods,paymentDocuments,paymentAllocations,orderApprovals,notifications]=await Promise.all([
      tableColumns(db,'suppliers'),tableColumns(db,'orders'),tableColumns(db,'receptions'),tableColumns(db,'invoices'),tableColumns(db,'products'),tableColumns(db,'supplier_products'),tableColumns(db,'approval_policies'),tableColumns(db,'payment_schedules'),tableColumns(db,'payment_methods'),tableColumns(db,'payment_documents'),tableColumns(db,'payment_allocations'),tableColumns(db,'order_approvals'),tableColumns(db,'notification_events')
    ]);
    return supplier.has('payment_term_type')&&supplier.has('payment_term_anchor')&&orders.has('approval_status')&&orders.has('closed_at')&&orders.has('internal_revision')&&receptions.has('revision')&&receptions.has('quick_mode')&&invoices.has('payment_status')&&invoices.has('due_date')&&invoices.has('validation_status')&&products.has('normalized_key')&&relations.has('content_signature')&&approvals.has('cost_center_id')&&approvals.has('threshold_amount')&&approvals.has('required_role')&&approvals.has('active')&&paymentSchedules.has('due_date')&&paymentSchedules.has('status')&&paymentSchedules.has('payment_method_id')&&paymentSchedules.has('cheque_collection_date')&&paymentSchedules.has('cheque_payee')&&paymentSchedules.has('cheque_amount')&&paymentMethods.has('code')&&paymentMethods.has('requirements_json')&&paymentDocuments.has('supplier_id')&&paymentDocuments.has('total_amount')&&paymentDocuments.has('proof_file_id')&&paymentAllocations.has('payment_document_id')&&paymentAllocations.has('invoice_id')&&paymentAllocations.has('allocated_amount')&&orderApprovals.has('batch_id')&&notifications.has('status');
  }catch{return false}
}
export async function ensureEnterpriseSchemaV41(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{
    const marker=await markerReady(env.DB);
    if(marker&&await enterpriseSchemaReady(env.DB))return{ready:true,added:{},fastPath:true,driftRepaired:false};
    const result=await ensureLegacyEnterpriseSchemaV41(env);
    const approvalRepair=await repairApprovalPolicyDrift(env.DB),paymentRepair=await ensurePaymentSchema(env.DB);
    const ready=await enterpriseSchemaReady(env.DB);
    if(!ready)throw new Error('Enterprise schema repair did not converge');
    await persistMarker(env.DB);
    return{...result,ready:true,fastPath:false,driftRepaired:true,approvalRepair,paymentRepair};
  })().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
