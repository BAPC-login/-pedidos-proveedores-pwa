import {CLIENT_RELEASE,ARCHITECTURE_GENERATION} from './app-release.js';

const RELOAD_MARK='nuvasto:release-guard-reload';
const LEGACY_STYLE_NAMES=new Set(['styles.css','pro-ui.css','experience.css','design-system-v13.css','design-system-v14.css','brand-v21.css','native-performance.css','design-system-v79.css','design-system-native-v80.css','design-system-native-v82.css']);

function releaseUrl(){return `/platform/release?client=${encodeURIComponent(CLIENT_RELEASE)}&architecture=${ARCHITECTURE_GENERATION}&ts=${Date.now()}`}
function requestedRelease(response,payload){return String(response?.headers?.get?.('X-Nuvasto-Release')||payload?.release||'').trim()}
async function purgeStaleRuntime(){
  try{
    const registrations=await navigator.serviceWorker?.getRegistrations?.()||[];
    await Promise.all(registrations.map(registration=>registration.unregister().catch(()=>false)));
  }catch{}
  try{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('nuvasto-')).map(key=>caches.delete(key)));
  }catch{}
}
function reloadFor(release){
  const url=new URL(location.href);url.searchParams.set('__nuvasto_release',release||CLIENT_RELEASE);url.searchParams.set('__nuvasto_ts',String(Date.now()));location.replace(url.toString());
}
async function waitForController(registration,serverRelease){
  if(!registration)return false;
  let changed=false;
  const onChange=()=>{changed=true;sessionStorage.setItem(RELOAD_MARK,serverRelease);reloadFor(serverRelease)};
  navigator.serviceWorker?.addEventListener?.('controllerchange',onChange,{once:true});
  try{await registration.update()}catch{}
  registration.waiting?.postMessage?.({type:'SKIP_WAITING'});
  const installing=registration.installing;
  if(installing)installing.addEventListener('statechange',()=>{if(installing.state==='installed')registration.waiting?.postMessage?.({type:'SKIP_WAITING'})});
  await new Promise(resolve=>setTimeout(resolve,1300));
  return changed;
}
export async function ensureCurrentStylesheet(){
  const existing=document.getElementById('nuvastoCurrentStyles');if(existing)return true;
  const link=document.createElement('link');link.id='nuvastoCurrentStyles';link.rel='stylesheet';link.href=`./app-current.css?release=${encodeURIComponent(CLIENT_RELEASE)}`;
  const loaded=new Promise(resolve=>{link.onload=()=>resolve(true);link.onerror=()=>resolve(false)});document.head.append(link);
  if(!await loaded){link.remove();return false}
  for(const legacy of document.querySelectorAll('link[rel="stylesheet"]')){
    if(legacy===link)continue;
    let name='';try{name=new URL(legacy.href,location.href).pathname.split('/').pop()||''}catch{}
    if(LEGACY_STYLE_NAMES.has(name))legacy.disabled=true;
  }
  document.documentElement.dataset.currentStyles=CLIENT_RELEASE;
  return true;
}
export async function ensureCurrentRelease(){
  document.documentElement.dataset.clientRelease=CLIENT_RELEASE;
  document.documentElement.dataset.architectureGeneration=String(ARCHITECTURE_GENERATION);
  await ensureCurrentStylesheet();
  if(!navigator.onLine)return true;
  let response,payload;
  try{response=await fetch(releaseUrl(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}});if(!response.ok)return true;payload=await response.json().catch(()=>({}))}catch{return true}
  const serverRelease=requestedRelease(response,payload);
  if(!serverRelease||serverRelease===CLIENT_RELEASE){sessionStorage.removeItem(RELOAD_MARK);return true}
  document.documentElement.dataset.releaseMismatch=serverRelease;
  const last=sessionStorage.getItem(RELOAD_MARK)||'';
  const registration=await navigator.serviceWorker?.getRegistration?.().catch?.(()=>null);
  if(last!==serverRelease&&registration){sessionStorage.setItem(RELOAD_MARK,serverRelease);if(await waitForController(registration,serverRelease))return false}
  await purgeStaleRuntime();sessionStorage.setItem(RELOAD_MARK,serverRelease);reloadFor(serverRelease);return false;
}
