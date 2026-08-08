import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [core,app,entry,v40,v41,sw,index,combined,wrangler,rootWrangler,deploy,pkg]=await Promise.all([
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v40-operations.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v41-enterprise.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v45.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8'),
  readFile(new URL('../../.github/workflows/deploy-cloudflare.yml',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(core,/const GET_TTL=2\*60\*1000/);
assert.match(core,/const SWR_REFRESH_AFTER=2\*60\*1000/);
assert.match(core,/pendingRequests\.has\(cacheKey\)\)return pendingRequests\.get\(cacheKey\)/);
assert.match(core,/apiBackoffUntil/);
assert.match(core,/Number\(normalized\.status\)===429/);

assert.match(app,/CLIENT_RELEASE='2026\.08\.08\.50'/);
assert.match(app,/\/platform\/release\?client=/);
assert.match(app,/register\('\.\/sw\.js',\{updateViaCache:'none'\}\)/);
assert.doesNotMatch(app,/register\('\.\/sw\.js'\)\.then\(registration=>registration\.update/);

assert.doesNotMatch(entry,/openRoute\(state\.view/);
assert.doesNotMatch(entry,/v32_initial_route_failed/);

assert.match(v40,/document\.addEventListener\('pedidos:view-rendered',schedule\)/);
assert.doesNotMatch(v40,/characterData:true/);
assert.doesNotMatch(v40,/notificationTimer=setInterval/);

assert.match(v41,/if\(!state\.token\|\|!state\.me\|\|document\.visibilityState==='hidden'\)return/);
assert.match(v41,/notificationPromise/);
assert.match(v41,/lastNotificationRefresh<2\*60\*1000/);
assert.match(v41,/function onRendered\(\)\{scheduleDomEnhance\(\);scheduleNotifications\(\)\}/);
assert.match(v41,/notificationTimer=setInterval\(.*5\*60\*1000/);
assert.doesNotMatch(v41,/function onRendered\(\)\{[^}]*notifications\(\)/);
assert.match(v41,/new MutationObserver\(records=>\{if\(records\.some\(record=>record\.addedNodes\.length\)\)scheduleDomEnhance\(\)\}\)/);

assert.match(sw,/nuvasto-v50-safari-navigation/);
assert.match(sw,/const PRECACHE=/);
assert.match(sw,/const OPTIONAL_ASSETS=/);
assert.match(sw,/if\(cached\)return cached/);
assert.doesNotMatch(sw,/cache\.addAll\(SHELL\)/);

for(const config of [wrangler,rootWrangler])assert.match(config,/\/platform\/release/);
assert.match(index,/VERSION='50'/);
assert.match(index,/RELEASE_VERSION='2\.0\.0-alpha\.50'/);
for(const capability of ['notificationLoopGuardV49','cacheFirstPwaV49','lightweightReleaseHandshakeV49','singleStartupRouteV49'])assert.match(index,new RegExp(`${capability}:true`));
assert.match(combined,/stable-runtime · 2026\.08\.08\.49/);
assert.match(combined,/PLATFORM_RELEASE='2026\.08\.08\.50'/);
assert.match(combined,/url\.pathname==='\/platform\/release'/);
assert.match(deploy,/notificationLoopGuardV49/);
assert.match(pkg,/"version": "2\.0\.0-alpha\.50"/);
assert.match(pkg,/workflow-v49-stability\.test\.mjs/);

for(const file of ['../web/app-core.js','../web/app.js','../web/app-v32-entry.js','../web/app-v40-operations.js','../web/app-v41-enterprise.js','../web/sw.js','../worker/src/index-v45.js','../../worker/src/combined.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});

const memory=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[]}});
Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>{},addEventListener:()=>{}}});
let networkCalls=0,rateLimited=false;
Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>{
  networkCalls++;
  await new Promise(resolve=>setTimeout(resolve,5));
  if(rateLimited)return new Response(JSON.stringify({ok:false,error:'Límite temporal',code:'rate_limited'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60'}});
  return new Response(JSON.stringify({ok:true,products:[{id:'p1'}]}),{status:200,headers:{'Content-Type':'application/json'}});
}});
const runtime=await import(new URL(`../web/app-core.js?r49=${Date.now()}`,import.meta.url));
runtime.state.token='test-token';
const concurrent=await Promise.all(Array.from({length:40},()=>runtime.api('/api/products',{fresh:true,persist:true})));
assert.equal(networkCalls,1,'40 lecturas fresh simultáneas deben producir una sola solicitud');
assert.equal(concurrent.length,40);
rateLimited=true;
const stale=await runtime.api('/api/products',{fresh:true,persist:true});
assert.equal(networkCalls,2);
assert.equal(stale.products[0].id,'p1');
await runtime.api('/api/products',{fresh:true,persist:true});
assert.equal(networkCalls,2,'el backoff 429 debe servir caché sin insistir al Worker');
console.log('workflow r49 stability: notification loop, startup, cache-first PWA and release handshake: OK');
