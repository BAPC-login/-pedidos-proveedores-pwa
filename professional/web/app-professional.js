import {injectV32Styles as injectProfessionalStyles} from './app-ui-foundation.js';
import {initializeOrdersHistoryV32 as initializeOrdersHistory} from './app-orders.js';
import {initializeCatalogV32 as initializeCatalog} from './app-catalog.js';
import {initializeEnhancementsV32 as initializeEnhancements} from './app-ui-enhancements.js';
import {initializeDocumentsV33 as initializeDocuments} from './app-documents.js';
import {initializePolishV34 as initializePolish} from './app-ui-polish.js';
import './app-multi-invoice.js';
import {initializeInvoiceReviewV36 as initializeInvoiceReview} from './app-invoice-review.js';
import {initializeEnterpriseV41 as initializeEnterprise} from './app-enterprise.js';
import {initializeProcurementOSV44 as initializeProcurement} from './app-procurement.js';
import {initializeMasterEditingV44 as initializeMasterEditing} from './app-master-edit.js';
import {initializeReceivingPlusV44 as initializeReception} from './app-reception.js';
import {initializeRuntimeV57 as initializeRuntime} from './app-runtime.js';
import {initializePaymentWorkflow} from './app-payment-workflow.js';
import {initializeOrderWorkflow} from './app-order-workflow.js';
let initialized=false;
export function initializeProfessional(){if(initialized)return;initialized=true;injectProfessionalStyles();initializeOrdersHistory();initializeCatalog();initializeEnhancements();initializeDocuments();initializePolish();initializeInvoiceReview();initializeEnterprise();initializeProcurement();initializeMasterEditing();initializeReception();initializePaymentWorkflow();initializeOrderWorkflow();initializeRuntime()}
setTimeout(initializeProfessional,120);
