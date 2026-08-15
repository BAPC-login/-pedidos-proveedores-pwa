from pathlib import Path
p=Path('professional/worker/src/invoice-pricing-matrix.js')
s=p.read_text()
needle="  if(!priced.length)return{verified:false,method:'no-priced-lines',totals,documentTotalComputed:0,checksumDelta:totals.total};\n  for(const line of priced){line.netLineTotal=deriveNet(line);"
replacement="  if(!priced.length)return{verified:false,method:'no-priced-lines',totals,documentTotalComputed:0,checksumDelta:totals.total};\n  const hasDocumentTotals=Boolean(totals.total||totals.net||totals.freight||totals.vat||totals.additionalTax||totals.other);\n  if(!hasDocumentTotals){const computed=priced.reduce((sum,line)=>sum+Math.max(0,peso(line.grossLineTotal)),0);for(const line of priced)line.priceVerified=false;return{verified:false,method:'document-line-fallback',totals,documentTotalComputed:computed,checksumDelta:0,matrix:{source:'unverified-line-values'}};}\n  for(const line of priced){line.netLineTotal=deriveNet(line);"
assert needle in s
s=s.replace(needle,replacement)
s=s.replace("line.grossUnitPrice=round3(gross/Math.max(1,units));line.grossPackPrice=qty?round3(gross/qty):0;line.priceVerified=verified;line.priceSource='printed-final-unit'", "line.grossUnitPrice=round3(num(line.printedFinalUnitPrice??line.finalUnitPrice));line.grossPackPrice=qty?round3(gross/qty):0;line.priceVerified=verified;line.priceSource='printed-final-unit'")
p.write_text(s)
for name in ['professional/tests/canonical-runtime.test.mjs','professional/tests/bootstrap.test.mjs']:
    p=Path(name); text=p.read_text().replace('nuvasto-v77-payment-proof-ops','nuvasto-v78-invoice-matrix-passkey-ledger'); p.write_text(text)
p=Path('professional/tests/functional-contracts.test.mjs'); text=p.read_text()
text=text.replace("normalizer=read('worker/src/invoice-normalizer.js'),analysisCore", "normalizer=read('worker/src/invoice-normalizer.js'),pricingMatrix=read('worker/src/invoice-pricing-matrix.js'),analysisCore")
text=text.replace("normalizer.includes('printed-final-unit-column')", "pricingMatrix.includes('printed-final-unit-column')")
text=text.replace('nuvasto-v77-payment-proof-ops','nuvasto-v78-invoice-matrix-passkey-ledger')
p.write_text(text)
