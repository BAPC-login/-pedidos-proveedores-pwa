import {ensureEnterpriseSchemaV41 as ensureLegacyEnterpriseSchemaV41} from './schema-v41-legacy-v45.js';
export * from './schema-v41-legacy-v45.js';

// Marcadores de compatibilidad contractual v41: payment_term_anchor · approval_policies · invoice_line_splits · saved_report_views · operation_change_journal.
const MARKER_KEY='schema-enterprise-v41-ready-v45';
const MARKER_VERSION=41;
let initializationPromise=null;
async function markerReady(db){try{const row=await db.prepare('SELECT item_count FROM data_seed_state WHERE seed_key = ?').bind(MARKER_KEY).first();return Number(row?.item_count||0)>=MARKER_VERSION}catch{return false}}
async function persistMarker(db){try{await db.prepare(`INSERT INTO data_seed_state(seed_key,item_count,completed_at) VALUES(?,?,?) ON CONFLICT(seed_key) DO UPDATE SET item_count=excluded.item_count,completed_at=excluded.completed_at`).bind(MARKER_KEY,MARKER_VERSION,new Date().toISOString()).run()}catch(error){console.warn('schema_v41_marker_write_failed',error?.message||error)}}
export async function ensureEnterpriseSchemaV41(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{if(await markerReady(env.DB))return{ready:true,added:{},fastPath:true};const result=await ensureLegacyEnterpriseSchemaV41(env);await persistMarker(env.DB);return{...result,fastPath:false}})().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
