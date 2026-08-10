import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [core,app,v40,v41,sw,current,combined]=await Promise.all([
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v40-operations.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v41-enterprise.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-current.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8')
]);

assert.match(core,/pendingRequests/);assert.match(core,/apiBackoffUntil/);assert.match(core,/HOT_MASTER/);assert.match(core,/HOT_OPERATIONAL/);assert.match(core,/options\.cancelOnNavigate===true/);
assert.match(app,/CLIENT_RELEASE='2026\.08\.10\.60'/);assert.match(app,/\/platform\/release\?client=/);assert.match(app,/updateViaCache:'none'/);assert.doesNotMatch(app,/window\.fetch=async/);
assert.match(v40,/document\.addEventListener\('pedidos:view-rendered',schedule\)/);assert.doesNotMatch(v40,/notificationTimer=setInterval/);
assert.match(v41,/notificationPromise/);assert.match(v41,/lastNotificationRefresh<2\*60\*1000/);assert.match(v41,/notificationTimer=setInterval\(.*5\*60\*1000/);
assert.match(sw,/nuvasto-v60-consolidated-runtime/);assert.match(sw,/if\(cached\)return cached/);
assert.match(current,/CURRENT_RELEASE='2026\.08\.10\.60'/);assert.match(current,/return\[base,'core-hotpath'\]/);assert.match(combined,/index-current\.js/);
for(const file of ['../web/app-core.js','../web/app.js','../web/app-v40-operations.js','../web/app-v41-enterprise.js','../web/sw.js','../worker/src/index-current.js','../../worker/src/combined.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});

const memory=new Map();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[]}});
Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>{},addEventListener:()=>{}}});
let networkCalls=0,rateLimited=false;
Object.defineProperty(globalThis,'fetch',{configurable:true,value:async()=>{networkCalls++;await new Promise(resolve=>setTimeout(resolve,5));if(rateLimited)return new Response(JSON.stringify({ok:false,error:'Límite temporal',code:'rate_limited'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60'}});return new Response(JSON.stringify({ok:true,products:[{id:'p1'}]}),{status:200,headers:{'Content-Type':'application/json'}})}});
const runtime=await import(new URL(`../web/app-core.js?r60=${Date.now()}`,import.meta.url));runtime.state.token='test-token';
const concurrent=await Promise.all(Array.from({length:40},()=>runtime.api('/api/products',{fresh:true,persist:true})));assert.equal(networkCalls,1);assert.equal(concurrent.length,40);
rateLimited=true;const stale=await runtime.api('/api/products',{fresh:true,persist:true});assert.equal(networkCalls,2);assert.equal(stale.products[0].id,'p1');await runtime.api('/api/products',{fresh:true,persist:true});assert.equal(networkCalls,2);
console.log('workflow r60 stability: one request coordinator, backoff and no navigation abort storm: OK');
