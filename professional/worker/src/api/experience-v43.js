import {HttpError,ROLES,assertMinimumRole,nowIso,readJson} from '../core.js';
import {writeAudit} from '../auth.js';

export async function setProductActiveV43(request,env,actor,productId){
  assertMinimumRole(actor.role,ROLES.PURCHASER);
  const current=await env.DB.prepare('SELECT id,name,active FROM products WHERE id=? AND org_id=?').bind(productId,actor.orgId).first();
  if(!current)throw new HttpError(404,'Producto no encontrado','not_found');
  const body=await readJson(request),active=body.active===true?1:body.active===false?0:null;
  if(active===null)throw new HttpError(400,'Indica si el producto debe quedar activo o deshabilitado','invalid_product_status');
  const timestamp=nowIso();
  await env.DB.prepare('UPDATE products SET active=?,updated_at=? WHERE id=? AND org_id=?').bind(active,timestamp,productId,actor.orgId).run();
  await writeAudit(env,actor,request,active?'product.enable':'product.disable','product',productId,{name:current.name,active:Boolean(active)});
  return{id:productId,name:current.name,active:Boolean(active),updatedAt:timestamp,preservedHistory:true,preservedSupplierLinks:true};
}
