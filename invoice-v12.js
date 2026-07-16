(function(root){
  'use strict';
  const core=()=>root.PedidosCore;
  const SOURCES={tesseract:['./vendor/tesseract/tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'],pdf:['./vendor/pdfjs/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js']};
  const loaders=new Map();let tesseractSource='',pdfSource='',workerPromise=null,currentProgress=null;
  function progress(callback,label,percent){if(typeof callback==='function')callback({label,percent:Math.max(0,Math.min(100,Number(percent)||0))})}
  function loadScript(url,test){if(test())return Promise.resolve(url);if(loaders.has(url))return loaders.get(url);const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.crossOrigin='anonymous';script.onload=()=>test()?resolve(url):reject(new Error('La biblioteca no se inició'));script.onerror=()=>reject(new Error(`No se pudo cargar ${url}`));document.head.appendChild(script)}).catch(error=>{loaders.delete(url);throw error});loaders.set(url,promise);return promise}
  async function loadFirst(urls,test){let last;for(const url of urls){try{return await loadScript(url,test)}catch(error){last=error}}throw last||new Error('No se pudo iniciar el lector')}
  async function ensureTesseract(){if(root.Tesseract)return root.Tesseract;tesseractSource=await loadFirst(SOURCES.tesseract,()=>!!root.Tesseract);return root.Tesseract}
  async function ensurePdf(){if(!root.pdfjsLib)pdfSource=await loadFirst(SOURCES.pdf,()=>!!root.pdfjsLib);root.pdfjsLib.GlobalWorkerOptions.workerSrc=pdfSource.startsWith('.')?'./vendor/pdfjs/pdf.worker.min.js':'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';return root.pdfjsLib}
  async function createWorker(onProgress){currentProgress=onProgress;if(workerPromise)return workerPromise;const Tesseract=await ensureTesseract(),local=tesseractSource.startsWith('.')||!!document.querySelector('script[src^="./vendor/tesseract"]'),options={logger:message=>{if(message.status==='recognizing text')progress(currentProgress,'Reconociendo texto',20+message.progress*75);else if(message.status)progress(currentProgress,message.status,12)}};if(local)Object.assign(options,{workerPath:'./vendor/tesseract/worker.min.js',corePath:'./vendor/tesseract-core',langPath:'./vendor/tessdata',gzip:true});workerPromise=Tesseract.createWorker('spa',1,options).then(async worker=>{await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});return worker}).catch(error=>{workerPromise=null;throw error});return workerPromise}
  const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('No se pudo abrir la imagen'));image.src=source});
  function enhanceCanvas(canvas){const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.getImageData(0,0,canvas.width,canvas.height),data=image.data;let min=255,max=0;for(let i=0;i<data.length;i+=4){const gray=data[i]*.299+data[i+1]*.587+data[i+2]*.114;min=Math.min(min,gray);max=Math.max(max,gray)}const range=Math.max(35,max-min);for(let i=0;i<data.length;i+=4){let gray=data[i]*.299+data[i+1]*.587+data[i+2]*.114;gray=(gray-min)*255/range;gray=gray<170?gray*.72:180+(gray-170)*1.3;gray=Math.max(0,Math.min(255,gray));data[i]=data[i+1]=data[i+2]=gray;data[i+3]=255}context.putImageData(image,0,0)}
  async function imageFileToCanvas(file){const source=URL.createObjectURL(file);try{const image=await loadImage(source),max=2600,scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);enhanceCanvas(canvas);return canvas}finally{URL.revokeObjectURL(source)}}
  async function recognizeCanvas(canvas,onProgress){const worker=await createWorker(onProgress),result=await worker.recognize(canvas);return result?.data?.text||''}
  async function readPdf(file,onProgress){const pdfjs=await ensurePdf(),pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,textParts=[],pages=Math.min(pdf.numPages,8);for(let pageNumber=1;pageNumber<=pages;pageNumber++){progress(onProgress,`Leyendo página ${pageNumber} de ${pages}`,5+(pageNumber-1)/pages*70);const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),plain=content.items.map(item=>item.str).join(' ');if(plain.replace(/\s/g,'').length>100){textParts.push(plain);continue}const viewport=page.getViewport({scale:1.8}),canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;enhanceCanvas(canvas);textParts.push(await recognizeCanvas(canvas,onProgress))}return textParts.join('\n')}
  async function readFile(file,onProgress){if(!file)throw new Error('Selecciona una factura');progress(onProgress,`Preparando ${file.name}`,2);let text='';if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))text=await readPdf(file,onProgress);else text=await recognizeCanvas(await imageFileToCanvas(file),onProgress);progress(onProgress,'Cotejando productos y precios',95);return text}
  async function analyze(file,products,onProgress){const text=await readFile(file,onProgress),summary=core().matchInvoice(text,products||[]);progress(onProgress,'Lectura terminada',100);return{text,summary}}
  root.PedidosInvoice={readFile,analyze,enhanceCanvas};
  if(!document.getElementById('buildVersion')){const marker=document.createElement('span');marker.id='buildVersion';marker.className='build-version';document.getElementById('eyebrow')?.append(' ',marker)}
})(globalThis);

