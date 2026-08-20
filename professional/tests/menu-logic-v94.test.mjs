import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const navigation=read('web/app-navigation.js');
const legacyNavigation=read('web/app-navigation-v14.js');
const settings=read('web/app-experience-settings.js');
const company=read('web/app-company-profile.js');
const legacyCompany=read('web/app-company-profile-v94.js');
const location=read('web/app-location-identity.js');
const suppliers=read('web/app-suppliers.js');
const legacySuppliers=read('web/app-suppliers-v94.js');
const core=read('worker/src/worker-core-v91.js');

assert.match(navigation,/renderSuppliersWorkspaceV94 as renderSuppliersWorkspace/,'canonical suppliers route must import the dedicated semantic supplier workspace');
assert.match(navigation,/registerRouteRenderer\('suppliers',renderSuppliersRoute\)/,'supplier menu must own exactly one supplier route');
assert.ok(navigation.includes("if(tab==='suppliers')return openRoute('suppliers','')"),'legacy supplier subroutes must redirect into Proveedores');
assert.doesNotMatch(navigation,/renderOperationsAdmin|querySelectorAll\('\[data-operations-tab="suppliers"\]'/,'navigation must not carry a second supplier-management renderer');
assert.match(legacyNavigation,/Compatibility alias only/,'versioned navigation module must remain a non-owning facade');

assert.match(settings,/Perfil de empresa/,'settings must expose one unified company profile');
assert.match(settings,/data-company-profile-v94/,'company profile action must remain wired');
assert.match(settings,/Perfil de local/,'settings must expose one unified local profile');
assert.match(settings,/data-location-profile/,'local profile must use the unified local editor');
assert.doesNotMatch(settings,/Datos de locales|Identidad de locales/,'local data and local logo must not be split into separate settings cards');
assert.doesNotMatch(settings,/data-settings-panel="locations"|data-location-identity/,'settings must not expose legacy split local profile actions');
assert.doesNotMatch(settings,/Proveedores e identidad/,'settings must not duplicate supplier administration');
assert.doesNotMatch(settings,/data-action="new-supplier"/,'settings must not create suppliers outside Proveedores');
assert.doesNotMatch(settings,/data-settings-panel="(?:company|pdf|palette)"/,'company data, logo and palette must not be split into separate settings cards');

assert.ok(company.includes("title:'Perfil de empresa'"),'company editor must be explicitly named Perfil de empresa');
assert.match(company,/Información de la empresa/,'company profile must contain corporate information');
assert.match(company,/Logo corporativo/,'company profile must contain the company logo');
assert.match(company,/Paleta y documentos/,'company profile must contain palette and PDF identity');
assert.match(company,/primaryColor/,'company profile must edit the primary brand color');
assert.match(company,/secondaryColor/,'company profile must edit the secondary brand color');
assert.doesNotMatch(company,/localLegalName|brandLocation|location:\s*\{/,'company profile must not edit local-specific identity');
assert.match(legacyCompany,/Compatibility alias only/,'versioned company profile file must remain a non-owning facade');

assert.ok(location.includes("title:'Perfil de local'"),'local editor must be explicitly named Perfil de local');
assert.match(location,/Información del local/,'local profile must contain tax and contact data');
assert.match(location,/Identidad visual/,'local profile must contain the local logo editor');
assert.match(location,/legalName/,'local profile must edit legal name');
assert.match(location,/contactName/,'local profile must edit contact data');
assert.match(location,/logoKey/,'local profile must persist its own logo metadata');
assert.match(location,/json:\{location:\{id:selectedId,details\}\}/,'local profile must persist one merged details object');
assert.match(location,/data-location-profile/,'local profile action must be wired');
assert.match(location,/openRoute\('settings'/,'local profile save must return through canonical navigation');

assert.match(suppliers,/Datos generales/,'supplier profile must own supplier identity data');
assert.match(suppliers,/Condiciones de abastecimiento/,'supplier profile must own purchasing conditions');
assert.match(suppliers,/Pago pactado/,'supplier profile must own agreed payment terms');
assert.match(suppliers,/Identidad visual/,'supplier profile must own supplier logo management');
assert.match(suppliers,/Productos vinculados/,'supplier profile must surface supplier-product relationships');
assert.match(suppliers,/\/payment-terms/,'supplier workspace must use normalized supplier payment terms');
assert.match(suppliers,/\/identity/,'supplier workspace must use supplier identity endpoint');
assert.match(suppliers,/method:'PATCH'.*json:body/s,'supplier profile must persist general supplier edits');
assert.ok(suppliers.includes("['delivery','Contra entrega']"),'supplier terms must support payment on delivery');
assert.ok(suppliers.includes("['days','Crédito a días']"),'supplier terms must support credit days');
assert.ok(suppliers.includes("['fixed_day','Pago en día fijo del mes']"),'supplier terms must support fixed payment day');
assert.ok(suppliers.includes("['prepaid','Prepago']"),'supplier terms must support prepaid agreements');
assert.match(legacySuppliers,/Compatibility alias only/,'versioned supplier module must remain a non-owning facade');

assert.ok(core.includes("import {updateSupplier} from './api/catalog.js'"),'backend must expose canonical supplier profile updates');
assert.ok(core.includes("supplierProfile=url.pathname.match(/^\\/api\\/suppliers\\/([^/]+)$/)"),'supplier profile update route must be exact and not swallow subresources');
assert.ok(core.includes("supplierProfile&&method==='PATCH'"),'supplier profile route must accept PATCH');
assert.match(core,/supplierProfileV94:true/,'health must expose supplier profile capability');

console.log('menu logic: OK · company, local and supplier profiles have one semantic owner');
