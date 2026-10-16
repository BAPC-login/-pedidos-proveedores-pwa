import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileInvoicePricing} from '../../worker/src/invoice-cost-reconciliation.js';
import {auditLogisticsAllocation} from '../../worker/src/invoice-logistics-audit-v98.js';
import {buildInternalInvoiceXml,parseInternalInvoiceXml,validateInternalInvoiceXml,processInternalInvoiceXml} from '../worker/src/invoice-xml-evidence-v96.js';

const printed=[
  {invoiceQuantity:1,totalUnits:1,netLineTotal:1000,sourcePrintedFinalUnitPrice:1100},
  {invoiceQuantity:1,totalUnits:1,netLineTotal:1000,sourcePrintedFinalUnitPrice:1100}
];
const warnings=[];
const inconsistent=reconcileInvoicePricing(printed,{net:2000,vat:380,total:2380},warnings,null);
assert.equal(inconsistent.balanced,true,'document totals may balance');
assert.equal(inconsistent.verified,false,'never approve gross unit prices contradictory to printed ones');
assert.deepEqual(inconsistent.printedFinalPriceMismatches,[1,2]);
assert.ok(warnings.some(msg=>msg.includes('precio')||msg.includes('Precio')));

const allocationRows=[
  {invoiceQuantity:2,totalUnits:12,netLineTotal:2000,freightLine:200,sourcePrintedFinalUnitPrice:0},
  {invoiceQuantity:1,totalUnits:12,netLineTotal:1000,freightLine:100,sourcePrintedFinalUnitPrice:0}
];
const hinted={freightBasis:'invoice_quantity',otherBasis:'unknown',freightIncludedInNet:'no',
  evidenceHeader:'FLETE POR BULTO',evidenceText:'FLETE DISTRIBUIDO SEGÚN BULTOS',confidence:0.92};
const allocation=auditLogisticsAllocation(allocationRows,{freight:300},hinted,
  {freight:'invoice_quantity',other:'net_value'});
assert.equal(allocation.freight.verified,true,'documentary charges confirm distribution');
assert.equal(allocation.freight.delta,0);
assert.equal(allocation.status,'document_distribution_verified');
const unsupported=auditLogisticsAllocation(allocationRows,{freight:300},{...hinted,evidenceHeader:'',evidenceText:'',confidence:0.99},null);
assert.equal(unsupported.freight.verified,false,'model suggestion without literal evidence cannot be applied');
assert.equal(unsupported.freight.suggestedBasis,'unknown');
const contradiction=auditLogisticsAllocation(allocationRows,{freight:300},{...hinted,freightBasis:'physical_units'},null);
assert.equal(contradiction.freight.verified,false);
assert.equal(contradiction.status,'needs_review');

const original={documentMathVerified:true,invoice:{
  invoiceNumber:'200',supplierName:'Distribuidora & Cía.',supplierRut:'76000000-K',invoiceDate:'2026-10-15',currency:'CLP',
  documentTypeCode:'33',totals:{subtotal:1000,net:1000,freight:0,vat:190,additionalTax:0,other:0,total:1190},
  logisticsEvidence:{...hinted,reviewStatus:'informational',recommendation:'Cotejo validado'},
  pricingSummary:{verified:true,balanced:true,method:'printed-final-unit-column',checksumDelta:0},
  lines:[{id:'item1',productId:'catalog-001',description:'Caja 1L x 6',
    sourceDescription:'CAJA 1 L X6',invoiceQuantity:1,packSize:6,totalUnits:6,
    netLineTotal:1000,grossLineTotal:1190,finalLineTotal:1190,finalUnitPrice:198.333333,
    sourcePrintedFinalUnitPrice:1190,priceSource:'printed-final-unit',readConfidence:0.98,
    allocatedFreight:0,allocatedVat:190,allocatedAdditionalTax:0,allocatedOtherCharges:0}]}
};
const xml=buildInternalInvoiceXml(original);
assert.match(xml,/origin="photo-derived" authenticatedDTE="false" version="2"/);
assert.match(xml,/Distribuidora &amp; Cía\./);
assert.match(xml,/<LogisticsEvidence>/);
const parsed=parseInternalInvoiceXml(xml);
assert.equal(parsed.invoice.lines[0].invoiceQuantity,1);
assert.equal(parsed.invoice.lines[0].grossLineTotal,1190);
assert.equal(parsed.invoice.logisticsEvidence.freightBasis,'invoice_quantity');
assert.equal(validateInternalInvoiceXml(xml,original).valid,true);
const processed=processInternalInvoiceXml(original,xml);
assert.equal(processed.internalXmlProcessed,true);
assert.equal(processed.invoice.lines[0].productId,'catalog-001','XML round-trip must preserve canonical product mapping');
assert.equal(processed.invoice.lines[0].sourcePrintedFinalUnitPrice,1190);
assert.equal(processed.invoice.totals.total,1190);
assert.throws(()=>parseInternalInvoiceXml('<!DOCTYPE foo><NuvastoInvoiceEvidence/>'),/inválido|excesivo/);
assert.throws(()=>parseInternalInvoiceXml('<DTE><Documento/></DTE>'),/no es un XML interno/);
const tampered=xml.replace('<grossLineTotal>1190</grossLineTotal>','<grossLineTotal>1170</grossLineTotal>');
assert.throws(()=>validateInternalInvoiceXml(tampered,original),/difiere/,'tampered totals must be rejected');

const fast=readFileSync(new URL('../worker/src/api/invoice-ai-fast-v88.js',import.meta.url),'utf8');
const asyncCode=readFileSync(new URL('../worker/src/api/invoice-async-v96.js',import.meta.url),'utf8');
const normalizer=readFileSync(new URL('../worker/src/invoice-normalizer.js',import.meta.url),'utf8');
const qa=readFileSync(new URL('../scripts/qa-copy-catalog-v98.mjs',import.meta.url),'utf8');
assert.match(fast,/logisticsEvidence/);
assert.match(fast,/No inventes productos/);
assert.match(fast,/No distribuyas impuestos ni fletes/i);
assert.match(asyncCode,/processInternalInvoiceXml/,'async worker consumes parsed XML before publishing');
assert.match(normalizer,/auditLogisticsAllocation/);
assert.match(qa,/method!=='GET'&&base===SOURCE/,'production-side writes prohibited');
assert.match(qa,/targetHealth\.environment!=='development'/,'target environment guarded');
assert.match(qa,/me\.organization\?\.name!=='Nuvasto QA'/,'target must be QA account');
assert.match(qa,/mode:'merge'/,'never wipe QA seed catalog');
assert.doesNotMatch(qa,/contactName|supplierRut|sourceInvoice/,'contacts and financial documents are excluded');
console.log('invoice logistics + XML round-trip + one-way QA catalog v98: OK');