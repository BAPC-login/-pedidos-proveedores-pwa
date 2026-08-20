import {normalizeInvoiceTotals,reconcileInvoicePricing as reconcileCanonicalPricing} from '../../../worker/src/invoice-cost-reconciliation.js';

export {normalizeInvoiceTotals};

export function reconcileInvoicePricing(lines,totals,warnings=[]){
  const result=reconcileCanonicalPricing(lines,totals,warnings);
  if(result.method==='unverified-line-values'){
    result.method='document-line-fallback';
    for(const line of lines||[])if(line?.priceSource==='unverified-line-values')line.priceSource='document-line-fallback';
  }
  return result;
}
