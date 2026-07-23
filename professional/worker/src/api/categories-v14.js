import {HttpError,ROLES,assertMinimumRole,nowIso,readJson,requireText,uuid} from '../core.js';
import {writeAudit} from '../auth.js';
import {listProducts as listProductsBase} from './catalog.js';

const rows=result=>result?.results||[];
const locationAllowed=(actor,locationId)=>actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId);

async function requireCostCenter(env,actor,costCenterId){
  const center=await env.DB.prepare(`
    SELECT cc.id,cc.name,cc.location_id,l.name AS location_name
    FROM cost_centers cc JOIN locations l ON l.id=cc.location_id
    WHERE cc.id=? AND cc.org_id=? AND cc.active=1
  `).bind(String(costCenterId||''),actor.orgId).first();
  if(!center||!locationAllowed(actor,center.location_id))throw new HttpError(400,'Selecciona un centro de costo válido','invalid_cost_center');
  return center;
}

async function nextSortOrder(env,orgId,costCenterId){
  const row=await env.DB.prepare(`
    SELECT COALESCE(MAX(c.sort_order),-1) AS value
    FROM categories c JOIN category_cost_centers ccc ON ccc.category_id=c.id
    WHERE c.org_id=? AND ccc.cost_center_id=? AND c.source='user'
  `).bind(orgId,costCenterId).first();
  return Number(row?.value??-1)+1;
}

export async function listCategoriesV14(env,actor,url){
  const costCenterId=String(url?.searchParams?.get('costCenterId')||'');
  const result=await env.DB.prepare(`
    SELECT c.id,c.name,c.sort_order,c.active,c.source,ccc.cost_center_id,
      cc.name AS cost_center_name,cc.location_id,l.name AS location_name,
      (SELECT COUNT(*) FROM product_center_categories pcc WHERE pcc.org_id=c.org_id AND pcc.category_id=c.id) AS product_count
    FROM categories c
    JOIN category_cost_centers ccc ON ccc.category_id=c.id AND ccc.org_id=c.org_id
    JOIN cost_centers cc ON cc.id=ccc.cost_center_id AND cc.active=1
    JOIN locations l ON l.id=cc.location_id AND l.active=1
    WHERE c.org_id=? AND c.active=1 AND c.source='user' AND (?='' OR ccc.cost_center_id=?)
    ORDER BY l.name COLLATE NOCASE,cc.name COLLATE NOCASE,c.sort_order,c.name COLLATE NOCASE
  `).bind(actor.orgId,costCenterId,costCenterId).all();
  return rows(result).filter(item=>locationAllowed(actor,item.location_id)).map(item=>({
    id:item.id,name:item.name,sortOrder:Number(item.sort_order||0),active:Boolean(item.active),source:'user',
    costCenterId:item.cost_center_id,costCenterName:item.cost_center_name,locationId:item.location_id,locationName:item.location_name,
    productCount:Number(item.product_count||0)
  }));
}

export async function createCategoryV14(request,env,actor){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request),name=requireText(body.name,'Nombre de categoría',{max:100}),center=await requireCostCenter(env,actor,body.costCenterId);
  const existing=await env.DB.prepare('SELECT id,name,source FROM categories WHERE org_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(actor.orgId,name).first();
  const timestamp=nowIso(),sortOrder=await nextSortOrder(env,actor.orgId,center.id);
  let id=existing?.id||uuid(),reused=false;
  if(existing?.source==='user')throw new HttpError(409,`Ya existe la categoría “${existing.name}”`,'duplicate_category');
  if(existing){
    reused=true;
    await env.DB.batch([
      env.DB.prepare("UPDATE categories SET name=?,source='user',active=1,sort_order=?,updated_at=? WHERE id=? AND org_id=?").bind(name,sortOrder,timestamp,id,actor.orgId),
      env.DB.prepare('DELETE FROM category_cost_centers WHERE category_id=? AND org_id=?').bind(id,actor.orgId),
      env.DB.prepare('INSERT INTO category_cost_centers(category_id,org_id,cost_center_id,created_at) VALUES(?,?,?,?)').bind(id,actor.orgId,center.id,timestamp)
    ]);
  }else{
    await env.DB.batch([
      env.DB.prepare("INSERT INTO categories(id,org_id,name,sort_order,active,created_at,updated_at,source) VALUES(?,?,?,?,1,?,?,'user')").bind(id,actor.orgId,name,sortOrder,timestamp,timestamp),
      env.DB.prepare('INSERT INTO category_cost_centers(category_id,org_id,cost_center_id,created_at) VALUES(?,?,?,?)').bind(id,actor.orgId,center.id,timestamp)
    ]);
  }
  await writeAudit(env,actor,request,'category.create','category',id,{name,costCenterId:center.id,reusedSystemCategory:reused});
  return {id,name,active:true,source:'user',costCenterId:center.id,costCenterName:center.name,locationId:center.location_id,locationName:center.location_name,reused};
}

