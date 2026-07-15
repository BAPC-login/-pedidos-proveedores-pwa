const CACHE='pedidos-proveedores-v5';
const SHELL=['./','./index.html','./styles.css?v=5','./ios-nav-fix.css?v=5','./app.js?v=5','./ios-nav-fix.js?v=5','./manifest.webmanifest?v=5','./assets/icon.svg?v=5','./seed-1.js?v=5','./seed-2.js?v=5','./seed-3.js?v=5','./seed-4.js?v=5'];
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
