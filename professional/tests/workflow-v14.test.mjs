import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [catalog,schema,operations,procurement,order,router,navigation,dashboard,experience,html]=await Promise.all([
  readFile(new URL('../worker/src/api/catalog-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-procurement-settings.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-core-v13.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-router-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-navigation-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-dashboard-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience.js',import.meta.url),'utf8'),
  readFile(new URL('../web/index.html',import.meta.url),'utf8')
]);

assert.match(schema,/SCHEMA_VERSION='14'/);
assert.match(schema,/categories','cost_center_id'/);
assert.match(catalog,/Selecciona un centro de costo válido/);
assert.match(catalog,/claimedSystemCategory/);
assert.match(operations,/Centro de costo obligatorio/);
assert.doesNotMatch(operations,/data-category-up/);
assert.match(procurement,/namesForCenter/);
assert.match(procurement,/Este es el orden que verá la lista maestra/);
assert.match(order,/Todos excepto…/);
assert.match(order,/data-exception-supplier/);
assert.match(order,/enterkeyhint="next"/);
assert.doesNotMatch(order,/data-enter-next/);
assert.match(router,/popstate/);
assert.match(router,/sessionStorage/);
assert.match(navigation,/renderDashboardV14/);
assert.match(dashboard,/line-chart/);
assert.match(dashboard,/donut/);
assert.match(dashboard,/vertical-bars/);
assert.doesNotMatch(experience,/MutationObserver/);
assert.match(html,/id="routeBack"/);
assert.match(html,/design-system-v14\.css/);

console.log('workflow v14 tests: OK');
