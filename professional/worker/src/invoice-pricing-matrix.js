import {normalizeInvoiceTotals,reconcileInvoicePricing as reconcileCanonicalPricing} from '../../../worker/src/invoice-cost-reconciliation.js';

export {normalizeInvoiceTotals};
export const INVOICE_PRICING_METHODS=Object.freeze({
  printedFinalUnit:'printed-final-unit-column',
  printedLineSum:'printed-line-sum-matrix',
  componentMatrix:'invoice-line-component-matrix',
  fallback:'document-line-fallback'
});
export const PRINTED_FINAL_UNIT_METHOD=INVOICE_PRICING_METHODS.printedFinalUnit;

export function reconcileInvoicePricing(lines,totals,warnings=[]){
  const result=reconcileCanonicalPricing(lines,totals,warnings);
  if(result.method==='unverified-line-values'){
    result.method=INVOICE_PRICING_METHODS.fallback;
    for(const line of lines||[])if(line?.priceSource==='unverified-line-values')line.priceSource=INVOICE_PRICING_METHODS.fallback;
  }
  return result;
}
