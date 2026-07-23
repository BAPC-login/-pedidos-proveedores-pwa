import fs from 'node:fs';

const file='worker/src/index.js';
let source=fs.readFileSync(file,'utf8');
function replace(from,to,label){
  if(!source.includes(from))throw new Error(`Missing ${label}`);
  source=source.replace(from,to);
}

replace(
`    supplierName: {type: 'STRING'}, supplierRut: {type: 'STRING'}, invoiceNumber: {type: 'STRING'}, invoiceDate: {type: 'STRING'}, currency: {type: 'STRING'},`,
`    supplierName: {type: 'STRING'}, supplierRut: {type: 'STRING'}, invoiceNumber: {type: 'STRING'}, invoiceDate: {type: 'STRING'}, currency: {type: 'STRING'},
    documentType: {type: 'STRING'}, documentTypeCode: {type: 'STRING'},`,
'document type schema');

replace(
`          matchedOrderProductId: {type: 'STRING'}, matchConfidence: {type: 'NUMBER'}, matchReason: {type: 'STRING'}, notes: {type: 'STRING'}`,
`          matchedOrderProductId: {type: 'STRING'}, matchConfidence: {type: 'NUMBER'}, matchReason: {type: 'STRING'}, notes: {type: 'STRING'},
          isFree: {type: 'BOOLEAN'}, freeReason: {type: 'STRING'}`,
'free item schema');

replace(
`        required: ['code','descriptionOriginal','quantityCellRaw','invoiceQuantity','packSize','units','contentMl','alcoholDegree','unitPriceNet','discountPct','netLineTotal','freightLine','vatLine','additionalTaxLine','otherLineCharges','grossLineTotal','matchedOrderProductId','matchConfidence','matchReason','notes']`,
`        required: ['code','descriptionOriginal','quantityCellRaw','invoiceQuantity','packSize','units','contentMl','alcoholDegree','unitPriceNet','discountPct','netLineTotal','freightLine','vatLine','additionalTaxLine','otherLineCharges','grossLineTotal','matchedOrderProductId','matchConfidence','matchReason','notes','isFree','freeReason']`,
'free item required');

replace(
`  required: ['supplierName','invoiceNumber','totals','items','warnings']`,
`  required: ['supplierName','invoiceNumber','documentType','documentTypeCode','totals','items','warnings']`,
'document type required');

replace(
`- Una salida por producto. Excluye flete, impuestos, descuentos, depósitos, garantías y totales.`,
`- Identifica documentType como FACTURA, BOLETA, GUIA_DESPACHO, NOTA_CREDITO u OTRO y documentTypeCode como 33, 39, 52, 61, 34 o 0.
- Una salida por producto. Excluye flete, impuestos, descuentos, depósitos, garantías y totales.`,
'prompt document type');

replace(
`- Lee neto, descuento, flete, IVA, impuesto adicional, otros y total final por línea.
- Números sin símbolos. Ilegible=0 y warning breve.`,
`- Lee neto, descuento, flete, IVA, impuesto adicional, otros y total final por línea.
- isFree=true solo si la línea tiene valor cero, descuento cercano a 100%, o texto SIN CARGO, BONIFICACION, BONIF, GRATIS, MUESTRA o PROMOCIONAL. freeReason explica la señal.
- BOLETA es un tipo de documento y no significa por sí sola que el producto sea gratis. Una bonificación puede venir en factura o guía de despacho.
- Números sin símbolos. Ilegible=0 y warning breve.`,
'prompt free rules');

replace(
`function distributeResidual(lines, targetTotal) {
  const current = lines.reduce((sum, line) => sum + line.grossLineTotal, 0);
  const residual = Math.round(targetTotal - current);
  if (!targetTotal || !lines.length || Math.abs(residual) <= 1) return;
  const basis = lines.reduce((sum, line) => sum + Math.max(0, line.netLineTotal), 0) || lines.length;
  let assigned = 0;
  lines.forEach((line, index) => {
    const share = index === lines.length - 1 ? residual - assigned : Math.round(residual * ((Math.max(0, line.netLineTotal) || 1) / basis));
    line.grossLineTotal = Math.max(0, line.grossLineTotal + share); assigned += share;
  });
}`,
`function documentTypeCode(raw = {}) {
  const explicit = String(raw.documentTypeCode || '').trim();
  if (['33','34','39','52','61'].includes(explicit)) return explicit;
  const label = normalize(raw.documentType || '');
  if (label.includes('GUIA')) return '52';
  if (label.includes('NOTA') && label.includes('CREDITO')) return '61';
  if (label.includes('BOLETA')) return '39';
  if (label.includes('EXENTA')) return '34';
  return label.includes('FACTURA') ? '33' : '0';
}

function freeLineSignal(line, sourceLine, invoiceQuantity) {
  const text = expandAbbreviations(sourceLine);
  const explicit = line.isFree === true;
  const discount = numeric(line.discountPct) >= 99.5;
  const zero = invoiceQuantity > 0 && numeric(line.netLineTotal) === 0 && numeric(line.grossLineTotal) === 0;
  const keyword = /\b(SIN CARGO|BONIFICACION|BONIF|GRATIS|MUESTRA|PROMOCIONAL|CORTESIA)\b/.test(text);
  return explicit || discount || zero || keyword;
}

function distributeResidual(lines, targetTotal) {
  const chargeable = lines.filter(line => !line.isFree);
  const current = chargeable.reduce((sum, line) => sum + line.grossLineTotal, 0);
  const residual = Math.round(targetTotal - current);
  if (!targetTotal || !chargeable.length || Math.abs(residual) <= 1) return;
  const basis = chargeable.reduce((sum, line) => sum + Math.max(0, line.netLineTotal), 0) || chargeable.length;
  let assigned = 0;
  chargeable.forEach((line, index) => {
    const share = index === chargeable.length - 1 ? residual - assigned : Math.round(residual * ((Math.max(0, line.netLineTotal) || 1) / basis));
    line.grossLineTotal = Math.max(0, line.grossLineTotal + share); assigned += share;
  });
}`,
'free helpers and residual');

