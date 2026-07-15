(()=>{
  const list=()=>[...document.querySelectorAll('#orderList [data-qty]')].filter(x=>x.offsetParent!==null);
  const move=step=>{
    const inputs=list();if(!inputs.length)return;
    let i=inputs.indexOf(document.activeElement);if(i<0)i=Math.max(0,inputs.indexOf(window.currentQtyInput));
    const next=inputs[Math.max(0,Math.min(inputs.length-1,i+step))];if(!next)return;
    window.currentQtyInput=next;
    next.focus({preventScroll:true});
    next.select?.();
    requestAnimationFrame(()=>next.scrollIntoView({block:'center',behavior:'smooth'}));
  };

  /* El gesto original abre el teclado; se bloquea el pointerdown antiguo que mostraba primero la barra. */
  document.addEventListener('pointerdown',event=>{
    const input=event.target.closest?.('#orderList [data-qty]');
    if(input){
      event.stopPropagation();
      input.focus({preventScroll:true});
      window.currentQtyInput=input;
      return;
    }
    const button=event.target.closest?.('#qtyNext,#qtyPrev');
    if(button){
      event.preventDefault();
      event.stopImmediatePropagation();
      move(button.id==='qtyNext'?1:-1);
    }
  },true);

  document.addEventListener('keydown',event=>{
    if(event.target.matches?.('#orderList [data-qty]')&&event.key==='Enter'){
      event.preventDefault();
      event.stopImmediatePropagation();
      move(1);
    }
  },true);

  const refresh=()=>{
    const nav=document.querySelector('.bottom');
    if(!nav)return;
    nav.style.setProperty('position','fixed','important');
    nav.style.setProperty('inset','auto 0 0 0','important');
    nav.style.setProperty('transform','none','important');
    const vv=window.visualViewport;
    const keyboard=!!(vv&&vv.height<window.innerHeight*.82);
    nav.style.visibility=keyboard?'hidden':'visible';
    nav.style.pointerEvents=keyboard?'none':'auto';
    if(!keyboard&&!document.activeElement?.matches('[data-qty]'))document.body.classList.remove('qty-editing');
  };
  window.visualViewport?.addEventListener('resize',refresh);
  window.visualViewport?.addEventListener('scroll',refresh);
  window.addEventListener('pageshow',refresh);
  window.addEventListener('orientationchange',()=>setTimeout(refresh,250));
  document.addEventListener('focusin',()=>setTimeout(refresh,20),true);
  document.addEventListener('focusout',()=>setTimeout(refresh,180),true);
  refresh();
})();
