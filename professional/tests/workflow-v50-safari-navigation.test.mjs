import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [sw,app,current,combined]=await Promise.all([
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-current.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8')
]);
assert.match(sw,/nuvasto-v60-consolidated-runtime/);const precache=sw.match(/const PRECACHE=\[(.*?)\];/s)?.[1]||'';assert.ok(precache);assert.doesNotMatch(precache,/index\.html/);assert.match(sw,/function withoutRedirectMetadata\(response\)/);assert.match(sw,/response\?\.ok&&!response\.redirected/);assert.match(sw,/cache\.match\('\.\/'\)/);assert.doesNotMatch(sw,/cache\.match\('\.\/index\.html'\)/);
assert.match(app,/CLIENT_RELEASE='2026\.08\.10\.60'/);assert.match(current,/CURRENT_RELEASE='2026\.08\.10\.60'/);assert.match(combined,/consolidated-r60/);
execFileSync(process.execPath,['--check',new URL('../web/sw.js',import.meta.url).pathname],{stdio:'inherit'});

const listeners={},stored=new Map(),background=[];const cache={async put(key,response){stored.set(String(key),response.clone())},async match(key){return stored.get(String(key))?.clone()||null}};const redirectedHtml=()=>{const response=new Response('<!doctype html><title>Nuvasto</title>',{status:200,headers:{'Content-Type':'text/html'}});Object.defineProperty(response,'redirected',{configurable:true,value:true});return response};
const context=vm.createContext({AbortController,Headers,Response,URL,console,setTimeout,clearTimeout,fetch:async()=>redirectedHtml(),caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},self:{location:{origin:'https://nuvasto.example'},addEventListener:(type,listener)=>{listeners[type]=listener},skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]},registration:{showNotification:async()=>{}}},clients:{matchAll:async()=>[],openWindow:async()=>{}}});vm.runInContext(sw,context,{filename:'sw.js'});
async function navigate(url){let responsePromise;listeners.fetch({request:{method:'GET',mode:'navigate',url},respondWith:value=>{responsePromise=Promise.resolve(value)},waitUntil:value=>background.push(Promise.resolve(value))});const response=await responsePromise;await Promise.all(background.splice(0));return response}
const online=await navigate('https://nuvasto.example/index.html');assert.equal(online.status,200);assert.equal(online.redirected,false);assert.match(await online.text(),/Nuvasto/);const cached=await cache.match('./');assert.ok(cached);assert.equal(cached.redirected,false);context.fetch=async()=>{throw new TypeError('offline')};const offline=await navigate('https://nuvasto.example/');assert.equal(offline.status,200);assert.equal(offline.redirected,false);assert.match(await offline.text(),/Nuvasto/);
console.log('workflow r60 Safari navigation contract: redirect metadata removed online and offline: OK');
