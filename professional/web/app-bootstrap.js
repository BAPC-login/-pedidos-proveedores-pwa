import './app-invoice-entry-v29.js';
import {initializeScreenState} from './app-screen-state.js';
import {initializeBrandingFeatures} from './app-branding.js';
import {initializeOrderCore} from './app-order-core.js';
import {initializeOrderSelection} from './app-order-selection.js';
import {initializeCompanyLogoUploader} from './app-company-logo.js';
import {initializeProcurementSettings} from './app-procurement-settings.js';
import {initializeProcurementEntry} from './app-procurement-entry.js';
import {initializeFileActions} from './app-file-actions.js';
import {initializeSettingsPanelsV13} from './app-settings-panels-v13.js';
import {initializeTelemetryV13} from './app-telemetry-v13.js';
import {initializeNavigationV14} from './app-navigation-v14.js';
import {initializeImportPreviewV17} from './app-import-preview-v17.js';
import {initializeAuthExperience} from './app-auth-experience.js';
import {initializeProfessionalV20} from './app-professional-v20.js';
import {initializeNuvastoV21} from './app-nuvasto-v21.js';
import {initializeCheckoutInvoiceV29} from './app-checkout-invoice-v29.js';
import {initializeLegalExperience} from './app-legal.js';

let initialized=false,authenticatedRuntimePromise=null;
export function initializePlatform(){
  if(initialized)return;
  initialized=true;
  initializeScreenState();
  initializeNuvastoV21();
  initializeBrandingFeatures();
  initializeProcurementSettings();
  initializeProcurementEntry();
  initializeOrderCore();
  initializeOrderSelection();
  initializeCompanyLogoUploader();
  initializeFileActions();
  initializeSettingsPanelsV13();
  initializeTelemetryV13();
  initializeNavigationV14();
  initializeImportPreviewV17();
  initializeAuthExperience();
  initializeProfessionalV20();
  initializeCheckoutInvoiceV29();
  initializeLegalExperience();
}
export function initializeAuthenticatedPlatform(){
  if(authenticatedRuntimePromise)return authenticatedRuntimePromise;
  authenticatedRuntimePromise=import('./app-professional.js').then(module=>{module.initializeProfessional();return true}).catch(error=>{authenticatedRuntimePromise=null;throw error});
  return authenticatedRuntimePromise;
}
