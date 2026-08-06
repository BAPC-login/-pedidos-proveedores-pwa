import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [reset,index,combined,pkg]=await Promise.all([
  readFile(new URL('../worker/src/api/order-reset-v35.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v34.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(reset,/orders-clean-slate-2026-08-05-v1/);
assert.match(reset,/DELETE FROM orders WHERE org_id=\?/);
assert.match(reset,/DELETE FROM order_items/);
assert.match(reset,/DELETE FROM receptions/);
assert.match(reset,/DELETE FROM invoice_order_links/);
assert.match(reset,/DELETE FROM document_links WHERE org_id=\? AND entity_type='order'/);
assert.match(reset,/f\.purpose='order-pdf'/);
assert.match(reset,/env\.FILES\.delete/);
assert.match(reset,/DELETE FROM usage_counters WHERE org_id=\? AND metric='orders_created'/);
assert.match(reset,/INSERT INTO data_seed_state/);
assert.match(reset,/system\.orders_clean_slate/);
assert.doesNotMatch(reset,/DELETE FROM products/);
assert.doesNotMatch(reset,/DELETE FROM categories/);
assert.doesNotMatch(reset,/DELETE FROM suppliers/);
assert.doesNotMatch(reset,/DELETE FROM organizations/);
assert.doesNotMatch(reset,/DELETE FROM locations/);
assert.doesNotMatch(reset,/DELETE FROM users/);
assert.doesNotMatch(reset,/DELETE FROM cost_centers/);
assert.doesNotMatch(reset,/DELETE FROM product_cost_centers/);
assert.match(index,/ensureOrdersCleanSlateV35/);
assert.match(index,/ordersCleanSlateApplied/);
assert.match(index,/ordersRemainingAfterReset/);
assert.match(index,/\/api\/operations\/order-reset-status/);
assert.match(combined,/2026\.08\.06\.40/);
assert.match(pkg,/order-reset-v35\.js/);
assert.match(pkg,/workflow-v35-order-reset\.test\.mjs/);

console.log('workflow v35 one-time order clean slate preserved under Nuvasto v39: OK');
