import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {receptionPrefill,renderCompactReception} from '../web/reception-compact-v96.js';

const sample={id:'line-a',description:'Pisco Mistral 1 L',orderUnit:'CAJA',unitsPerOrderUnit:6,quantityOrdered:4,quantityReceived:1};
assert.deepEqual(receptionPrefill(sample,null,false),{quantity:3,source:'pedido',pending:3,invoiceQuantity:null});
assert.deepEqual(receptionPrefill(sample,{id:'line-a',invoiced:18},true),{quantity:2,source:'factura',pending:3,invoiceQuantity:3});
assert.equal(receptionPrefill(sample,{id:'line-a',invoiced:120},true).quantity,3,'invoice prefill cannot exceed pending quantity');
assert.equal(receptionPrefill(sample,{id:'line-a',invoiced:0},true).source,'pedido','unmatched invoice line falls back to order');
assert.equal(receptionPrefill({...sample,unitsPerOrderUnit:1,quantityReceived:0,quantityOrdered:1.5},{invoiced:1.245},true).quantity,1.245,'decimal quantities retain precision');
assert.equal(receptionPrefill({...sample,quantityOrdered:2,quantityReceived:5},{invoiced:1},true).quantity,0,'already received items do not prefill negative');

const html=renderCompactReception([sample,{...sample,id:'other',description:'<script>alert(1)</script>'}],[{id:'line-a',invoiced:18}],true);
assert.match(html,/class="v96-reception-list"/);
assert.match(html,/name="accepted"[^>]+value="2"/);
assert.match(html,/data-pending="3"/);
assert.equal((html.match(/data-reception-line=/g)||[]).length,2,'each product is exactly one row');
assert.equal((html.match(/data-v96-reception-toggle/g)||[]).length,2,'each row has its own incident disclosure button');
assert.equal((html.match(/class="v96-reception-extra"/g)||[]).length,2);
assert.equal((html.match(/class="v96-reception-extra"[^>]+hidden/g)||[]).length,2,'every incident panel starts collapsed');
assert.match(html,/name="rejected"/);
for(const name of ['qualityType','qualityNote','lotNumber','expiresAt','temperature','qualityPhoto'])assert.match(html,new RegExp('name="'+name+'"'),name+' kept for backend quality/audit');
assert.match(html,/name="deliveryNoteNumber"/);
assert.match(html,/name="receivedAt"/);
assert.match(html,/name="notes"/);
assert.doesNotMatch(html,/v30-reception-card/,'per-product cards must be removed');
assert.doesNotMatch(html,/<script>/,'product labels must be escaped');
assert.match(html,/&lt;script&gt;/,'malicious descriptions are plain text');

const detail=readFileSync(new URL('../web/app-order-detail-v30.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/reception-compact-v96.css',import.meta.url),'utf8');
const entry=readFileSync(new URL('../web/app-current.css',import.meta.url),'utf8');
assert.match(detail,/renderCompactReception\(items,comparison\?\.items\|\|\[\],hasLinkedInvoice\)/,'order detail uses the compact list');
assert.match(detail,/reconcile-three-way/,'invoice quantities are provided by existing reconciliation API');
assert.match(detail,/name=accepted/,'accepted amounts continue to feed canonical reception API');
assert.match(detail,/name=qualityType/,'incident type continues to be audited');
assert.match(detail,/openOrderDetail\(order\.id\)/,'receipt save refreshes the same order');
assert.doesNotMatch(detail,/toast\('Recepción registrada · el pedido ya puede cerrarse'\);state\.cache\.orders=\[\];await navigate\('orders'\)/,'receipt must not navigate away from current order');
assert.match(css,/\.v96-reception-extra\[hidden\]/,'collapsed incident panels never reserve card space');
assert.match(entry,/reception-compact-v96\.css/,'compact layout styles must be loaded');

console.log('compact reception v96: OK · editable suggested quantities, collapsible incidents and order context preserved');
