const CACHE='pedidos-proveedores-v7';
const SHELL=['./','./index.html','./styles.css?v=7','./ios-nav-fix.css?v=7','./pro-features.css?v=7','./v6-professional.css?v=7','./app.js?v=7','./ios-nav-fix.js?v=7','./pro-features.js?v=7','./v6-invoice-ai.js?v=7','./v6-management.js?v=7','./v6-ios-input.js?v=7','./manifest.webmanifest?v=7','./assets/icon.svg?v=7','./seed-1.js?v=7','./seed-2.js?v=7','./seed-3.js?v=7','./seed-4.js?v=7'];
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
