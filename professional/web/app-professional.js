import {api,state} from './app-core.js';
import {injectV32Styles as injectProfessionalStyles} from './app-ui-foundation.js';
import {initializeOrdersHistoryV32 as initializeOrdersHistory} from './app-orders.js';
import {initializeCatalog} from './app-catalog-current.js';
import {initializeEnhancementsV32 as initializeEnhancements} from './app-ui-enhancements.js';
import {initializeDocumentsV33 as initializeDocuments} from './app-documents.js';
import {initializePolishV34 as initializePolish} from './app-ui-polish.js';
import './app-multi-invoice.js';
import {initializeInvoiceReviewV36 as initializeInvoiceReview} from './app-invoice-review.js';
import {initializeEnterpriseV41 as initializeEnterprise} from './app-enterprise.js';
import {initializeProcurementOSV44 as initializeProcurement} from './app-procurement.js';
import {loadProcurementSettings} from './app-procurement-settings.js';
import {initializeMasterEditingV44 as initializeMasterEditing} from './app-master-edit.js';
import {initializeReceivingPlusV44 as initializeReception} from './app-reception.js';
import {initializeRuntimeV57 as initializeRuntime} from './app-runtime.js';
import {initializePaymentWorkflow} from './app-payment-workflow.js';
import {initializeOrderWorkflow} from './app-order-workflow.js';
import {initializeDashboardV82} from './app-dashboard-v82.js';
import {initializeReconciliationV82} from './app-reconciliation-v82.js';
import {initializeProfessionalV20 as initializePlatformControl} from './app-platform-control.js';

let initialized=false,masterWarmStarted=false;
function applyCurrentDensity(){if(document.querySelector('#nuvastoCurrentDensity'))return;const style=document.createElement('style');style.id='nuvastoCurrentDensity';style.textContent=`
#mainContent :is(.v32-head,.v40-dashboard-head,.v33-head,.v41-head,.experience-head,.page-head){padding:0 2px 2px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;min-height:0!important;align-items:center!important}
#mainContent :is(.v32-head,.v40-dashboard-head,.v33-head,.v41-head,.experience-head,.page-head) :is(.eyebrow,p){display:none!important}
#mainContent :is(.v32-head,.v40-dashboard-head,.v33-head,.v41-head,.experience-head,.page-head) :is(h1,h2){margin:0!important;font-size:22px!important;line-height:1.15!important;letter-spacing:-.025em!important}
#mainContent .v32-card{box-shadow:none!important}.v32-page{gap:10px!important}
@media(max-width:680px){#mainContent :is(.v32-head,.v40-dashboard-head,.v33-head,.v41-head,.experience-head,.page-head) :is(h1,h2){font-size:20px!important}}
`;document.head.append(style)}
function localMonth(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit'}).formatToParts(new Date()),map=Object.fromEntries(parts.map(item=>[item.type,item.value]));return`${map.year}-${map.month}`}
function warmMasterOrder(){if(masterWarmStarted||!state.token)return;masterWarmStarted=true;const run=()=>{Promise.allSettled([import('./app-master-order.js'),api('/api/operations-bootstrap-v45',{persist:true,timeout:12000}),loadProcurementSettings(false),api(`/api/budgets?month=${localMonth()}`,{persist:true,timeout:10000})]).then(results=>{if(results.slice(1).every(item=>item.status==='rejected'))masterWarmStarted=false}).catch(()=>{masterWarmStarted=false})};if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1400});else setTimeout(run,120)}
export function initializeProfessional(){
  if(initialized)return;
  initialized=true;
  injectProfessionalStyles();
  applyCurrentDensity();
  initializeOrdersHistory();
  initializeCatalog();
  initializeEnhancements();
  initializeDocuments();
  initializePolish();
  initializeInvoiceReview();
  initializeEnterprise();
  initializeProcurement();
  initializeMasterEditing();
  initializeReception();
  initializePaymentWorkflow();
  initializeOrderWorkflow();
  initializeRuntime();
  initializeDashboardV82();
  initializeReconciliationV82();
  initializePlatformControl();
  warmMasterOrder();
}
