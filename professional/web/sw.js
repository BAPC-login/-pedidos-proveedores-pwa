const VERSION = 'pedidos-pro-platform-v6-stability-pass';
const SHELL = [
  './','./index.html','./styles.css','./pro-ui.css','./app.js','./app-core.js','./app-views.js','./app-actions.js',
  './app-modal.js','./app-order-detail.js','./app-invoices.js','./app-branding.js','./app-stability.js','./manifest.webmanifest','./icon.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname==='/health'||url.pathname==='/platform/health')return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok)caches.open(VERSION).then(cache=>cache.put('./index.html',response.clone()));
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok)caches.open(VERSION).then(cache=>cache.put(request,response.clone()));
      return response;
    }).catch(()=>caches.match(request)));
  }
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
