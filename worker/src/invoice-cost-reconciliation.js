import {supplierWeights,integerCostShares,validateSupplierCostPolicy} from './supplier-cost-allocation.js';

const num = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? '').trim().replace(/\s|\$/g, '');
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (raw.includes(',')) raw = raw.replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const peso = value => Math.round(num(value));
const round3 = value => Math.round(num(value) * 1000) / 1000;
const round6 = value => Math.round(num(value) * 1e6) / 1e6;
const positive = value => Math.max(0, num(value));
const toleranceFor = _total => 2;

export function normalizeInvoiceTotals(raw = {}) {
  return {
    subtotal: Math.max(0, peso(raw.subtotal ?? raw.subTotal)),
    discount: Math.max(0, peso(raw.discount ?? raw.discounts ?? raw.totalDiscounts)),
    net: Math.max(0, peso(raw.net)),
    freight: Math.max(0, peso(raw.freight)),
    vat: Math.max(0, peso(raw.vat ?? raw.tax)),
    additionalTax: Math.max(0, peso(raw.additionalTax)),
    other: Math.max(0, peso(raw.other ?? raw.otherCharges ?? raw.serviceLogistics)),
    exempt: Math.max(0, peso(raw.exempt)),
    total: Math.max(0, peso(raw.total))
  };
}

function sum(values) { return values.reduce((total, value) => total + num(value), 0); }
function lineInvoiceQuantity(line) { return positive(line.invoiceQuantity ?? line.packageQty ?? line.quantity); }
function linePhysicalQuantity(line) {
  const explicit = positive(line.totalUnits ?? line.units);
  if (explicit) return explicit;
  const invoice = lineInvoiceQuantity(line), pack = Math.max(1, positive(line.packSize) || 1);
  return invoice * pack;
}
function rawNet(line) { return Math.max(0, peso(line.readNetLineTotal ?? line.netLineTotal ?? line.netTotal)); }
function rawGross(line) { return Math.max(0, peso(line.readGrossLineTotal ?? line.grossLineTotal ?? line.grossTotal ?? line.lineTotal ?? line.total)); }
function componentTotal(line) {
  return rawNet(line)
    + Math.max(0, peso(line.freightLine ?? line.freightLineTotal))
    + Math.max(0, peso(line.vatLine ?? line.taxLineTotal ?? line.taxTotal))
    + Math.max(0, peso(line.additionalTaxLine ?? line.additionalTaxLineTotal ?? line.additionalTax))
    + Math.max(0, peso(line.otherLineCharges));
}
function printedFinal(line) { return positive(line.printedFinalUnitPrice) || positive(line.sourcePrintedFinalUnitPrice) || positive(line.finalUnitPrice); }

function integerShares(total, weights) {
  const target = Math.max(0, peso(total));
  const safe = weights.map(value => Math.max(0, num(value)));
  if (!safe.length) return [];
  const basis = sum(safe);
  if (!target) return safe.map(() => 0);
  if (!basis) {
    const base = Math.floor(target / safe.length), output = safe.map(() => base);
    for (let index = 0; index < target - base * output.length; index++) output[index % output.length]++;
    return output;
  }
  const exact = safe.map(value => target * value / basis);
  const output = exact.map(Math.floor);
  let remainder = target - sum(output);
  const ranking = exact.map((value, index) => ({index, fraction: value - output[index]}))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index++) output[ranking[index % ranking.length].index]++;
  return output;
}

function allocateResidual(baseTotals, target, weights) {
  const base = baseTotals.map(value => Math.max(0, peso(value)));
  const wanted = Math.max(0, peso(target));
  const current = sum(base);
  if (!wanted || !base.length || current === wanted) return base;
  const residual = wanted - current;
  if (residual > 0) {
    const shares = integerShares(residual, weights);
    return base.map((value, index) => value + shares[index]);
  }
  return integerShares(wanted, base.map((value, index) => value || weights[index] || 1));
}

