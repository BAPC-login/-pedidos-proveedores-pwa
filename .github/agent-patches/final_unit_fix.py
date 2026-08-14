from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

# Fix mixed nullish / logical expression generated in the review template.
p=ROOT/'professional/web/app-multi-invoice.js'
s=p.read_text()
old="line.printedFinalUnitPrice??line.finalUnitPrice??line.grossUnitPrice||0"
new="line.printedFinalUnitPrice??line.finalUnitPrice??line.grossUnitPrice??0"
if old not in s: raise SystemExit('expected final-unit UI expression not found')
p.write_text(s.replace(old,new,1))

# Replace the old arithmetic-first architecture guard with the new printed-price contract.
p=ROOT/'professional/tests/functional-contracts.test.mjs'
s=p.read_text()
if "aiWorker=read('../worker/src/index.js')" not in s:
    anchor="multiInvoice=read('web/app-multi-invoice.js');"
    if anchor not in s: raise SystemExit('functional contract source list anchor missing')
    s=s.replace(anchor,"multiInvoice=read('web/app-multi-invoice.js'),aiWorker=read('../worker/src/index.js');",1)
lines=s.splitlines()
replaced=False
for i,line in enumerate(lines):
    if 'invoice prices must be reconstructed from printed invoice totals with explicit provenance' in line:
        lines[i]="assert.ok(normalizer.includes('printed-final-unit-column')&&normalizer.includes(\"priceSource:'printed-final-unit'\")&&normalizer.includes('supplier-total-x-unidad')&&multiInvoice.includes('Precio final impreso · Total x Unidad'),'supplier-printed final-unit prices must outrank reconstructed invoice arithmetic');"
        lines.insert(i+1,"assert.ok(aiWorker.includes('finalUnitPrice')&&aiWorker.includes('Total x Unidad')&&aiWorker.includes('PISQUERA DE CHILE')&&aiWorker.includes('VINA SAN PEDRO'),'AI extraction must use supplier final-unit reader profiles');")
        replaced=True
        break
if not replaced: raise SystemExit('old invoice arithmetic functional guard missing')
s='\n'.join(lines)+'\n'
s=s.replace('nuvasto-v75-invoice-arithmetic','nuvasto-v76-supplier-final-unit')
p.write_text(s)
print('final-unit UI and regression gates fixed')
