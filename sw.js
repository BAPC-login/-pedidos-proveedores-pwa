const VERSION='pedidos-pro-v12';
const CORE_CACHE=`${VERSION}-core`;
const OCR_CACHE=`${VERSION}-ocr`;
const CORE=[
  './','./index.html','./styles-v12.css?v=12','./patch-v12.css?v=12','./manifest.webmanifest?v=12','./assets/icon.svg?v=12',
  './seed-1.js?v=12','./seed-2.js?v=12','./seed-3.js?v=12','./seed-4.js?v=12',
  './core-v12.js?v=12','./db-v12.js?v=12','./state-v12.js?v=12','./orders-v12.js?v=12','./invoice-v12.js?v=12','./pdf-v12.js?v=12','./app-v12.js?v=12',
  './vendor/jspdf/jspdf.umd.min.js','./vendor/pdfjs/pdf.min.js','./vendor/tesseract/tesseract.min.js'
];
const OCR_ASSETS=[
  './vendor/pdfjs/pdf.worker.min.js','./vendor/tesseract/worker.min.js','./vendor/tessdata/spa.traineddata.gz',
  './vendor/tesseract-core/tesseract-core.wasm.js','./vendor/tesseract-core/tesseract-core.wasm',
  './vendor/tesseract-core/tesseract-core-simd.wasm.js','./vendor/tesseract-core/tesseract-core-simd.wasm',
  './vendor/tesseract-core/tesseract-core-lstm.wasm.js','./vendor/tesseract-core/tesseract-core-lstm.wasm',
  './vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js','./vendor/tesseract-core/tesseract-core-simd-lstm.wasm'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='CACHE_OCR')event.waitUntil(caches.open(OCR_CACHE).then(cache=>Promise.allSettled(OCR_ASSETS.map(asset=>cache.add(asset)))));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CORE_CACHE).then(cache=>cache.put('./index.html',copy));return response}).catch(()=>caches.match('./index.html')));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(url.pathname.includes('/vendor/tesseract')||url.pathname.includes('/vendor/pdfjs')?OCR_CACHE:CORE_CACHE).then(cache=>cache.put(event.request,copy))}return response})));
});
