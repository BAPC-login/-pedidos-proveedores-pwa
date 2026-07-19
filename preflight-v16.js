(function(root){
  'use strict';
  if(root.__PEDIDOS_PREFLIGHT_V16__)return;
  root.__PEDIDOS_PREFLIGHT_V16__=true;

  const NativeMutationObserver=root.MutationObserver;
  if(NativeMutationObserver&&!NativeMutationObserver.__pedidosV16){
    class SafeMutationObserver extends NativeMutationObserver{
      observe(target,options){
        if(target?.id==='historyList')return;
        return super.observe(target,options);
      }
    }
    SafeMutationObserver.__pedidosV16=true;
    root.MutationObserver=SafeMutationObserver;
  }

  const Orders=root.PedidosOrders;
  const DB=root.PedidosDB;
  if(Orders?.saveDraft&&!Orders.saveDraft.__pedidosV16){
    const originalSaveDraft=Orders.saveDraft.bind(Orders);
    const stableSaveDraft=async function(...args){
      const order=await originalSaveDraft(...args);
      let stored=await Orders.get(order.folio);
      if(!stored||!(stored.rows||[]).length){
        await DB.put('orders',order);
        stored=await Orders.get(order.folio);
      }
      if(!stored)throw new Error('El pedido no pudo guardarse en el historial');
      return stored;
    };
    stableSaveDraft.__pedidosV16=true;
    Orders.saveDraft=stableSaveDraft;
  }
})(globalThis);
