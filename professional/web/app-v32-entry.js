import {state} from './app-core.js';
import {openRoute} from './app-router-v14.js';
import {injectV32Styles} from './app-v32-base.js';
import {initializeOrdersHistoryV32} from './app-v32-orders.js';
import {initializeCatalogV32} from './app-v32-catalog.js';
import {initializeEnhancementsV32} from './app-v32-enhancements.js';
import {initializeDocumentsV33} from './app-v33-documents.js';
import {initializePolishV34} from './app-v34-polish.js';
import './app-multi-invoice-v38.js';
import './app-v39-stability.js';
import {initializeInvoiceReviewV36} from './app-v36-invoice-review.js';
import {initializeOperationalUpgradeV40} from './app-v40-operations.js';
import {initializeEnterpriseV41} from './app-v41-enterprise.js';

let initialized=false;
export function initializeProfessionalV32(){
  if(initialized)return;initialized=true;injectV32Styles();initializeOrdersHistoryV32();initializeCatalogV32();initializeEnhancementsV32();initializeDocumentsV33();initializePolishV34();initializeInvoiceReviewV36();initializeOperationalUpgradeV40();initializeEnterpriseV41();
  if(state.token&&['dashboard','orders','history','documents','catalog','suppliers','receiving','finance','approvals'].includes(state.view))openRoute(state.view,state.subview||'',{replace:true}).catch(error=>console.warn('v32_initial_route_failed',error));
}

setTimeout(initializeProfessionalV32,220);
