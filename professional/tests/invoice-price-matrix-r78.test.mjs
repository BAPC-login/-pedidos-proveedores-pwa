import assert from 'node:assert/strict';
import {reconcileInvoicePricing} from '../worker/src/invoice-pricing-matrix.js';
const warnings=[];
const lines=[{invoiceQuantity:2,totalUnits:6,netLineTotal:10068,freightLine:1642,vatLine:2225,additionalTaxLine:1812},{invoiceQuantity:32,totalUnits:192,netLineTotal:84652,freightLine:21888,vatLine:20242,additionalTaxLine:15238},{invoiceQuantity:20,totalUnits:120,netLineTotal:56182,freightLine:13680,vatLine:13274,additionalTaxLine:5618},{invoiceQuantity:4,totalUnits:24,netLineTotal:11236,freightLine:2736,vatLine:2655,additionalTaxLine:1124}];
const result=reconcileInvoicePricing(lines,{net:202084,freight:39946,vat:38396,additionalTax:23792,other:0,total:264272},warnings);
assert.equal(result.verified,true);assert.equal(result.documentTotalComputed,264272);assert.equal(result.checksumDelta,0);assert.equal(lines[1].grossLineTotal,142020);assert.equal(lines[1].grossUnitPrice,739.688);
const printed=[{invoiceQuantity:1,totalUnits:6,netLineTotal:50000,printedFinalUnitPrice:14105.2,finalUnitPrice:14105.2,priceSource:'printed-final-unit'},{invoiceQuantity:1,totalUnits:6,netLineTotal:50000,printedFinalUnitPrice:11462.8,finalUnitPrice:11462.8,priceSource:'printed-final-unit'},{invoiceQuantity:1,totalUnits:12,netLineTotal:50000,printedFinalUnitPrice:6677.2,finalUnitPrice:6677.2,priceSource:'printed-final-unit'},{invoiceQuantity:3,totalUnits:18,netLineTotal:50000,printedFinalUnitPrice:8499.7,finalUnitPrice:8499.7,priceSource:'printed-final-unit'}];
const q=reconcileInvoicePricing(printed,{total:386528},[]);assert.equal(q.verified,true);assert.equal(q.method,'printed-final-unit-column');
console.log('r78 adaptive invoice price matrix: OK');
