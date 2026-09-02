import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reconcileInvoicePricing} from '../worker/src/invoice-pricing-matrix.js';
import {normalizeInvoiceAnalysis} from '../worker/src/invoice-normalizer.js';

// Matriz por línea: Neto + Flete + IVA + impuesto adicional ya viene por producto.
const warnings=[];
const lines=[
  {invoiceQuantity:2,totalUnits:6,netLineTotal:10068,freightLine:1642,vatLine:2225,additionalTaxLine:1812},
  {invoiceQuantity:32,totalUnits:192,netLineTotal:84652,freightLine:21888,vatLine:20242,additionalTaxLine:15238},
  {invoiceQuantity:20,totalUnits:120,netLineTotal:56182,freightLine:13680,vatLine:13274,additionalTaxLine:5618},
  {invoiceQuantity:4,totalUnits:24,netLineTotal:11236,freightLine:2736,vatLine:2655,additionalTaxLine:1124}
];
const result=reconcileInvoicePricing(lines,{net:202084,freight:39946,vat:38396,additionalTax:23792,other:0,total:264272},warnings);
assert.equal(result.verified,true);
assert.equal(result.balanced,true);
assert.equal(result.documentTotalComputed,264272);
assert.equal(result.formulaExtendedTotal,264272);
assert.equal(result.checksumDelta,0);
assert.equal(lines[1].grossLineTotal,142020);
assert.equal(lines[1].grossUnitPrice,739.688);
assert.equal(lines[1].finalQuantityBasis,'physical_units');
assert.equal(Math.round(lines.reduce((sum,line)=>sum+line.finalQuantity*line.finalUnitPrice,0)),264272);

// Formato donde el precio final impreso es por unidad física: debe usar totalUnits, no Cantidad de cajas.
const physicalPrinted=[
  {invoiceQuantity:1,totalUnits:6,netLineTotal:50000,printedFinalUnitPrice:14105.2,finalUnitPrice:14105.2},
  {invoiceQuantity:1,totalUnits:6,netLineTotal:50000,printedFinalUnitPrice:11462.8,finalUnitPrice:11462.8},
  {invoiceQuantity:1,totalUnits:12,netLineTotal:50000,printedFinalUnitPrice:6677.2,finalUnitPrice:6677.2},
  {invoiceQuantity:3,totalUnits:18,netLineTotal:50000,printedFinalUnitPrice:8499.7,finalUnitPrice:8499.7}
];
const physicalResult=reconcileInvoicePricing(physicalPrinted,{total:386528},[]);
assert.equal(physicalResult.verified,true);
assert.equal(physicalResult.sourceFinalPriceBasis,'physical_units');
assert.equal(physicalResult.finalQuantityBasis,'physical_units');
assert.equal(physicalResult.checksumDelta,0);
assert.ok(physicalPrinted.every(line=>line.finalQuantityBasis==='physical_units'));

// Formato VCT-like: Precio Unit. Bruto Final corresponde a la Cantidad facturada (ej. CA), no a botellas del pack.
const billedPrinted=[
  {invoiceQuantity:1,totalUnits:6,printedFinalUnitPrice:93600,finalUnitPrice:93600},
  {invoiceQuantity:1,totalUnits:12,printedFinalUnitPrice:25335,finalUnitPrice:25335},
  {invoiceQuantity:2,totalUnits:24,printedFinalUnitPrice:83161,finalUnitPrice:83161}
];
const billedTotal=93600+25335+2*83161;
const billedResult=reconcileInvoicePricing(billedPrinted,{total:billedTotal},[]);
assert.equal(billedResult.verified,true);
assert.equal(billedResult.sourceFinalPriceBasis,'invoice_quantity');
assert.equal(billedResult.finalQuantityBasis,'physical_units');
assert.equal(billedResult.formulaExtendedTotal,billedTotal);
assert.ok(billedPrinted.every(line=>line.sourceFinalUnitPriceBasis==='invoice_quantity'&&line.finalQuantityBasis==='physical_units'));
assert.equal(billedPrinted[0].sourcePrintedFinalUnitPrice,93600);
assert.equal(billedPrinted[0].printedFinalUnitPrice,15600);
assert.equal(billedPrinted[2].grossLineTotal,166322);

