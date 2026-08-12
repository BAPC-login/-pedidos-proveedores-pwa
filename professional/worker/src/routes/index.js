import {matchCatalogDomain} from './catalog.js';
import {matchProcurementDomain} from './procurement.js';
import {matchEnterpriseDomain} from './enterprise.js';

export function resolveDomain(path,method){
  return matchCatalogDomain(path,method)||matchProcurementDomain(path,method)||matchEnterpriseDomain(path,method)||{implementation:'core',layer:'core'};
}