(function(root){
  'use strict';
  const DB=root.PedidosDB,Orders=root.PedidosOrders;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number(value||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
  const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('No se pudo leer la imagen'));image.src=source});
  async function normalizeImage(blob){
    if(!(blob instanceof Blob)||!String(blob.type||'').startsWith('image/'))return blob;
    const source=URL.createObjectURL(blob);
    try{
      const image=await loadImage(source),max=900,scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/png',.92));
    }catch{return blob}finally{URL.revokeObjectURL(source)}
  }

  if(DB?.setAsset){
    const originalSetAsset=DB.setAsset.bind(DB);
    DB.setAsset=async function(key,blob,meta={}){
      const value=/^(?:provider|profile):/.test(String(key))?await normalizeImage(blob):blob;
      return originalSetAsset(key,value,meta);
    };
  }

  if(Orders?.saveInvoice){
    const originalSaveInvoice=Orders.saveInvoice.bind(Orders);
    Orders.saveInvoice=async function(invoice){
      const saved=await originalSaveInvoice(invoice);
      if(saved?.status==='read'&&Array.isArray(saved.lines)&&saved.lines.length&&!saved.autoProcessed){
        saved.autoProcessed=true;
        await originalSaveInvoice(saved);
        await Orders.reviewInvoice(saved.id,saved.lines,{invoiceNumber:saved.invoiceNumber||'',displayName:saved.displayName||saved.originalName||'Factura'});
        return DB.get('invoices',saved.id);
      }
      return saved;
    };
  }

  async function hydrateInvoiceSummaries(){
    const list=document.querySelector('#invoiceList');if(!list||!DB?.get)return;
    for(const button of list.querySelectorAll('[data-invoice-review]')){
      const row=button.closest('.invoice-row');if(!row||row.dataset.summaryReady==='1'||row.dataset.summaryReady==='loading')continue;
      row.dataset.summaryReady='loading';
      try{
        const invoice=await DB.get('invoices',Number(button.dataset.invoiceReview)),lines=(invoice?.lines||[]).filter(line=>line.productId);
        if(!lines.length){row.dataset.summaryReady='1';continue}
        const value=lines.reduce((sum,line)=>sum+Number(line.grossLineTotal||0),0),summary=document.createElement('div');summary.className='invoice-item-summary';summary.innerHTML=`<div class="invoice-summary-total"><span>Resumen de factura</span><b>${money(value)}</b></div>${lines.map(line=>`<div class="invoice-summary-line"><span>${esc(line.description||'Producto')}</span><small>${Number(line.units||0).toFixed(Number(line.units||0)%1?1:0)} un · ${money(line.grossUnitPrice||0)}/un · <b>${money(line.grossLineTotal||0)}</b></small></div>`).join('')}`;
        row.querySelector(':scope > div:first-child')?.appendChild(summary);row.dataset.summaryReady='1';
      }catch(error){console.warn(error);row.dataset.summaryReady='0'}
    }
  }

  const observer=new MutationObserver(()=>queueMicrotask(hydrateInvoiceSummaries));
  const start=()=>{const reception=document.querySelector('#receptionContent');if(reception)observer.observe(reception,{childList:true,subtree:true});hydrateInvoiceSummaries();const marker=document.querySelector('#buildVersion');if(marker)marker.textContent='v8.0.0'};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
  document.addEventListener('click',event=>{const tab=event.target.closest?.('[data-data-tab]');if(tab){const button=document.querySelector('#newProduct');if(button)button.classList.toggle('hidden',tab.dataset.dataTab!=='products')}});
})(globalThis);
