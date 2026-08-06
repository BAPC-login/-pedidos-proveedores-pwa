import {HttpError,nowIso,uuid} from '../core.js';

const rows=result=>result?.results||[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let integrityPromise=null;

async function ensureLockTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS folio_operation_locks(
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lock_key TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,lock_key)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_locks_expiry ON folio_operation_locks(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_org_folio_lookup ON orders(org_id,folio)').run();
}

async function acquireLock(env,orgId,lockKey,{ttlMs=20000,attempts=70}={}){
  await ensureLockTable(env);
  const token=uuid();
  for(let attempt=0;attempt<attempts;attempt++){
    const current=new Date(),now=current.toISOString(),expiresAt=new Date(current.getTime()+ttlMs).toISOString();
    await env.DB.prepare(`INSERT OR IGNORE INTO folio_operation_locks(org_id,lock_key,token,expires_at,updated_at)
      VALUES(?,?,?,?,?)`).bind(orgId,lockKey,token,expiresAt,now).run();
    const result=await env.DB.prepare(`UPDATE folio_operation_locks SET token=?,expires_at=?,updated_at=?
      WHERE org_id=? AND lock_key=? AND (token=? OR expires_at<=?)`)
      .bind(token,expiresAt,now,orgId,lockKey,token,now).run();
    if(Number(result?.meta?.changes||0)>0)return token;
    await wait(Math.min(240,55+attempt*7));
  }
  throw new HttpError(409,'Otro pedido está reservando un folio. Intenta nuevamente en unos segundos.','folio_allocation_busy');
}

async function releaseLock(env,orgId,lockKey,token){
  await env.DB.prepare('DELETE FROM folio_operation_locks WHERE org_id=? AND lock_key=? AND token=?')
    .bind(orgId,lockKey,token).run().catch(()=>{});
}

export async function withFolioWriteLockV34(env,orgId,work){
  const token=await acquireLock(env,orgId,'folios');
  try{return await work()}finally{await releaseLock(env,orgId,'folios',token)}
}

function folioParts(value){
  const match=String(value||'').match(/^(.*-)(\d{3,})$/);
  return match?{prefix:match[1],width:match[2].length}:null;
}

function nextFolio(used,current){
  const parts=folioParts(current);
  if(parts){
    let number=1,candidate='';
    do{candidate=`${parts.prefix}${String(number++).padStart(parts.width,'0')}`}while(used.has(candidate));
    used.add(candidate);return candidate;
  }
  const base=`FIX-${new Date().toISOString().slice(0,10).replaceAll('-','')}-`;let number=1,candidate='';
  do{candidate=`${base}${String(number++).padStart(4,'0')}`}while(used.has(candidate));
  used.add(candidate);return candidate;
}

async function repairDuplicates(env){
  const groups=rows(await env.DB.prepare(`SELECT org_id,folio,COUNT(*) AS total
    FROM orders GROUP BY org_id,folio HAVING COUNT(*)>1 ORDER BY org_id,folio`).all());
  const repaired=[];
  for(const group of groups){
    const orders=rows(await env.DB.prepare(`SELECT id,folio,status,location_id,created_at,updated_at,emitted_at,sent_at
      FROM orders WHERE org_id=? AND folio=?
      ORDER BY CASE WHEN status='draft' THEN 2 WHEN status='cancelled' THEN 3 ELSE 0 END,
        COALESCE(emitted_at,sent_at,created_at),created_at,id`).bind(group.org_id,group.folio).all());
    if(orders.length<2)continue;
    const used=new Set(rows(await env.DB.prepare('SELECT folio FROM orders WHERE org_id=?').bind(group.org_id).all()).map(item=>String(item.folio||'')));
    const timestamp=nowIso(),changes=orders.slice(1).map(order=>({order,to:nextFolio(used,order.folio),temporary:`TMP-${uuid()}`}));
    if(!changes.length)continue;
    await env.DB.batch(changes.map(change=>env.DB.prepare('UPDATE orders SET folio=?,updated_at=? WHERE id=? AND org_id=?')
      .bind(change.temporary,timestamp,change.order.id,group.org_id)));
    const statements=[];
    for(const change of changes){
      statements.push(env.DB.prepare('UPDATE orders SET folio=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=?')
        .bind(change.to,timestamp,change.order.id,group.org_id));
      statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,org_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata_json,ip_hash,created_at)
        VALUES(?,?,NULL,'system@nuvasto.local','system.folio_repair','order',?,?,'',?)`)
        .bind(uuid(),group.org_id,change.order.id,JSON.stringify({from:group.folio,to:change.to,reason:'duplicate_folio_v34'}),timestamp));
      repaired.push({orgId:group.org_id,orderId:change.order.id,from:group.folio,to:change.to});
    }
    await env.DB.batch(statements);
  }
  return repaired;
}

async function runIntegrity(env){
  await ensureLockTable(env);
  const systemOrg='__system__',token=await acquireLock(env,systemOrg,'integrity',{ttlMs:45000,attempts:100});
  try{
    // The global integrity lock protects the one-time repair. Folio writes use an
    // organization lock afterwards, while the database index is the final guard.
    const repaired=await repairDuplicates(env);
    await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_folio_unique ON orders(org_id,folio)').run();
    return{ready:true,repaired,repairedCount:repaired.length,uniqueIndex:true,checkedAt:nowIso()};
  }finally{await releaseLock(env,systemOrg,'integrity',token)}
}

export async function ensureFolioIntegrityV34(env,{force=false}={}){
  if(force)return runIntegrity(env);
  if(integrityPromise)return integrityPromise;
  integrityPromise=runIntegrity(env).catch(error=>{integrityPromise=null;throw error});
  return integrityPromise;
}

export async function folioIntegrityStatusV34(env){
  await ensureLockTable(env);
  const duplicate=await env.DB.prepare(`SELECT COUNT(*) AS total FROM(
    SELECT org_id,folio FROM orders GROUP BY org_id,folio HAVING COUNT(*)>1
  )`).first();
  const indexes=rows(await env.DB.prepare('PRAGMA index_list(orders)').all());
  return{duplicates:Number(duplicate?.total||0),uniqueIndex:indexes.some(item=>item.name==='idx_orders_org_folio_unique'),checkedAt:nowIso()};
}
