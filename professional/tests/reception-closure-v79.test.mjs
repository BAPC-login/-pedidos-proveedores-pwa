import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const worker=read('../worker/src/worker-core.js');
const orders=read('../web/app-orders.js');
const detail=read('../web/app-order-detail-v30.js');
const invoice=read('../web/app-invoice-v30.js');
const query=read('../worker/src/api/orders-query.js');
const fallback=read('../worker/src/api/orders-list-v2.js');
const shell=read('../web/index.html');
const currentCss=read('../web/app-current.css');
const sw=read('../web/sw.js');

assert.match(worker,/receptionRequiredForClosure:true/,'health must expose reception as the closure gate');
assert.match(worker,/reconciliationRequiredForClosure:false/,'reconciliation must not gate closure');
assert.match(worker,/invoiceRequiredForClosure:false/,'invoice must not gate closure');
assert.match(worker,/paymentRequiredForClosure:false/,'payment must not gate closure');
assert.match(worker,/FROM receptions WHERE order_id=\? AND org_id=\? AND status='completed'/,'closure must verify a persisted completed reception');
assert.doesNotMatch(worker,/order\.status\s*!==\s*['"]reconciled['"]/,'closure must never require reconciled status');
assert.match(worker,/body\.markReceived!==true/,'invoice flow must create reception only when explicitly requested');
assert.match(worker,/createReceptionV13/,'invoice reception must use the canonical reception API');

assert.match(orders,/partially_received:\[\['closed','Cerrar pedido'\]/,'partial reception must be explicitly closable');
assert.match(orders,/received:\[\['closed','Cerrar pedido'\]\]/,'received orders must be explicitly closable');
assert.match(orders,/Proveedor no presentado/,'orders UI must expose supplier no-show');
assert.match(orders,/Factura opcional/,'invoice must be communicated as optional');
assert.match(orders,/Conciliación opcional/,'reconciliation must be communicated as optional');

assert.match(detail,/Recepción registrada · el pedido ya puede cerrarse/,'reception must return to an explicit close-ready state');
assert.match(detail,/id="v30CloseOrder"/,'order detail must expose direct closure after reception');
assert.match(detail,/id="v30NoShow"/,'order detail must expose supplier no-show');
assert.match(detail,/REVISIÓN DE DIFERENCIAS/,'reconciliation must be presented as optional review');
assert.match(detail,/La factura, la conciliación y el pago pueden gestionarse después/,'close confirmation must preserve financial independence');

assert.match(invoice,/name="markReceived"/,'invoice UI must keep the explicit receive-from-invoice choice');
assert.match(invoice,/receptionDate/,'invoice UI must let the user choose reception date');
assert.match(query,/deliveryOutcome.*not_presented/s,'canonical history query must expose no-show outcome');
assert.match(fallback,/deliveryOutcome.*not_presented/s,'fallback history query must expose no-show outcome');
assert.match(shell,/id="nuvastoCurrentStyles"[^>]+app-current\.css/,'shell must expose only the current presentation entry');
assert.match(currentCss,/design-system-v79\.css/,'current presentation cascade must retain the validated reception layout contract');
assert.match(sw,/importScripts\('\.\/sw-release\.js'\)/,'service worker cache identity must come only from the generated current release');
assert.match(sw,/deleteStaleNuvastoCaches/,'service worker activation must delete all stale Nuvasto caches');

console.log('reception-closure contracts: ok');
