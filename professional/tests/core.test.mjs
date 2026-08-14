import assert from 'node:assert/strict';
import {
  ORDER_TRANSITIONS,
  PLAN_LIMITS,
  canTransition,
  normalizeRut,
  planFor,
  routeMatch,
  sha256,
  slugify
} from '../worker/src/core.js';
import {hashPassword, verifyPassword} from '../worker/src/password.js';
import {normalizeInvoiceAnalysis} from '../worker/src/invoice-normalizer.js';

assert.equal(slugify('Comercializadora Castellón SpA'),'comercializadora-castellon-spa');
assert.deepEqual(routeMatch('/api/orders/123/transition','/api/orders/:id/transition'),{id:'123'});
assert.equal(routeMatch('/api/orders/123','/api/orders/:id/transition'),null);
assert.equal(canTransition('draft','requested'),true);
assert.equal(canTransition('draft','received'),false);
assert.deepEqual(ORDER_TRANSITIONS.closed,[]);
assert.equal(planFor('unknown'),PLAN_LIMITS.free);
assert.equal(normalizeRut('77.375.227-3'),'77.375.227-3');
assert.throws(()=>normalizeRut('77.375.227-4'));

const password = await hashPassword('Una-clave-segura-2026');
assert.equal(password.algorithm,'pbkdf2-sha256-100000');
assert.equal(await verifyPassword('Una-clave-segura-2026',password.salt,password.hash),true);
assert.equal(await verifyPassword('clave-incorrecta',password.salt,password.hash),false);
assert.equal((await sha256('pedidos-pro')).length,64);

const reconciliation=normalizeInvoiceAnalysis({invoice:{lines:[{sourceLine:'CC ZERO PET 6 X 1500 CC',invoiceQuantity:1,grossLineTotal:12000,confidence:.42}],warnings:[]}}, {products:[{productId:'coke-original',description:'Coca Cola Original 1.5 LT',unit:'CAJA (6)',orderedQty:1,unitsPerOrderUnit:6},{productId:'coke-zero',description:'Coca Cola Sin Azúcar 1.5 LT',unit:'CAJA (6)',orderedQty:1,unitsPerOrderUnit:6}],aliases:[{productId:'coke-zero',alias:'CC Zero 1500cc',confidence:.98,usageCount:12}]});
const reconciledLine=reconciliation.invoice.lines[0];
assert.equal(reconciledLine.productId,'coke-zero','supplier alias must resolve abbreviated invoice descriptions to the ordered product');
assert.equal(reconciledLine.packSize,6,'explicit invoice pack must be preserved');
assert.equal(reconciledLine.units,6,'invoice package quantity must normalize to base units');
assert.equal(reconciledLine.orderedFormatQty,1,'base units must reconcile to the order purchase format');
assert.equal(reconciledLine.grossUnitPrice,2000,'unit price must be derived from line total and normalized units');
assert.equal(reconciledLine.priceVerified,true,'deterministic line arithmetic must mark price as verified');
assert.equal(reconciledLine.matchMethod,'supplier-alias','learned supplier alias should be recorded as the match method');

console.log('professional core tests: OK');
