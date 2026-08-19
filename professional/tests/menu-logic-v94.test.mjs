import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const navigation=read('web/app-navigation-v14.js');
const settings=read('web/app-experience-settings.js');
const company=read('web/app-company-profile-v94.js');
const suppliers=read('web/app-suppliers-v94.js');
const core=read('worker/src/worker-core-v91.js');

assert.match(navigation,/renderSuppliersWorkspaceV94/,'canonical suppliers route must use the dedicated supplier workspace');
assert.ok(navigation.includes("registerRouteRenderer('suppliers',()=>renderSuppliersWorkspaceV94())"),'supplier menu must own the supplier workspace');
assert.ok(navigation.includes("if(tab==='suppliers')return openRoute('suppliers','')"),'legacy supplier subroutes must redirect into Proveedores');
assert.ok(navigation.includes("querySelectorAll('[data-operations-tab=\"suppliers\"]')"),'catalog must remove the legacy supplier management entry');

assert.match(settings,/Perfil de empresa/,'settings must expose one unified company profile');
assert.match(settings,/data-company-profile-v94/,'company profile must use the unified v94 editor');
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

assert.ok(core.includes("import {updateSupplier} from './api/catalog.js'"),'backend must expose canonical supplier profile updates');
assert.ok(core.includes("supplierProfile=url.pathname.match(/^\\/api\\/suppliers\\/([^/]+)$/)"),'supplier profile update route must be exact and not swallow subresources');
assert.ok(core.includes("supplierProfile&&method==='PATCH'"),'supplier profile route must accept PATCH');
assert.match(core,/supplierProfileV94:true/,'health must expose supplier profile capability');

console.log('v94 menu logic: OK · company profile unified · suppliers own commercial, payment and logo settings');