function inferDocumentFormula(totals) {
  if (!totals.total) return {verified: false, formula: 'sin_total_oficial', computed: 0, delta: 0};
  const candidates = [];
  if (totals.net) {
    candidates.push({formula: 'neto + iva + impuestos_adicionales + otros', computed: totals.net + totals.vat + totals.additionalTax + totals.other});
    candidates.push({formula: 'neto + flete + iva + impuestos_adicionales + otros', computed: totals.net + totals.freight + totals.vat + totals.additionalTax + totals.other});
  }
  if (totals.subtotal) {
    candidates.push({formula: 'subtotal - descuentos + flete + iva + impuestos_adicionales + otros', computed: totals.subtotal - totals.discount + totals.freight + totals.vat + totals.additionalTax + totals.other});
  }
  if (!candidates.length) return {verified: false, formula: 'total_oficial_sin_componentes_suficientes', computed: 0, delta: totals.total};
  for (const candidate of candidates) candidate.delta = totals.total - candidate.computed;
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  const best = candidates[0], tolerance = toleranceFor(totals.total);
  return {...best, verified: Math.abs(best.delta) <= tolerance};
}

function applyFinalPricing(lines, lineTotals, options) {
  const {
    targetTotal = 0,
    basis = 'invoice_quantity',
    method = 'derived',
    linePriceSource = method,
    taxAllocationMethod = '',
    verified = false,
    sourceBase = [],
    warnings = [],
    documentFormula = null,
    printedBasis = ''
  } = options;
  lines.forEach((line, index) => {
    const sourcePrintedFinalUnitPrice = round6(printedFinal(line));
    const invoiceQty = lineInvoiceQuantity(line), physicalQty = linePhysicalQuantity(line);
    const sourceQuantityBasis = basis === 'physical_units' ? 'physical_units' : 'invoice_quantity';
    const sourceQuantity = sourceQuantityBasis === 'physical_units' ? physicalQty : invoiceQty;
    const finalLineTotal = Math.max(0, peso(lineTotals[index]));
    const canonicalQuantity = physicalQty || invoiceQty;
    const canonicalUnit = canonicalQuantity > 0 ? round6(finalLineTotal / canonicalQuantity) : 0;
    const sourceEffectiveUnit = sourceQuantity > 0 ? round6(finalLineTotal / sourceQuantity) : 0;
    line.invoiceQuantity = invoiceQty;
    line.packageQty = invoiceQty;
    line.totalUnits = physicalQty;
    line.units = physicalQty;
    line.sourceFinalUnitPriceBasis = printedBasis || sourceQuantityBasis;
    line.finalQuantityBasis = 'physical_units';
    line.finalQuantity = canonicalQuantity;
    line.finalLineTotal = finalLineTotal;
    line.effectiveFinalUnitPrice = canonicalUnit;
    line.sourceEffectiveFinalUnitPrice = sourceEffectiveUnit;
    if (sourcePrintedFinalUnitPrice > 0) line.sourcePrintedFinalUnitPrice = sourcePrintedFinalUnitPrice;
    if (line.sourceFinalUnitPriceHeader) line.finalUnitPriceHeader = String(line.sourceFinalUnitPriceHeader);
    line.finalUnitPrice = canonicalUnit;
    line.printedFinalUnitPrice = sourcePrintedFinalUnitPrice > 0 ? canonicalUnit : 0;
    line.grossLineTotal = finalLineTotal;
    line.grossPackPrice = invoiceQty > 0 ? round3(finalLineTotal / invoiceQty) : 0;
    line.grossUnitPrice = round3(canonicalUnit);
    line.priceSource = sourcePrintedFinalUnitPrice > 0
      ? (sourceQuantityBasis === 'physical_units' ? 'printed-final-unit' : 'printed-final-billed-unit-converted')
      : linePriceSource;
    if (taxAllocationMethod) line.taxAllocationMethod = taxAllocationMethod;
    line.priceVerified = Boolean(verified);
    line.allocationAdjustment = finalLineTotal - Math.max(0, peso(sourceBase[index]));
    line.pricingAudit = {
      sourceBase: Math.max(0, peso(sourceBase[index])),
      allocationAdjustment: line.allocationAdjustment,
      sourcePrintedFinalUnitPrice,
      sourceFinalUnitPriceBasis: printedBasis || '',
      sourceEffectiveFinalUnitPrice: sourceEffectiveUnit,
      finalQuantityBasis: 'physical_units',
      finalQuantity: canonicalQuantity,
      finalUnitPrice: canonicalUnit,
      finalLineTotal
    };
  });
  const lineTotalSum = sum(lines.map(line => line.finalLineTotal));
  const formulaExtendedTotal = round3(sum(lines.map(line => line.finalQuantity * line.finalUnitPrice)));
  const target = Math.max(0, peso(targetTotal));
  const checksumDelta = target ? round3(target - formulaExtendedTotal) : 0;
  const lineDelta = target ? target - lineTotalSum : 0;
  const tolerance = toleranceFor(target);
  const balanced = Boolean(target) && Math.abs(checksumDelta) <= tolerance && Math.abs(lineDelta) <= tolerance;
  if (target && !balanced) warnings.push(`La cuadratura final por productos no cierra: ${formulaExtendedTotal} vs ${target}.`);
  return {
    verified: Boolean(verified && balanced),
    balanced,
    method,
    totals: options.totals,
    documentFormula,
    sourceFinalPriceBasis: printedBasis || '',
    finalQuantityBasis: 'physical_units',
    targetTotal: target,
    documentTotalComputed: lineTotalSum,
    formulaExtendedTotal,
    checksumDelta,
    lineChecksumDelta: lineDelta,
    tolerance,
    formula: 'Σ(cantidad_producto × precio_final_unitario_producto) = total_factura'
  };
}

