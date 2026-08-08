const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number(value || 0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const date = value => {
  const text=String(value??'').trim();
  if(!text)return '—';
  const calendar=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed=calendar?new Date(Number(calendar[1]),Number(calendar[2])-1,Number(calendar[3])):new Date(text);
  return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleDateString('es-CL');
};
const roleNames = {owner:'Propietario',admin:'Administrador',purchaser:'Compras',approver:'Aprobador',receiver:'Recepción',finance:'Finanzas',readonly:'Solo lectura'};
const state = {
  token: localStorage.getItem('pp:token') || '',
  me: null,
  view: 'dashboard',
  subview: '',
  cache: {dashboard:null,orders:[],invoices:[],products:[],suppliers:[],categories:[],locations:[],costCenters:[],users:[],audit:[],brands:[],sessions:[]},
  online: navigator.onLine,
  pending: []
};

const responseCache=new Map();
const pendingRequests=new Map();
const GET_TTL=2*60*1000;
const SWR_REFRESH_AFTER=2*60*1000;
const DEFAULT_REQUEST_TIMEOUT=15000;
const STALE_FALLBACK_MAX_AGE=30*60*1000;
const MAX_PARALLEL_GETS=4;
const SWR_PATHS=[
  /^\/api\/(categories|cost-centers|suppliers|products|locations|supplier-assets)(?:\?|$)/,
  /^\/api\/dashboard\/layout(?:\?|$)/,
  /^\/api\/settings(?:\?|$)/,
  /^\/api\/master-list-ordering-v42(?:\?|$)/,
  /^\/api\/operations-bootstrap-v4[35](?:\?|$)/
];
let sessionValidationPromise=null;
let routeRequestController=new AbortController();
let activeGetCount=0;
let apiBackoffUntil=0;
const getQueue=[];
let dataWorker=null,workerSequence=0;
const workerJobs=new Map();
const toastJobs=new Map();

function cacheKeyFor(path){return `${state.token.slice(-12)}:${path}`}
function requestTimeoutError(){return Object.assign(new Error('La solicitud tardó demasiado. Intenta nuevamente.'),{code:'request_timeout',status:0})}
function requestSupersededError(){return Object.assign(new Error(''),{code:'request_superseded',status:0,silent:true})}
function isSWRPath(path){return SWR_PATHS.some(pattern=>pattern.test(String(path||'')))}
function beginViewRequestScope(){try{routeRequestController.abort('route_changed')}catch{}routeRequestController=new AbortController()}
function metric(detail){try{window.dispatchEvent(new CustomEvent('nuvasto:api-metric',{detail}))}catch{}}

function getDataWorker(){
  if(dataWorker||typeof Worker!=='function')return dataWorker;
  try{
    dataWorker=new Worker('./app-data-worker.js',{type:'module'});
    dataWorker.onmessage=event=>{const{id,ok,result,error}=event.data||{},job=workerJobs.get(id);if(!job)return;workerJobs.delete(id);ok?job.resolve(result):job.reject(new Error(error||'No se pudo procesar la información'))};
    dataWorker.onerror=()=>{for(const job of workerJobs.values())job.reject(new Error('El procesador en segundo plano dejó de responder'));workerJobs.clear();try{dataWorker?.terminate()}catch{}dataWorker=null};
  }catch{dataWorker=null}
  return dataWorker;
}
function runDataWorker(type,payload,transfer=[]){
  const worker=getDataWorker();
  if(!worker)return Promise.reject(new Error('worker_unavailable'));
  return new Promise((resolve,reject)=>{const id=`w${Date.now()}-${++workerSequence}`;workerJobs.set(id,{resolve,reject});worker.postMessage({id,type,payload},transfer)});
}
async function parseResponsePayload(response){
  const text=await response.text();
  if(!text)return {};
  if(text.length>=160000){try{return await runDataWorker('parse-json',{text})}catch{}}
  try{return JSON.parse(text)}catch{return{ok:false,error:`HTTP ${response.status}`}}
}

function acquireGetSlot(){
  if(activeGetCount<MAX_PARALLEL_GETS){activeGetCount++;return Promise.resolve()}
  return new Promise(resolve=>getQueue.push(resolve)).then(()=>{activeGetCount++});
}
function releaseGetSlot(){activeGetCount=Math.max(0,activeGetCount-1);const next=getQueue.shift();if(next)next()}
async function withGetSlot(task){await acquireGetSlot();try{return await task()}finally{releaseGetSlot()}}

async function sessionStillValid(){
  if(!state.token)return false;
  if(sessionValidationPromise)return sessionValidationPromise;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  sessionValidationPromise=fetch('/api/me',{method:'GET',cache:'no-store',headers:{Authorization:`Bearer ${state.token}`},signal:controller.signal})
    .then(response=>response.ok?true:response.status===401?false:true).catch(()=>true).finally(()=>{clearTimeout(timer);sessionValidationPromise=null});
  return sessionValidationPromise;
}
function clearResponseCache(){responseCache.clear();pendingRequests.clear()}
function seedResponseCache(path,value){const cacheKey=cacheKeyFor(path);responseCache.set(cacheKey,{time:Date.now(),value});pendingRequests.delete(cacheKey);return value}
function staleResponse(cacheKey){const cached=responseCache.get(cacheKey);if(!cached)return null;return Date.now()-cached.time<=STALE_FALLBACK_MAX_AGE?cached.value:null}

async function networkRequest(path,options,method,cacheKey,stale,{background=false}={}){
  const started=performance.now();
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization',`Bearer ${state.token}`);
  const controller=new AbortController(),upstreamSignal=options.signal,viewSignal=method==='GET'&&!options.persist?routeRequestController.signal:null;
  let timeoutHit=false,viewAborted=false;
  const forwardAbort=signal=>{
    if(!signal)return;
    if(signal.aborted){if(signal===viewSignal)viewAborted=true;controller.abort(signal.reason);return}
    signal.addEventListener('abort',()=>{if(signal===viewSignal)viewAborted=true;controller.abort(signal.reason)},{once:true});
  };
  forwardAbort(upstreamSignal);forwardAbort(viewSignal);
  const timeout=Math.max(1000,Number(options.timeout||DEFAULT_REQUEST_TIMEOUT));
  const timer=setTimeout(()=>{timeoutHit=true;controller.abort('timeout')},timeout);
  const requestOptions={...options,method,headers,cache:'no-store',signal:controller.signal};
  delete requestOptions.json;delete requestOptions.fresh;delete requestOptions.ttl;delete requestOptions.timeout;delete requestOptions.noStaleFallback;delete requestOptions.persist;delete requestOptions.background;
  if (options.json !== undefined) {headers.set('Content-Type','application/json');requestOptions.body=JSON.stringify(options.json)}
  try{
    const execute=async()=>{
      const response = await fetch(path,requestOptions);
      const payload = await parseResponsePayload(response);
      if(response.status===429){
        const retryAfter=Math.max(10,Number(response.headers.get('Retry-After')||60));
        apiBackoffUntil=Date.now()+Math.min(retryAfter,300)*1000;
      }
      if (response.status === 401 && state.token) {
        const invalid=String(path)==='/api/me'||String(payload.code||'').includes('session_')||!(await sessionStillValid());
        if(invalid)logoutLocal();
      }
      if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || 'No se pudo completar la operación'),{code:payload.code,status:response.status,details:payload.details});
      if(method==='GET')seedResponseCache(path,payload);else clearResponseCache();
      return payload;
    };
    const payload=method==='GET'?await withGetSlot(execute):await execute();
    metric({path,method,duration:Math.round(performance.now()-started),status:'ok',background});
    return payload;
  }catch(error){
    const aborted=error?.name==='AbortError';
    const normalized=aborted?(viewAborted&&!timeoutHit?requestSupersededError():requestTimeoutError()):error;
    const recoverable=method==='GET'&&!options.noStaleFallback&&stale&&!viewAborted&&(!normalized?.status||Number(normalized.status)===429||Number(normalized.status)>=500);
    metric({path,method,duration:Math.round(performance.now()-started),status:normalized?.code||'error',background});
    if(recoverable){console.warn('api_stale_fallback',path,normalized?.code||normalized?.message||normalized);return stale}
    throw normalized;
  }finally{clearTimeout(timer)}
}

