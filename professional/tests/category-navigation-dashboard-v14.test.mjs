import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [schema,categoriesApi,index,admin,procurement,orderCore,navigation,dashboard,serviceWorker]=await Promise.all([
  read('../worker/src/schema.js'),read('../worker/src/api/categories-v14.js'),read('../worker/src/index.js'),read('../web/app-experience-admin.js'),read('../web/app-procurement-settings.js'),read('../web/app-order-core-v13.js'),read('../web/app-navigation-v14.js'),read('../web/app-dashboard-v14.js'),read('../web/sw.js')
]);

assert.match(schema,/SCHEMA_VERSION='14'/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS category_cost_centers/);
assert.match(schema,/CREATE TABLE IF NOT EXISTS product_center_categories/);
assert.match(categoriesApi,/Selecciona un centro de costo válido/);
assert.match(categoriesApi,/category_center_mismatch/);
assert.match(categoriesApi,/product_center_categories/);
assert.match(index,/\/api\/products\/:id\/center-category/);
assert.match(index,/categoryCostCenters:true/);
assert.match(admin,/Centro de costo/);
assert.match(admin,/data-product-center-categories/);
assert.doesNotMatch(admin,/data-category-up/);
assert.match(procurement,/category\.costCenterId===id/);
assert.match(orderCore,/product\.centerCategories/);
assert.match(navigation,/history\.pushState/);
assert.match(navigation,/popstate/);
assert.match(navigation,/scrollY/);
assert.match(dashboard,/Evolución mensual del gasto/);
assert.match(dashboard,/dashboard-donut/);
assert.match(dashboard,/Principales proveedores/);
assert.match(serviceWorker,/app-navigation-v14\.js/);
assert.match(serviceWorker,/app-dashboard-v14\.js/);

console.log('category, navigation and dashboard v14 tests: OK');
