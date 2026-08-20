import {navigate} from './app-views.js';
import {renderSuppliersWorkspaceV94 as renderSuppliersWorkspace} from './app-suppliers.js';
import {initializeCompanyProfileV94 as initializeCompanyProfile} from './app-company-profile.js';
import {initialRoute,initializeRouter,openRoute,registerRouteRenderer} from './app-router.js';

const standard=['dashboard','orders','invoices','catalog','suppliers','team','audit','settings'];
const deferred=['operations','receiving','history','enterprise','professional','documents','finance','approvals','masterdata','intelligence','planning','permissions','system'];
let initialized=false;
function renderSuppliersRoute(){return renderSuppliersWorkspace()}
function register(){
  registerRouteRenderer('suppliers',renderSuppliersRoute);
  for(const view of ['invoices','team','audit','settings'])registerRouteRenderer(view,()=>navigate(view));
}
function intercept(event){
  const target=event.target.closest?.('[data-view],[data-view-link],[data-experience-view],[data-operations-tab]');
  if(!target)return;
  const view=target.dataset.view||target.dataset.viewLink||target.dataset.experienceView,tab=target.dataset.operationsTab||'';
  if(!view&&!tab)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(tab==='suppliers')return openRoute('suppliers','').catch(console.error);
  if(tab)return openRoute('operations',tab).catch(console.error);
  openRoute(view,view==='operations'?'home':'').catch(console.error);
}
export function initializeNavigation(){if(initialized)return;initialized=true;initializeCompanyProfile();register();initializeRouter();document.addEventListener('click',intercept,true)}
export function openInitialRoute(){const route=initialRoute(),valid=[...standard,...deferred].includes(route.view)?route:{view:'dashboard',subview:'',depth:0,scrollY:0};return openRoute(valid.view,valid.subview||'',{replace:true,restore:true,scrollY:valid.scrollY||0})}
export {openRoute};
