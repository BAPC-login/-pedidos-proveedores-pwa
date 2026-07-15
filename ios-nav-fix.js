(()=>{
  const bottom=document.querySelector('.bottom');
  const toolbar=document.querySelector('#qtyToolbar');
  if(!bottom)return;

  const pinBottomNav=()=>{
    bottom.style.setProperty('position','fixed','important');
    bottom.style.setProperty('left','0','important');
    bottom.style.setProperty('right','0','important');
    bottom.style.setProperty('top','auto','important');
    bottom.style.setProperty('bottom','0','important');
    bottom.style.setProperty('width','100%','important');
    bottom.style.setProperty('transform','translate3d(0,0,0)','important');
    void bottom.offsetHeight;
  };

  const keyboardIsOpen=()=>{
    const vv=window.visualViewport;
    return !!(vv&&vv.height<window.innerHeight*.82);
  };

  const recoverAfterKeyboard=()=>{
    if(!keyboardIsOpen()&&!document.activeElement?.matches('[data-qty]')){
      document.body.classList.remove('qty-editing');
      if(toolbar&&!toolbar.contains(document.activeElement))toolbar.classList.add('hidden');
    }
    pinBottomNav();
  };

  const deferredRecover=()=>{
    requestAnimationFrame(pinBottomNav);
    setTimeout(recoverAfterKeyboard,80);
    setTimeout(recoverAfterKeyboard,260);
  };

  window.visualViewport?.addEventListener('resize',deferredRecover);
  window.visualViewport?.addEventListener('scroll',pinBottomNav);
  window.addEventListener('resize',deferredRecover);
  window.addEventListener('orientationchange',()=>setTimeout(deferredRecover,300));
  window.addEventListener('pageshow',deferredRecover);
  window.addEventListener('scroll',pinBottomNav,{passive:true});
  document.addEventListener('focusin',deferredRecover,true);
  document.addEventListener('focusout',deferredRecover,true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)deferredRecover()});
  new MutationObserver(pinBottomNav).observe(document.body,{attributes:true,attributeFilter:['class']});

  const version=document.querySelector('#buildVersion');
  if(version)version.textContent='v4.0.1';
  deferredRecover();
})();
