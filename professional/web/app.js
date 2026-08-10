import {$,$$,state,api,toast,setBusy,setTheme,syncMutations,updateSyncChip,showAuth,showApp,logoutLocal,isAdmin,seedResponseCache,clearResponseCache} from './app-core.js';
import './app-invoice-entry-v29.js';
import {initializeCheckoutInvoiceV29} from './app-checkout-invoice-v29.js';
import {initializeScreenStateHotfix} from './app-screen-state-hotfix.js';
import {openBootstrap,openOrder,openWorkspaceSwitcher,handleAction} from './app-actions.js';
import {initializeBrandingFeatures,refreshBranding} from './app-branding.js';
import {initializeOrderCoreV15} from './app-order-core-v15.js';
import {initializeCompanyLogoUploader} from './app-company-logo.js';
import {initializeProcurementSettings} from './app-procurement-settings.js';
import {initializeProcurementEntry} from './app-procurement-entry.js';
import {initializeExperience} from './app-experience.js';
import {initializeFileActions} from './app-file-actions.js';
import {initializeSettingsPanelsV13} from './app-settings-panels-v13.js';
import {initializeTelemetryV13} from './app-telemetry-v13.js';
import {initializeNavigationV14,openInitialRouteV14,openRoute} from './app-navigation-v14.js';
import {initializeCommercialV16} from './app-commercial-v16.js';
import {initializeImportPreviewV17} from './app-import-preview-v17.js';
import {initializeMasterV18} from './app-master-v18.js';
import {initializeHistoryV18} from './app-history-v18.js';
import {initializePdfV18} from './app-pdf-v18.js';
import {initializeWorkflowV19} from './app-workflow-v19.js';
import {initializeSsoV20} from './app-sso-v20.js';
import {initializeProfessionalV20} from './app-professional-v20.js';
import {initializeHistorySemanticV20} from './app-history-semantic-v20.js';
import {initializeNuvastoV21} from './app-nuvasto-v21.js';
import {initializeNuvastoUXV22} from './app-ux-v22.js';
import {initializeNuvastoV23} from './app-nuvasto-v23.js';
import {initializeProfessionalHotfixV24} from './app-professional-hotfix-v24.js';
import {initializeMasterOrderingV42} from './app-v42-master-ordering.js';
import {initializeR51UX} from './app-r51-ux.js';

const CLIENT_RELEASE='2026.08.10.60';
document.documentElement.dataset.clientRelease=CLIENT_RELEASE;
document.documentElement.dataset.runtime='consolidated-r60';
const nativeFetch=window.fetch.bind(window);

if(!document.querySelector('link[data-native-performance]')){const link=document.createElement('link');link.rel='stylesheet';link.href='./native-performance.css';link.dataset.nativePerformance='60';document.head.append(link)}

// Compatibilidad funcional: las implementaciones históricas siguen disponibles, pero el transporte/caché ya es único en app-core.
initializeScreenStateHotfix();initializeNuvastoV21();initializeNuvastoV23();initializeBrandingFeatures();initializeProcurementSettings();initializeProcurementEntry();initializeOrderCoreV15();initializeCompanyLogoUploader();initializeFileActions();initializeSettingsPanelsV13();initializeExperience();initializeTelemetryV13();initializeNavigationV14();initializeCommercialV16();initializeImportPreviewV17();initializeMasterV18();initializeMasterOrderingV42();initializeR51UX();initializeNuvastoUXV22();initializeHistoryV18();initializePdfV18();initializeWorkflowV19();initializeSsoV20();initializeProfessionalV20();initializeHistorySemanticV20();initializeProfessionalHotfixV24();initializeCheckoutInvoiceV29();

