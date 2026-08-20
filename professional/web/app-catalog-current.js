import {registerRouteRenderer} from './app-router.js';
import {renderCatalogV32 as renderCatalog} from './app-catalog.js';

let initialized=false;
export function initializeCatalog(){
  if(initialized)return;
  initialized=true;
  registerRouteRenderer('catalog',renderCatalog);
}
