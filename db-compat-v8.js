(()=>{
  const DATABASE='pedidos-proveedores-profesional';
  const TARGET_VERSION=3;
  if(!window.indexedDB)return;
  const factory=window.indexedDB;
  const proto=Object.getPrototypeOf(factory);
  const originalOpen=proto.open;

  const ensureSchema=request=>{
    const database=request.result;
    if(!database.objectStoreNames.contains('orders'))database.createObjectStore('orders',{keyPath:'folio'});
    if(!database.objectStoreNames.contains('invoices')){
      const store=database.createObjectStore('invoices',{keyPath:'id',autoIncrement:true});
      store.createIndex('folio','folio');
    }else if(request.transaction){
      const store=request.transaction.objectStore('invoices');
      if(!store.indexNames.contains('folio'))store.createIndex('folio','folio');
    }
  };

  proto.open=function(name,version){
    const requested=name===DATABASE?Math.max(Number(version)||1,TARGET_VERSION):version;
    const request=version===undefined
      ? originalOpen.call(this,name)
      : originalOpen.call(this,name,requested);
    if(name===DATABASE)request.addEventListener('upgradeneeded',()=>ensureSchema(request));
    return request;
  };

  const migration=originalOpen.call(factory,DATABASE,TARGET_VERSION);
  migration.addEventListener('upgradeneeded',()=>ensureSchema(migration));
  migration.addEventListener('success',()=>migration.result.close());
})();
