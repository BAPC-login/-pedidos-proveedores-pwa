import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ai=read('worker/src/api/invoice-ai-fast-v88.js');
const core=read('worker/src/api/invoice-analysis-core-v39.js');
const invoiceUi=read('web/app-invoice-v30.js');
const multiInvoice=read('web/app-multi-invoice.js');
const modal=read('web/app-modal.js');
const native=read('web/native-performance.css');
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
assert.match(ai,/return\{ok:false,reason:'partial-line-values'/,'partial monetary rows must never be silently accepted as verified');
assert.match(ai,/free-document-visible-lines/,'documents without charge need an evidence path that does not require a positive invoice total');
assert.match(ai,/analyzeInvoiceFastV88\(env,file,context=\{\}\)/,'document nature must reach the AI validator');
assert.doesNotMatch(ai,/temperature\s*:/,'Gemini 3.x invoice reading should not override temperature');

assert.match(core,/server-supplier-catalog-v88/,'reconciliation context must include the supplier catalog');
assert.match(core,/serverExtraCatalogProductCount/,'extra supplier products must be measured');
assert.match(core,/ANALYSIS_TIMEOUT_MS=60000/,'professional invoice pipeline must retire the old 112 second timeout');
assert.match(core,/analyzeInvoiceFastV88\(env,file,context\)/,'invoice analysis must pass trusted order/document context into extraction');
assert.match(core,/manualCandidates/,'degraded analysis may expose manual candidates separately from extracted lines');
assert.match(core,/lines:\[\],items:\[\]/,'degraded analysis must not fabricate invoice rows from order items');
assert.match(core,/invoice_pricing_unverified/,'value documents must fail closed when deterministic pricing does not close');

assert.match(multiInvoice,/invoice-analysis-transition/,'AI processing must stay inside the existing modal transition instead of opening a loading screen');
assert.doesNotMatch(multiInvoice,/title:'Procesando documento'/,'multi-document flow must not replace the current screen with a processing modal');
assert.doesNotMatch(multiInvoice,/manual_order_fallback/,'the client must not fabricate AI lines from the order');
assert.match(multiInvoice,/attachableOrder=order=>order&&\(order\.publicState\|\|order\.status\)!=='editing'&&!\['draft','cancelled'\]/,'received and closed folios must continue accepting later documents');
assert.match(multiInvoice,/El límite de 5 es solo por carga/,'the five-file cap must be explained as a batch limit, not a folio limit');
assert.match(multiInvoice,/Ingresar manualmente/,'unverified extraction must offer explicit manual recovery rather than fake data');
assert.match(multiInvoice,/timeout:68000/,'canonical multi-document analysis must use the bounded professional timeout');
assert.match(modal,/animationend/,'modal replacement animation must remain mounted until the animation actually completes');
assert.match(native,/nuvasto-analysis-veil/,'long AI work must extend the transition animation instead of revealing a separate loader');
assert.match(native,/nuvasto-modal-enter \.29s/,'modal opening must use the smoother native transition');

assert.match(invoiceUi,/Catálogo del proveedor · no solicitado/,'review must allow products that were not in the original order');
assert.match(invoiceUi,/extraAccepted/,'accepted extras must travel with the invoice/reception payload');
assert.match(invoiceUi,/Leyendo tabla y totales/,'legacy review must expose staged processing progress');
assert.match(invoiceUi,/Validando sumas/,'legacy review must distinguish deterministic verification from extraction');
assert.match(invoiceUi,/Cotejando catálogo/,'legacy review must distinguish catalog matching from extraction');
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

console.log('v88/v90 AI reconciliation, truthful review and safe-area contracts: OK');
