import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const dashboard=read('web/app-dashboard-v82.js');
const reconciliation=read('web/app-reconciliation-v82.js');
const darkCss=read('web/design-system-native-v82.css');
const professional=read('web/app-professional.js');
const sw=read('web/sw.js');
const orders=read('web/app-orders.js');

assert.match(dashboard,/registerRouteRenderer\('dashboard',renderDashboardV82\)/,'v82 must own the dashboard route');
assert.match(dashboard,/\/api\/dashboard\/finance-v81/,'dashboard must keep canonical finance data');
assert.match(dashboard,/Fondos transferidos/,'transferred funds must be part of the unified summary');
assert.match(dashboard,/Saldo por pagar/,'outstanding exposure must be part of the unified summary');
assert.match(dashboard,/Comprometido/,'open commitments must be visible in the unified summary');
assert.match(dashboard,/Próximos 60 días/,'near-term charges must be visible in the unified summary');
assert.match(dashboard,/Flujo financiero/,'finance must render as a visual panel rather than loose text');
assert.doesNotMatch(dashboard,/v81-finance-strip/,'v82 dashboard must not reuse the detached raw finance strip');

assert.match(reconciliation,/Diferencias · control opcional/,'history must not present reconciliation as a pending closure step');
assert.match(reconciliation,/Pedido ya cerrado/,'closed orders must be explicitly identified inside reconciliation');
assert.match(reconciliation,/Recepción registrada · cierre disponible/,'active received orders must expose closure from review');
assert.match(reconciliation,/status:'closed'/,'reconciliation must offer the canonical closed transition');
assert.match(reconciliation,/Factura, diferencias y pago seguirán disponibles en Historial/,'closure must remain independent from finance and reconciliation');
assert.match(reconciliation,/observer\.observe\(frame/,'reconciliation enhancement must observe only the modal frame');
assert.doesNotMatch(reconciliation,/observe\(document\.body/,'v82 must not observe the whole DOM');
assert.match(orders,/received:\[\['closed','Cerrar pedido'\]\]/,'reception-only closure contract must remain intact');

assert.match(darkCss,/--primary:#0a84ff!important/,'dark UI primary must use legible iOS blue');
assert.match(darkCss,/--success:#30d158!important/,'dark success state must use legible iOS green');
assert.match(darkCss,/--text:#f5f5f7!important/,'dark primary text must remain high contrast');
assert.match(darkCss,/\.v67-task\.ok/,'order state chips must receive dark-mode contrast fixes');
assert.match(darkCss,/\.v82-chart-line/,'dashboard graph must receive dark-mode contrast fixes');

assert.match(professional,/initializeDashboardV82/,'professional runtime must initialize dashboard v82');
assert.match(professional,/initializeReconciliationV82/,'professional runtime must initialize reconciliation v82');
assert.match(professional,/design-system-native-v82\.css\?v=82/,'professional runtime must load the v82 contrast layer');
assert.ok(professional.indexOf('initializeRuntime();')<professional.indexOf('initializeDashboardV82();'),'dashboard v82 must register after legacy runtime routes');
assert.match(sw,/nuvasto-v82-dashboard-reconciliation-dark/,'service worker cache must rotate for v82');
assert.match(sw,/nuvasto-v81-catalog-finance-density/,'v82 cache cutover must identify v81');
assert.match(sw,/app-dashboard-v82\.js/,'dashboard v82 must be available offline');
assert.match(sw,/app-reconciliation-v82\.js/,'reconciliation v82 must be available offline');
assert.match(sw,/design-system-native-v82\.css/,'dark contrast v82 must be available offline');

console.log('dashboard reconciliation theme v82: ok');
