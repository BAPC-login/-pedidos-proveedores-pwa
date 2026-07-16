(function(root){
  'use strict';

  const core=()=>root.PedidosCore;
  const SOURCES={
    tesseract:['./vendor/tesseract/tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'],
    pdf:['./vendor/pdfjs/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js']
  };
  const loaders=new Map();
  let tesseractSource='';
  let pdfSource='';
  let workerPromise=null;
  let currentProgress=null;

  function progress(callback,label,percent){
    if(typeof callback==='function')callback({label,percent:Math.max(0,Math.min(100,Number(percent)||0))});
  }

  function loadScript(url,test){
    if(test())return Promise.resolve(url);
    if(loaders.has(url))return loaders.get(url);
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=url;
      script.crossOrigin='anonymous';
      script.onload=()=>test()?resolve(url):reject(new Error('La biblioteca no se inició'));
      script.onerror=()=>reject(new Error(`No se pudo cargar ${url}`));
      document.head.appendChild(script);
    }).catch(error=>{loaders.delete(url);throw error});
    loaders.set(url,promise);
    return promise;
  }

  async function loadFirst(urls,test){
    let lastError;
    for(const url of urls){
      try{return await loadScript(url,test)}catch(error){lastError=error}
    }
    throw lastError||new Error('No se pudo iniciar el lector');
  }

  async function ensureTesseract(){
    if(root.Tesseract)return root.Tesseract;
    tesseractSource=await loadFirst(SOURCES.tesseract,()=>!!root.Tesseract);
    return root.Tesseract;
  }

  async function ensurePdf(){
    if(!root.pdfjsLib)pdfSource=await loadFirst(SOURCES.pdf,()=>!!root.pdfjsLib);
    const local=pdfSource.startsWith('.')||!!document.querySelector('script[src^="./vendor/pdfjs"]');
    root.pdfjsLib.GlobalWorkerOptions.workerSrc=local?'./vendor/pdfjs/pdf.worker.min.js':'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return root.pdfjsLib;
  }

  async function createWorker(onProgress){
    currentProgress=onProgress;
    if(workerPromise)return workerPromise;
    const Tesseract=await ensureTesseract();
    const local=tesseractSource.startsWith('.')||!!document.querySelector('script[src^="./vendor/tesseract"]');
    const options={logger:message=>{
      if(message.status==='recognizing text')progress(currentProgress,'Reconociendo texto',20+message.progress*75);
      else if(message.status)progress(currentProgress,message.status,12);
    }};
    if(local)Object.assign(options,{workerPath:'./vendor/tesseract/worker.min.js',corePath:'./vendor/tesseract-core',langPath:'./vendor/tessdata',gzip:true});
    workerPromise=Tesseract.createWorker('spa',1,options).then(async worker=>{
      await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
      return worker;
    }).catch(error=>{workerPromise=null;throw error});
    return workerPromise;
  }

  const loadImage=source=>new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('No se pudo abrir la imagen'));
    image.src=source;
  });

  function enhanceCanvas(canvas){
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const image=context.getImageData(0,0,canvas.width,canvas.height);
    const data=image.data;
    let min=255,max=0;
    for(let index=0;index<data.length;index+=4){
      const gray=data[index]*.299+data[index+1]*.587+data[index+2]*.114;
      min=Math.min(min,gray);max=Math.max(max,gray);
    }
    const range=Math.max(35,max-min);
    for(let index=0;index<data.length;index+=4){
      let gray=data[index]*.299+data[index+1]*.587+data[index+2]*.114;
      gray=(gray-min)*255/range;
      gray=gray<170?gray*.72:180+(gray-170)*1.3;
      gray=Math.max(0,Math.min(255,gray));
      data[index]=data[index+1]=data[index+2]=gray;data[index+3]=255;
    }
    context.putImageData(image,0,0);
  }

  async function imageFileToCanvas(file){
    const source=URL.createObjectURL(file);
    try{
      const image=await loadImage(source);
      const max=2800;
      const scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      enhanceCanvas(canvas);
      return canvas;
    }finally{URL.revokeObjectURL(source)}
  }

  async function recognizeCanvas(canvas,onProgress){
    const worker=await createWorker(onProgress);
    const result=await worker.recognize(canvas);
    return result?.data?.text||'';
  }

  async function readPdf(file,onProgress){
    const pdfjs=await ensurePdf();
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const textParts=[];
    const pages=Math.min(pdf.numPages,12);
    for(let pageNumber=1;pageNumber<=pages;pageNumber++){
      progress(onProgress,`Leyendo página ${pageNumber} de ${pages}`,5+(pageNumber-1)/pages*70);
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      const plain=content.items.map(item=>item.str).join(' ');
      if(plain.replace(/\s/g,'').length>100){textParts.push(plain);continue}
      const viewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      enhanceCanvas(canvas);
      textParts.push(await recognizeCanvas(canvas,onProgress));
    }
    return textParts.join('\n');
  }

  async function readFile(file,onProgress){
    if(!file)throw new Error('Selecciona una factura');
    progress(onProgress,`Preparando ${file.name}`,2);
    const text=(file.type==='application/pdf'||/\.pdf$/i.test(file.name))
      ?await readPdf(file,onProgress)
      :await recognizeCanvas(await imageFileToCanvas(file),onProgress);
    if(!String(text).trim())throw new Error('No se detectó texto legible en la factura');
    progress(onProgress,'Cotejando productos y precios',95);
    return text;
  }

  async function analyze(file,products,onProgress){
    const text=await readFile(file,onProgress);
    const summary=core().matchInvoice(text,products||[]);
    progress(onProgress,'Lectura terminada',100);
    return{text,summary};
  }

  root.PedidosInvoice={readFile,analyze,enhanceCanvas};
  if(!document.getElementById('buildVersion')){
    const marker=document.createElement('span');
    marker.id='buildVersion';marker.className='build-version';
    document.getElementById('eyebrow')?.append(' ',marker);
  }
})(globalThis);

