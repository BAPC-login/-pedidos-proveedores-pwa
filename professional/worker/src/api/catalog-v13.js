import {HttpError,ROLES,assertMinimumRole,nowIso,readJson} from '../core.js';
import {writeAudit} from '../auth.js';

export async function setProductCategoryV13(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const product=await env.DB.prepare('SELECT id,name FROM products WHERE id=? AND org_id=?').bind(productId,actor.orgId).first();
  if(!product)throw new HttpError(404,'Producto no encontrado','not_found');
  const body=await readJson(request),categoryId=String(body.categoryId||'')||null;
  if(categoryId){
    const category=await env.DB.prepare("SELECT id,name FROM categories WHERE id=? AND org_id=? AND active=1 AND source='user'").bind(categoryId,actor.orgId).first();
    if(!category)throw new HttpError(400,'Selecciona una categoría creada por ti','invalid_category');
  }
  await env.DB.prepare('UPDATE products SET category_id=?,updated_at=? WHERE id=? AND org_id=?').bind(categoryId,nowIso(),productId,actor.orgId).run();
  await writeAudit(env,actor,request,'product.category','product',productId,{categoryId});
  return {productId,categoryId};
}
