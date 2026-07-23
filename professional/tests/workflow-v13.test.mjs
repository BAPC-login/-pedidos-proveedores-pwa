import assert from 'node:assert/strict';
import {deliveryDateForSupplier,normalizeCategoryOrder,operationalNotifications,publicOrderState,reconciliationAssessment} from '../worker/src/workflow-rules.js';

assert.equal(publicOrderState('draft'),'editing');
assert.equal(publicOrderState('requested'),'emitted');
assert.equal(publicOrderState('approved'),'emitted');
assert.equal(publicOrderState('received'),'received');
assert.equal(publicOrderState('closed'),'received');

assert.equal(deliveryDateForSupplier({deliveryDate:'2026-07-25',deliveryDates:{ccu:'2026-07-24'}},'ccu'),'2026-07-24');
assert.equal(deliveryDateForSupplier({deliveryDate:'2026-07-25',deliveryDates:{}},'desa'),'2026-07-25');
assert.equal(deliveryDateForSupplier({deliveryDate:'no-valida'},'desa'),null);

assert.deepEqual(normalizeCategoryOrder(['b','b','invalid','a'],['a','b','c']),['b','a','c']);
const matched=reconciliationAssessment({ordered:12,invoiced:12,expectedPrice:1000,invoicedPrice:1005,priceTolerancePct:1});
assert.equal(matched.status,'matched');
const review=reconciliationAssessment({ordered:12,invoiced:10,expectedPrice:1000,invoicedPrice:1200,quantityTolerancePct:5,priceTolerancePct:3});
assert.equal(review.status,'review');assert.equal(review.quantityIssue,true);assert.equal(review.priceIssue,true);

const notifications=operationalNotifications([
  {id:'draft-1',batchId:'batch-1',status:'draft',supplierName:'CCU'},
  {id:'sent-1',status:'requested',supplierName:'DESA',deliveryDate:'2026-07-20',receptionCount:0,invoiceCount:0}
],'2026-07-23');
assert.equal(notifications.some(item=>item.type==='draft_batch'),true);
assert.equal(notifications.some(item=>item.type==='late_order'),true);
assert.equal(notifications.some(item=>item.type==='missing_invoice'),true);

console.log('workflow v13 tests: OK');
