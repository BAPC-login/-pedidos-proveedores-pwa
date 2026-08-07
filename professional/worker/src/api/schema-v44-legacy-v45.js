let initializationPromise=null;
const rows=result=>result?.results||[];
async function ensureColumn(db,table,column,definition){const result=await db.prepare(`PRAGMA table_info(${table})`).all();if(rows(result).some(item=>item.name===column))return false;await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();return true}
const ddl=[
`CREATE TABLE IF NOT EXISTS procurement_user_permissions(org_id TEXT NOT NULL,user_id TEXT NOT NULL,location_scope TEXT NOT NULL DEFAULT '["*"]',cost_center_scope TEXT NOT NULL DEFAULT '["*"]',max_order_amount INTEGER NOT NULL DEFAULT 0,can_create_orders INTEGER NOT NULL DEFAULT 0,can_emit_orders INTEGER NOT NULL DEFAULT 0,can_receive INTEGER NOT NULL DEFAULT 0,can_manage_catalog INTEGER NOT NULL DEFAULT 0,can_view_finance INTEGER NOT NULL DEFAULT 0,can_approve INTEGER NOT NULL DEFAULT 0,updated_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(org_id,user_id))`,
`CREATE TABLE IF NOT EXISTS product_favorites(org_id TEXT NOT NULL,user_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,product_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(org_id,user_id,cost_center_id,product_id))`,
`CREATE TABLE IF NOT EXISTS reception_evidence_v44(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,reception_id TEXT,order_id TEXT NOT NULL,order_item_id TEXT,file_id TEXT,storage_key TEXT NOT NULL DEFAULT '',evidence_type TEXT NOT NULL DEFAULT 'photo',note TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS work_jobs_v44(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,job_type TEXT NOT NULL,entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,progress INTEGER NOT NULL DEFAULT 0,error_message TEXT NOT NULL DEFAULT '',payload_json TEXT NOT NULL DEFAULT '{}',result_json TEXT NOT NULL DEFAULT '{}',available_at TEXT NOT NULL,locked_at TEXT,started_at TEXT,completed_at TEXT,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS master_data_merge_events_v44(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,entity_type TEXT NOT NULL,source_id TEXT NOT NULL,target_id TEXT NOT NULL,metadata_json TEXT NOT NULL DEFAULT '{}',created_by TEXT,created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS system_health_snapshots_v44(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,health_json TEXT NOT NULL DEFAULT '{}',created_by TEXT,created_at TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_v44_permissions_user ON procurement_user_permissions(org_id,user_id)`,
`CREATE INDEX IF NOT EXISTS idx_v44_favorites_user_center ON product_favorites(org_id,user_id,cost_center_id)`,
`CREATE INDEX IF NOT EXISTS idx_v44_evidence_order ON reception_evidence_v44(org_id,order_id,created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_v44_jobs_status ON work_jobs_v44(org_id,status,available_at,created_at)`,
`CREATE INDEX IF NOT EXISTS idx_v44_merge_events ON master_data_merge_events_v44(org_id,entity_type,created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_v44_health ON system_health_snapshots_v44(org_id,created_at DESC)`
];
export async function ensureProcurementSuiteV44(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{const added={categoryCostCenter:await ensureColumn(env.DB,'categories','cost_center_id','TEXT')};for(const statement of ddl)await env.DB.prepare(statement).run();await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_v44_categories_center ON categories(org_id,cost_center_id,active,sort_order)').run();return{ready:true,tables:6,added}})().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
