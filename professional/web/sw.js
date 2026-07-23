const VERSION='pedidos-pro-platform-v14-category-navigation-dashboard';
const SHELL=[
  './','./index.html','./styles.css','./pro-ui.css','./experience.css','./design-system-v13.css','./operations-v14.css','./app.js','./app-core.js','./app-views.js','./app-actions.js',
  './app-modal.js','./app-order-detail.js','./app-invoices.js','./app-branding.js','./app-order-core-v13.js','./app-company-logo.js',
  './app-procurement-settings.js','./app-procurement-entry.js','./app-experience.js','./app-experience-operations.js','./app-experience-settings.js','./app-experience-keyboard.js','./app-experience-admin.js','./app-file-actions.js','./app-assets-v13.js','./app-settings-panels-v13.js','./app-telemetry-v13.js','./app-navigation-v14.js','./app-dashboard-v14.js',
  './manifest.webmanifest','./icon.svg'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname==='/health'||url.pathname==='/platform/health')return;if(request.mode==='navigate'){event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put('./index.html',response.clone()));return response}).catch(()=>caches.match('./index.html')));return}if(url.origin===self.location.origin)event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put(request,response.clone()));return response}).catch(()=>caches.match(request)))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
