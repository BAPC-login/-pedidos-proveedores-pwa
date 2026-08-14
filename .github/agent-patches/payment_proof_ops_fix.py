from pathlib import Path
p=Path('professional/tests/canonical-runtime.test.mjs')
t=p.read_text()
old="assert.ok(sw.includes('nuvasto-v76-supplier-final-unit')&&sw.includes('sessionCacheKey')&&sw.includes('apiDataResponse'),'service worker must provide authenticated offline data fallback and invalidate stale invoice UI');"
new="assert.ok(sw.includes('nuvasto-v77-payment-proof-ops')&&sw.includes('sessionCacheKey')&&sw.includes('apiDataResponse'),'service worker must provide authenticated offline data fallback and invalidate stale finance/catalog UI');"
if old not in t: raise SystemExit('missing canonical-runtime r76 assertion')
p.write_text(t.replace(old,new,1))
print('r77 runtime gate aligned')