let startupFinished=false,startupWatchdog=null;
function finishStartup(){startupFinished=true;if(startupWatchdog){clearTimeout(startupWatchdog);startupWatchdog=null}}
function recoverStartup(message='No pudimos restaurar la sesión automáticamente. Ingresa nuevamente para continuar.'){if(startupFinished)return;finishStartup();showAuth();const email=localStorage.getItem('nuvasto:last-email')||'';if($('#loginEmail')&&!$('#loginEmail').value)$('#loginEmail').value=email;toast(message,'error')}
startupWatchdog=setTimeout(()=>recoverStartup('La restauración tardó demasiado. Mostramos el acceso para que puedas continuar.'),9000);

const onIdle=callback=>typeof requestIdleCallback==='function'?requestIdleCallback(callback,{timeout:900}):setTimeout(callback,120);
function applyOperationsBootstrap(payload){const cache=payload?.cache||{};for(const[path,value]of Object.entries(cache)){if(path.startsWith('/api/')&&value)seedResponseCache(path,value)}state.cache.categories=cache['/api/categories']?.categories||state.cache.categories||[];state.cache.costCenters=cache['/api/cost-centers']?.costCenters||state.cache.costCenters||[];state.cache.suppliers=cache['/api/suppliers']?.suppliers||state.cache.suppliers||[];state.cache.products=cache['/api/products']?.products||state.cache.products||[];state.cache.locations=cache['/api/locations']?.locations||state.cache.locations||[]}
let preloadScheduled=false;
function preloadOperations(){if(!state.token||preloadScheduled)return;preloadScheduled=true;onIdle(()=>{const task=api('/api/operations-bootstrap-v45',{persist:true,ttl:5*60*1000,timeout:8000});Promise.resolve(task).then(payload=>applyOperationsBootstrap(payload)).catch(error=>{if(!error?.silent)console.warn('operations_bootstrap_failed',error)})})}
let releaseCheckPromise=null;
async function verifyClientRelease(){if(releaseCheckPromise)return releaseCheckPromise;releaseCheckPromise=(async()=>{try{const response=await nativeFetch(`/platform/release?client=${encodeURIComponent(CLIENT_RELEASE)}&ts=${Date.now()}`,{cache:'no-store'});if(!response.ok)return;const serverRelease=response.headers.get('X-Nuvasto-Release')||response.headers.get('X-Pedidos-Pro-Release')||'';if(!serverRelease||serverRelease===CLIENT_RELEASE){sessionStorage.removeItem('nuvasto:release-reload');return}const already=sessionStorage.getItem('nuvasto:release-reload');if(already===serverRelease)return;sessionStorage.setItem('nuvasto:release-reload',serverRelease);const registration=await navigator.serviceWorker?.getRegistration?.();await registration?.update?.().catch(()=>{});setTimeout(()=>location.reload(),180)}catch(error){console.warn('release_check_failed',error)}finally{setTimeout(()=>{releaseCheckPromise=null},30000)}})();return releaseCheckPromise}