replace(
`    const netLineTotal = Math.max(0, Math.round(numeric(line.netLineTotal)));
    const freightLine = Math.max(0, Math.round(numeric(line.freightLine)));
    const vatLine = Math.max(0, Math.round(numeric(line.vatLine)));
    const additionalTaxLine = Math.max(0, Math.round(numeric(line.additionalTaxLine)));
    const otherLineCharges = Math.max(0, Math.round(numeric(line.otherLineCharges)));
    const componentTotal = netLineTotal + freightLine + vatLine + additionalTaxLine + otherLineCharges;
    let grossLineTotal = Math.max(0, Math.round(numeric(line.grossLineTotal)));
    if (!grossLineTotal || Math.abs(grossLineTotal - componentTotal) > Math.max(3, componentTotal * .03)) grossLineTotal = componentTotal;`,
`    const isFree = freeLineSignal(line, sourceLine, invoiceQuantity);
    let netLineTotal = Math.max(0, Math.round(numeric(line.netLineTotal)));
    let freightLine = Math.max(0, Math.round(numeric(line.freightLine)));
    let vatLine = Math.max(0, Math.round(numeric(line.vatLine)));
    let additionalTaxLine = Math.max(0, Math.round(numeric(line.additionalTaxLine)));
    let otherLineCharges = Math.max(0, Math.round(numeric(line.otherLineCharges)));
    const componentTotal = netLineTotal + freightLine + vatLine + additionalTaxLine + otherLineCharges;
    let grossLineTotal = Math.max(0, Math.round(numeric(line.grossLineTotal)));
    if (isFree) {
      netLineTotal = 0; freightLine = 0; vatLine = 0; additionalTaxLine = 0; otherLineCharges = 0; grossLineTotal = 0;
    } else if (!grossLineTotal || Math.abs(grossLineTotal - componentTotal) > Math.max(3, componentTotal * .03)) grossLineTotal = componentTotal;`,
'free line totals');

replace(
`      matchReason: String(line.matchReason || match.reason || ''), notes: String(line.notes || ''), engine: 'gemini'`,
`      matchReason: String(line.matchReason || match.reason || ''), notes: String(line.notes || ''),
      isFree, freeReason: isFree ? String(line.freeReason || line.notes || 'Producto sin cargo o bonificado') : '', engine: 'gemini'`,
'free line output');

replace(
`  for (const line of lines) {
    line.grossUnitPrice = line.units ? Math.round(line.grossLineTotal / line.units) : 0;
    line.grossPackPrice = line.invoiceQuantity ? Math.round(line.grossLineTotal / line.invoiceQuantity) : 0;
  }`,
`  for (const line of lines) {
    line.grossUnitPrice = line.isFree ? 0 : (line.units ? Math.round(line.grossLineTotal / line.units) : 0);
    line.grossPackPrice = line.isFree ? 0 : (line.invoiceQuantity ? Math.round(line.grossLineTotal / line.invoiceQuantity) : 0);
  }`,
'free price output');

replace(
`    supplierName: String(raw.supplierName || ''), supplierRut: String(raw.supplierRut || ''), invoiceNumber: String(raw.invoiceNumber || ''),
    invoiceDate: String(raw.invoiceDate || ''), currency: String(raw.currency || 'CLP'), totals, lines,`,
`    supplierName: String(raw.supplierName || ''), supplierRut: String(raw.supplierRut || ''), invoiceNumber: String(raw.invoiceNumber || ''),
    invoiceDate: String(raw.invoiceDate || ''), currency: String(raw.currency || 'CLP'), documentType: String(raw.documentType || ''), documentTypeCode: documentTypeCode(raw), totals, lines,`,
'document type output');

replace(`resolver: 'catalog-v22'`,`resolver: 'catalog-v23-free-items'`,'resolver version');
fs.writeFileSync(file,source,'utf8');
console.log('updated',file);

const procurementFile='professional/web/app-procurement-settings.js';
let procurementSource=fs.readFileSync(procurementFile,'utf8');
const procurementFrom=`  openModal({eyebrow:'AJUSTES · COMPRAS',title:'Bodegas, categorías y unidades',subtitle:'Se configura fuera de la operación. Cada centro conserva su propio recorrido, bodegas y unidades de compra.',size:'large',body:`;
const marker=`onSubmit:async()=>{\n    const center=availableCenters.find(item=>item.id===centerId);const draft=getDraft(centerId);`;
if(!procurementSource.includes(procurementFrom)||!procurementSource.includes(marker))throw new Error('Missing procurement save marker');
procurementSource=procurementSource.replace(marker,`onSubmit:async()=>{\n    syncInputs();\n    const center=availableCenters.find(item=>item.id===centerId);const draft=getDraft(centerId);`);
fs.writeFileSync(procurementFile,procurementSource,'utf8');
console.log('updated',procurementFile);
