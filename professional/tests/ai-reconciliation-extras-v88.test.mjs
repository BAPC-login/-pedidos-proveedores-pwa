import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ai=read('worker/src/api/invoice-ai-fast-v88.js');
const core=read('worker/src/api/invoice-analysis-core-v39.js');
const invoiceUi=read('web/app-invoice-v30.js');
const reception=read('worker/src/api/reception-v13.js');
const worker=read('worker/src/worker-core.js');
const schema=read('worker/src/schema.js');
const payment=read('worker/src/api/payment-proof-ai.js');
const mobile=read('web/app-mobile-runtime.js');
const sw=read('web/sw.js');

assert.match(ai,/thinkingLevel:'minimal'/,'primary invoice extraction must minimize thinking latency');
assert.match(ai,/thinkingLevel:'medium'/,'only the targeted repair pass may increase thinking');
assert.match(ai,/VALOR TOTAL/,'invoice prompt must preserve explicit row total columns');
assert.match(ai,/candidateMath/,'AI output must be checked deterministically before acceptance');
assert.match(ai,/No inventes productos|No inventes productos/i,'invoice prompt must forbid invented values/products');
assert.match(ai,/invoice_math_unverified/,'unverifiable math must produce an explicit review condition');
assert.doesNotMatch(ai,/temperature\s*:/,'Gemini 3.x invoice reading should not override temperature');

assert.match(core,/server-supplier-catalog-v88/,'reconciliation context must include the supplier catalog');
assert.match(core,/serverExtraCatalogProductCount/,'extra supplier products must be measured');
assert.match(core,/ANALYSIS_TIMEOUT_MS=60000/,'professional invoice pipeline must retire the old 112 second timeout');
assert.match(core,/analyzeInvoiceFastV88/,'invoice analysis must use the dedicated fast extraction pipeline');

assert.match(invoiceUi,/Catálogo del proveedor · no solicitado/,'review must allow products that were not in the original order');
assert.match(invoiceUi,/extraAccepted/,'accepted extras must travel with the invoice/reception payload');
assert.match(invoiceUi,/Leyendo tabla y totales/,'UI must expose staged processing progress');
assert.match(invoiceUi,/Validando sumas/,'UI must distinguish deterministic verification from extraction');
assert.match(invoiceUi,/Cotejando catálogo/,'UI must distinguish catalog matching from extraction');
assert.match(invoiceUi,/timeout:68000/,'browser analysis timeout must be bounded below the legacy 124 seconds');

assert.match(schema,/CREATE TABLE IF NOT EXISTS reception_extra_items/,'accepted extras need auditable receipt persistence without editing the issued order');
assert.match(reception,/extraItems/,'canonical reception must accept supplier-catalog extras');
assert.match(reception,/extra_product_not_in_supplier_catalog/,'extra products must be validated against the supplier catalog server-side');
assert.match(worker,/receiveFromInvoice\(request,env,actor,body,invoiceId\)/,'invoice-driven reception must preserve invoice provenance for extras');
assert.match(worker,/extraReceivingV88:true/,'health must expose extra receiving capability');
assert.match(worker,/noSilentAiAcceptanceV88:true/,'health must expose no-silent-AI policy');

assert.match(payment,/TIMEOUT_MS=24000/,'payment proof AI must use a fast bounded timeout');
assert.match(payment,/thinkingLevel:'minimal'/,'payment proof extraction must minimize thinking latency');
assert.match(payment,/evidenceVerified/,'payment extraction must report deterministic evidence completeness');
assert.match(payment,/Jamás inventes verificadores/,'payment prompt must retain the no-invention rule');

assert.match(mobile,/--nuvasto-safe-top/,'mobile runtime must centralize safe-area variables');
assert.match(mobile,/\.topbar\{[^}]*safe-top/s,'top bar must respect device safe area');
assert.match(mobile,/#modalClose\{[^}]*48px/s,'modal close target must remain reachable and touch-sized');
assert.match(mobile,/\.bottom-nav\{[^}]*safe-bottom/s,'bottom navigation must respect the home indicator area');
assert.match(sw,/CACHE_VERSION='nuvasto-v88-ai-reconciliation-extras'/,'v88 must rotate installed PWA assets');

console.log('v88 AI reconciliation, extras and safe-area contracts: OK');
