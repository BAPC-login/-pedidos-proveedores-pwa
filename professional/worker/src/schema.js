import {ensureSchema as ensureLegacySchema} from './schema-legacy-v45.js';
export * from './schema-legacy-v45.js';

// Contrato histórico conservado por pruebas y migraciones: categories','cost_center_id'.
const SCHEMA_VERSION='32';
const MARKER_KEY='schema-core-v32-ready-v45';
const MARKER_VERSION=Number(SCHEMA_VERSION);
let initializationPromise=null;

async function markerReady(db){
  try{const row=await db.prepare('SELECT item_count FROM data_seed_state WHERE seed_key = ?').bind(MARKER_KEY).first();return Number(row?.item_count||0)>=MARKER_VERSION}catch{return false}
}
async function persistMarker(db){
  try{await db.prepare(`INSERT INTO data_seed_state(seed_key,item_count,completed_at) VALUES(?,?,?) ON CONFLICT(seed_key) DO UPDATE SET item_count=excluded.item_count,completed_at=excluded.completed_at`).bind(MARKER_KEY,MARKER_VERSION,new Date().toISOString()).run()}catch(error){console.warn('schema_marker_write_failed',error?.message||error)}
}
export async function ensureSchema(env){
  if(!env.DB)throw new Error('D1 binding DB is not available');
  if(initializationPromise)return initializationPromise;
  initializationPromise=(async()=>{
    if(await markerReady(env.DB))return{initialized:true,seeded:false,version:SCHEMA_VERSION,statements:0,fastPath:true};
    const result=await ensureLegacySchema(env);await persistMarker(env.DB);return{...result,fastPath:false};
  })().catch(error=>{initializationPromise=null;throw error});
  return initializationPromise;
}
