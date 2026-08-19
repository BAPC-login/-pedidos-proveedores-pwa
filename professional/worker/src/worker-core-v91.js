import legacyWorker from './worker-core.js';
import {authenticate} from './auth.js';
import {HttpError,errorResponse,nowIso,ok,readJson} from './core.js';
import {hashPassword} from './password.js';
import {listOrdersCanonical} from './api/orders-query.js';

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
  return ok({...payload,environment,developmentEnvironment:environment==='development',productionStabilityV91:true,reservedOrdersAdvancedV91:true,transientInvoiceRetryV91:true,verifiedAiUsageV91:true},request,env);
}
async function syncDevelopmentQaIdentity(request,env){
  if(runtimeEnvironment(env)!=='development')throw new HttpError(404,'Ruta no disponible','not_found');
  const configured=String(env.BOOTSTRAP_ADMIN_TOKEN||''),provided=String(request.headers.get('X-Bootstrap-Token')||'');
  if(!configured||provided!==configured)throw new HttpError(403,'Token de inicialización inválido','invalid_bootstrap_token');
  const body=await readJson(request),email=String(body.email||'').trim().toLowerCase();
  if(email!==DEV_QA_EMAIL)throw new HttpError(400,'La sincronización QA solo acepta la identidad E2E reservada','invalid_dev_qa_identity');
  const identity=await env.DB.prepare(`SELECT u.id AS user_id,o.id AS org_id,o.slug AS org_slug FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.org_id WHERE u.email=? AND o.slug=? LIMIT 1`).bind(DEV_QA_EMAIL,DEV_QA_SLUG).first();
  if(!identity)throw new HttpError(404,'La identidad QA no existe todavía','dev_qa_not_found');
  const passwordData=await hashPassword(String(body.password||'')),timestamp=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_salt=?,password_hash=?,password_algorithm=?,active=1,updated_at=? WHERE id=?').bind(passwordData.salt,passwordData.hash,passwordData.algorithm,timestamp,identity.user_id),
    env.DB.prepare(`UPDATE memberships SET active=1,role='owner',location_scope='["*"]',updated_at=? WHERE user_id=? AND org_id=?`).bind(timestamp,identity.user_id,identity.org_id),
    env.DB.prepare(`UPDATE organizations SET status='active',updated_at=? WHERE id=?`).bind(timestamp,identity.org_id),
    env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND org_id=? AND revoked_at IS NULL').bind(timestamp,identity.user_id,identity.org_id)
  ]);
  return{synced:true,email:DEV_QA_EMAIL,organizationSlug:DEV_QA_SLUG};
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),method=request.method.toUpperCase();
    try{
      // Reserved collection endpoints must be resolved before /api/orders/:id.
      // worker-core.js currently computes routeMatch('/api/orders/:id') first, so
      // "advanced" can otherwise be interpreted as an order id and return 404.
      if(method==='GET'&&url.pathname==='/api/orders/advanced'){
        const actor=await authenticate(request,env);
        return decorate(ok(await listOrdersCanonical(env,actor,url),request,env));
      }
      // DEV-only QA maintenance. This route is hard-disabled in production and
      // accepts only the reserved e2e@nuvasto.dev identity inside nuvasto-qa.
      if(method==='POST'&&url.pathname==='/api/dev/qa/sync-identity')return decorate(ok(await syncDevelopmentQaIdentity(request,env),request,env));
      let response=await legacyWorker.fetch(request,env,ctx);
      if(method==='GET'&&(url.pathname==='/health'||url.pathname==='/platform/health'))response=await healthResponse(response,request,env);
      return decorate(response);
    }catch(error){return decorate(errorResponse(error,request,env))}
  }
};
