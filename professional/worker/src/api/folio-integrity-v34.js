import {HttpError,nowIso,uuid} from '../core.js';

const rows=result=>result?.results||[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let integrityPromise=null;

async function runBatches(env,statements,size=70){for(let index=0;index<statements.length;index+=size)await env.DB.batch(statements.slice(index,index+size))}
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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_folio_aliases(
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    legacy_folio TEXT NOT NULL,
    current_folio TEXT NOT NULL,
    migrated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,order_id),
    UNIQUE(org_id,legacy_folio)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS folio_migrations(
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    migrated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL,
    PRIMARY KEY(org_id,version)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_locks_expiry ON folio_operation_locks(expires_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_org_folio_lookup ON orders(org_id,folio)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_sequences_scope ON folio_sequences(org_id,location_id,cost_center_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_folio_alias_current ON order_folio_aliases(org_id,current_folio)').run();
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
  const token=await acquireLock(env,orgId,'folios',{ttlMs:60000,attempts:100});
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

export async function migrateLegacyFoliosV67(env,orgId){
  await ensureLockTable(env);const version='scoped-sequence-v67';
  const completed=await env.DB.prepare('SELECT migrated_count,skipped_count,completed_at FROM folio_migrations WHERE org_id=? AND version=?').bind(orgId,version).first();
  if(completed)return{migrated:Number(completed.migrated_count||0),skipped:Number(completed.skipped_count||0),completedAt:completed.completed_at,alreadyMigrated:true};
  const result=await env.DB.prepare(`SELECT o.id,o.folio,o.location_id,
      COALESCE(occ.cost_center_id,o.cost_center_id) AS cost_center_id,
      l.code AS location_code,l.name AS location_name,cc.code AS cost_center_code,cc.name AS cost_center_name,
      COALESCE(o.emitted_at,o.sent_at,o.created_at) AS sequence_at,o.created_at
    FROM orders o
    JOIN locations l ON l.id=o.location_id AND l.org_id=o.org_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id AND occ.org_id=o.org_id
    LEFT JOIN cost_centers cc ON cc.id=COALESCE(occ.cost_center_id,o.cost_center_id) AND cc.org_id=o.org_id
    WHERE o.org_id=? AND o.status!='draft'
    ORDER BY sequence_at,o.created_at,o.id`).bind(orgId).all(),orders=rows(result),timestamp=nowIso();
  const eligible=orders.filter(order=>order.location_id&&order.cost_center_id&&order.cost_center_code),skipped=orders.length-eligible.length;
  if(!eligible.length){await env.DB.prepare('INSERT INTO folio_migrations(org_id,version,migrated_count,skipped_count,completed_at) VALUES(?,?,?,?,?)').bind(orgId,version,0,skipped,timestamp).run();return{migrated:0,skipped,completedAt:timestamp}}
  const groups=new Map();for(const order of eligible){const key=`${order.location_id}:${order.cost_center_id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(order)}
  const sequences=new Map();for(const[key,items]of groups){const first=items[0],sequence=await ensureSequence(env,orgId,{locationId:first.location_id,locationCode:first.location_code,costCenterId:first.cost_center_id,costCenterCode:first.cost_center_code,costCenterName:first.cost_center_name});sequences.set(key,sequence)}
  const aliasStatements=eligible.map(order=>env.DB.prepare(`INSERT INTO order_folio_aliases(org_id,order_id,legacy_folio,current_folio,migrated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(org_id,order_id) DO UPDATE SET current_folio=excluded.current_folio,migrated_at=excluded.migrated_at`).bind(orgId,order.id,String(order.folio||''),String(order.folio||''),timestamp));
  await runBatches(env,aliasStatements);
  await runBatches(env,eligible.map(order=>env.DB.prepare('UPDATE orders SET folio=?,updated_at=? WHERE id=? AND org_id=?').bind(`MIG-${order.id}-${uuid().slice(0,8)}`,timestamp,order.id,orgId)));
  const finalStatements=[];let migrated=0;
  for(const[key,items]of groups){const sequence=sequences.get(key);items.forEach((order,index)=>{const folio=`${sequence.prefix}${String(index+1).padStart(5,'0')}`;finalStatements.push(env.DB.prepare('UPDATE orders SET folio=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=?').bind(folio,timestamp,order.id,orgId));finalStatements.push(env.DB.prepare('UPDATE order_folio_aliases SET current_folio=?,migrated_at=? WHERE org_id=? AND order_id=?').bind(folio,timestamp,orgId,order.id));finalStatements.push(env.DB.prepare(`INSERT INTO audit_logs(id,org_id,actor_user_id,actor_email,action,entity_type,entity_id,metadata_json,ip_hash,created_at)
      VALUES(?,?,NULL,'system@nuvasto.local','system.folio_scope_migration','order',?,?,'',?)`).bind(uuid(),orgId,order.id,JSON.stringify({from:order.folio,to:folio,locationId:order.location_id,costCenterId:order.cost_center_id,version}),timestamp));migrated++});finalStatements.push(env.DB.prepare('UPDATE folio_sequences SET last_value=?,updated_at=? WHERE org_id=? AND location_id=? AND cost_center_id=?').bind(items.length,timestamp,orgId,items[0].location_id,items[0].cost_center_id))}
  await runBatches(env,finalStatements);
  await env.DB.prepare('INSERT INTO folio_migrations(org_id,version,migrated_count,skipped_count,completed_at) VALUES(?,?,?,?,?)').bind(orgId,version,migrated,skipped,timestamp).run();
  return{migrated,skipped,completedAt:timestamp,alreadyMigrated:false};
}

export async function folioAliasMapV67(env,orgId,orderIds=[]){
  await ensureLockTable(env);const ids=[...new Set(orderIds.map(String).filter(Boolean))];if(!ids.length)return new Map();const placeholders=ids.map(()=>'?').join(','),result=await env.DB.prepare(`SELECT order_id,legacy_folio,current_folio FROM order_folio_aliases WHERE org_id=? AND order_id IN (${placeholders})`).bind(orgId,...ids).all();return new Map(rows(result).map(item=>[item.order_id,{legacyFolio:item.legacy_folio,currentFolio:item.current_folio}]))
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
