import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reconcileInvoicePricing} from '../worker/src/invoice-pricing-matrix.js';
const corpus=JSON.parse(fs.readFileSync(new URL('./fixtures/invoice-benchmark-v84.json',import.meta.url),'utf8'));
let correct=0,verified=0;
const failures=[];
for(const sample of corpus){
  const lines=structuredClone(sample.lines),warnings=[];
  const result=reconcileInvoicePricing(lines,sample.totals,warnings);
  const gross=lines.filter(line=>!line.isFree).reduce((sum,line)=>sum+Number(line.grossLineTotal||0),0);
  const vat=lines.reduce((sum,line)=>sum+Number(line.allocatedVat||line.vatLine||0),0);
  const freight=lines.reduce((sum,line)=>sum+Number(line.allocatedFreight||line.freightLine||0),0);
  const additionalTax=lines.reduce((sum,line)=>sum+Number(line.allocatedAdditionalTax||line.additionalTaxLine||0),0);
  const checks=[result.verified===sample.expected.verified,gross===sample.expected.grossTotal,result.method===sample.expected.method];
  if(sample.expected.vat!==undefined)checks.push(vat===sample.expected.vat);
  if(sample.expected.freight!==undefined)checks.push(freight===sample.expected.freight);
  if(sample.expected.additionalTax!==undefined)checks.push(additionalTax===sample.expected.additionalTax);
  if(result.verified)verified++;
  if(checks.every(Boolean))correct++;else failures.push({id:sample.id,result:{method:result.method,verified:result.verified,gross,vat,freight,additionalTax},expected:sample.expected,warnings});
}
const accuracy=correct/corpus.length,verificationRate=verified/corpus.length;
assert.ok(corpus.length>=12,'benchmark seed corpus must contain at least 12 representative cases');
assert.ok(accuracy>=.99,`invoice pricing benchmark accuracy ${(accuracy*100).toFixed(1)}% < 99%. ${JSON.stringify(failures)}`);
assert.ok(verificationRate>=.95,`invoice verification rate ${(verificationRate*100).toFixed(1)}% < 95%`);
console.log(`v84 invoice benchmark: ${(accuracy*100).toFixed(1)}% accuracy · ${(verificationRate*100).toFixed(1)}% verified · ${corpus.length} cases`);
