from pathlib import Path
p=Path('professional/worker/src/invoice-pricing-matrix.js')
s=p.read_text()
needle="  if(!priced.length)return{verified:false,method:'no-priced-lines',totals,documentTotalComputed:0,checksumDelta:totals.total};\n  for(const line of priced){line.netLineTotal=deriveNet(line);"
replacement="  if(!priced.length)return{verified:false,method:'no-priced-lines',totals,documentTotalComputed:0,checksumDelta:totals.total};\n  const hasDocumentTotals=Boolean(totals.total||totals.net||totals.freight||totals.vat||totals.additionalTax||totals.other);\n  if(!hasDocumentTotals){const computed=priced.reduce((sum,line)=>sum+Math.max(0,peso(line.grossLineTotal)),0);for(const line of priced)line.priceVerified=false;return{verified:false,method:'document-line-fallback',totals,documentTotalComputed:computed,checksumDelta:0,matrix:{source:'unverified-line-values'}};}\n  for(const line of priced){line.netLineTotal=deriveNet(line);"
assert needle in s
p.write_text(s.replace(needle,replacement))
