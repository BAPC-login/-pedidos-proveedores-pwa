import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const dashboard=read('web/app-dashboard-v82.js');
const reconciliation=read('web/app-reconciliation-v82.js');
const darkCss=read('web/design-system-native-v82.css');
const currentCss=read('web/app-current.css');
const professional=read('web/app-professional.js');
const sw=read('web/sw.js');
const orders=read('web/app-orders.js');

assert.match(dashboard,/registerRouteRenderer\('dashboard',renderDashboardV82\)/,'unified dashboard must own the dashboard route');
assert.match(dashboard,/\/api\/dashboard\/finance-v81/,'dashboard must keep canonical finance data');
assert.match(dashboard,/Fondos transferidos/,'transferred funds must be part of the unified summary');
assert.match(dashboard,/Saldo por pagar/,'outstanding exposure must be part of the unified summary');
assert.match(dashboard,/Comprometido/,'open commitments must be visible in the unified summary');
assert.match(dashboard,/Próximos 60 días/,'near-term charges must be visible in the unified summary');
assert.match(dashboard,/Flujo financiero/,'finance must render as a visual panel rather than loose text');
assert.doesNotMatch(dashboard,/v81-finance-strip/,'unified dashboard must not reuse the detached raw finance strip');

assert.match(reconciliation,/Diferencias · control opcional/,'history must not present reconciliation as a pending closure step');
assert.match(reconciliation,/Pedido ya cerrado/,'closed orders must be explicitly identified inside reconciliation');
assert.match(reconciliation,/Recepción registrada · cierre disponible/,'active received orders must expose closure from review');
assert.match(reconciliation,/status:'closed'/,'reconciliation must offer the canonical closed transition');
assert.match(reconciliation,/Factura, diferencias y pago seguirán disponibles en Historial/,'closure must remain independent from finance and reconciliation');
assert.match(reconciliation,/observer\.observe\(frame/,'reconciliation enhancement must observe only the modal frame');
assert.doesNotMatch(reconciliation,/observe\(document\.body/,'reconciliation must not observe the whole DOM');
assert.match(orders,/received:\[\['closed','Cerrar pedido'\]\]/,'reception-only closure contract must remain intact');

assert.match(darkCss,/--primary:#0a84ff!important/,'dark UI primary must use legible iOS blue');
assert.match(darkCss,/--success:#30d158!important/,'dark success state must use legible iOS green');
assert.match(darkCss,/--text:#f5f5f7!important/,'dark primary text must remain high contrast');
assert.match(darkCss,/\.v67-task\.ok/,'order state chips must receive dark-mode contrast fixes');
assert.match(darkCss,/\.v82-chart-line/,'dashboard graph must receive dark-mode contrast fixes');

assert.match(professional,/initializeDashboardV82/,'professional runtime must initialize the unified dashboard');
assert.match(professional,/initializeReconciliationV82/,'professional runtime must initialize reconciliation');
assert.match(currentCss,/design-system-native-v82\.css/,'the single current stylesheet entry must include the validated dark contrast layer');
assert.doesNotMatch(professional,/design-system-native-v82\.css/,'professional runtime must not inject a second contrast stylesheet');
assert.ok(professional.indexOf('initializeRuntime();')<professional.indexOf('initializeDashboardV82();'),'unified dashboard must register after base runtime routes');
assert.match(sw,/importScripts\('\.\/sw-release\.js'\)/,'service worker cache identity must come from the single current release manifest');
assert.match(sw,/deleteStaleNuvastoCaches/,'current cache cutover must delete superseded generations instead of chaining them');
assert.match(sw,/app-dashboard-v82\.js/,'unified dashboard implementation must be available offline');
assert.match(sw,/app-reconciliation-v82\.js/,'reconciliation implementation must be available offline');
assert.match(sw,/design-system-native-v82\.css/,'validated dark contrast layer must be available offline');

console.log('dashboard reconciliation theme: ok');
