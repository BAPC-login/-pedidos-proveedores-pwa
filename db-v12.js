(function(root){
  'use strict';
  const DB_NAME='pedidos-proveedores-profesional';
  const DB_VERSION=8;
  let databasePromise=null;

  function open(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result,tx=request.transaction;
        const ensureStore=(name,options)=>db.objectStoreNames.contains(name)?tx.objectStore(name):db.createObjectStore(name,options);
        const ensureIndex=(store,name,keyPath,options={})=>{if(!store.indexNames.contains(name))store.createIndex(name,keyPath,options)};

        const orders=ensureStore('orders',{keyPath:'folio'});
        ensureIndex(orders,'createdAt','createdAt');ensureIndex(orders,'updatedAt','updatedAt');ensureIndex(orders,'status','status');

        const invoices=ensureStore('invoices',{keyPath:'id',autoIncrement:true});
        ensureIndex(invoices,'folio','folio');ensureIndex(invoices,'provider','provider');ensureIndex(invoices,'providerId','providerId');ensureIndex(invoices,'folioProvider',['folio','providerId']);ensureIndex(invoices,'createdAt','createdAt');ensureIndex(invoices,'invoiceNumber','invoiceNumber');

        const prices=ensureStore('prices',{keyPath:'id'});
        ensureIndex(prices,'productId','productId');ensureIndex(prices,'providerId','providerId');ensureIndex(prices,'provider','provider');ensureIndex(prices,'createdAt','createdAt');ensureIndex(prices,'folio','folio');ensureIndex(prices,'invoiceId','invoiceId');

        ensureStore('assets',{keyPath:'key'});
        ensureStore('meta',{keyPath:'key'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();databasePromise=null};
        resolve(db);
      };
      request.onerror=()=>reject(request.error||new Error('No se pudo abrir la base local'));
      request.onblocked=()=>reject(new Error('La base local está bloqueada. Cierra otras ventanas de la app y vuelve a abrir.'));
    });
    return databasePromise;
  }

  async function get(store,key){
    const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error)});
  }
  async function all(store){
    const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)});
  }
  async function put(store,value){
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),request=tx.objectStore(store).put(value);request.onsuccess=()=>{if(value&&value.id==null&&request.result!=null)value.id=request.result};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||request.error)});
  }
  async function remove(store,key){
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  }
  async function clear(store){
    const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  }
  async function byIndex(store,index,key){
    const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).index(index).getAll(key);request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)});
  }

  async function deleteOrderCascade(folio){
    const db=await open();
    const invoiceRows=(await all('invoices')).filter(row=>row.folio===folio),invoiceIds=new Set(invoiceRows.map(row=>String(row.id)));
    const priceRows=(await all('prices')).filter(row=>row.folio===folio||invoiceIds.has(String(row.invoiceId)));
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['orders','invoices','prices'],'readwrite');
      tx.objectStore('orders').delete(folio);
      invoiceRows.forEach(row=>tx.objectStore('invoices').delete(row.id));
      priceRows.forEach(row=>tx.objectStore('prices').delete(row.id));
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }

  const dataUrlToBlob=dataUrl=>{
    const [header,data]=String(dataUrl||'').split(','),mime=(header.match(/data:([^;]+)/)||[])[1]||'image/png',binary=atob(data||''),bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return new Blob([bytes],{type:mime});
  };
  const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});

  async function setAsset(key,blob,meta={}){
    if(!blob)return remove('assets',key);
    const value=blob instanceof Blob?blob:dataUrlToBlob(blob);
    return put('assets',{key,blob:value,mime:value.type||meta.mime||'application/octet-stream',name:meta.name||'',size:meta.size||value.size,updatedAt:new Date().toISOString(),...meta});
  }
  async function getAsset(key){return get('assets',key)}
  async function assetDataUrl(key){const asset=await getAsset(key);return asset?.blob?blobToDataUrl(asset.blob):null}

  function openLegacyAssetDb(){
    return new Promise(resolve=>{
      const request=indexedDB.open('pedidos-proveedores-assets');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
    });
  }
  async function migrateLegacyAssets(state,normalize){
    const marker=await get('meta','assets-migrated-v12');if(marker)return;
    const providers=state.catalog?.providers||[];
    const legacyMap=state.providerLogos||{};
    for(const provider of providers){
      const existing=await getAsset(`provider:${provider.id}`);if(existing)continue;
      const direct=provider.logo||legacyMap[provider.name]||Object.entries(legacyMap).find(([name])=>normalize(name)===normalize(provider.name))?.[1];
      if(direct)await setAsset(`provider:${provider.id}`,direct,{name:provider.name,logoSize:Number(provider.logoSize)||24});
    }
    if(state.profile?.logo&&!await getAsset('profile:logo1'))await setAsset('profile:logo1',state.profile.logo,{name:'logo-principal'});
    if(state.profile?.logo2&&!await getAsset('profile:logo2'))await setAsset('profile:logo2',state.profile.logo2,{name:'logo-secundario'});

    const legacyDb=await openLegacyAssetDb();
    if(legacyDb&&legacyDb.objectStoreNames.contains('providerLogos')){
      const rows=await new Promise(resolve=>{const request=legacyDb.transaction('providerLogos').objectStore('providerLogos').getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([])});
      for(const row of rows){
        const provider=providers.find(item=>normalize(item.name)===normalize(row.name||row.key));
        if(provider&&!await getAsset(`provider:${provider.id}`)&&row.data)await setAsset(`provider:${provider.id}`,row.data,{name:provider.name,logoSize:Number(row.size)||Number(provider.logoSize)||24});
      }
      legacyDb.close();
    }
    await put('meta',{key:'assets-migrated-v12',at:new Date().toISOString()});
  }

  async function migrateLegacyOrders(currentState){
    const marker=await get('meta','orders-normalized-v12');if(marker)return;
    const orders=await all('orders');
    for(const order of orders){
      const rows=Array.isArray(order.rows)?order.rows:[];
      order.rows=rows.map((row,index)=>({
        id:row.id||`row-${index+1}`,
        productId:row.productId||row.id||'',
        description:row.description||'',
        providerId:row.providerId||currentState.catalog?.providers?.find(item=>item.name===row.provider)?.id||'',
        providerName:row.providerName||row.provider||'',
        category:row.category||'OTROS',unit:row.unit||'UNIDAD',
        orderedQty:Number(row.orderedQty??row.qty)||0,receivedQty:Number(row.receivedQty)||0,receivedUnits:Number(row.receivedUnits)||0,
        reception:row.reception||'pending',unitPrice:Number(row.unitPrice)||0
      })).filter(row=>row.description&&row.orderedQty>0);
      order.providers=[...new Set(order.rows.map(row=>row.providerName).filter(Boolean))];
      order.providerIds=[...new Set(order.rows.map(row=>row.providerId).filter(Boolean))];
      order.totalItems=order.rows.length;order.updatedAt=order.updatedAt||order.createdAt||new Date().toISOString();
      await put('orders',order);
    }
    await put('meta',{key:'orders-normalized-v12',at:new Date().toISOString()});
  }

  root.PedidosDB={open,get,all,put,remove,clear,byIndex,deleteOrderCascade,setAsset,getAsset,assetDataUrl,blobToDataUrl,dataUrlToBlob,migrateLegacyAssets,migrateLegacyOrders};
})(globalThis);
