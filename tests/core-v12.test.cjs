const assert=require('node:assert/strict');
const core=require('../core-v12.js');

assert.equal(core.parsePackFromText('MISTRAL35-1000CCX12=1'),12,'detecta caja x12');
assert.equal(core.parseLine('MISTRAL35-1000CCX12=1 120.000',1.19).units,12,'convierte una caja a 12 botellas');
assert.equal(core.parseLine('MISTRAL35-1000CCX12=1 120.000',1.19).grossUnitPrice,11900,'calcula precio final por botella');

const totals=core.extractTotals('TOTAL NETO 100.000\nIVA 19% 19.000\nTOTAL 119.000');
assert.equal(totals.taxFactor,1.19,'calcula factor de impuesto');

const summary=core.matchInvoice('FACTURA ELECTRONICA N 445566\nMISTRAL35-1000CCX12=1 120.000\nTOTAL NETO 120.000\nIVA 22.800\nTOTAL 142.800',[{productId:'p1',description:'PISCO MISTRAL 35',unit:'CAJA (12)'}]);
assert.equal(summary.invoiceNumber,'445566');
assert.equal(summary.lines.length,1,'coteja el producto de la factura');
assert.equal(summary.lines[0].productId,'p1');
assert.equal(summary.lines[0].receivedOrderQty,1,'registra una caja recibida');
assert.equal(summary.lines[0].grossUnitPrice,11900,'precio con IVA por botella');

const existing=['MDR-260716-001','MDR-260716-003'];
assert.equal(core.allocateFolio(existing,'MDR',new Date(2026,6,16)),'MDR-260716-002','reutiliza el primer folio libre');
assert.equal(core.invoiceDisplayName('Coca-Cola','12345','foto.jpeg'),'COCA_COLA_FACTURA_12345.jpeg');
console.log('core-v12 tests: OK');
