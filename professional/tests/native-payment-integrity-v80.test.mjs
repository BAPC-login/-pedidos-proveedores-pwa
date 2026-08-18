import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ordersQuery=read('worker/src/api/orders-query.js');
const fallbackOrders=read('worker/src/api/orders-list-v2.js');
const workerCore=read('worker/src/worker-core.js');
const ordersUi=read('web/app-orders.js');
const professional=read('web/app-professional.js');
const nativeCss=read('web/design-system-native-v80.css');
const sw=read('web/sw.js');

assert.match(ordersQuery,/payment_allocations/,'advanced orders must derive payments from allocations');
assert.match(ordersQuery,/payment_documents/,'advanced orders must use payment documents');
assert.match(ordersQuery,/paymentState:/,'advanced orders must expose paymentState');
assert.match(fallbackOrders,/payment_allocations/,'fallback orders must derive payments from allocations');
assert.match(fallbackOrders,/paymentState:/,'fallback orders must expose paymentState');

assert.match(workerCore,/issued_order_must_cancel/,'issued orders must reject physical deletion');
assert.match(workerCore,/actionablePaymentQueueV80:true/,'health must expose actionable payment queue contract');
assert.match(workerCore,/url\.pathname==='\/api\/finance\/payments'&&!url\.searchParams\.has\('status'\)/,'default finance queue must be filtered');
assert.match(workerCore,/COALESCE\(coverage\.covered,0\)<COALESCE\(ps\.amount,0\)/,'fully covered invoices must not remain actionable');

assert.match(ordersUi,/data-v32-order-preview/,'orders must expose native preview control');
assert.match(ordersUi,/window\.open\('about:blank','_blank'\)/,'preview must preserve the native browser user gesture');
assert.match(ordersUi,/\['delete-draft','Eliminar borrador'\]/,'draft action menu must expose delete draft');
assert.match(ordersUi,/Solo los borradores pueden eliminarse/,'client must reject non-draft deletion');
assert.match(ordersUi,/data-v41-collaboration\]\{display:none!important\}/,'legacy pencil shortcut must not remain visible');

assert.match(professional,/design-system-native-v80\.css/,'native design layer must load from canonical professional bootstrap');
assert.match(professional,/operations-bootstrap-v45/,'master order data must prewarm');
assert.match(professional,/loadProcurementSettings\(false\)/,'master ordering settings must prewarm');
assert.match(nativeCss,/--ios-blue:#007aff/,'native design tokens must use system semantic colors');
assert.match(nativeCss,/backdrop-filter:saturate\(180%\) blur\(28px\)/,'navigation chrome must use restrained glass');
assert.match(nativeCss,/prefers-reduced-motion:reduce/,'motion must respect system accessibility');
assert.match(sw,/nuvasto-v80-native-orders-payments/,'service worker cache must rotate for v80');
assert.match(sw,/design-system-native-v80\.css/,'native design assets must be precached');
assert.match(sw,/app-master-order\.js/,'master order runtime must be precached');

console.log('native payment integrity v80: ok');
