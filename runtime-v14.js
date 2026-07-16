(function(root){
  'use strict';
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

  if(root.PedidosDB?.setAsset){
    const originalSetAsset=root.PedidosDB.setAsset.bind(root.PedidosDB);
    root.PedidosDB.setAsset=async function(key,blob,meta={}){
      const value=/^(?:provider|profile):/.test(String(key))?await normalizeImage(blob):blob;
      return originalSetAsset(key,value,meta);
    };
  }

  if(root.PedidosOrders?.saveInvoice){
    const originalSaveInvoice=root.PedidosOrders.saveInvoice.bind(root.PedidosOrders);
    root.PedidosOrders.saveInvoice=async function(invoice){
      const saved=await originalSaveInvoice(invoice);
      if(saved?.status==='read'&&Array.isArray(saved.lines)&&saved.lines.length&&!saved.autoProcessed){
        saved.autoProcessed=true;
        await originalSaveInvoice(saved);
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
