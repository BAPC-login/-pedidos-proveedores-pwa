import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const catalog=read('web/app-catalog.js');
const dashboard=read('web/app-operations-dashboard.js');
const professional=read('web/app-professional.js');
const sw=read('web/sw.js');
const icon=read('web/icon.svg');
const productInsights=read('worker/src/api/product-insights-v81.js');
const financeDashboard=read('worker/src/api/dashboard-finance-v81.js');
const procurementWorker=read('worker/src/worker-procurement.js');
const catalogRoutes=read('worker/src/routes/catalog.js');
const procurementRoutes=read('worker/src/routes/procurement.js');
const combined=read('../worker/src/combined.js');

assert.match(catalog,/const LIST_PAGE=48,MOBILE_PAGE=28,MATRIX_PRODUCTS=32,MATRIX_SUPPLIERS=36/,'catalog must bound mounted products and supplier matrix size');
assert.match(catalog,/IntersectionObserver/,'catalog images must hydrate on demand');
assert.match(catalog,/slice\(0,MATRIX_PRODUCTS\)/,'matrix must cap rendered products');
assert.match(catalog,/\/insights\?months=12/,'catalog must expose product history');
assert.match(catalog,/\/manual-price`/,'catalog must expose guarded manual last-price editing');
assert.match(productInsights,/manual_price_locked_by_invoice/,'manual price must lock after invoice evidence exists');
assert.match(productInsights,/price_history/,'manual and invoice price history must remain traceable');
assert.match(productInsights,/invoiceCount\?lockedPrice:requestedPrice\|\|currentPrice/,'supplier edits must preserve invoice-backed prices');
assert.match(catalogRoutes,/product-insights/,'product history must route through canonical catalog domain');
assert.match(catalogRoutes,/product-price/,'manual price must route through canonical catalog domain');

assert.match(dashboard,/\/api\/dashboard\/finance-v81/,'dashboard must request canonical finance projection data');
assert.match(dashboard,/Fondos transferidos/,'dashboard must visualize transferred funds');
assert.match(dashboard,/Cargos proyectados/,'dashboard must visualize projected charges');
assert.match(dashboard,/function orderActionMenu/,'dashboard refactor must preserve order actions');
assert.match(dashboard,/export async function refreshNotifications/,'dashboard refactor must preserve notifications');
assert.match(dashboard,/function enhanceReception/,'dashboard refactor must preserve reception enhancements');
assert.match(dashboard,/initializeOperationalUpgradeV40/,'dashboard refactor must preserve operational initialization');
assert.match(financeDashboard,/payment_documents/,'finance dashboard must derive transferred funds from payment documents');
assert.match(financeDashboard,/payment_allocations/,'finance dashboard must account for allocated payments');
assert.match(financeDashboard,/next60Days/,'finance dashboard must expose upcoming obligations');
assert.match(procurementRoutes,/dashboard-finance/,'finance dashboard must route through procurement domain');
assert.match(procurementWorker,/manualPriceIntegrityV81:true/,'procurement health must expose price integrity contract');
assert.match(procurementWorker,/catalogMemorySafetyV81:true/,'procurement health must expose catalog memory safety contract');
assert.match(combined,/async function platformHealthResponse/,'top-level worker must own the public platform health normalization');
assert.match(combined,/r2Configured=Boolean\(env\.FILES\)/,'public health must read the deployed R2 binding directly');
assert.match(combined,/financeDashboardV81:true/,'public health must expose the v81 production feature contract');

assert.match(professional,/applyDensityV81/,'canonical professional bootstrap must own compact headers');
assert.match(professional,/\.v32-head,.v40-dashboard-head/,'compact header styling must cover catalog and dashboard');
assert.match(sw,/nuvasto-v81-catalog-finance-density/,'service worker cache must rotate for v81 assets');
assert.match(sw,/nuvasto-v80-native-orders-payments/,'v81 cutover must identify the previous v80 cache');
assert.match(icon,/rx="116"/,'Nuvasto icon must use an iOS-like rounded square');
assert.match(icon,/#0A84FF/,'Nuvasto icon must retain a restrained iOS accent');

console.log('catalog finance v81: ok');
