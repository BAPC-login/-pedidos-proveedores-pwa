import {ROLES,assertMinimumRole,nowIso,readJson} from '../core.js';
import {writeAudit} from '../auth.js';

const NUVASTO={
  productName:'Nuvasto',
  tagline:'Compras claras. Abastecimiento inteligente.',
  descriptor:'Procurement OS',
  palette:{navy:'#08111F',primary:'#4031B8',secondary:'#178F73',accent:'#2BD6A0',cloud:'#F4F7FB'},
  candidates:[{name:'Nuvasto',tagline:'Compras claras. Abastecimiento inteligente.',status:'selected'}]
};
const safeJson=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};
export async function ensureNuvastoBrandV21(env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);const timestamp=nowIso();
  await env.DB.prepare(`INSERT INTO brand_workspaces(org_id,product_name,tagline,status,candidates_json,palette_json,updated_by,updated_at) VALUES(?,?,?,'selected',?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET product_name=excluded.product_name,tagline=excluded.tagline,status=CASE WHEN brand_workspaces.status='registered' THEN 'registered' ELSE 'selected' END,candidates_json=excluded.candidates_json,palette_json=excluded.palette_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(actor.orgId,NUVASTO.productName,NUVASTO.tagline,JSON.stringify(NUVASTO.candidates),JSON.stringify(NUVASTO.palette),actor.userId,timestamp).run();
  return getNuvastoBrandV21(env,actor);
}
export async function getNuvastoBrandV21(env,actor){
  assertMinimumRole(actor.role,ROLES.ADMIN);const row=await env.DB.prepare('SELECT * FROM brand_workspaces WHERE org_id=?').bind(actor.orgId).first();
  if(!row)return ensureNuvastoBrandV21(env,actor);
  return{...NUVASTO,status:row.status==='registered'?'registered':'selected',palette:{...NUVASTO.palette,...safeJson(row.palette_json,{})},updatedAt:row.updated_at||null};
}
export async function saveNuvastoBrandV21(request,env,actor){
  assertMinimumRole(actor.role,ROLES.OWNER);const body=await readJson(request),timestamp=nowIso(),status=body.status==='registered'?'registered':'selected',tagline=String(body.tagline||NUVASTO.tagline).trim().slice(0,160)||NUVASTO.tagline,palette={...NUVASTO.palette,...(body.palette&&typeof body.palette==='object'?body.palette:{})};
  await env.DB.prepare(`INSERT INTO brand_workspaces(org_id,product_name,tagline,status,candidates_json,palette_json,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET product_name=excluded.product_name,tagline=excluded.tagline,status=excluded.status,candidates_json=excluded.candidates_json,palette_json=excluded.palette_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(actor.orgId,NUVASTO.productName,tagline,status,JSON.stringify(NUVASTO.candidates),JSON.stringify(palette),actor.userId,timestamp).run();
  await writeAudit(env,actor,request,'brand.nuvasto_update','organization',actor.orgId,{productName:NUVASTO.productName,tagline,status,palette});
  return{...NUVASTO,tagline,status,palette,updatedAt:timestamp};
}
export {NUVASTO};