(function(root){
  'use strict';
  if(root.__PEDIDOS_STABILITY_V15__)return;
  root.__PEDIDOS_STABILITY_V15__=true;

  const DB=root.PedidosDB;
  const Orders=root.PedidosOrders;
  const Core=root.PedidosCore;
  const State=root.PedidosState;
  const ALIAS_KEY='pedidos-pro:invoice-aliases:v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>Number(value||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
  const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('No se pudo leer la imagen'));image.src=source});

  function readAliases(){try{return JSON.parse(localStorage.getItem(ALIAS_KEY)||'{}')||{}}catch{return{}}}
  function saveAliases(value){try{localStorage.setItem(ALIAS_KEY,JSON.stringify(value))}catch(error){console.warn('No se pudieron guardar equivalencias OCR',error)}}
  function aliasKey(value){
    return Core.normalizeText(value)
      .replace(/\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?/g,' ')
      .replace(/\b\d+(?:[.,]\d+)?\b/g,' ')
      .replace(/\b(?:TOTAL|NETO|IVA|SUBTOTAL|DESCUENTO|CANTIDAD|PRECIO|VALOR|UNIDAD|CAJA|CAJAS|BOTELLA|BOTELLAS)\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  async function normalizeImage(blob){
    if(!(blob instanceof Blob)||!String(blob.type||'').startsWith('image/'))return blob;
    const source=URL.createObjectURL(blob);
    try{
      const image=await loadImage(source);
      const max=1200;
      const scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');
      context.clearRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/png',.94));
    }catch{return blob}finally{URL.revokeObjectURL(source)}
  }

  if(DB?.setAsset&&!DB.setAsset.__stabilityV15){
    const originalSetAsset=DB.setAsset.bind(DB);
    const patched=async function(key,blob,meta={}){
      const value=/^(?:provider|profile):/.test(String(key))?await normalizeImage(blob):blob;
      return originalSetAsset(key,value,meta);
    };
    patched.__stabilityV15=true;
    DB.setAsset=patched;
  }

  if(Core?.matchInvoice&&!Core.matchInvoice.__stabilityV15){
    const originalMatchInvoice=Core.matchInvoice.bind(Core);
    const patched=function(text,products){
      const result=originalMatchInvoice(text,products||[]);
      const aliases=readAliases();
      const candidates=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      const byProduct=new Map((result.lines||[]).map(line=>[String(line.productId),line]));
      for(const [key,productId] of Object.entries(aliases)){
        const product=(products||[]).find(entry=>String(entry.productId||entry.id)===String(productId));
        if(!product)continue;
        const sourceLine=candidates.find(line=>{const normalized=aliasKey(line);return normalized&&key&&(normalized.includes(key)||key.includes(normalized))});
        if(!sourceLine)continue;
        const parsed=Core.parseLine(sourceLine,result.totals?.taxFactor||Core.TAX_DEFAULT);
        const orderPack=Core.packFromUnit(product.unit);
        const receivedOrderQty=orderPack>1?parsed.units/orderPack:parsed.units;
        byProduct.set(String(productId),{id:`alias-${productId}`,sourceLine,productId,description:product.description,confidence:.995,...parsed,receivedOrderQty:Number(receivedOrderQty.toFixed(3))});
      }
      result.lines=[...byProduct.values()];
      return result;
    };
    patched.__stabilityV15=true;
    Core.matchInvoice=patched;
  }

  if(Orders?.reviewInvoice&&!Orders.reviewInvoice.__stabilityV15){
    const originalReviewInvoice=Orders.reviewInvoice.bind(Orders);
    const patched=async function(invoiceId,lines,metadata={}){
      const reviewed=await originalReviewInvoice(invoiceId,lines,metadata);
      const aliases=readAliases();
      for(const line of lines||[]){
        const key=aliasKey(line.sourceLine||'');
        if(key.length>=4&&line.productId)aliases[key]=line.productId;
      }
      saveAliases(aliases);
      return reviewed;
    };
    patched.__stabilityV15=true;
    Orders.reviewInvoice=patched;
  }

  if(Orders?.saveInvoice&&!Orders.saveInvoice.__stabilityV15){
    const originalSaveInvoice=Orders.saveInvoice.bind(Orders);
    const patched=async function(invoice){
      if(invoice){
        invoice.invoiceNumber=String(invoice.invoiceNumber||'').trim();
        invoice.displayName=invoice.displayName||Core.invoiceDisplayName(invoice.providerName||'PROVEEDOR',invoice.invoiceNumber||`SIN-${invoice.id||Date.now()}`,invoice.originalName||'factura.jpg');
      }
      const saved=await originalSaveInvoice(invoice);
      if(saved?.status==='read'&&Array.isArray(saved.lines)&&saved.lines.length&&!saved.autoProcessed){
        saved.autoProcessed=true;
        await originalSaveInvoice(saved);
        await Orders.reviewInvoice(saved.id,saved.lines,{invoiceNumber:saved.invoiceNumber||'',displayName:saved.displayName,providerName:saved.providerName});
        return DB.get('invoices',saved.id);
      }
      return saved;
    };
    patched.__stabilityV15=true;
    Orders.saveInvoice=patched;
  }

  function patchPdf(){
    const engine=root.ProfessionalPDF;
    const api=root.PedidosPDF;
    if(engine?.Document?.prototype?.image&&!engine.Document.prototype.image.__stabilityV15){
      const originalImage=engine.Document.prototype.image;
      const patched=async function(...args){
        try{return await originalImage.apply(this,args)}catch(error){console.warn('Logo omitido del PDF por formato incompatible',error);return null}
      };
      patched.__stabilityV15=true;
      engine.Document.prototype.image=patched;
    }
    if(api?.blob&&!api.blob.__stabilityV15){
      const originalBlob=api.blob.bind(api);
      const patched=async function(options){
        try{
          const blob=await originalBlob(options);
          if(!(blob instanceof Blob)||blob.size<200)throw new Error('El documento generado está vacío');
          return blob;
        }catch(firstError){
          console.warn('PDF con logos falló; se generará una copia sin imágenes',firstError);
          const fallback={...options,provider:{...(options?.provider||{}),logo:null},logos:{}};
          const blob=await originalBlob(fallback);
          if(!(blob instanceof Blob)||blob.size<200)throw firstError;
          return blob;
        }
      };
      patched.__stabilityV15=true;
      api.blob=patched;
    }
    if(api?.download&&!api.download.__stabilityV15){
      const patched=function(pdfBlob,name){
        const url=URL.createObjectURL(pdfBlob);
        const anchor=document.createElement('a');
        anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.target='_blank';
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),30000);
      };
      patched.__stabilityV15=true;
      api.download=patched;
    }
  }

  async function hydrateInvoiceSummaries(){
    const list=document.querySelector('#invoiceList');
    if(!list||!DB?.get)return;
    for(const button of list.querySelectorAll('[data-invoice-review]')){
      const row=button.closest('.invoice-row');
      if(!row||row.dataset.summaryReady==='1'||row.dataset.summaryReady==='loading')continue;
      row.dataset.summaryReady='loading';
      try{
        const invoice=await DB.get('invoices',Number(button.dataset.invoiceReview));
        if(!invoice){row.dataset.summaryReady='1';continue}
        const title=row.querySelector(':scope > div:first-child > b');
        const expectedName=invoice.displayName||Core.invoiceDisplayName(invoice.providerName||'PROVEEDOR',invoice.invoiceNumber||`SIN-${invoice.id}`,invoice.originalName||'factura.jpg');
        if(title)title.textContent=expectedName;
        if(!invoice.displayName){invoice.displayName=expectedName;await DB.put('invoices',invoice)}
        row.querySelector('.invoice-item-summary')?.remove();
        const lines=(invoice.lines||[]).filter(line=>line.productId);
        const summary=document.createElement('div');summary.className='invoice-item-summary';
        if(!lines.length){
          summary.innerHTML='<div class="invoice-summary-warning"><b>Sin coincidencias automáticas</b><span>Abre “Revisar resumen” para vincular los productos manualmente.</span></div>';
        }else{
          const lineValue=lines.reduce((sum,line)=>sum+Number(line.grossLineTotal||0),0);
          const invoiceTotal=Number(invoice.taxTotals?.total)||lineValue;
          const tax=Number(invoice.taxTotals?.tax)||0;
          summary.innerHTML=`<div class="invoice-summary-total"><span>${lines.length} ítems · IVA ${money(tax)}</span><b>${money(invoiceTotal)}</b></div>${lines.map(line=>{
            const packs=Number(line.packageQty||0);
            const packSize=Number(line.packSize||1);
            const units=Number(line.units||0);
            const confidence=Number(line.confidence||0);
            return`<div class="invoice-summary-line"><span>${esc(line.description||'Producto')}</span><small>${packs||1} caja${packs===1?'':'s'} × ${packSize} · ${units.toFixed(units%1?1:0)} un<br><b>${money(line.grossUnitPrice||0)}/un</b> · ${money(line.grossLineTotal||0)}${confidence?` · ${Math.round(confidence*100)}%`:''}</small></div>`;
          }).join('')}`;
        }
        row.querySelector(':scope > div:first-child')?.appendChild(summary);
        row.dataset.summaryReady='1';
      }catch(error){console.warn(error);row.dataset.summaryReady='0'}
    }
  }

  function sortProviderRows(){
    document.querySelectorAll('.provider-order-list').forEach(list=>{
      const rows=[...list.querySelectorAll('.provider-order-row')];
      rows.sort((a,b)=>(a.querySelector('b')?.textContent||'').localeCompare(b.querySelector('b')?.textContent||'','es'));
      rows.forEach(row=>list.appendChild(row));
    });
  }

  function applyDefaultTheme(){
    try{
      const hasSaved=!!localStorage.getItem(State?.KEY||'pedidos-proveedores:v1');
      if(!hasSaved&&State?.value){State.value.settings={...(State.value.settings||{}),theme:'dark'};State.persist()}
    }catch(error){console.warn(error)}
  }

  const observer=new MutationObserver(()=>queueMicrotask(()=>{hydrateInvoiceSummaries();sortProviderRows();patchPdf()}));
  const start=()=>{
    applyDefaultTheme();patchPdf();hydrateInvoiceSummaries();sortProviderRows();
    const reception=document.querySelector('#receptionContent');if(reception)observer.observe(reception,{childList:true,subtree:true});
    const history=document.querySelector('#historyList');if(history)observer.observe(history,{childList:true,subtree:true});
    const marker=document.querySelector('#buildVersion');if(marker)marker.textContent='v8.1.0';
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
  document.addEventListener('click',event=>{
    const tab=event.target.closest?.('[data-data-tab]');
    if(tab){const button=document.querySelector('#newProduct');if(button)button.classList.toggle('hidden',tab.dataset.dataTab!=='products')}
  });
})(globalThis);
