import {HttpError,ROLES,assertMinimumRole,nowIso,readJson} from '../core.js';
import {writeAudit} from '../auth.js';

export async function setProductCategoryV13(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const product=await env.DB.prepare('SELECT id,name FROM products WHERE id=? AND org_id=?').bind(productId,actor.orgId).first();
  if(!product)throw new HttpError(404,'Producto no encontrado','not_found');
  const body=await readJson(request),categoryId=String(body.categoryId||'')||null;
  let category=null;
  if(categoryId){
    category=await env.DB.prepare("SELECT id,name,cost_center_id FROM categories WHERE id=? AND org_id=? AND active=1 AND source='user'").bind(categoryId,actor.orgId).first();
    if(!category)throw new HttpError(400,'Selecciona una categoría creada por ti','invalid_category');
    const assigned=await env.DB.prepare('SELECT 1 AS valid FROM product_cost_centers WHERE org_id=? AND product_id=? AND cost_center_id=? LIMIT 1').bind(actor.orgId,productId,category.cost_center_id).first();
    if(!assigned)throw new HttpError(400,'Primero asigna el producto al centro de costo de esta categoría','category_outside_product_centers');
  }
  await env.DB.prepare('UPDATE products SET category_id=?,updated_at=? WHERE id=? AND org_id=?').bind(categoryId,nowIso(),productId,actor.orgId).run();
  await writeAudit(env,actor,request,'product.category','product',productId,{categoryId,costCenterId:category?.cost_center_id||null});
  return {productId,categoryId,costCenterId:category?.cost_center_id||null};
}
