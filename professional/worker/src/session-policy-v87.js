import {HttpError,parseBearer,sha256} from './core.js';

export const SESSION_IDLE_TIMEOUT_DAYS=30;
const SESSION_IDLE_TIMEOUT_MS=SESSION_IDLE_TIMEOUT_DAYS*24*60*60*1000;
const CLEANUP_INTERVAL_MS=6*60*60*1000;
const cleanupByOrg=new Map();
const iso=value=>new Date(value).toISOString();
export const sessionIdleCutoff=()=>iso(Date.now()-SESSION_IDLE_TIMEOUT_MS);

async function cleanupOrganizationSessions(env,orgId){
  if(!orgId)return;
  const now=Date.now(),last=cleanupByOrg.get(orgId)||0;
  if(now-last<CLEANUP_INTERVAL_MS)return;
  cleanupByOrg.set(orgId,now);
  const stamp=iso(now),cutoff=sessionIdleCutoff();
  try{
    await env.DB.prepare(`UPDATE sessions SET revoked_at=? WHERE org_id=? AND revoked_at IS NULL AND COALESCE(last_seen_at,created_at)<?`).bind(stamp,orgId,cutoff).run();
  }catch(error){
    cleanupByOrg.delete(orgId);
    console.warn('session_idle_cleanup_failed',error?.message||error);
  }
}

export async function enforceSessionIdlePolicy(request,env){
  const token=parseBearer(request);
  if(!token)return null;
  const tokenHash=await sha256(token),row=await env.DB.prepare('SELECT id,org_id,created_at,last_seen_at,revoked_at FROM sessions WHERE token_hash=? LIMIT 1').bind(tokenHash).first();
  if(!row||row.revoked_at)return null;
  const activityMs=Date.parse(String(row.last_seen_at||row.created_at||''))||0,now=Date.now();
  if(!activityMs||now-activityMs>SESSION_IDLE_TIMEOUT_MS){
    const stamp=iso(now);
    await env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(stamp,row.id).run();
    throw new HttpError(401,'Tu sesión expiró por inactividad. Inicia sesión nuevamente.','session_expired');
  }
  await cleanupOrganizationSessions(env,row.org_id);
  return{sessionId:row.id,orgId:row.org_id};
}

export async function filterActiveSessionsResponse(response){
  if(!response?.ok)return response;
  const payload=await response.clone().json().catch(()=>null);
  if(!payload||!Array.isArray(payload.sessions))return response;
  const cutoff=Date.now()-SESSION_IDLE_TIMEOUT_MS;
  payload.sessions=payload.sessions.filter(item=>{
    if(item?.revokedAt)return false;
    const seen=Date.parse(String(item?.lastSeenAt||item?.createdAt||''))||0;
    return seen>=cutoff;
  }).sort((a,b)=>Date.parse(String(b.lastSeenAt||b.createdAt||''))-Date.parse(String(a.lastSeenAt||a.createdAt||''))).slice(0,50);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');
  return new Response(JSON.stringify(payload),{status:response.status,statusText:response.statusText,headers});
}
