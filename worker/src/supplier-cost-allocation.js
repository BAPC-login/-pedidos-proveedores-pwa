// Deterministic supplier-specific allocation policies. No tax amount is invented:
// all shares add up exactly to the explicit document-level charge.
const METHODS=new Set(['net_value','invoice_quantity','physical_units','manual_review']);
export function validateSupplierCostPolicy(raw={}){
  const value=key=>String(raw[key]||'net_value');
  const policy={freight:value('freight'),other:value('other'),vat:value('vat'),additionalTax:value('additionalTax')};
  for(const [key,method] of Object.entries(policy))if(!METHODS.has(method))throw new Error('Invalid supplier cost allocation policy: '+key);
  return policy;
}
export function supplierWeights(lines,nets,method){
  if(method==='manual_review')return null;
  if(method==='net_value')return nets.map(value=>Math.max(0,Number(value)||0));
  if(method==='invoice_quantity')return lines.map(line=>Math.max(0,Number(line.invoiceQuantity??line.packageQty??line.quantity)||0));
  if(method==='physical_units')return lines.map(line=>Math.max(0,Number(line.totalUnits??line.units??((line.invoiceQuantity??line.packageQty??line.quantity)||0)*(line.packSize||1))||0));
  throw new Error('Unsupported allocation method');
}
export function integerCostShares(amount,weights){
  const total=Math.round(Number(amount)||0);
  if(total<0||!Number.isSafeInteger(total))throw new Error('Invalid nonnegative CLP charge');
  if(!Array.isArray(weights)||!weights.length)return [];
  const values=weights.map(n=>Math.max(0,Number(n)||0)),sum=values.reduce((a,b)=>a+b,0);
  if(!sum&&total)throw new Error('Cannot allocate charge without positive line evidence');
  if(!total)return values.map(()=>0);
  const exact=values.map(v=>v*total/sum),rounded=exact.map(Math.floor);
  const order=exact.map((value,index)=>({index,remainder:value-rounded[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  let rest=total-rounded.reduce((a,b)=>a+b,0);
  for(let i=0;i<rest;i++)rounded[order[i%order.length].index]++;
  return rounded;
}
