import {$,state} from './app-core.js';
import {renderReceiving,renderHistory,setExperienceActive} from './app-experience-operations.js';
import {renderOperationsAdmin} from './app-experience-admin.js';
import {enhanceSettings} from './app-experience-settings.js';
import {initializeQuantityKeyboard} from './app-experience-keyboard.js';
let initialized=false;
function loadStyles(){if(!document.querySelector('link[data-experience-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href='./experience.css';link.dataset.experienceCss='1';document.head.append(link)}if(!document.querySelector('link[data-design-v13]')){const design=document.createElement('link');design.rel='stylesheet';design.href='./design-system-v13.css';design.dataset.designV13='1';document.head.append(design)}}
function injectNavigation(){
  const side=$('.side-nav');
  if(side&&!side.querySelector('[data-experience-view="receiving"]')){
    const orders=side.querySelector('[data-view="orders"]');if(orders){orders.classList.add('hidden');orders.insertAdjacentHTML('afterend','<button class="nav-item" data-experience-view="receiving"><span class="nav-icon">▤</span><span>Archivos y pedidos</span><b class="nav-count" id="receivingCount">0</b></button>')}
    const catalog=side.querySelector('[data-view="catalog"]');catalog?.insertAdjacentHTML('afterend','<button class="nav-item" data-experience-view="operations"><span class="nav-icon">⚙</span><span>Operaciones</span></button>');
    const invoices=side.querySelector('[data-view="invoices"]');if(invoices){invoices.querySelector('span:last-of-type').textContent='Documentos';invoices.insertAdjacentHTML('afterend','<button class="nav-item" data-experience-view="history"><span class="nav-icon">◷</span><span>Historial</span></button>')}
    const settings=$('[data-view="settings"]');if(settings)settings.querySelector('span:last-of-type').textContent='Configuración';
  }
  const bottom=$('.bottom-nav');if(bottom&&!bottom.dataset.experience){bottom.dataset.experience='1';bottom.innerHTML='<button class="bottom-item active" data-view="dashboard"><span>⌂</span><small>Inicio</small></button><button class="bottom-item" data-experience-view="receiving"><span>▤</span><small>Pedidos</small></button><button class="bottom-create" id="mobileCreate" type="button" aria-label="Nuevo archivo">＋</button><button class="bottom-item" data-experience-view="history"><span>◷</span><small>Historial</small></button><button class="bottom-item" data-view="settings"><span>☰</span><small>Más</small></button>'}
}
function open(view){if(view==='receiving')renderReceiving().catch(console.error);if(view==='history')renderHistory().catch(console.error);if(view==='operations')renderOperationsAdmin().catch(console.error)}
export function initializeExperience(){
  if(initialized)return;initialized=true;loadStyles();injectNavigation();initializeQuantityKeyboard();
  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-experience-view]');if(button){event.preventDefault();event.stopImmediatePropagation();open(button.dataset.experienceView)}},true);
  let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{injectNavigation();if(state.view==='settings')enhanceSettings();if(!['receiving','history','operations'].includes(state.view))setExperienceActive(state.view)},25)}).observe($('#appShell')||document.body,{subtree:true,childList:true});
}
