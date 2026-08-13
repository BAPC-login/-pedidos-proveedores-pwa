import {$,state,api} from './app-core.js';

let initialized=false,lastSent=0;
const BUDGET_KEY='nuvasto:request-budget:v67';
const DAY_LIMIT=100000;
const SCREEN_SOFT_LIMIT=1200;
function dayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date())}
function device(){return `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight} · ${navigator.onLine?'online':'offline'}`.slice(0,160)}
function emptyBudget(){return{day:dayKey(),total:0,background:0,failures:0,duration:0,byView:{},byPath:{},updatedAt:new Date().toISOString()}}
function readBudget(){try{const data=JSON.parse(localStorage.getItem(BUDGET_KEY)||'null');return data?.day===dayKey()?data:emptyBudget()}catch{return emptyBudget()}}
function writeBudget(data){data.updatedAt=new Date().toISOString();try{localStorage.setItem(BUDGET_KEY,JSON.stringify(data))}catch{}}
function bucket(map,key){if(!map[key])map[key]={requests:0,background:0,failures:0,duration:0};return map[key]}
function applyApiMetric(event){const detail=event?.detail||{},data=readBudget(),view=String(state.view||'startup'),path=String(detail.path||'unknown').split('?')[0].slice(0,100),duration=Math.max(0,Number(detail.duration||0)),status=String(detail.status||''),failure=status&&status!=='ok'?1:0,background=detail.background?1:0;data.total++;data.background+=background;data.failures+=failure;data.duration+=duration;for(const target of[bucket(data.byView,view),bucket(data.byPath,path)]){target.requests++;target.background+=background;target.failures+=failure;target.duration+=duration}const pathEntries=Object.entries(data.byPath);if(pathEntries.length>40){pathEntries.sort((a,b)=>b[1].requests-a[1].requests);data.byPath=Object.fromEntries(pathEntries.slice(0,40))}writeBudget(data);document.documentElement.dataset.requestBudget=String(data.total);document.documentElement.dataset.requestBudgetPct=String(Math.round(data.total/DAY_LIMIT*100));document.documentElement.dataset.requestBudgetWarning=String((data.byView[view]?.requests||0)>=SCREEN_SOFT_LIMIT)}
async function record(type,message='',details={}){if(!state.token)return;const now=Date.now(),minimum=type==='long_task'?30000:10000;if(now-lastSent<minimum)return;lastSent=now;try{await api('/api/telemetry/client',{method:'POST',json:{type,message,path:location.pathname,view:state.view,device:device(),details}})}catch{}}
function requestBudget(){const data=readBudget(),views=Object.entries(data.byView).map(([view,value])=>({view,...value,averageMs:value.requests?Math.round(value.duration/value.requests):0})).sort((a,b)=>b.requests-a.requests),paths=Object.entries(data.byPath).map(([path,value])=>({path,...value,averageMs:value.requests?Math.round(value.duration/value.requests):0})).sort((a,b)=>b.requests-a.requests);return{...data,limit:DAY_LIMIT,remaining:Math.max(0,DAY_LIMIT-data.total),usagePct:data.total/DAY_LIMIT,views,paths}}
function applyNotificationCount(event){const count=Math.max(0,Number(event?.detail?.count||0));['pendingCount','receivingCount'].forEach(id=>{const node=$('#'+id);if(node&&node.textContent!==String(count))node.textContent=String(count)});document.documentElement.dataset.alerts=String(count)}

export function initializeTelemetryV13(){
  if(initialized)return;initialized=true;
  window.addEventListener('nuvasto:api-metric',applyApiMetric);
  window.addEventListener('error',event=>record('window_error',event.message,{file:event.filename,line:event.lineno,column:event.colno}));
  window.addEventListener('unhandledrejection',event=>record('unhandled_rejection',String(event.reason?.message||event.reason||'Promise rechazada')));
  window.addEventListener('online',()=>record('connectivity','Conexión recuperada'));
  window.addEventListener('offline',()=>record('connectivity','Sin conexión'));
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(entry.duration>=240)record('long_task',`Tarea de ${Math.round(entry.duration)} ms`,{duration:entry.duration})}}).observe({entryTypes:['longtask']})}catch{}
  window.addEventListener('load',()=>{const navigation=performance.getEntriesByType('navigation')[0];if(navigation)record('page_load','Carga de aplicación',{duration:Math.round(navigation.duration),domContentLoaded:Math.round(navigation.domContentLoadedEventEnd)})},{once:true});
  window.addEventListener('nuvasto:notifications-updated',applyNotificationCount);
  const data=readBudget();document.documentElement.dataset.requestBudget=String(data.total);
  window.NuvastoTelemetry=Object.freeze({requestBudget,resetRequestBudget:()=>{const next=emptyBudget();writeBudget(next);return requestBudget()}});
}
