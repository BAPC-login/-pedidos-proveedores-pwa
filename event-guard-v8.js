(()=>{
  const original=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,listener,options){
    const source=typeof listener==='function'?Function.prototype.toString.call(listener):'';
    const oldQuantityKeydown=type==='keydown'&&this===document&&source.includes("#orderList [data-qty]")&&source.includes('nextQty(1)');
    const oldQuantityButtons=type==='pointerdown'&&(this?.id==='qtyNext'||this?.id==='qtyPrev')&&source.includes('nextQty(');
    if(oldQuantityKeydown||oldQuantityButtons)return;
    return original.call(this,type,listener,options);
  };
})();
