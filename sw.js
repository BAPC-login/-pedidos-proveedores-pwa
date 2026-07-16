const VERSION='pedidos-pro-v14';
const CORE_CACHE=`${VERSION}-core`;
const RUNTIME_CACHE=`${VERSION}-runtime`;
const CORE=[
  './','./index.html','./styles-v12.css?v=13','./patch-v12.css?v=13','./manifest.webmanifest?v=13','./assets/icon.svg?v=13',
  './seed-1.js?v=13','./seed-2.js?v=13','./seed-3.js?v=13','./seed-4.js?v=13',
  './core-v12.js?v=13','./db-v12.js?v=13','./state-v12.js?v=13','./orders-v12.js?v=13','./invoice-v12.js?v=13','./pdf-v12.js?v=13','./app-v12.js?v=13','./runtime-v14.js?v=14'
];
const OCR=[
  './vendor/pdfjs/pdf.min.js','./vendor/pdfjs/pdf.worker.min.js','./vendor/tesseract/tesseract.min.js','./vendor/tesseract/worker.min.js','./vendor/tessdata/spa.traineddata.gz',
  './vendor/tesseract-core/tesseract-core.wasm.js','./vendor/tesseract-core/tesseract-core.wasm','./vendor/tesseract-core/tesseract-core-simd.wasm.js','./vendor/tesseract-core/tesseract-core-simd.wasm','./vendor/tesseract-core/tesseract-core-lstm.wasm.js','./vendor/tesseract-core/tesseract-core-lstm.wasm','./vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js','./vendor/tesseract-core/tesseract-core-simd-lstm.wasm'
];
const cacheOcr=()=>caches.open(RUNTIME_CACHE).then(cache=>Promise.allSettled(OCR.map(asset=>cache.add(asset))));
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CACHE_OCR')event.waitUntil(cacheOcr())});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CORE_CACHE).then(cache=>cache.put('./index.html',copy));return response}).catch(()=>caches.match('./index.html')));return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(url.pathname.includes('/vendor/')?RUNTIME_CACHE:CORE_CACHE).then(cache=>cache.put(event.request,copy))}return response})));return;
  }
  event.respondWith(caches.open(RUNTIME_CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok||response.type==='opaque')cache.put(event.request,response.clone());return response}));
});
