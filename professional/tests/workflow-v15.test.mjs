import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [schema,legacy,enterprise,index,scoped,orderCore,keyboard,orderDetail,dashboard,settings,admin,liveBrowser,serviceWorker,migration]=await Promise.all([
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/legacyCatalog.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/enterprise-v15.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-scoped.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-core-v15.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience-keyboard.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-detail.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-dashboard-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-enterprise-v15.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience-admin.js',import.meta.url),'utf8'),
  readFile(new URL('./live-browser-v15.mjs',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0006_enterprise_v15.sql',import.meta.url),'utf8')
]);

assert.match(schema,/SCHEMA_VERSION='(?:15|16|17|18|19|20|21)'/);
assert.match(schema,/seedLegacyCatalogOnce/);
assert.match(schema,/classifyLegacyCategoriesOnce/);
assert.match(schema,/if\(Number\(completed\?\.item_count\|\|0\)>=LEGACY_CATALOG_SIZE\)/);
assert.doesNotMatch(schema,/legacyCatalog=await seedLegacyCatalog\(env\.DB\)/);
assert.match(legacy,/if \(Number\(completed\?\.item_count \|\| 0\) >= LEGACY_ITEMS\.length\)/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS trash_items/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS draft_autosaves/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS cost_center_budgets/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS product_aliases/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS subscriptions/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS dashboard_layouts/);
assert.match(enterprise,/deleteOrderToTrashV15/);
assert.match(enterprise,/deleteProductToTrashV15/);
assert.match(enterprise,/deleteSupplierToTrashV15/);
assert.match(enterprise,/item\.entity_type==='product'/);
assert.match(enterprise,/item\.entity_type==='supplier'/);
assert.match(enterprise,/restoreTrashV15/);
assert.match(enterprise,/duplicateOrderV15/);
assert.match(enterprise,/threeWayReconciliationV15/);
assert.match(enterprise,/productPriceHistoryV15/);
assert.match(enterprise,/createCheckoutV15/);
assert.match(enterprise,/restoreBackupV15/);
assert.match(enterprise,/migrateFilesToR2V15/);
assert.match(enterprise,/executiveExportV15/);
assert.match(index,/2\.0\.0-alpha\.15/);
assert.match(index,/persistentCatalog:true/);
assert.match(index,/\/api\/autosave/);
assert.match(index,/\/api\/billing\/checkout/);
assert.match(scoped,/deleteCategoryToTrashV15/);
assert.match(scoped,/deleteProductToTrashV15/);
assert.match(scoped,/deleteSupplierToTrashV15/);
assert.match(admin,/data-product-delete/);
assert.match(admin,/data-supplier-delete/);
assert.match(orderCore,/>Hoy</);
assert.match(orderCore,/PASO 1 DE 2/);
assert.match(orderCore,/PASO 2 DE 2/);
assert.match(orderCore,/master-order-v15/);
assert.match(orderCore,/inputmode="decimal"/);
assert.doesNotMatch(orderCore,/quantity-keyboard-toolbar/);
assert.doesNotMatch(keyboard,/createElement\('div'\)/);
assert.doesNotMatch(keyboard,/quantity-keyboard-toolbar/);
assert.match(keyboard,/focusNext/);
assert.match(orderDetail,/Recepción avanzada/);
assert.match(orderDetail,/Conciliar 3 vías/);
assert.match(orderDetail,/Duplicar/);
assert.match(orderDetail,/order-edit:/);
assert.match(dashboard,/dashboard\/layout/);
assert.match(settings,/Papelera y restauración/);
assert.match(settings,/Exportación ejecutiva/);
assert.match(liveBrowser,/chromium,webkit/);
assert.match(liveBrowser,/WebKit iPhone/);
assert.match(liveBrowser,/WebKit iPad/);
assert.match(serviceWorker,/addEventListener\('push'/);

console.log('workflow v15 compatibility tests: OK');
