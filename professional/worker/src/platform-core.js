import legacyWorker from './worker-core.js';
import {authenticate} from './auth.js';
import {HttpError,errorResponse,nowIso,ok,readJson,uuid} from './core.js';
import {hashPassword} from './password.js';
import {listOrdersCanonical} from './api/orders-query.js';
import {updateSupplier} from './api/catalog.js';

const DEV_QA_EMAIL='e2e@nuvasto.dev';
const DEV_QA_SLUG='nuvasto-qa';
const runtimeEnvironment=env=>String(env.ENVIRONMENT||'production').trim().toLowerCase()||'production';

function decorate(response){
  const headers=new Headers(response.headers);
  headers.set('X-Nuvasto-Orders-Query','canonical-cursor-v91-reserved-route');
  headers.set('X-Nuvasto-Production-Stability','v91');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function healthResponse(response,request,env){
  if(!response.ok)return response;
  const payload=await response.clone().json().catch(()=>null);
  if(!payload)return response;
  const environment=runtimeEnvironment(env);
  return ok({...payload,environment,developmentEnvironment:environment==='development',productionStabilityV91:true,reservedOrdersAdvancedV91:true,transientInvoiceRetryV91:true,verifiedAiUsageV91:true,supplierProfileV94:true},request,env);
}
function assertDevelopmentBootstrap(request,env){
  if(runtimeEnvironment(env)!=='development')throw new HttpError(404,'Ruta no disponible','not_found');
  const configured=String(env.BOOTSTRAP_ADMIN_TOKEN||''),provided=String(request.headers.get('X-Bootstrap-Token')||'');
  if(!configured||provided!==configured)throw new HttpError(403,'Token de inicialización inválido','invalid_bootstrap_token');
}
async function ensureDevelopmentQaTenant(request,env){
  assertDevelopmentBootstrap(request,env);
  const body=await readJson(request),email=String(body.email||'').trim().toLowerCase();
  if(email!==DEV_QA_EMAIL)throw new HttpError(400,'La inicialización QA solo acepta la identidad E2E reservada','invalid_dev_qa_identity');
  const passwordData=await hashPassword(String(body.password||'')),timestamp=nowIso();
  const [existingOrg,existingUser]=await Promise.all([
    env.DB.prepare('SELECT id,name,slug FROM organizations WHERE slug=? LIMIT 1').bind(DEV_QA_SLUG).first(),
    env.DB.prepare('SELECT id,email FROM users WHERE email=? LIMIT 1').bind(DEV_QA_EMAIL).first()
  ]);
  const orgId=existingOrg?.id||uuid(),userId=existingUser?.id||uuid();
  const [existingLocation,existingMembership]=await Promise.all([
    existingOrg?env.DB.prepare('SELECT id FROM locations WHERE org_id=? AND name=? LIMIT 1').bind(orgId,'Laboratorio').first():null,
    existingOrg&&existingUser?env.DB.prepare('SELECT id FROM memberships WHERE org_id=? AND user_id=? LIMIT 1').bind(orgId,userId).first():null
  ]);
  const locationId=existingLocation?.id||uuid(),membershipId=existingMembership?.id||uuid(),statements=[];
  if(!existingOrg)statements.push(env.DB.prepare(`INSERT INTO organizations (id,name,slug,plan,status,created_at,updated_at) VALUES (?,?,?,'free','active',?,?)`).bind(orgId,'Nuvasto QA',DEV_QA_SLUG,timestamp,timestamp));
  else statements.push(env.DB.prepare(`UPDATE organizations SET name='Nuvasto QA',status='active',updated_at=? WHERE id=?`).bind(timestamp,orgId));
  if(!existingLocation)statements.push(env.DB.prepare(`INSERT INTO locations (id,org_id,name,code,timezone,active,created_at,updated_at) VALUES (?,?,?,'QA','America/Santiago',1,?,?)`).bind(locationId,orgId,'Laboratorio',timestamp,timestamp));
  else statements.push(env.DB.prepare('UPDATE locations SET active=1,updated_at=? WHERE id=?').bind(timestamp,locationId));
  if(!existingUser)statements.push(env.DB.prepare(`INSERT INTO users (id,email,display_name,profile_json,password_salt,password_hash,password_algorithm,active,created_at,updated_at) VALUES (?,?,?,'{}',?,?,?,1,?,?)`).bind(userId,DEV_QA_EMAIL,'Nuvasto E2E',passwordData.salt,passwordData.hash,passwordData.algorithm,timestamp,timestamp));
  else statements.push(env.DB.prepare(`UPDATE users SET display_name='Nuvasto E2E',password_salt=?,password_hash=?,password_algorithm=?,active=1,updated_at=? WHERE id=?`).bind(passwordData.salt,passwordData.hash,passwordData.algorithm,timestamp,userId));
  if(!existingMembership)statements.push(env.DB.prepare(`INSERT INTO memberships (id,org_id,user_id,role,location_scope,active,created_at,updated_at) VALUES (?,?,?,'owner','["*"]',1,?,?)`).bind(membershipId,orgId,userId,timestamp,timestamp));
  else statements.push(env.DB.prepare(`UPDATE memberships SET role='owner',location_scope='["*"]',active=1,updated_at=? WHERE id=?`).bind(timestamp,membershipId));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO platform_owners (user_id,created_at) VALUES (?,?)').bind(userId,timestamp));
  statements.push(env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(timestamp,userId));
  if(!existingOrg){
    ['Bebidas sin alcohol','Cervezas','Vinos','Espumantes','Pisco','Ron','Vodka','Gin','Whisky','Tequila','Licores','Insumos','Abarrotes','Otros'].forEach((name,index)=>statements.push(env.DB.prepare(`INSERT INTO categories (id,org_id,name,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`).bind(uuid(),orgId,name,index,timestamp,timestamp)));
  }
  await env.DB.batch(statements);
  return{ensured:true,email:DEV_QA_EMAIL,organizationId:orgId,organizationSlug:DEV_QA_SLUG,locationId,createdOrganization:!existingOrg,createdUser:!existingUser};
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase(),supplierProfile=url.pathname.match(/^\/api\/suppliers\/([^/]+)$/);
    try{
      // Reserved collection endpoints must be resolved before /api/orders/:id.
      // worker-core.js currently computes routeMatch('/api/orders/:id') first, so
      // "advanced" can otherwise be interpreted as an order id and return 404.
      if(method==='GET'&&url.pathname==='/api/orders/advanced'){
        const actor=await authenticate(request,env);
        return decorate(ok(await listOrdersCanonical(env,actor,url),request,env));
      }
      // Canonical supplier profile mutation. Identity and payment terms remain on
      // their own explicit subresources; this exact route only updates general
      // supplier/commercial fields.
      if(supplierProfile&&method==='PATCH'){
        const actor=await authenticate(request,env),supplierId=decodeURIComponent(supplierProfile[1]);
        return decorate(ok({supplier:await updateSupplier(request,env,actor,supplierId)},request,env));
      }
      // DEV-only QA provisioning. The route is hard-disabled in production and
      // can create/repair only Nuvasto QA + e2e@nuvasto.dev.
      if(method==='POST'&&(url.pathname==='/api/dev/qa/ensure'||url.pathname==='/api/dev/qa/sync-identity'))return decorate(ok(await ensureDevelopmentQaTenant(request,env),request,env));
      let response=await legacyWorker.fetch(request,env,ctx);
      if(method==='GET'&&(url.pathname==='/health'||url.pathname==='/platform/health'))response=await healthResponse(response,request,env);
      return decorate(response);
    }catch(error){return decorate(errorResponse(error,request,env))}
  }
};
