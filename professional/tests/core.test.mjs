import assert from 'node:assert/strict';
import {
  ORDER_TRANSITIONS,
  PLAN_LIMITS,
  canTransition,
  hashPassword,
  normalizeRut,
  planFor,
  routeMatch,
  sha256,
  slugify,
  verifyPassword
} from '../worker/src/core.js';

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
assert.equal(await verifyPassword('Una-clave-segura-2026',password.salt,password.hash),true);
assert.equal(await verifyPassword('clave-incorrecta',password.salt,password.hash),false);
assert.equal((await sha256('pedidos-pro')).length,64);

console.log('professional core tests: OK');