function revalidateInBackground(path,options,method,cacheKey,stale){
  if(pendingRequests.has(cacheKey))return;
  const request=networkRequest(path,{...options,fresh:true,persist:true,noStaleFallback:true},method,cacheKey,stale,{background:true}).catch(error=>{if(!error?.silent)console.warn('api_background_refresh_failed',path,error?.code||error?.message||error)}).finally(()=>pendingRequests.delete(cacheKey));
  pendingRequests.set(cacheKey,request);
}

const api = async (path, options={}) => {
  const method=String(options.method||'GET').toUpperCase();
  const cacheKey=cacheKeyFor(path),cached=method==='GET'?responseCache.get(cacheKey):null,stale=method==='GET'?staleResponse(cacheKey):null,age=cached?Date.now()-cached.time:Infinity;
  if(method==='GET'&&pendingRequests.has(cacheKey))return pendingRequests.get(cacheKey);
  if(method==='GET'&&!options.noStaleFallback&&stale&&Date.now()<apiBackoffUntil)return stale;
  if(method==='GET'&&!options.fresh){
    if(cached&&isSWRPath(path)&&age<STALE_FALLBACK_MAX_AGE){if(age>SWR_REFRESH_AFTER)revalidateInBackground(path,options,method,cacheKey,stale);return cached.value}
    if(cached&&age<Number(options.ttl||GET_TTL))return cached.value;
  }
  const request=networkRequest(path,options,method,cacheKey,stale);
  if(method==='GET')pendingRequests.set(cacheKey,request);
  try{return await request}finally{if(method==='GET'&&pendingRequests.get(cacheKey)===request)pendingRequests.delete(cacheKey)}
};

