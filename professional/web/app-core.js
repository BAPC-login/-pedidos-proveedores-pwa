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
const GET_TTL=30000;
const DEFAULT_REQUEST_TIMEOUT=15000;
let sessionValidationPromise=null;

function requestTimeoutError(){return Object.assign(new Error('La solicitud tardó demasiado. Revisa tu conexión e intenta nuevamente.'),{code:'request_timeout',status:0})}
async function sessionStillValid(){
  if(!state.token)return false;
  if(sessionValidationPromise)return sessionValidationPromise;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  sessionValidationPromise=fetch('/api/me',{method:'GET',cache:'no-store',headers:{Authorization:`Bearer ${state.token}`},signal:controller.signal})
    .then(response=>response.ok?true:response.status===401?false:true).catch(()=>true).finally(()=>{clearTimeout(timer);sessionValidationPromise=null});
  return sessionValidationPromise;
}
function clearResponseCache(){responseCache.clear();pendingRequests.clear()}
const api = async (path, options={}) => {
  const method=String(options.method||'GET').toUpperCase();
  const cacheKey=`${state.token.slice(-12)}:${path}`;
  if(method==='GET'&&!options.fresh){
    const cached=responseCache.get(cacheKey);
    if(cached&&Date.now()-cached.time<Number(options.ttl||GET_TTL))return cached.value;
    if(pendingRequests.has(cacheKey))return pendingRequests.get(cacheKey);
  }
  const request=(async()=>{
    const headers = new Headers(options.headers || {});
    if (state.token) headers.set('Authorization',`Bearer ${state.token}`);
    const controller=new AbortController();
    const upstreamSignal=options.signal;
    if(upstreamSignal?.aborted)controller.abort(upstreamSignal.reason);
    else upstreamSignal?.addEventListener?.('abort',()=>controller.abort(upstreamSignal.reason),{once:true});
    const timeout=Math.max(1000,Number(options.timeout||DEFAULT_REQUEST_TIMEOUT));
    const timer=setTimeout(()=>controller.abort(),timeout);
    const requestOptions={...options,method,headers,cache:'no-store',signal:controller.signal};
    delete requestOptions.json;delete requestOptions.fresh;delete requestOptions.ttl;delete requestOptions.timeout;
    if (options.json !== undefined) {headers.set('Content-Type','application/json');requestOptions.body=JSON.stringify(options.json)}
    try{
      const response = await fetch(path,requestOptions);
      const payload = await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
      if (response.status === 401 && state.token) {
        const invalid=String(path)==='/api/me'||String(payload.code||'').includes('session_')||!(await sessionStillValid());
        if(invalid)logoutLocal();
      }
      if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || 'No se pudo completar la operación'),{code:payload.code,status:response.status,details:payload.details});
      if(method==='GET')responseCache.set(cacheKey,{time:Date.now(),value:payload});else clearResponseCache();
      return payload;
    }catch(error){
      if(error?.name==='AbortError')throw requestTimeoutError();
      throw error;
    }finally{clearTimeout(timer)}
  })();
  if(method==='GET')pendingRequests.set(cacheKey,request);
  try{return await request}finally{if(method==='GET')pendingRequests.delete(cacheKey)}
};

function toast(message,type='ok') {const node=document.createElement('div');node.className=`toast ${type==='error'?'error':''}`;node.textContent=message;$('#toastRegion')?.append(node);setTimeout(()=>node.remove(),4200)}
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
async function syncMutations(){if(!navigator.onLine||!state.token)return;for(const mutation of await readMutations().catch(()=>[])){try{await api(mutation.path,{method:mutation.method,json:mutation.json,headers:{'Idempotency-Key':mutation.id}});await removeMutation(mutation.id)}catch(error){if(error.status===401)break;console.warn('sync_failed',mutation,error)}}await updateSyncChip()}
async function updateSyncChip(){const count=(await readMutations().catch(()=>[])).length;const chip=$('#syncChip');if(!chip)return;chip.querySelector('span').textContent=!navigator.onLine?'Sin conexión':count?`${count} pendiente${count===1?'':'s'}`:'Sincronizado';chip.classList.toggle('pending',count>0||!navigator.onLine)}
function hideStartup(){$('#startupScreen')?.classList.add('hidden')}
function showAuth(){hideStartup();$('#authScreen')?.classList.remove('hidden');$('#appShell')?.classList.add('hidden')}
function showApp(){hideStartup();$('#authScreen')?.classList.add('hidden');$('#appShell')?.classList.remove('hidden');const {user,organization,plan}=state.me;$('#workspaceName').textContent=organization.name;$('#workspacePlan').textContent=user.isPlatformOwner?'Owner de plataforma':`Plan ${plan.name==='free'?'gratuito':plan.name}`;$('#workspaceAvatar').textContent=initials(organization.name);$('#workspaceCard').disabled=false;$('#workspaceCard').classList.add('selectable');$('#workspaceChevron').classList.remove('hidden');$('#userName').textContent=user.displayName;$('#userRole').textContent=roleNames[user.role]||user.role;$('#userAvatar').textContent=initials(user.displayName);$('#mobileWorkspaceName')&&($('#mobileWorkspaceName').textContent=organization.name);$('#mobileUserAvatar')&&($('#mobileUserAvatar').textContent=initials(user.displayName));$$('.admin-only').forEach(node=>node.classList.toggle('hidden',!isAdmin()))}
function logoutLocal(){state.token='';state.me=null;clearResponseCache();localStorage.removeItem('pp:token');showAuth()}
export {$,$$,esc,money,date,roleNames,state,api,toast,initials,isAdmin,canBuy,setBusy,setTheme,queueMutation,readMutations,syncMutations,updateSyncChip,showAuth,showApp,logoutLocal,sessionStillValid,clearResponseCache};