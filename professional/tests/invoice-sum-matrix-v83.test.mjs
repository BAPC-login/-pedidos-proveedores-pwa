import assert from 'node:assert/strict';
import {reconcileInvoicePricing} from '../worker/src/invoice-pricing-matrix.js';

const gross=[{invoiceQuantity:2,totalUnits:2,netLineTotal:70200},{invoiceQuantity:1,totalUnits:1,netLineTotal:30400}];
const grossResult=reconcileInvoicePricing(gross,{net:84538,vat:16062,total:100600},[]);
assert.equal(grossResult.method,'printed-line-sum-matrix');
assert.equal(grossResult.documentTotalComputed,100600);
assert.equal(gross[0].grossLineTotal,70200);
assert.equal(gross[1].grossLineTotal,30400);

const net=[{invoiceQuantity:2,totalUnits:2,netLineTotal:59000},{invoiceQuantity:1,totalUnits:1,netLineTotal:25000}];
const netResult=reconcileInvoicePricing(net,{net:84000,vat:15960,total:99960},[]);
assert.equal(netResult.method,'printed-line-sum-matrix');
assert.equal(netResult.documentTotalComputed,99960);
assert.equal(net.reduce((sum,line)=>sum+line.allocatedVat,0),15960);
assert.equal(net.reduce((sum,line)=>sum+line.grossLineTotal,0),99960);

console.log('v83 invoice sum matrix: OK');
