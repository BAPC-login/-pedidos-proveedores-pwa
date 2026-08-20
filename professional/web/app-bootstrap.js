import './app-copy-policy.js';
import './app-invoice-entry-v29.js';
import {initializeScreenState} from './app-screen-state.js';
import {initializeBrandingFeatures} from './app-branding.js';
import {initializeOrderCore} from './app-order-core.js';
import {initializeOrderSelection} from './app-order-selection.js';
import {initializeCompanyLogoUploader} from './app-company-logo.js';
import {initializeLocationIdentity} from './app-location-identity.js';
import {initializeProcurementSettings} from './app-procurement-settings.js';
import {initializeProcurementEntry} from './app-procurement-entry.js';
import {initializeFileActions} from './app-file-actions.js';
import {initializeSettingsPanelsV13} from './app-settings-panels-v13.js';
import {initializeTelemetryV13} from './app-telemetry-v13.js';
import {initializeReadinessV85} from './app-readiness-v85.js';
import {initializeNavigation} from './app-navigation.js';
import {initializeImportPreviewV17} from './app-import-preview-v17.js';
import {initializeAuthExperience} from './app-auth-experience.js';
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
  initializeLocationIdentity();
  initializeFileActions();
  initializeSettingsPanelsV13();
  initializeTelemetryV13();
  initializeReadinessV85();
  initializeNavigation();
  initializeImportPreviewV17();
  initializeAuthExperience();
  initializeCheckoutInvoiceV29();
  initializeLegalExperience();
}
export function initializeAuthenticatedPlatform(){
  if(authenticatedRuntimePromise)return authenticatedRuntimePromise;
  authenticatedRuntimePromise=import('./app-professional.js').then(module=>{module.initializeProfessional();return true}).catch(error=>{authenticatedRuntimePromise=null;throw error});
  return authenticatedRuntimePromise;
}
