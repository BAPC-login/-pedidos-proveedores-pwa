(function(root){
  'use strict';
  let workerPromise=null;
  const core=()=>root.PedidosCore;

  function progress(callback,label,percent){if(typeof callback==='function')callback({label,percent:Math.max(0,Math.min(100,Number(percent)||0)})}

  async function createWorker(onProgress){
    if(workerPromise)return workerPromise;
    if(!root.Tesseract)throw new Error('El lector OCR local no está disponible');
    workerPromise=(async()=>{
      const worker=await root.Tesseract.createWorker('spa',1,{
        workerPath:'./vendor/tesseract/worker.min.js',
        corePath:'./vendor/tesseract-core',
        langPath:'./vendor/tessdata',
        gzip:true,
        logger:message=>{
          if(message.status==='recognizing text')progress(onProgress,'Reconociendo texto',25+message.progress*70);
          else if(message.status)progress(onProgress,message.status,15);
        }
      });
      await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
      return worker;
    })().catch(error=>{workerPromise=null;throw error});
    return workerPromise;
  }

  const loadImage=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('No se pudo abrir la imagen'));image.src=source});
  async function imageFileToCanvas(file){
    const source=URL.createObjectURL(file);
    try{
      const image=await loadImage(source),max=2400,scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      enhanceCanvas(canvas);return canvas;
    }finally{URL.revokeObjectURL(source)}
  }

  function enhanceCanvas(canvas){
    const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.getImageData(0,0,canvas.width,canvas.height),data=image.data;
    for(let index=0;index<data.length;index+=4){
      const gray=data[index]*.299+data[index+1]*.587+data[index+2]*.114;
      const adjusted=Math.max(0,Math.min(255,(gray-128)*1.45+128));
      data[index]=data[index+1]=data[index+2]=adjusted;
    }
    context.putImageData(image,0,0);
  }

  async function recognizeCanvas(canvas,onProgress){
    const worker=await createWorker(onProgress),result=await worker.recognize(canvas);return result?.data?.text||'';
  }

  async function readPdf(file,onProgress){
    if(!root.pdfjsLib)throw new Error('El lector de PDF local no está disponible');
    root.pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.js';
    const pdf=await root.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,textParts=[],pages=Math.min(pdf.numPages,8);
    for(let pageNumber=1;pageNumber<=pages;pageNumber++){
      progress(onProgress,`Leyendo página ${pageNumber} de ${pages}`,5+(pageNumber-1)/pages*70);
      const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),plain=content.items.map(item=>item.str).join(' ');
      if(plain.replace(/\s/g,'').length>100){textParts.push(plain);continue}
      const viewport=page.getViewport({scale:1.8}),canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;enhanceCanvas(canvas);textParts.push(await recognizeCanvas(canvas,onProgress));
    }
    return textParts.join('\n');
  }

  async function readFile(file,onProgress){
    if(!file)throw new Error('Selecciona una factura');
    progress(onProgress,`Preparando ${file.name}`,2);
    let text='';
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))text=await readPdf(file,onProgress);
    else text=await recognizeCanvas(await imageFileToCanvas(file),onProgress);
    progress(onProgress,'Cotejando productos y precios',95);
    return text;
  }

  async function analyze(file,products,onProgress){
    const text=await readFile(file,onProgress),summary=core().matchInvoice(text,products||[]);
    progress(onProgress,'Lectura terminada',100);
    return{text,summary};
  }

  root.PedidosInvoice={readFile,analyze,enhanceCanvas};

  const runtimeStyle=document.createElement('style');
  runtimeStyle.textContent='.management-panel,.data-panel{display:none}.management-panel.active,.data-panel.active{display:block}#providerDatabase .provider-logo-preview.empty{padding:4px;display:flex;align-items:center;justify-content:center;font-size:10px}@media(max-width:760px){.invoice-review-row[style]{display:none}}';
  document.head.appendChild(runtimeStyle);

  const blobToPng=async blob=>{
    if(!(blob instanceof Blob)||!String(blob.type||'').startsWith('image/'))return blob;
    const source=URL.createObjectURL(blob);
    try{
      const image=await loadImage(source),max=900,scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/png',.92));
    }catch{return blob}finally{URL.revokeObjectURL(source)}
  };

  if(root.PedidosDB?.setAsset){
    const originalSetAsset=root.PedidosDB.setAsset.bind(root.PedidosDB);
    root.PedidosDB.setAsset=async function(key,blob,meta={}){
      const normalized=/^(?:provider|profile):/.test(String(key))?await blobToPng(blob):blob;
      return originalSetAsset(key,normalized,meta);
    };
  }

  if(root.PedidosOrders?.saveInvoice){
    const originalSaveInvoice=root.PedidosOrders.saveInvoice.bind(root.PedidosOrders);
    root.PedidosOrders.saveInvoice=async function(invoice){
      const saved=await originalSaveInvoice(invoice);
      if(saved?.status==='read'&&Array.isArray(saved.lines)&&saved.lines.length&&!saved.autoProcessed){
        saved.autoProcessed=true;await originalSaveInvoice(saved);
        await root.PedidosOrders.reviewInvoice(saved.id,saved.lines,{invoiceNumber:saved.invoiceNumber||'',displayName:saved.displayName||saved.originalName||'Factura'});
        return root.PedidosDB.get('invoices',saved.id);
      }
      return saved;
    };
  }

  document.addEventListener('click',event=>{
    const tab=event.target.closest?.('[data-data-tab]');
    if(tab){const button=document.querySelector('#newProduct');if(button)button.classList.toggle('hidden',tab.dataset.dataTab!=='products')}
  });
})(globalThis);
