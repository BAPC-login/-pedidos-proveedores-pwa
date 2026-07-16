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
      const row=button.closest('.invoice-row');if(!row||row.dataset.summaryReady==='1')continue;
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
