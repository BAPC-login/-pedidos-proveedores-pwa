(()=>{
  setTimeout(async()=>{
    try{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pedidos-proveedores-profesional',5);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      const getAll=store=>new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)});
      const put=(store,value)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      const orders=await getAll('orders'),orderMap=new Map(orders.map(order=>[order.folio,order]));
      const invoices=await getAll('invoices');
      for(const invoice of invoices){
        const order=orderMap.get(invoice.folio);if(!order)continue;
        if(!invoice.provider){
          const matchProviders=[...new Set((invoice.matches||[]).map(match=>order.rows?.find(row=>String(row.id)===String(match.rowId))?.provider).filter(Boolean))];
          invoice.provider=matchProviders[0]||((order.providers||[]).length===1?order.providers[0]:'');
          if(invoice.provider)await put('invoices',invoice);
        }
        for(const match of invoice.matches||[]){
          const row=order.rows?.find(item=>String(item.id)===String(match.rowId));
          if(!row||!Number(match.unitPrice))continue;
          await put('prices',{id:`invoice:${invoice.id}:${row.id}`,invoiceId:invoice.id,folio:invoice.folio,productId:row.id,description:row.description,provider:row.provider,quantity:Number(match.qty)||0,unitPrice:Number(match.unitPrice)||0,createdAt:invoice.processedAt||invoice.createdAt||new Date().toISOString(),source:'invoice'});
        }
      }
      db.close();
    }catch(error){console.warn('Reparación histórica omitida',error)}
  },500);
})();
