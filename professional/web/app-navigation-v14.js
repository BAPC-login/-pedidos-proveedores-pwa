import {navigate} from './app-views.js';
import {renderDashboardV14} from './app-dashboard-v14.js';
import {renderEnterpriseV15} from './app-enterprise-v15.js';
import {renderOperationsAdmin} from './app-experience-admin.js';
import {renderSuppliersWorkspaceV94} from './app-suppliers-v94.js';
import {initializeCompanyProfileV94} from './app-company-profile-v94.js';
import {renderReceiving,renderHistory} from './app-experience-operations.js';
import {initialRoute,initializeRouter,openRoute,registerRouteRenderer} from './app-router-v14.js';

const standard=['dashboard','orders','invoices','catalog','suppliers','team','audit','settings'];
const deferred=['operations','receiving','history','enterprise','professional','documents','finance','approvals','masterdata','intelligence','planning','permissions','system'];
let initialized=false;
async function renderCatalogOperations(route){
  const tab=route.subview||'home';
  if(tab==='suppliers')return renderSuppliersWorkspaceV94();
  await renderOperationsAdmin(tab,{fromRoute:true});
  const root=document.querySelector('#operationsAdminV14');
  root?.querySelectorAll('[data-operations-tab="suppliers"]').forEach(node=>node.remove());
  const eyebrow=root?.querySelector('.view-header .eyebrow'),copy=root?.querySelector('.view-header p');
  if(eyebrow)eyebrow.textContent='CATÁLOGO Y RECORRIDO';
  if(copy)copy.textContent='Productos, categorías, bodegas y recorrido se administran aquí. Los proveedores se gestionan exclusivamente desde Proveedores.';
}
function register(){
  registerRouteRenderer('dashboard',()=>renderDashboardV14());
  registerRouteRenderer('enterprise',()=>renderEnterpriseV15());
  registerRouteRenderer('suppliers',()=>renderSuppliersWorkspaceV94());
  standard.filter(view=>!['dashboard','suppliers'].includes(view)).forEach(view=>registerRouteRenderer(view,()=>navigate(view)));
  registerRouteRenderer('operations',route=>renderCatalogOperations(route));
  registerRouteRenderer('receiving',()=>renderReceiving());
  registerRouteRenderer('history',()=>renderHistory());
}
function intercept(event){const target=event.target.closest?.('[data-view],[data-view-link],[data-experience-view],[data-operations-tab]');if(!target)return;const view=target.dataset.view||target.dataset.viewLink||target.dataset.experienceView,tab=target.dataset.operationsTab||'';if(!view&&!tab)return;event.preventDefault();event.stopImmediatePropagation();if(tab==='suppliers')return openRoute('suppliers','').catch(console.error);if(tab)return openRoute('operations',tab).catch(console.error);openRoute(view,view==='operations'?'home':'').catch(console.error)}
export function initializeNavigationV14(){if(initialized)return;initialized=true;initializeCompanyProfileV94();register();initializeRouter();document.addEventListener('click',intercept,true)}
export function openInitialRouteV14(){const route=initialRoute(),valid=[...standard,...deferred].includes(route.view)?route:{view:'dashboard',subview:'',depth:0,scrollY:0};return openRoute(valid.view,valid.subview||'',{replace:true,restore:true,scrollY:valid.scrollY||0})}
export {openRoute};