// Printed final unit prices take precedence over inferred/allocated prices.
// If a printed value cannot reproduce a saved gross line total on either documented
// quantity basis, stop automatic cost approval instead of hiding the disagreement.
function applyGuardedFinalPricing(lines,amounts,options){
  const outcome=applyFinalPricing(lines,amounts,options),mismatches=[];
  for(const [index,line] of lines.entries()){
    const printed=positive(line.sourcePrintedFinalUnitPrice);
    if(!printed)continue;
    const billed=lineInvoiceQuantity(line),physical=linePhysicalQuantity(line),amount=positive(line.finalLineTotal);
    const allowance=Math.max(2,Math.ceil(Math.max(billed,physical)/2));
    if(Math.min(Math.abs(amount-printed*billed),Math.abs(amount-printed*physical))>allowance){
      line.priceVerified=false;
      mismatches.push(index+1);
    }
  }
  if(mismatches.length){
    outcome.verified=false;
    outcome.printedFinalPriceMismatches=mismatches;
    options.warnings?.push('Precio final unitario impreso incompatible con el total bruto calculado en líneas '+mismatches.join(', ')+'. Se requiere revisión; no se acepta prorrata automática.');
  }
  return outcome;
}

export function reconcileInvoicePricing(inputLines, rawTotals, warnings = [], supplierCostPolicy = null) {
  const policy=supplierCostPolicy?validateSupplierCostPolicy(supplierCostPolicy):null;
  let allocationNeedsReview=false;
  const totals = normalizeInvoiceTotals(rawTotals);
  const documentFormula = inferDocumentFormula(totals);
  const lines = inputLines.filter(line => !line.isFree && (lineInvoiceQuantity(line) > 0 || linePhysicalQuantity(line) > 0));
  const target = totals.total;
  const tolerance = toleranceFor(target);
  if (!lines.length) return {verified: false, balanced: false, method: 'no-priced-lines', totals, documentFormula, targetTotal: target, documentTotalComputed: 0, formulaExtendedTotal: 0, checksumDelta: target, lineChecksumDelta: target, tolerance, formula: 'Σ(cantidad_final × precio_final_unitario) = total_factura'};

  const printed = lines.filter(line => printedFinal(line) > 0);
  if (target && printed.length === lines.length) {
    const invoiceExact = sum(lines.map(line => printedFinal(line) * lineInvoiceQuantity(line)));
    const physicalExact = sum(lines.map(line => printedFinal(line) * linePhysicalQuantity(line)));
    const invoiceDelta = target - invoiceExact, physicalDelta = target - physicalExact;
    const basis = Math.abs(invoiceDelta) <= Math.abs(physicalDelta) ? 'invoice_quantity' : 'physical_units';
    const bestExact = basis === 'invoice_quantity' ? invoiceExact : physicalExact;
    const bestDelta = target - bestExact;
    if (Math.abs(bestDelta) <= tolerance) {
      const exactLineTotals = lines.map(line => printedFinal(line) * (basis === 'invoice_quantity' ? lineInvoiceQuantity(line) : linePhysicalQuantity(line)));
      const rounded = exactLineTotals.map(peso);
      const adjusted = allocateResidual(rounded, target, exactLineTotals.map(value => Math.max(1, value)));
      const summary = applyFinalPricing(lines, adjusted, {targetTotal: target, basis, method: 'printed-final-unit-column', linePriceSource: 'printed-final-unit', taxAllocationMethod: basis === 'physical_units' ? 'supplier-total-x-unidad' : 'supplier-final-unit-verified', verified: true, sourceBase: rounded, warnings, documentFormula, printedBasis: basis, totals});
      summary.sourceExtendedExact = round3(bestExact);
      summary.sourceExtendedRounded = peso(bestExact);
      summary.sourceChecksumDelta = target - peso(bestExact);
      summary.extendedExact = peso(bestExact);
      return summary;
    }
    warnings.push(`Los precios finales impresos no cuadran con el total usando cantidad facturada (${round3(invoiceExact)}) ni unidades físicas (${round3(physicalExact)}). Se recalculará el costo efectivo sin alterar los valores impresos.`);
  } else if (printed.length) {
    warnings.push(`Solo ${printed.length} de ${lines.length} líneas tienen precio final unitario legible; se usará la matriz completa del documento para cuadrar.`);
  }

  if (target) {
    const readGross = lines.map(rawGross);
    const grossSum = sum(readGross);
    if (readGross.every(value => value > 0) && Math.abs(target - grossSum) <= tolerance) {
      const adjusted = allocateResidual(readGross, target, readGross);
      return applyGuardedFinalPricing(lines, adjusted, {targetTotal: target, basis: 'invoice_quantity', method: 'printed-final-line-totals', verified: true, sourceBase: readGross, warnings, documentFormula, totals});
    }

    const components = lines.map(componentTotal);
    const componentSum = sum(components);
    if (components.every(value => value > 0) && Math.abs(target - componentSum) <= tolerance) {
      const adjusted = allocateResidual(components, target, components);
      return applyGuardedFinalPricing(lines, adjusted, {targetTotal: target, basis: 'invoice_quantity', method: 'printed-line-sum-matrix', verified: true, sourceBase: components, warnings, documentFormula, totals});
    }

    const nets = lines.map(rawNet);
    const netSum = sum(nets);
    if (nets.every(value => value > 0) && totals.net && Math.abs(netSum - totals.net) <= tolerance && documentFormula.verified) {
      const freightOutside = /\+ flete /.test(` ${documentFormula.formula} `);
      // Keep explicit printed charges separate from allocation assumptions.
      const allocate=(amount,kind,fallback)=>{
        if(!amount)return nets.map(()=>0);
        if(!policy)return integerShares(amount,fallback);
        const weights=supplierWeights(lines,nets,policy[kind]);
        if(weights&&weights.some(value=>value>0))return integerCostShares(amount,weights);
        allocationNeedsReview=true;
        warnings.push('El proveedor no tiene evidencia suficiente para distribuir '+kind+'; revisar costos antes de confirmar.');
        return integerShares(amount,fallback);
      };
      // Line-level charges printed on the document override proration methods.
      // This matters whenever a provider spreads logistics non-proportionally.
      const explicitComponent=(amount,fields)=>{
        if(!amount)return null;
        const visible=lines.map(line=>fields.map(key=>line[key]).find(value=>value!==undefined&&value!==null&&String(value).trim()!==''));
        if(!visible.some(value=>positive(value)>0))return null;
        const values=visible.map(value=>Math.max(0,peso(value)));
        return Math.abs(sum(values)-amount)<=tolerance?allocateResidual(values,amount,values):null;
      };
      const freightPrinted=freightOutside?explicitComponent(totals.freight,['freightLine','freightLineTotal']):null;
      const vatPrinted=explicitComponent(totals.vat,['vatLine','taxLineTotal']);
      const additionalPrinted=explicitComponent(totals.additionalTax,['additionalTaxLine','additionalTaxLineTotal']);
      const otherPrinted=explicitComponent(totals.other,['otherLineCharges']);
      const freightShares = freightOutside ? (freightPrinted||allocate(totals.freight,'freight',nets)) : nets.map(() => 0);
      const vatShares = vatPrinted||allocate(totals.vat,'vat',nets.map((value,index)=>value+freightShares[index]));
      const additionalShares = additionalPrinted||allocate(totals.additionalTax,'additionalTax',nets);
      const otherShares = otherPrinted||allocate(totals.other,'other',nets);
      let adjusted = nets.map((value, index) => value + freightShares[index] + vatShares[index] + additionalShares[index] + otherShares[index]);
      adjusted = allocateResidual(adjusted, target, nets);
      lines.forEach((line, index) => {
        line.allocatedFreight = freightShares[index];
        line.allocatedVat = vatShares[index];
        line.allocatedAdditionalTax = additionalShares[index];
        line.allocatedOtherCharges = otherShares[index] + (adjusted[index] - (nets[index] + freightShares[index] + vatShares[index] + additionalShares[index] + otherShares[index]));
        line.allocatedDocumentCharges = adjusted[index] - nets[index];
        line.taxAllocationMethod = (freightPrinted||vatPrinted||additionalPrinted||otherPrinted)?'printed-line-component-evidence-v98':policy?'supplier-cost-policy-v96':'document-total-sum-check';
        if(policy)line.supplierCostPolicy={...policy};
      });
      const explicitLineTotal = lines.some(line => /\b(?:VALOR\s+TOTAL|TOTAL\s+(?:LINEA|LÍNEA|ITEM)|IMPORTE\s+TOTAL|TOTAL)\b/i.test(String(line.lineTotalHeader || line.totalHeader || '')));
      const method = lines.length > 1 || explicitLineTotal ? 'printed-line-sum-matrix' : 'invoice-column-matrix-reconciled';
      return applyGuardedFinalPricing(lines, adjusted, {targetTotal: target, basis: 'invoice_quantity', method, linePriceSource: method === 'invoice-column-matrix-reconciled' ? 'invoice-total-tax-allocation' : method, verified: !allocationNeedsReview, sourceBase: nets, warnings, documentFormula, totals});
    }

    const componentEvidence = componentSum > 0 ? components : null;
    const grossEvidence = grossSum > 0 ? readGross : null;
    const netEvidence = netSum > 0 ? nets : null;
    const base = componentEvidence || grossEvidence || netEvidence;
    if (base) {
      const weights = base.map((value, index) => Math.max(1, value || nets[index] || lineInvoiceQuantity(lines[index])));
      const adjusted = allocateResidual(base, target, weights);
      const residual = target - sum(base);
      const ratio = Math.abs(residual) / Math.max(1, target);
      const plausiblyExplained = documentFormula.verified || ratio <= 0.01;
      if (!plausiblyExplained) warnings.push(`La lectura base difiere del total oficial en ${Math.round(residual)}. Se calculó un costo efectivo para cuadratura, pero la extracción requiere revisión.`);
      return applyGuardedFinalPricing(lines, adjusted, {targetTotal: target, basis: 'invoice_quantity', method: plausiblyExplained ? 'adaptive-document-total-allocation' : 'unexplained-total-allocation', verified: plausiblyExplained, sourceBase: base, warnings, documentFormula, totals});
    }
  }

  const fallback = lines.map(line => rawGross(line) || componentTotal(line) || rawNet(line));
  return applyGuardedFinalPricing(lines, fallback, {targetTotal: target, basis: 'invoice_quantity', method: 'unverified-line-values', verified: false, sourceBase: fallback, warnings, documentFormula, totals});
}
