import {HttpError,ROLES,assertMinimumRole,readJson,nowIso} from '../core.js';
import {validateSupplierCostPolicy} from '../../../../worker/src/supplier-cost-allocation.js';

async function prepare(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS supplier_cost_policies_v96 (
    org_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
    policy_json TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(org_id,supplier_id)
  )`).run();
}
async function assertSupplier(env,actor,supplierId){
  const supplier=await env.DB.prepare('SELECT id FROM suppliers WHERE id=? AND org_id=?').bind(supplierId,actor.orgId).first();
  if(!supplier)throw new HttpError(404,'Proveedor no encontrado','not_found');
}
export async function getSupplierCostPolicy(env,actor,supplierId,{forAnalysis=false}={}){
  if(!supplierId)return null;
  if(!forAnalysis)await assertSupplier(env,actor,supplierId);
  try{
    await prepare(env);
    const row=await env.DB.prepare('SELECT policy_json,updated_at FROM supplier_cost_policies_v96 WHERE org_id=? AND supplier_id=?').bind(actor.orgId,supplierId).first();
    if(!row)return null;return {...validateSupplierCostPolicy(JSON.parse(row.policy_json)),updatedAt:row.updated_at};
  }catch(error){
    if(forAnalysis){console.warn('supplier_cost_policy_read_failed',error?.message||error);return null}
    throw error;
  }
}
export async function saveSupplierCostPolicy(request,env,actor,supplierId){
  assertMinimumRole(actor.role,ROLES.ADMIN);
  await assertSupplier(env,actor,supplierId);
  const input=await readJson(request),policy=validateSupplierCostPolicy(input),timestamp=nowIso();
  await prepare(env);
  await env.DB.prepare(`INSERT INTO supplier_cost_policies_v96(org_id,supplier_id,policy_json,updated_by,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(org_id,supplier_id) DO UPDATE SET policy_json=excluded.policy_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(actor.orgId,supplierId,JSON.stringify(policy),actor.userId,timestamp).run();
  return {...policy,updatedAt:timestamp};
}
