import {$,state,api} from './app-core.js';

let initialized=false,lastSent=0;
const BUDGET_KEY='nuvasto:request-budget:v84';
const DAY_LIMIT=100000;
const SCREEN_SOFT_LIMIT=1200;
const SAMPLE_LIMIT=80;
const P95_WARN_MS=2500;
const FAILURE_WARN_RATE=.03;
function dayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date())}
function device(){return `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight} · ${navigator.onLine?'online':'offline'}`.slice(0,160)}
function emptyBucket(){return{requests:0,background:0,failures:0,duration:0,samples:[]}}
function emptyBudget(){return{day:dayKey(),total:0,background:0,failures:0,duration:0,byView:{},byPath:{},updatedAt:new Date().toISOString()}}
function readBudget(){try{const data=JSON.parse(localStorage.getItem(BUDGET_KEY)||'null');return data?.day===dayKey()?data:emptyBudget()}catch{return emptyBudget()}}
function writeBudget(data){data.updatedAt=new Date().toISOString();try{localStorage.setItem(BUDGET_KEY,JSON.stringify(data))}catch{}}
function bucket(map,key){if(!map[key])map[key]=emptyBucket();if(!Array.isArray(map[key].samples))map[key].samples=[];return map[key]}
function addSample(target,value){const sample=Math.max(0,Math.round(Number(value)||0));target.samples.push(sample);if(target.samples.length>SAMPLE_LIMIT)target.samples.splice(0,target.samples.length-SAMPLE_LIMIT)}
function percentile(samples,p){if(!samples?.length)return 0;const sorted=[...samples].sort((a,b)=>a-b),index=Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1));return sorted[index]}
function summarize(value){const requests=Number(value.requests||0),failures=Number(value.failures||0);return{...value,averageMs:requests?Math.round(Number(value.duration||0)/requests):0,p50Ms:percentile(value.samples,.5),p95Ms:percentile(value.samples,.95),failureRate:requests?failures/requests:0,sloOk:requests<5||(percentile(value.samples,.95)<=P95_WARN_MS&&failures/requests<=FAILURE_WARN_RATE)}}
function applyApiMetric(event){const detail=event?.detail||{},data=readBudget(),view=String(state.view||'startup'),path=String(detail.path||'unknown').split('?')[0].slice(0,100),duration=Math.max(0,Number(detail.duration||0)),status=String(detail.status||''),failure=status&&status!=='ok'?1:0,background=detail.background?1:0;data.total++;data.background+=background;data.failures+=failure;data.duration+=duration;for(const target of[bucket(data.byView,view),bucket(data.byPath,path)]){target.requests++;target.background+=background;target.failures+=failure;target.duration+=duration;addSample(target,duration)}const pathEntries=Object.entries(data.byPath);if(pathEntries.length>40){pathEntries.sort((a,b)=>b[1].requests-a[1].requests);data.byPath=Object.fromEntries(pathEntries.slice(0,40))}writeBudget(data);const current=summarize(bucket(data.byView,view));document.documentElement.dataset.requestBudget=String(data.total);document.documentElement.dataset.requestBudgetPct=String(Math.round(data.total/DAY_LIMIT*100));document.documentElement.dataset.requestBudgetWarning=String(current.requests>=SCREEN_SOFT_LIMIT);document.documentElement.dataset.performanceSlo=String(current.sloOk?'ok':'warning')}
async function record(type,message='',details={}){if(!state.token)return;const now=Date.now(),minimum=type==='long_task'?30000:10000;if(now-lastSent<minimum)return;lastSent=now;try{await api('/api/telemetry/client',{method:'POST',json:{type,message,path:location.pathname,view:state.view,device:device(),details}})}catch{}}
function requestBudget(){const data=readBudget(),views=Object.entries(data.byView).map(([view,value])=>({view,...summarize(value)})).sort((a,b)=>b.requests-a.requests),paths=Object.entries(data.byPath).map(([path,value])=>({path,...summarize(value)})).sort((a,b)=>b.requests-a.requests),overall={requests:data.total,failures:data.failures,duration:data.duration,samples:paths.flatMap(item=>item.samples||[]).slice(-SAMPLE_LIMIT)};return{...data,limit:DAY_LIMIT,remaining:Math.max(0,DAY_LIMIT-data.total),usagePct:data.total/DAY_LIMIT,thresholds:{p95Ms:P95_WARN_MS,failureRate:FAILURE_WARN_RATE,screenRequests:SCREEN_SOFT_LIMIT},overall:summarize(overall),views,paths}}
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
