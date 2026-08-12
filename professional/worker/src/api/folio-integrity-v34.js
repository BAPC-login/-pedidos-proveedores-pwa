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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS folio_sequences(
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    cost_center_id TEXT NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
    prefix TEXT NOT NULL,
    last_value INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,location_id,cost_center_id),
    UNIQUE(org_id,prefix)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_locks_expiry ON folio_operation_locks(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_org_folio_lookup ON orders(org_id,folio)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_sequences_scope ON folio_sequences(org_id,location_id,cost_center_id)').run();
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

const cleanToken=(value,fallback)=>String(value||fallback||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')||fallback;
function prefixCandidates(locationCode,costCenterCode){
  const location=cleanToken(locationCode,'LOC').slice(0,6),center=cleanToken(costCenterCode,'C').slice(0,10),candidates=[];
  for(let length=1;length<=Math.min(6,center.length);length++)candidates.push(`${location}${center.slice(0,length)}`);
  const stem=`${location}${center.slice(0,Math.min(4,center.length))}`;
  for(let suffix=2;suffix<=99;suffix++)candidates.push(`${stem}${suffix}`);
  return candidates;
}
async function existingSequenceMaximum(env,orgId,locationId,costCenterId,prefix){
  const result=await env.DB.prepare(`SELECT o.folio FROM orders o
    JOIN order_cost_centers occ ON occ.order_id=o.id AND occ.org_id=o.org_id
    WHERE o.org_id=? AND o.location_id=? AND occ.cost_center_id=? AND o.status!='draft'`)
    .bind(orgId,locationId,costCenterId).all();
  const pattern=new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(\\d{5,})$`);
  let maximum=0;
  for(const item of rows(result)){const match=String(item.folio||'').match(pattern);if(match)maximum=Math.max(maximum,Number(match[1])||0)}
  return maximum;
}
async function ensureSequence(env,orgId,scope){
  const current=await env.DB.prepare('SELECT prefix,last_value FROM folio_sequences WHERE org_id=? AND location_id=? AND cost_center_id=?')
    .bind(orgId,scope.locationId,scope.costCenterId).first();
  if(current)return current;
  for(const prefix of prefixCandidates(scope.locationCode,scope.costCenterCode||scope.costCenterName)){
    const maximum=await existingSequenceMaximum(env,orgId,scope.locationId,scope.costCenterId,prefix),timestamp=nowIso();
    await env.DB.prepare(`INSERT OR IGNORE INTO folio_sequences(org_id,location_id,cost_center_id,prefix,last_value,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).bind(orgId,scope.locationId,scope.costCenterId,prefix,maximum,timestamp,timestamp).run();
    const created=await env.DB.prepare('SELECT prefix,last_value FROM folio_sequences WHERE org_id=? AND location_id=? AND cost_center_id=?')
      .bind(orgId,scope.locationId,scope.costCenterId).first();
    if(created)return created;
  }
  throw new HttpError(409,'No fue posible reservar un prefijo único para el local y centro de costo.','folio_prefix_unavailable');
}

export async function allocateScopedFoliosV66(env,orgId,scope,count=1){
  const amount=Math.max(1,Math.min(1000,Number(count)||1));
  if(!scope?.locationId||!scope?.costCenterId)throw new HttpError(400,'El folio requiere local y centro de costo.','folio_scope_required');
  const lockKey=`folio:${scope.locationId}:${scope.costCenterId}`,token=await acquireLock(env,orgId,lockKey,{ttlMs:25000,attempts:90});
  try{
    const sequence=await ensureSequence(env,orgId,scope),start=Number(sequence.last_value||0)+1,last=start+amount-1,timestamp=nowIso();
    await env.DB.prepare(`UPDATE folio_sequences SET last_value=?,updated_at=?
      WHERE org_id=? AND location_id=? AND cost_center_id=?`).bind(last,timestamp,orgId,scope.locationId,scope.costCenterId).run();
    return Array.from({length:amount},(_,index)=>`${sequence.prefix}${String(start+index).padStart(5,'0')}`);
  }finally{await releaseLock(env,orgId,lockKey,token)}
}

function folioParts(value){
  const match=String(value||'').match(/^(.*?)(\d{3,})$/);
  return match?{prefix:match[1],width:match[2].length}:null;
}

function nextFolio(used,current){
  const parts=folioParts(current);
  if(parts){
    let number=1,candidate='';
    do{candidate=`${parts.prefix}${String(number++).padStart(parts.width,'0')}`}while(used.has(candidate));
    used.add(candidate);return candidate;
  }
  const base='FIX';let number=1,candidate='';
  do{candidate=`${base}${String(number++).padStart(5,'0')}`}while(used.has(candidate));
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
  const anchor=await env.DB.prepare('SELECT id FROM organizations ORDER BY created_at,id LIMIT 1').first();
  if(!anchor?.id){
    await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_folio_unique ON orders(org_id,folio)').run();
    return{ready:true,repaired:[],repairedCount:0,uniqueIndex:true,checkedAt:nowIso()};
  }
  const token=await acquireLock(env,anchor.id,'integrity-global',{ttlMs:45000,attempts:100});
  try{
    const repaired=await repairDuplicates(env);
    await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_folio_unique ON orders(org_id,folio)').run();
    return{ready:true,repaired,repairedCount:repaired.length,uniqueIndex:true,checkedAt:nowIso()};
  }finally{await releaseLock(env,anchor.id,'integrity-global',token)}
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
