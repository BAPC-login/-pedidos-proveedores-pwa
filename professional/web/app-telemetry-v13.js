import {$,state,api} from './app-core.js';

let initialized=false,lastSent=0;
function device(){return `${navigator.userAgent} · ${window.innerWidth}x${window.innerHeight} · ${navigator.onLine?'online':'offline'}`.slice(0,160)}
async function record(type,message='',details={}){if(!state.token)return;const now=Date.now();if(type==='long_task'&&now-lastSent<5000)return;lastSent=now;try{await api('/api/telemetry/client',{method:'POST',json:{type,message,path:location.pathname,view:state.view,device:device(),details}})}catch{}}

function applyNotificationCount(event){const count=Math.max(0,Number(event?.detail?.count||0));['pendingCount','receivingCount'].forEach(id=>{const node=$('#'+id);if(node&&node.textContent!==String(count))node.textContent=String(count)});document.documentElement.dataset.alerts=String(count)}

export function initializeTelemetryV13(){
  if(initialized)return;initialized=true;
  window.addEventListener('error',event=>record('window_error',event.message,{file:event.filename,line:event.lineno,column:event.colno}));
  window.addEventListener('unhandledrejection',event=>record('unhandled_rejection',String(event.reason?.message||event.reason||'Promise rechazada')));
  window.addEventListener('online',()=>record('connectivity','Conexión recuperada'));
  window.addEventListener('offline',()=>record('connectivity','Sin conexión'));
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(entry.duration>=180)record('long_task',`Tarea de ${Math.round(entry.duration)} ms`,{duration:entry.duration})}}).observe({entryTypes:['longtask']})}catch{}
  window.addEventListener('load',()=>{const navigation=performance.getEntriesByType('navigation')[0];if(navigation)record('page_load','Carga de aplicación',{duration:Math.round(navigation.duration),domContentLoaded:Math.round(navigation.domContentLoadedEventEnd)})},{once:true});
  window.addEventListener('nuvasto:notifications-updated',applyNotificationCount);
}
