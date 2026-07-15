(()=>{
  const nav=document.querySelector('.bottom'),toolbar=document.querySelector('#qtyToolbar');
  if(!nav)return;
  const keyboardOpen=()=>{const viewport=window.visualViewport;return !!(viewport&&viewport.height<window.innerHeight*.82)};
  const refresh=()=>{
    nav.style.setProperty('position','fixed','important');
    nav.style.setProperty('left','0','important');
    nav.style.setProperty('right','0','important');
    nav.style.setProperty('top','auto','important');
    nav.style.setProperty('bottom','0','important');
    nav.style.setProperty('width','100%','important');
    nav.style.setProperty('transform','none','important');
    const keyboard=keyboardOpen();
    nav.style.visibility=keyboard?'hidden':'visible';
    nav.style.pointerEvents=keyboard?'none':'auto';
    if(!keyboard&&!document.activeElement?.matches('[data-qty]')){
      document.body.classList.remove('qty-editing');
      if(toolbar&&!toolbar.contains(document.activeElement))toolbar.classList.add('hidden');
    }
  };
  window.visualViewport?.addEventListener('resize',refresh);
  window.visualViewport?.addEventListener('scroll',refresh);
  window.addEventListener('resize',refresh);
  window.addEventListener('orientationchange',()=>setTimeout(refresh,250));
  window.addEventListener('pageshow',refresh);
  document.addEventListener('focusin',()=>setTimeout(refresh,20),true);
  document.addEventListener('focusout',()=>setTimeout(refresh,180),true);
  refresh();
})();
