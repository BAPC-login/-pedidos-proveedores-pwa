import {injectV32Styles} from './app-v32-base.js';
import {initializeOrdersHistoryV32} from './app-v32-orders.js';
import {initializeCatalogV32} from './app-v32-catalog.js';
import {initializeEnhancementsV32} from './app-v32-enhancements.js';
import {initializeDocumentsV33} from './app-v33-documents.js';
import {initializePolishV34} from './app-v34-polish.js';
import './app-multi-invoice-v38.js';
import './app-v39-stability.js';
import {initializeInvoiceReviewV36} from './app-v36-invoice-review.js';
import {initializeEnterpriseV41} from './app-v41-enterprise.js';
import {initializeProcurementOSV44} from './app-v44-procurement-os.js';
import {initializeMasterEditingV44} from './app-v44-master-edit.js';
import {initializeReceivingPlusV44} from './app-v44-receiving-plus.js';
import {initializeRuntimeV57} from './app-runtime-v57.js';

let initialized=false;
export function initializeProfessionalV32(){
  if(initialized)return;initialized=true;
  injectV32Styles();
  initializeOrdersHistoryV32();
  initializeCatalogV32();
  initializeEnhancementsV32();
  initializeDocumentsV33();
  initializePolishV34();
  initializeInvoiceReviewV36();
  initializeEnterpriseV41();
  initializeProcurementOSV44();
  initializeMasterEditingV44();
  initializeReceivingPlusV44();
  initializeRuntimeV57();
}
setTimeout(initializeProfessionalV32,120);
