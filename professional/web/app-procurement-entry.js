import {$,esc,state} from './app-core.js';

let initialized=false;
let timer=0;

function enhance(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    if(state.view!=='settings'||!$('#mainContent')||$('#procurementAdminPanel'))return;
    const sessions=[...document.querySelectorAll('#mainContent h3')].find(node=>node.textContent.trim()==='Sesiones')?.closest('.panel');
    const centers=state.cache.costCenters||[];
    const locations=state.cache.locations||[];
    const panel=document.createElement('section');
    panel.className='panel';panel.id='procurementAdminPanel';
    panel.innerHTML=`<div class="panel-head"><div><h3>Lista maestra y recorrido de bodegas</h3><small>Configuración operativa separada de la emisión de pedidos.</small></div></div><p style="color:var(--muted);font-size:10px;line-height:1.5">Define por centro de costo sus unidades de compra, bodegas, categorías y el orden alfabético o personalizado que seguirá cada jefe durante el recorrido.</p><div class="location-list">${centers.map(center=>{const location=locations.find(item=>item.id===center.locationId);return`<div class="location-row"><div><strong>${esc(center.name)}</strong><small>${esc(location?.name||'Local')} · ${center.productCount||0} productos</small></div><button class="btn small" type="button" data-procurement-settings data-center-id="${esc(center.id)}">Configurar recorrido</button></div>`}).join('')}</div>`;
    if(sessions)sessions.insertAdjacentElement('beforebegin',panel);else $('#mainContent').append(panel);
  },25);
}

export function initializeProcurementEntry(){
  if(initialized)return;initialized=true;
  new MutationObserver(enhance).observe($('#appShell')||document.body,{subtree:true,childList:true});
  enhance();
}
