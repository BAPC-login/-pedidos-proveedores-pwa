import {HttpError,ROLES,assertMinimumRole,nowIso,readJson,requireText,uuid} from '../core.js';
import {writeAudit} from '../auth.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);

async function requireCenter(env,actor,costCenterId){
  const center=await env.DB.prepare(`
    SELECT cc.id,cc.name,cc.location_id,l.name AS location_name
    FROM cost_centers cc JOIN locations l ON l.id=cc.location_id
    WHERE cc.id=? AND cc.org_id=? AND cc.active=1
  `).bind(String(costCenterId||''),actor.orgId).first();
  if(!center||!locationAllowed(actor,center.location_id))throw new HttpError(400,'Selecciona un centro de costo válido','invalid_cost_center');
  return center;
}

export async function listUserCategoriesV14(env,actor){
  const result=await env.DB.prepare(`
    SELECT c.id,c.name,c.sort_order,c.active,c.source,c.cost_center_id,
      cc.name AS cost_center_name,cc.location_id,l.name AS location_name,
      COUNT(DISTINCT p.id) AS product_count
    FROM categories c
    LEFT JOIN cost_centers cc ON cc.id=c.cost_center_id AND cc.org_id=c.org_id
    LEFT JOIN locations l ON l.id=cc.location_id
    LEFT JOIN products p ON p.category_id=c.id AND p.org_id=c.org_id AND p.active=1
    WHERE c.org_id=? AND c.active=1 AND c.source='user'
    GROUP BY c.id
    ORDER BY COALESCE(l.name,''),COALESCE(cc.name,''),c.name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return rows(result)
    .filter(item=>!item.location_id||locationAllowed(actor,item.location_id))
    .map(item=>({
      id:item.id,name:item.name,sortOrder:Number(item.sort_order||0),active:Boolean(item.active),source:'user',
      costCenterId:item.cost_center_id||'',costCenterName:item.cost_center_name||'Sin centro',
      locationId:item.location_id||'',locationName:item.location_name||'',productCount:Number(item.product_count||0)
    }));
}

export async function createCategoryV14(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request),name=requireText(body.name,'Nombre de categoría',{max:100}),center=await requireCenter(env,actor,body.costCenterId);
  const existing=await env.DB.prepare('SELECT id,source FROM categories WHERE org_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(actor.orgId,name).first();
  const timestamp=nowIso();
  let id=existing?.id||uuid();
  if(existing){
    await env.DB.prepare("UPDATE categories SET name=?,source='user',cost_center_id=?,active=1,updated_at=? WHERE id=? AND org_id=?")
      .bind(name,center.id,timestamp,id,actor.orgId).run();
  }else{
    const max=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS value FROM categories WHERE org_id=?').bind(actor.orgId).first();
    await env.DB.prepare(`INSERT INTO categories(id,org_id,name,sort_order,active,created_at,updated_at,source,cost_center_id) VALUES(?,?,?,?,1,?,?, 'user',?)`)
      .bind(id,actor.orgId,name,Number(max?.value||-1)+1,timestamp,timestamp,center.id).run();
  }
  await writeAudit(env,actor,request,'category.create','category',id,{name,costCenterId:center.id,claimedSystemCategory:Boolean(existing&&existing.source!=='user')});
  return {id,name,active:true,source:'user',costCenterId:center.id,costCenterName:center.name,locationId:center.location_id,locationName:center.location_name};
}

export async function updateCategoryV14(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const current=await env.DB.prepare("SELECT id,name,cost_center_id FROM categories WHERE id=? AND org_id=? AND source='user'").bind(categoryId,actor.orgId).first();
  if(!current)throw new HttpError(404,'Categoría no encontrada','not_found');
  const body=await readJson(request),name=body.name===undefined?current.name:requireText(body.name,'Nombre',{max:100});
  const center=body.costCenterId===undefined?await requireCenter(env,actor,current.cost_center_id):await requireCenter(env,actor,body.costCenterId);
  const duplicate=await env.DB.prepare('SELECT id FROM categories WHERE org_id=? AND name=? COLLATE NOCASE AND id<>? LIMIT 1').bind(actor.orgId,name,categoryId).first();
  if(duplicate)throw new HttpError(409,'Ya existe una categoría con ese nombre','duplicate_category');
  await env.DB.prepare("UPDATE categories SET name=?,cost_center_id=?,source='user',active=1,updated_at=? WHERE id=? AND org_id=?")
    .bind(name,center.id,nowIso(),categoryId,actor.orgId).run();
  await writeAudit(env,actor,request,'category.update','category',categoryId,{name,costCenterId:center.id});
  return {id:categoryId,name,source:'user',active:true,costCenterId:center.id,costCenterName:center.name,locationId:center.location_id,locationName:center.location_name};
}

export async function deleteCategoryV14(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const category=await env.DB.prepare("SELECT id,name FROM categories WHERE id=? AND org_id=? AND source='user'").bind(categoryId,actor.orgId).first();
  if(!category)throw new HttpError(404,'Categoría no encontrada','not_found');
  const timestamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE products SET category_id=NULL,updated_at=? WHERE org_id=? AND category_id=?').bind(timestamp,actor.orgId,categoryId),
    env.DB.prepare('DELETE FROM categories WHERE id=? AND org_id=?').bind(categoryId,actor.orgId)
  ]);
  await writeAudit(env,actor,request,'category.delete','category',categoryId,{name:category.name});
  return {deleted:true,id:categoryId,name:category.name};
}