export async function updateCategoryV14(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const current=await env.DB.prepare(`
    SELECT c.id,c.name,ccc.cost_center_id FROM categories c
    JOIN category_cost_centers ccc ON ccc.category_id=c.id
    WHERE c.id=? AND c.org_id=? AND c.source='user'
  `).bind(categoryId,actor.orgId).first();
  if(!current)throw new HttpError(404,'Categoría no encontrada','not_found');
  const body=await readJson(request),name=body.name===undefined?current.name:requireText(body.name,'Nombre de categoría',{max:100});
  try{await env.DB.prepare("UPDATE categories SET name=?,active=1,source='user',updated_at=? WHERE id=? AND org_id=?").bind(name,nowIso(),categoryId,actor.orgId).run()}
  catch(error){if(/UNIQUE/i.test(String(error?.message||error)))throw new HttpError(409,`Ya existe la categoría “${name}”`,'duplicate_category');throw error}
  await writeAudit(env,actor,request,'category.update','category',categoryId,{name,costCenterId:current.cost_center_id});
  return {id:categoryId,name,active:true,source:'user',costCenterId:current.cost_center_id};
}

export async function deleteCategoryV14(request,env,actor,categoryId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const category=await env.DB.prepare("SELECT id,name FROM categories WHERE id=? AND org_id=? AND source='user'").bind(categoryId,actor.orgId).first();
  if(!category)throw new HttpError(404,'Categoría no encontrada','not_found');
  const timestamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE products SET category_id=NULL,updated_at=? WHERE org_id=? AND category_id=?').bind(timestamp,actor.orgId,categoryId),
    env.DB.prepare('DELETE FROM product_center_categories WHERE org_id=? AND category_id=?').bind(actor.orgId,categoryId),
    env.DB.prepare('DELETE FROM category_cost_centers WHERE org_id=? AND category_id=?').bind(actor.orgId,categoryId),
    env.DB.prepare('DELETE FROM categories WHERE id=? AND org_id=?').bind(categoryId,actor.orgId)
  ]);
  await writeAudit(env,actor,request,'category.delete','category',categoryId,{name:category.name});
  return {deleted:true,id:categoryId,name:category.name};
}

export async function setProductCenterCategoryV14(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const body=await readJson(request),center=await requireCostCenter(env,actor,body.costCenterId),categoryId=String(body.categoryId||'');
  const product=await env.DB.prepare(`
    SELECT p.id FROM products p JOIN product_cost_centers pcc ON pcc.product_id=p.id AND pcc.org_id=p.org_id
    WHERE p.id=? AND p.org_id=? AND pcc.cost_center_id=? AND p.active=1
  `).bind(productId,actor.orgId,center.id).first();
  if(!product)throw new HttpError(400,'El producto no está asignado a este centro de costo','product_outside_cost_center');
  if(categoryId){
    const category=await env.DB.prepare(`
      SELECT c.id FROM categories c JOIN category_cost_centers ccc ON ccc.category_id=c.id AND ccc.org_id=c.org_id
      WHERE c.id=? AND c.org_id=? AND c.source='user' AND c.active=1 AND ccc.cost_center_id=?
    `).bind(categoryId,actor.orgId,center.id).first();
    if(!category)throw new HttpError(400,'La categoría no pertenece a este centro de costo','category_center_mismatch');
    await env.DB.prepare(`
      INSERT INTO product_center_categories(product_id,org_id,cost_center_id,category_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(product_id,cost_center_id) DO UPDATE SET category_id=excluded.category_id,updated_at=excluded.updated_at
    `).bind(productId,actor.orgId,center.id,categoryId,nowIso(),nowIso()).run();
  }else{
    await env.DB.prepare('DELETE FROM product_center_categories WHERE product_id=? AND org_id=? AND cost_center_id=?').bind(productId,actor.orgId,center.id).run();
  }
  const primary=await env.DB.prepare('SELECT category_id FROM product_center_categories WHERE product_id=? AND org_id=? ORDER BY updated_at DESC LIMIT 1').bind(productId,actor.orgId).first();
  await env.DB.prepare('UPDATE products SET category_id=?,updated_at=? WHERE id=? AND org_id=?').bind(primary?.category_id||null,nowIso(),productId,actor.orgId).run();
  await writeAudit(env,actor,request,'product.center_category','product',productId,{costCenterId:center.id,categoryId:categoryId||null});
  return {productId,costCenterId:center.id,categoryId:categoryId||null};
}

export async function listProductsV14(env,actor,url){
  const products=await listProductsBase(env,actor,url);
  const result=await env.DB.prepare(`
    SELECT pcc.product_id,pcc.cost_center_id,pcc.category_id,c.name AS category_name,cc.name AS cost_center_name,cc.location_id
    FROM product_center_categories pcc
    JOIN categories c ON c.id=pcc.category_id AND c.active=1 AND c.source='user'
    JOIN cost_centers cc ON cc.id=pcc.cost_center_id AND cc.active=1
    WHERE pcc.org_id=?
    ORDER BY cc.name COLLATE NOCASE,c.name COLLATE NOCASE
  `).bind(actor.orgId).all();
  const map=new Map();
  for(const row of rows(result)){
    if(!locationAllowed(actor,row.location_id))continue;
    if(!map.has(row.product_id))map.set(row.product_id,[]);
    map.get(row.product_id).push({costCenterId:row.cost_center_id,costCenterName:row.cost_center_name,categoryId:row.category_id,categoryName:row.category_name});
  }
  return products.map(product=>{
    const centerCategories=map.get(product.id)||[],primary=centerCategories[0];
    return {...product,centerCategories,categoryId:primary?.categoryId||null,categoryName:primary?.categoryName||null};
  });
}