$('#loginForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;setBusy(button,true,'Ingresando…');try{const email=$('#loginEmail').value.trim(),response=await api('/api/auth/login',{method:'POST',timeout:15000,json:{email,password:$('#loginPassword').value}});state.token=response.token;localStorage.setItem('pp:token',state.token);localStorage.setItem('nuvasto:last-email',email);state.me=await api('/api/me',{fresh:true,persist:true,timeout:8000});try{await refreshBranding(true)}catch(error){console.warn('branding_load_failed',error)}showApp();finishStartup();verifyClientRelease();await openRoute('dashboard','',{replace:true});preloadOperations();toast('Sesión iniciada')}catch(error){if(!error?.silent)toast(error.message,'error')}finally{setBusy(button,false)}});
$('#openBootstrap').onclick=openBootstrap;$('#logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',json:{}})}catch{}preloadScheduled=false;clearResponseCache();logoutLocal()};$('#primaryAction').onclick=()=>handleAction(state.view==='invoices'?'analyze-invoice':state.view==='catalog'?'new-product':state.view==='suppliers'?'new-supplier':state.view==='team'?'new-user':'new-order');$('#mobileCreate').onclick=()=>openOrder();$('#themeButton').onclick=()=>{const current=document.documentElement.dataset.theme;setTheme(current==='system'?'light':current==='light'?'dark':'system')};$('#syncChip').onclick=syncMutations;$('#workspaceCard').addEventListener('click',openWorkspaceSwitcher);$('#mobileWorkspaceButton').addEventListener('click',openWorkspaceSwitcher);$('#mobileUserButton').addEventListener('click',openWorkspaceSwitcher);$('#globalSearch').addEventListener('focus',()=>openCommand());$('#globalSearch').addEventListener('keydown',event=>{if(event.key==='Enter')openCommand()});
function openCommand(){$('#commandMenu').classList.remove('hidden');$('#commandInput').value='';renderCommands();setTimeout(()=>$('#commandInput').focus(),0)}
function renderCommands(){const query=$('#commandInput').value.toLowerCase(),commands=[['dashboard','Ir a Resumen'],['receiving','Abrir pedidos por emitir'],['invoices','Ir a Documentos'],['history','Abrir historial'],['operations','Abrir Operaciones'],...(isAdmin()?[['professional','Control profesional Nuvasto'],['enterprise','Centro profesional y SaaS'],['team','Administrar usuarios'],['audit','Ver auditoría']]:[]),['settings','Abrir configuración']].filter(([,label])=>label.toLowerCase().includes(query));$('#commandResults').innerHTML=commands.map(([view,label])=>`<button class="command-result" data-command="${view}"><span>${label}</span><span>↵</span></button>`).join('');$$('[data-command]').forEach(node=>node.onclick=()=>{$('#commandMenu').classList.add('hidden');openRoute(node.dataset.command,node.dataset.command==='operations'?'home':'').catch(error=>{if(!error?.silent)toast(error.message,'error')})})}
$('#commandInput').addEventListener('input',renderCommands);$('#commandMenu').addEventListener('click',event=>{if(event.target===$('#commandMenu'))$('#commandMenu').classList.add('hidden')});document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openCommand()}if(event.key==='Escape')$('#commandMenu').classList.add('hidden')});window.addEventListener('online',()=>{state.online=true;updateSyncChip().catch(()=>{});syncMutations().catch(error=>console.warn('sync_recovery_failed',error));toast('Conexión recuperada')});window.addEventListener('offline',()=>{state.online=false;updateSyncChip().catch(()=>{});toast('Modo offline','error')});
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(console.warn);navigator.serviceWorker.addEventListener('controllerchange',()=>console.info('service_worker_updated'));navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='NUVASTO_SW_UPDATED'){console.info('nuvasto_assets_updated',event.data.version);verifyClientRelease()}})}
async function initialize(){updateSyncChip().catch(error=>console.warn('sync_chip_startup_failed',error));$('#openBootstrap').classList.add('hidden');if(!state.token){const email=localStorage.getItem('nuvasto:last-email')||'';if($('#loginEmail'))$('#loginEmail').value=email;showAuth();finishStartup();return}try{state.me=await api('/api/me',{persist:true,timeout:7000})}catch(error){console.warn('session_restore_failed',error);if(error.status===401)logoutLocal();else recoverStartup(error.code==='request_timeout'?'No fue posible validar la sesión a tiempo. Ingresa nuevamente para continuar.':'No se pudo restaurar la sesión. Ingresa nuevamente para continuar.');finishStartup();return}try{await refreshBranding(false)}catch(error){console.warn('branding_load_failed',error)}showApp();finishStartup();verifyClientRelease();try{await openInitialRouteV14()}catch(error){if(!error?.silent){console.warn('initial_route_failed',error);await openRoute('dashboard','',{replace:true}).catch(()=>{});toast('La sesión sigue activa. Reintenta cargar el panel.','error')}}preloadOperations();syncMutations().catch(error=>console.warn('sync_startup_failed',error))}
initialize().catch(error=>{console.error('startup_failed',error);recoverStartup('Ocurrió un error al iniciar Nuvasto. Ingresa nuevamente para continuar.')});
