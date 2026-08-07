import {HttpError,ROLES,assertMinimumRole,nowIso,readJson} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
let schemaPromise=null;
const locationAllowed=(actor,id)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(id);

async function ensureSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS master_list_preferences(
      org_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,product_order_mode TEXT NOT NULL DEFAULT 'alphabetical',
      updated_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(org_id,cost_center_id))`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS master_list_product_order(
      org_id TEXT NOT NULL,cost_center_id TEXT NOT NULL,category_id TEXT NOT NULL,product_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,
      PRIMARY KEY(org_id,cost_center_id,category_id,product_id))`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_master_list_order_lookup ON master_list_product_order(org_id,cost_center_id,category_id,sort_order,product_id)').run();
  })().catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}

async function requireCenter(env,actor,costCenterId){
  const center=await env.DB.prepare(`SELECT cc.id,cc.name,cc.location_id,l.name AS location_name
    FROM cost_centers cc JOIN locations l ON l.id=cc.location_id
    WHERE cc.id=? AND cc.org_id=? AND cc.active=1 AND l.active=1`).bind(costCenterId,actor.orgId).first();
  if(!center||!locationAllowed(actor,center.location_id))throw new HttpError(404,'Centro de costo no encontrado','not_found');
  return center;
}

export async function getMasterOrderingV42(env,actor,url){
  await ensureSchema(env);
  const costCenterId=String(url.searchParams.get('costCenterId')||'');
  if(!costCenterId)throw new HttpError(400,'Selecciona un centro de costo','missing_cost_center');
  const center=await requireCenter(env,actor,costCenterId);
  const [preference,result]=await Promise.all([
    env.DB.prepare('SELECT product_order_mode FROM master_list_preferences WHERE org_id=? AND cost_center_id=?').bind(actor.orgId,costCenterId).first(),
    env.DB.prepare(`SELECT category_id,product_id,sort_order FROM master_list_product_order
      WHERE org_id=? AND cost_center_id=? ORDER BY category_id,sort_order,product_id`).bind(actor.orgId,costCenterId).all()
  ]);
  const categories={};
  for(const item of rows(result)){if(!categories[item.category_id])categories[item.category_id]=[];categories[item.category_id].push(item.product_id)}
  return{costCenterId,centerName:center.name,locationName:center.location_name,mode:preference?.product_order_mode==='custom'?'custom':'alphabetical',categories};
}

export async function putMasterOrderingV42(request,env,actor){
  await ensureSchema(env);assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request),costCenterId=String(body.costCenterId||''),center=await requireCenter(env,actor,costCenterId),mode=body.mode==='custom'?'custom':'alphabetical',provided=body.categories&&typeof body.categories==='object'?body.categories:{};
  const products=rows(await env.DB.prepare(`SELECT p.id,p.category_id,p.name FROM products p
    JOIN product_cost_centers pcc ON pcc.product_id=p.id AND pcc.org_id=p.org_id
    WHERE p.org_id=? AND pcc.cost_center_id=? AND p.active=1`).bind(actor.orgId,costCenterId).all());
  const allowed=new Map(products.map(product=>[product.id,String(product.category_id||'uncategorized')]));
  const timestamp=nowIso(),statements=[env.DB.prepare('DELETE FROM master_list_product_order WHERE org_id=? AND cost_center_id=?').bind(actor.orgId,costCenterId)];
  for(const[categoryId,list]of Object.entries(provided)){
    const seen=new Set();let position=0;
    for(const raw of Array.isArray(list)?list:[]){
      const productId=String(raw||'');if(seen.has(productId)||allowed.get(productId)!==String(categoryId))continue;seen.add(productId);
      statements.push(env.DB.prepare(`INSERT INTO master_list_product_order(org_id,cost_center_id,category_id,product_id,sort_order,updated_at)
        VALUES(?,?,?,?,?,?)`).bind(actor.orgId,costCenterId,String(categoryId),productId,position++,timestamp));
    }
  }
  statements.push(env.DB.prepare(`INSERT INTO master_list_preferences(org_id,cost_center_id,product_order_mode,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(org_id,cost_center_id) DO UPDATE SET product_order_mode=excluded.product_order_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(actor.orgId,costCenterId,mode,actor.userId,timestamp,timestamp));
  await env.DB.batch(statements);
  await writeAudit(env,actor,request,'master_list.ordering_update','cost_center',costCenterId,{mode,centerName:center.name,categories:Object.keys(provided).length,products:products.length});
  const url=new URL(request.url);url.searchParams.set('costCenterId',costCenterId);return getMasterOrderingV42(env,actor,url);
}
