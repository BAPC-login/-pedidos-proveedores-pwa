(function(root){
  'use strict';
  if(root.__PEDIDOS_PREFLIGHT_V17__)return;
  root.__PEDIDOS_PREFLIGHT_V17__=true;

  const NativeObserver=root.MutationObserver;
  if(NativeObserver&&!NativeObserver.__pedidosV17){
    function SafeMutationObserver(callback){
      const observer=new NativeObserver(callback);
      const nativeObserve=observer.observe.bind(observer);
      observer.observe=(target,options)=>{
        if(target?.id==='historyList')return;
        return nativeObserve(target,options);
      };
      return observer;
    }
    SafeMutationObserver.prototype=NativeObserver.prototype;
    SafeMutationObserver.__pedidosV17=true;
    root.MutationObserver=SafeMutationObserver;
  }

  const Orders=root.PedidosOrders;
  const DB=root.PedidosDB;
  if(Orders?.saveDraft&&!Orders.saveDraft.__pedidosV17){
    const original=Orders.saveDraft.bind(Orders);
    const stable=async function(...args){
      const order=await original(...args);
      let stored=await Orders.get(order.folio);
      if(!stored||!(stored.rows||[]).length){
        await DB.put('orders',order);
        stored=await Orders.get(order.folio);
      }
      if(!stored||!(stored.rows||[]).length)throw new Error('El pedido no pudo registrarse en el historial');
      return stored;
    };
    stable.__pedidosV17=true;
    Orders.saveDraft=stable;
  }
})(globalThis);
