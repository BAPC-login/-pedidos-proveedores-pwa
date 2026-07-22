const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number(value || 0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const date = value => value ? new Date(value).toLocaleDateString('es-CL') : '—';
const roleNames = {owner:'Propietario',admin:'Administrador',purchaser:'Compras',approver:'Aprobador',receiver:'Recepción',finance:'Finanzas',readonly:'Solo lectura'};
const state = {
  token: localStorage.getItem('pp:token') || '',
  me: null,
  view: 'dashboard',
  cache: {dashboard:null,orders:[],invoices:[],products:[],suppliers:[],categories:[],locations:[],costCenters:[],users:[],audit:[],brands:[],sessions:[]},
  online: navigator.onLine,
  pending: []
};

const api = async (path, options={}) => {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization',`Bearer ${state.token}`);
  if (options.json !== undefined) {
    headers.set('Content-Type','application/json');
    options.body = JSON.stringify(options.json);
  }
  const response = await fetch(path,{...options,headers});
  const payload = await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  if (response.status === 401 && state.token) logoutLocal();
  if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || 'No se pudo completar la operación'),{code:payload.code,status:response.status,details:payload.details});
  return payload;
};

function toast(message,type='ok') {
  const node=document.createElement('div');
  node.className=`toast ${type==='error'?'error':''}`;
  node.textContent=message;
  $('#toastRegion')?.append(node);
  setTimeout(()=>node.remove(),4200);
}

function initials(value='') { return value.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase() || 'PP'; }
function isAdmin(){return ['owner','admin'].includes(state.me?.user?.role)}
function canBuy(){return ['owner','admin','purchaser','approver'].includes(state.me?.user?.role)}
function setBusy(button,busy,label='Guardando…'){
  if(!button)return;
  if(busy){
    button.dataset.label=button.innerHTML;
    button.textContent=label;
    button.disabled=true;
  }else{
    button.innerHTML=button.dataset.label||button.innerHTML;
    button.disabled=false;
  }
}

function setTheme(theme){
  document.documentElement.dataset.theme=theme;
  localStorage.setItem('pp:theme',theme);
}
setTheme(localStorage.getItem('pp:theme') || 'system');

async function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('pedidos-pro-platform',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('mutations',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function queueMutation(path,method,json){
  const db=await openDb();
  const mutation={id:crypto.randomUUID(),path,method,json,createdAt:new Date().toISOString()};
  await new Promise((resolve,reject)=>{const tx=db.transaction('mutations','readwrite');tx.objectStore('mutations').put(mutation);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  await updateSyncChip();
  return mutation;
}
async function readMutations(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const r=db.transaction('mutations').objectStore('mutations').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
}
async function removeMutation(id){
  const db=await openDb();
  return new Promise((resolve,reject)=>{const tx=db.transaction('mutations','readwrite');tx.objectStore('mutations').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
}
async function syncMutations(){
  if(!navigator.onLine||!state.token)return;
  for(const mutation of await readMutations()){
    try{
      await api(mutation.path,{method:mutation.method,json:mutation.json,headers:{'Idempotency-Key':mutation.id}});
      await removeMutation(mutation.id);
    }catch(error){
      if(error.status===401)break;
      console.warn('sync_failed',mutation,error);
    }
  }
  await updateSyncChip();
}
async function updateSyncChip(){
  const count=(await readMutations().catch(()=>[])).length;
  const chip=$('#syncChip');
  if(!chip)return;
  chip.querySelector('span').textContent=!navigator.onLine?'Sin conexión':count?`${count} pendiente${count===1?'':'s'}`:'Sincronizado';
  chip.classList.toggle('pending',count>0||!navigator.onLine);
}

function showAuth(){
  $('#authScreen')?.classList.remove('hidden');
  $('#appShell')?.classList.add('hidden');
}
function showApp(){
  $('#authScreen')?.classList.add('hidden');
  $('#appShell')?.classList.remove('hidden');
  const {user,organization,plan}=state.me;
  $('#workspaceName').textContent=organization.name;
  $('#workspacePlan').textContent=user.isPlatformOwner?'Owner de plataforma':`Plan ${plan.name==='free'?'gratuito':plan.name}`;
  $('#workspaceAvatar').textContent=initials(organization.name);
  $('#workspaceCard').disabled=false;
  $('#workspaceCard').classList.add('selectable');
  $('#workspaceChevron').classList.remove('hidden');
  $('#userName').textContent=user.displayName;
  $('#userRole').textContent=roleNames[user.role]||user.role;
  $('#userAvatar').textContent=initials(user.displayName);
  $('#mobileWorkspaceName') && ($('#mobileWorkspaceName').textContent=organization.name);
  $('#mobileUserAvatar') && ($('#mobileUserAvatar').textContent=initials(user.displayName));
  $$('.admin-only').forEach(node=>node.classList.toggle('hidden',!isAdmin()));
}
function logoutLocal(){
  state.token='';state.me=null;localStorage.removeItem('pp:token');showAuth();
}

export {$,$$,esc,money,date,roleNames,state,api,toast,initials,isAdmin,canBuy,setBusy,setTheme,queueMutation,readMutations,syncMutations,updateSyncChip,showAuth,showApp,logoutLocal};
