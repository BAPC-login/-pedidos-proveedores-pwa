(()=>{
  const inputs=()=>[...document.querySelectorAll('#orderList [data-qty]')].filter(input=>input.offsetParent!==null);
  let current=null;

  const move=step=>{
    const list=inputs();
    if(!list.length)return;
    let index=list.indexOf(document.activeElement);
    if(index<0)index=Math.max(0,list.indexOf(current));
    const next=list[Math.max(0,Math.min(list.length-1,index+step))];
    if(!next||next===current&&index+step!==index)return;
    current=next;
    next.focus({preventScroll:true});
    next.select?.();
    requestAnimationFrame(()=>next.scrollIntoView({block:'center',behavior:'smooth'}));
  };

  const replaceButton=id=>{
    const old=document.getElementById(id);
    if(!old)return null;
    const fresh=old.cloneNode(true);
    old.replaceWith(fresh);
    return fresh;
  };

  const previous=replaceButton('qtyPrev');
  const next=replaceButton('qtyNext');
  previous?.addEventListener('pointerdown',event=>{event.preventDefault();move(-1)});
  next?.addEventListener('pointerdown',event=>{event.preventDefault();move(1)});

  document.addEventListener('pointerdown',event=>{
    const input=event.target.closest?.('#orderList [data-qty]');
    if(input)current=input;
  },true);

  document.addEventListener('focusin',event=>{
    if(event.target.matches?.('#orderList [data-qty]'))current=event.target;
  },true);

  document.addEventListener('keydown',event=>{
    if(!event.target.matches?.('#orderList [data-qty]')||event.key!=='Enter')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    current=event.target;
    move(1);
  },true);
})();
