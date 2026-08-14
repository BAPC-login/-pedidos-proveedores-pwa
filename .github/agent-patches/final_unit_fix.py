from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
p=ROOT/'professional/web/app-multi-invoice.js'
s=p.read_text()
old="line.printedFinalUnitPrice??line.finalUnitPrice??line.grossUnitPrice||0"
new="line.printedFinalUnitPrice??line.finalUnitPrice??line.grossUnitPrice??0"
if old not in s: raise SystemExit('expected final-unit UI expression not found')
p.write_text(s.replace(old,new,1))
print('final-unit UI expression fixed')
