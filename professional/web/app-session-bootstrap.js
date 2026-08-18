(()=>{
  try{
    const ephemeral=localStorage.getItem('nuvasto:ephemeral-token')==='1',active=sessionStorage.getItem('nuvasto:ephemeral-session')==='1';
    if(ephemeral&&!active){localStorage.removeItem('pp:token');localStorage.removeItem('nuvasto:ephemeral-token')}else if(ephemeral)sessionStorage.setItem('nuvasto:ephemeral-session','1');
  }catch{}
  try{
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    document.documentElement.dataset.nuvastoLaunch=reduced?'reduced':'animated';
    const complete=()=>{const screen=document.getElementById('startupScreen');if(!screen)return;screen.classList.add('launch-complete');if(screen.classList.contains('hidden'))screen.setAttribute('aria-hidden','true')};
    const arm=()=>setTimeout(complete,reduced?450:2820);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arm,{once:true});else arm();
  }catch{}
})();
