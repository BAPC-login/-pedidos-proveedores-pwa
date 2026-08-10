import './app-invoice-entry-v29.js';
import {initializeCheckoutInvoiceV29} from './app-checkout-invoice-v29.js';
import {initializeScreenStateHotfix} from './app-screen-state-hotfix.js';
import {initializeBrandingFeatures} from './app-branding.js';
import {initializeOrderCoreV15} from './app-order-core-v15.js';
import {initializeCompanyLogoUploader} from './app-company-logo.js';
import {initializeProcurementSettings} from './app-procurement-settings.js';
import {initializeProcurementEntry} from './app-procurement-entry.js';
import {initializeExperience} from './app-experience.js';
import {initializeFileActions} from './app-file-actions.js';
import {initializeSettingsPanelsV13} from './app-settings-panels-v13.js';
import {initializeTelemetryV13} from './app-telemetry-v13.js';
import {initializeNavigationV14} from './app-navigation-v14.js';
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

let initialized=false;
export function initializeCurrentRuntime(){
  if(initialized)return;initialized=true;
  // Orden único y explícito. Los módulos históricos no deben autoinicializarse desde otros entrypoints.
  const initializers=[
    initializeScreenStateHotfix,initializeNuvastoV21,initializeNuvastoV23,initializeBrandingFeatures,
    initializeProcurementSettings,initializeProcurementEntry,initializeOrderCoreV15,initializeCompanyLogoUploader,
    initializeFileActions,initializeSettingsPanelsV13,initializeExperience,initializeTelemetryV13,initializeNavigationV14,
    initializeCommercialV16,initializeImportPreviewV17,initializeMasterV18,initializeMasterOrderingV42,initializeR51UX,
    initializeNuvastoUXV22,initializeHistoryV18,initializePdfV18,initializeWorkflowV19,initializeSsoV20,
    initializeProfessionalV20,initializeHistorySemanticV20,initializeProfessionalHotfixV24,initializeCheckoutInvoiceV29
  ];
  for(const initialize of initializers)initialize();
  document.documentElement.dataset.frontendRuntime='current-r60';
}
