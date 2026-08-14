from pathlib import Path
p=Path('professional/tests/production-e2e-v44.mjs')
s=p.read_text()
s=s.replace("import assert from 'node:assert/strict';\n","import assert from 'node:assert/strict';\nimport fs from 'node:fs';\n",1)
anchor="const password=process.env.NUVASTO_E2E_PASSWORD||'';\n"
insert=anchor+"const combinedSource=fs.readFileSync('../worker/src/combined.js','utf8'),releaseMatch=combinedSource.match(/PLATFORM_RELEASE='([^']+)'/);assert.ok(releaseMatch?.[1],'canonical platform release must be readable');const expectedRelease=releaseMatch[1];\nconst localSw=fs.readFileSync('web/sw.js','utf8'),swMatch=localSw.match(/const VERSION='([^']+)'/);assert.ok(swMatch?.[1],'canonical service worker version must be readable');const expectedSw=swMatch[1];\n"
if anchor not in s: raise SystemExit('credential anchor missing')
s=s.replace(anchor,insert,1)
s=s.replace("assert.equal(release.release,'2026.08.14.74','public release must be r74');","assert.equal(release.release,expectedRelease,'public release must match the canonical platform release');",1)
s=s.replace("appText.includes(\"CLIENT_RELEASE='2026.08.14.74'\")","appText.includes(`CLIENT_RELEASE='${expectedRelease}'`)",1)
s=s.replace("swText.includes('nuvasto-v74-payment-documents')","swText.includes(expectedSw)",1)
s=s.replace("'reduced cache-first r74 service worker'","'release-scoped reduced cache-first service worker'",1)
s=s.replace("if(!email||!password){console.log('production r74 public journey: OK · collective payments + reconciliation/navigation/auth assets verified · authenticated journey NOT CONFIGURED (set NUVASTO_E2E_EMAIL / NUVASTO_E2E_PASSWORD)');process.exit(0)}","assert.equal(health.supplierFinalUnitReadersV76,true,'health must expose supplier final-unit readers');assert.equal(health.printedFinalUnitPricingV76,true,'health must expose printed final-unit pricing');assert.equal(health.supplierInvoiceProfilesV76,true,'health must expose supplier invoice profiles');\nif(!email||!password){console.log(`production ${expectedRelease} public journey: OK · release/assets/final-unit readers verified · authenticated journey NOT CONFIGURED (set NUVASTO_E2E_EMAIL / NUVASTO_E2E_PASSWORD)`);process.exit(0)}",1)
p.write_text(s)
print('dynamic E2E release contract applied')
