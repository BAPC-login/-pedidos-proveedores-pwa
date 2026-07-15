const CACHE='pedidos-proveedores-v9-2';
const SHELL=['./','./index.html','./styles.css?v=9','./pro-features.css?v=9','./v6-professional.css?v=9','./stable-v9.css?v=9','./app.js?v=9','./catalog-bridge-v9.js?v=9','./stable-ocr-v9.js?v=9','./stable-core-v9.js?v=9','./legacy-data-repair-v9.js?v=9','./manifest.webmanifest?v=9','./assets/icon.svg?v=9','./seed-1.js?v=9','./seed-2.js?v=9','./seed-3.js?v=9','./seed-4.js?v=9'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||(event.request.mode==='navigate'?caches.match('./index.html'):undefined))));
});