function toast(message,type='ok') {
  const text=String(message||'').trim();if(!text)return;
  const key=`${type}:${text}`,existing=toastJobs.get(key);
  if(existing){clearTimeout(existing.timer);existing.timer=setTimeout(()=>{existing.node.remove();toastJobs.delete(key)},4200);return}
  while(toastJobs.size>=3){const first=toastJobs.entries().next().value;if(!first)break;const[oldKey,old]=first;clearTimeout(old.timer);old.node.remove();toastJobs.delete(oldKey)}
  const node=document.createElement('div');node.className=`toast ${type==='error'?'error':''}`;node.textContent=text;node.dataset.toastKey=key;$('#toastRegion')?.append(node);
  const timer=setTimeout(()=>{node.remove();toastJobs.delete(key)},4200);toastJobs.set(key,{node,timer})
}
function initials(value='') { return value.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase() || 'PP'; }
function isAdmin(){return ['owner','admin'].includes(state.me?.user?.role)}
function canBuy(){return ['owner','admin','purchaser','approver'].includes(state.me?.user?.role)}
function setBusy(button,busy,label='Guardando…'){if(!button)return;if(busy){button.dataset.label=button.innerHTML;button.textContent=label;button.disabled=true}else{button.innerHTML=button.dataset.label||button.innerHTML;button.disabled=false}}
function setTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem('pp:theme',theme)}
setTheme(localStorage.getItem('pp:theme') || 'system');
function openDb(){return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};
  const timer=setTimeout(()=>finish(reject,Object.assign(new Error('indexeddb_timeout'),{code:'indexeddb_timeout'})),2500);
  try{
    const request=indexedDB.open('pedidos-pro-platform',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('mutations'))request.result.createObjectStore('mutations',{keyPath:'id'})};
    request.onsuccess=()=>{if(settled){request.result.close();return}finish(resolve,request.result)};
    request.onerror=()=>finish(reject,request.error||new Error('indexeddb_error'));
    request.onblocked=()=>finish(reject,Object.assign(new Error('indexeddb_blocked'),{code:'indexeddb_blocked'}));
  }catch(error){finish(reject,error)}
})}
async function queueMutation(path,method,json){const db=await openDb();const mutation={id:crypto.randomUUID(),path,method,json,createdAt:new Date().toISOString()};await new Promise((resolve,reject)=>{const tx=db.transaction('mutations','readwrite');tx.objectStore('mutations').put(mutation);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();updateSyncChip().catch(()=>{});return mutation}
async function readMutations(){const db=await openDb();return new Promise((resolve,reject)=>{let settled=false;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);db.close();fn(value)};const timer=setTimeout(()=>finish(resolve,[]),1800);try{const r=db.transaction('mutations').objectStore('mutations').getAll();r.onsuccess=()=>finish(resolve,r.result||[]);r.onerror=()=>finish(reject,r.error)}catch(error){finish(reject,error)}})}
async function removeMutation(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('mutations','readwrite');tx.objectStore('mutations').delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function syncMutations(){if(!navigator.onLine||!state.token)return;for(const mutation of await readMutations().catch(()=>[])){try{await api(mutation.path,{method:mutation.method,json:mutation.json,headers:{'Idempotency-Key':mutation.id},persist:true});await removeMutation(mutation.id)}catch(error){if(error.status===401)break;console.warn('sync_failed',mutation,error)}}await updateSyncChip()}
async function updateSyncChip(){const count=(await readMutations().catch(()=>[])).length;const chip=$('#syncChip');if(!chip)return;chip.querySelector('span').textContent=!navigator.onLine?'Sin conexión':count?`${count} pendiente${count===1?'':'s'}`:'Sincronizado';chip.classList.toggle('pending',count>0||!navigator.onLine)}
function hideStartup(){$('#startupScreen')?.classList.add('hidden')}
function showAuth(){hideStartup();$('#authScreen')?.classList.remove('hidden');$('#appShell')?.classList.add('hidden')}
function showApp(){hideStartup();$('#authScreen')?.classList.add('hidden');$('#appShell')?.classList.remove('hidden');const {user,organization,plan}=state.me;$('#workspaceName').textContent=organization.name;$('#workspacePlan').textContent=user.isPlatformOwner?'Owner de plataforma':`Plan ${plan.name==='free'?'gratuito':plan.name}`;$('#workspaceAvatar').textContent=initials(organization.name);$('#workspaceCard').disabled=false;$('#workspaceCard').classList.add('selectable');$('#workspaceChevron').classList.remove('hidden');$('#userName').textContent=user.displayName;$('#userRole').textContent=roleNames[user.role]||user.role;$('#userAvatar').textContent=initials(user.displayName);$('#mobileWorkspaceName')&&($('#mobileWorkspaceName').textContent=organization.name);$('#mobileUserAvatar')&&($('#mobileUserAvatar').textContent=initials(user.displayName));$$('.admin-only').forEach(node=>node.classList.toggle('hidden',!isAdmin()))}
function logoutLocal(){beginViewRequestScope();state.token='';state.me=null;clearResponseCache();localStorage.removeItem('pp:token');showAuth()}
export {$,$$,esc,money,date,roleNames,state,api,toast,initials,isAdmin,canBuy,setBusy,setTheme,queueMutation,readMutations,syncMutations,updateSyncChip,showAuth,showApp,logoutLocal,sessionStillValid,clearResponseCache,seedResponseCache,beginViewRequestScope,runDataWorker};
