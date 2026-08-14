from pathlib import Path

def replace(path,old,new,label):
    p=Path(path);t=p.read_text()
    if old not in t: raise SystemExit(f'missing {label}')
    p.write_text(t.replace(old,new,1))

replace('professional/tests/canonical-runtime.test.mjs',"assert.ok(sw.includes('nuvasto-v76-supplier-final-unit')&&sw.includes('sessionCacheKey')&&sw.includes('apiDataResponse'),'service worker must provide authenticated offline data fallback and invalidate stale invoice UI');","assert.ok(sw.includes('nuvasto-v77-payment-proof-ops')&&sw.includes('sessionCacheKey')&&sw.includes('apiDataResponse'),'service worker must provide authenticated offline data fallback and invalidate stale finance/catalog UI');",'canonical runtime r76 assertion')
replace('professional/tests/bootstrap.test.mjs',"assert.ok(sw.includes('nuvasto-v76-supplier-final-unit')&&sw.includes(\"'./app-bootstrap.js'\")&&!sw.includes(\"'./app-procurement.js'\")&&!sw.includes(\"'./app-enterprise.js'\")&&!sw.includes(\"'./app-mobile-runtime.js'\"),'service worker install must warm only the critical shell, invalidate stale invoice UI and cache feature modules on demand');","assert.ok(sw.includes('nuvasto-v77-payment-proof-ops')&&sw.includes(\"'./app-bootstrap.js'\")&&!sw.includes(\"'./app-procurement.js'\")&&!sw.includes(\"'./app-enterprise.js'\")&&!sw.includes(\"'./app-mobile-runtime.js'\"),'service worker install must warm only the critical shell, invalidate stale finance/catalog UI and cache feature modules on demand');",'bootstrap r76 assertion')
print('r77 runtime gates aligned')
