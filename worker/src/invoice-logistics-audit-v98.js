import {integerCostShares,supplierWeights} from './supplier-cost-allocation.js';

const KNOWN=new Set(['net_value','invoice_quantity','physical_units']);
const nonnegative=value=>Math.max(0,Number(value)||0);
const amount=value=>Math.round(nonnegative(value));
const clean=value=>String(value||'').trim().slice(0,500);

function chargeBasis(lines,kind,charge,proposal,configured){
  const configuredBasis=KNOWN.has(configured)?configured:'';
  const suggestedBasis=KNOWN.has(proposal)?proposal:'unknown';
  if(!charge)return{suggestedBasis,configuredBasis,status:'no_document_charge',verified:false};
  const key=kind==='freight'?'freightLine':'otherLineCharges';
  const explicit=lines.map(line=>amount(line[key]??(kind==='freight'?line.freightLineTotal:undefined)));
  const explicitTotal=explicit.reduce((s,v)=>s+v,0);
  const nets=lines.map(line=>amount(line.readNetLineTotal??line.netLineTotal));
  if(explicitTotal===charge&&suggestedBasis!=='unknown'){
    const weights=supplierWeights(lines,nets,suggestedBasis);
    if(weights?.some(Boolean)){
      const allocation=integerCostShares(charge,weights);
      const delta=allocation.reduce((sum,v,i)=>sum+Math.abs(v-explicit[i]),0);
      if(delta<=2)return{suggestedBasis,configuredBasis,status:'verified_against_printed_line_charges',verified:true,delta};
      return{suggestedBasis,configuredBasis,status:'contradicts_printed_line_charges',verified:false,delta};
    }
  }
  return{suggestedBasis,configuredBasis,status:configuredBasis?'configured_supplier_rule_requires_document_check':'suggestion_requires_review',verified:false};
}

export function auditLogisticsAllocation(lines,totals={},evidence={},supplierPolicy=null){
  const source=evidence&&typeof evidence==='object'?evidence:{},policy=supplierPolicy&&typeof supplierPolicy==='object'?supplierPolicy:{};
  const confidence=Math.max(0,Math.min(1,Number(source.confidence)||0));
  const header=clean(source.evidenceHeader).slice(0,160),text=clean(source.evidenceText);
  const hasQuotedEvidence=Boolean((header||text).length>=5&&confidence>=.8);
  const freight=chargeBasis(lines,'freight',amount(totals.freight),hasQuotedEvidence?source.freightBasis:'unknown',policy.freight);
  const other=chargeBasis(lines,'other',amount(totals.other),hasQuotedEvidence?source.otherBasis:'unknown',policy.other);
  const printed=lines.filter(line=>nonnegative(line.sourcePrintedFinalUnitPrice)>0);
  const mismatch=printed.filter(line=>{
    const unit=nonnegative(line.sourcePrintedFinalUnitPrice),invoiceQty=nonnegative(line.invoiceQuantity),physicalQty=nonnegative(line.totalUnits);
    const actual=nonnegative(line.finalLineTotal??line.grossLineTotal);
    const tolerance=Math.max(2,Math.ceil(Math.max(invoiceQty,physicalQty)/2));
    return Math.min(Math.abs(actual-unit*invoiceQty),Math.abs(actual-unit*physicalQty))>tolerance;
  });
  const needsReview=Boolean(freight.status==='contradicts_printed_line_charges'
    ||other.status==='contradicts_printed_line_charges'||mismatch.length);
  return{freight,other,evidenceHeader:header,evidenceText:text,confidence,hasQuotedEvidence,
    printedUnitPrices:printed.length,printedPriceMismatches:mismatch.length,
    status:needsReview?'needs_review':freight.verified||other.verified?'document_distribution_verified':hasQuotedEvidence?'suggestion_not_automatically_applied':'no_document_allocation_evidence',
    recommendation:needsReview?'Revisar importes impresos antes de aceptar costos':'Usar precios finales impresos cuando cuadren. Aplicar reglas del proveedor cuando falte evidencia por línea.',
    reviewStatus:needsReview?'needs_review':'informational'};
}