// Solo netos por línea + impuestos globales: se asignan de forma determinista y la fórmula final debe cerrar.
const globalTax=[
  {invoiceQuantity:1,totalUnits:1,netLineTotal:100},
  {invoiceQuantity:2,totalUnits:2,netLineTotal:200}
];
const globalResult=reconcileInvoicePricing(globalTax,{net:300,vat:57,total:357},[]);
assert.equal(globalResult.verified,true);
assert.equal(globalResult.method,'printed-line-sum-matrix');
assert.equal(Math.round(globalTax.reduce((sum,line)=>sum+line.finalQuantity*line.finalUnitPrice,0)),357);

// La IA puede transcribir una columna explícita como lineTotal + lineTotalKind=net.
// El normalizador debe conservar esa semántica para asignar impuestos/flete globales.
const classifiedNet=normalizeInvoiceAnalysis({invoice:{totals:{net:100000,freight:5000,additionalTax:15000,vat:19950,total:139950},items:[
  {description:'Mistral 35 1000CC X12',quantity:1,packSize:12,lineTotal:50000,lineTotalKind:'net'},
  {description:'Producto E2E',quantity:2,packSize:1,lineTotal:50000,lineTotalKind:'net'}
]}},{products:[]});
assert.equal(classifiedNet.invoice.lines[0].netLineTotal,50000);
assert.equal(classifiedNet.invoice.lines[1].netLineTotal,50000);
assert.equal(classifiedNet.invoice.pricingSummary.verified,true);
assert.equal(classifiedNet.invoice.pricingSummary.method,'printed-line-sum-matrix');
assert.equal(classifiedNet.invoice.pricingSummary.formulaExtendedTotal,139950);

// Un residuo grande sin respaldo en el resumen se puede balancear para costo, pero NO se valida como lectura fidedigna.
const reviewWarnings=[];
const suspicious=[{invoiceQuantity:1,totalUnits:1,netLineTotal:100},{invoiceQuantity:1,totalUnits:1,netLineTotal:200}];
const suspiciousResult=reconcileInvoicePricing(suspicious,{total:900},reviewWarnings);
assert.equal(suspiciousResult.balanced,true);
assert.equal(suspiciousResult.verified,false);
assert.equal(suspiciousResult.formulaExtendedTotal,900);
assert.ok(reviewWarnings.some(message=>/requiere revisión/i.test(message)));

const aiSource=fs.readFileSync(new URL('../worker/src/api/invoice-ai-fast-v88.js',import.meta.url),'utf8');
assert.match(aiSource,/ESTRUCTURA REAL/,'Gemini must identify each invoice structure before interpreting values');
assert.match(aiSource,/PRECIO UNIT\. BRUTO FINAL/,'Gemini must recognize VCT-style final-unit headers');
assert.match(aiSource,/sourcePrintedFinalUnitPrice/,'explicit source final prices need an audit-safe backup through normalization');
assert.match(aiSource,/additionalTaxes/,'multiple IABA/ILA rows must be extracted separately before deterministic aggregation');
assert.match(aiSource,/invoice_quantity/,'AI precheck must test billed-quantity final price basis');
assert.match(aiSource,/physical_units/,'AI precheck must test physical-unit final price basis');
assert.match(aiSource,/Math\.abs\(num\(a\)-num\(b\)\)<=Math\.max\(0,Number\(tolerance\)\|\|0\)/,'AI arithmetic precheck must use explicit fixed tolerance, not percentage drift');

console.log('invoice adaptive structure + final product checksum: OK');
