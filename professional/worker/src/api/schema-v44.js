import {ensureProcurementSuiteV44 as ensureLegacyProcurementSuiteV44} from './schema-v44-legacy-v45.js';
export * from './schema-v44-legacy-v45.js';

const MARKER_KEY='schema-procurement-v44-ready-v45';
const MARKER_VERSION=44;
let initializationPromise=null;
async function markerReady(db){try{const row=await db.prepare('SELECT item_count FROM data_seed_state WHERE seed_key = ?').bind(MARKER_KEY).first();return Number(row?.item_count||0)>=MARKER_VERSION}catch{return false}}
async function persistMarker(db){try{await db.prepare(`INSERT INTO data_seed_state(seed_key,item_count,completed_at) VALUES(?,?,?) ON CONFLICT(seed_key) DO UPDATE SET item_count=excluded.item_count,completed_at=excluded.completed_at`).bind(MARKER_KEY,MARKER_VERSION,new Date().toISOString()).run()}catch(error){console.warn('schema_v44_marker_write_failed',error?.message||error)}}
export async function ensureProcurementSuiteV44(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{if(await markerReady(env.DB))return{ready:true,tables:6,added:{},fastPath:true};const result=await ensureLegacyProcurementSuiteV44(env);await persistMarker(env.DB);return{...result,fastPath:false}})().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
