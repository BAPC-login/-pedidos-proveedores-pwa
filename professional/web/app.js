import {$,$$,state,api,toast,setBusy,setTheme,syncMutations,updateSyncChip,showAuth,showApp,logoutLocal,isAdmin} from './app-core.js';
import {navigate} from './app-views.js';
import {openBootstrap,openOrder,openWorkspaceSwitcher,handleAction} from './app-actions.js';
import {initializeBrandingFeatures,refreshBranding} from './app-branding.js';
import {initializeOrderCore} from './app-order-core.js';
import {initializeStabilityPass} from './app-stability.js';
import {initializeCompanyLogoUploader} from './app-company-logo.js';

initializeBrandingFeatures();
initializeOrderCore();
initializeStabilityPass();
initializeCompanyLogoUploader();

$('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.submitter;
  setBusy(button,true,'Ingresando…');
  try{
    const response=await api('/api/auth/login',{method:'POST',json:{
      email:$('#loginEmail').value,
      password:$('#loginPassword').value
    }});
    state.token=response.token;
    localStorage.setItem('pp:token',state.token);
    state.me=await api('/api/me');
    try{await refreshBranding(true)}catch(error){console.warn('branding_load_failed',error)}
    showApp();
    await navigate('dashboard');
    toast('Sesión iniciada');
  }catch(error){
    toast(error.message,'error');
  }finally{
    setBusy(button,false);
  }
});

$('#openBootstrap').onclick=openBootstrap;
$('#logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',json:{}})}catch{}logoutLocal()};
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
$('#primaryAction').onclick=()=>handleAction(
  state.view==='invoices'?'analyze-invoice':
  state.view==='catalog'?'new-product':
  state.view==='suppliers'?'new-supplier':
  state.view==='team'?'new-user':'new-order'
);
$('#mobileCreate').onclick=()=>openOrder();
$('#themeButton').onclick=()=>{const current=document.documentElement.dataset.theme;setTheme(current==='system'?'light':current==='light'?'dark':'system')};
$('#syncChip').onclick=syncMutations;
$('#workspaceCard').addEventListener('click',openWorkspaceSwitcher);
$('#mobileWorkspaceButton').addEventListener('click',openWorkspaceSwitcher);
$('#mobileUserButton').addEventListener('click',openWorkspaceSwitcher);

$('#globalSearch').addEventListener('focus',()=>openCommand());
$('#globalSearch').addEventListener('keydown',event=>{if(event.key==='Enter')openCommand()});

function openCommand(){
  $('#commandMenu').classList.remove('hidden');
  $('#commandInput').value='';
  renderCommands();
  setTimeout(()=>$('#commandInput').focus(),0);
}
function renderCommands(){
  const query=$('#commandInput').value.toLowerCase();
  const commands=[
    ['dashboard','Ir a Resumen'],['orders','Ir a Pedidos'],['invoices','Ir a Facturas'],
    ['catalog','Ir a Catálogo'],['suppliers','Ir a Proveedores'],
    ...(isAdmin()?[['team','Administrar usuarios'],['audit','Ver auditoría']]:[]),
    ['settings','Abrir configuración']
  ].filter(([,label])=>label.toLowerCase().includes(query));
  $('#commandResults').innerHTML=commands.map(([view,label])=>`<button class="command-result" data-command="${view}"><span>${label}</span><span>↵</span></button>`).join('');
  $$('[data-command]').forEach(node=>node.onclick=()=>{$('#commandMenu').classList.add('hidden');navigate(node.dataset.command)});
}
$('#commandInput').addEventListener('input',renderCommands);
$('#commandMenu').addEventListener('click',event=>{if(event.target===$('#commandMenu'))$('#commandMenu').classList.add('hidden')});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openCommand()}
  if(event.key==='Escape')$('#commandMenu').classList.add('hidden');
});
window.addEventListener('online',()=>{state.online=true;updateSyncChip();syncMutations();toast('Conexión recuperada')});
window.addEventListener('offline',()=>{state.online=false;updateSyncChip();toast('Modo offline','error')});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').then(registration=>{
    registration.update().catch(()=>{});
    if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
  }).catch(console.warn);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!sessionStorage.getItem('pp:sw-reloaded')){
      sessionStorage.setItem('pp:sw-reloaded','1');
      location.reload();
    }
  });
}

async function initialize(){
  await updateSyncChip();
  $('#openBootstrap').classList.add('hidden');
  if(!state.token){
    $('#loginEmail').value='';
    showAuth();
    return;
  }
  try{
    state.me=await api('/api/me');
  }catch(error){
    if(error.status===401)logoutLocal();
    else{showAuth();toast('No se pudo validar la sesión. Revisa tu conexión.','error')}
    return;
  }
  try{await refreshBranding(true)}catch(error){console.warn('branding_load_failed',error)}
  showApp();
  try{await navigate('dashboard')}catch(error){console.warn('dashboard_load_failed',error);toast('La sesión sigue activa. Reintenta cargar el panel.','error')}
  syncMutations();
}
initialize();
