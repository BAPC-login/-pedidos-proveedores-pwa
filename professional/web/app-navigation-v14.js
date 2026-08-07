import {navigate} from './app-views.js';
import {renderDashboardV14} from './app-dashboard-v14.js';
import {renderEnterpriseV15} from './app-enterprise-v15.js';
import {renderOperationsAdmin} from './app-experience-admin.js';
import {renderReceiving,renderHistory} from './app-experience-operations.js';
import {initialRoute,initializeRouter,openRoute,registerRouteRenderer} from './app-router-v14.js';

const standard=['dashboard','orders','invoices','catalog','suppliers','team','audit','settings'];
const deferred=['operations','receiving','history','enterprise','professional','documents','finance','approvals'];
let initialized=false;
function register(){registerRouteRenderer('dashboard',()=>renderDashboardV14());registerRouteRenderer('enterprise',()=>renderEnterpriseV15());standard.filter(view=>view!=='dashboard').forEach(view=>registerRouteRenderer(view,()=>navigate(view)));registerRouteRenderer('operations',route=>renderOperationsAdmin(route.subview||'home',{fromRoute:true}));registerRouteRenderer('receiving',()=>renderReceiving());registerRouteRenderer('history',()=>renderHistory())}
function intercept(event){const target=event.target.closest?.('[data-view],[data-view-link],[data-experience-view],[data-operations-tab]');if(!target)return;const view=target.dataset.view||target.dataset.viewLink||target.dataset.experienceView,tab=target.dataset.operationsTab||'';if(!view&&!tab)return;event.preventDefault();event.stopImmediatePropagation();if(tab)return openRoute('operations',tab).catch(console.error);openRoute(view,view==='operations'?'home':'').catch(console.error)}
export function initializeNavigationV14(){if(initialized)return;initialized=true;register();initializeRouter();document.addEventListener('click',intercept,true)}
export function openInitialRouteV14(){const route=initialRoute(),valid=[...standard,...deferred].includes(route.view)?route:{view:'dashboard',subview:'',depth:0,scrollY:0};return openRoute(valid.view,valid.subview||'',{replace:true,restore:true,scrollY:valid.scrollY||0})}
export {openRoute};
