import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const index40=read('worker/src/index-v40.js');
const core91=read('worker/src/worker-core-v91.js');
const invoiceAi=read('worker/src/api/invoice-ai-fast-v88.js');
const invoice91=read('worker/src/api/invoice-analysis-v91.js');
const index39=read('worker/src/index-v39.js');
const fileActions=read('web/app-file-actions.js');

assert.match(index40,/worker-core-v91\.js/,'v91 core guard must be active');
assert.match(core91,/url\.pathname==='\/api\/orders\/advanced'/,'advanced orders route must be reserved before dynamic ids');
assert.match(core91,/listOrdersCanonical/,'advanced orders must use the canonical cursor query');
assert.ok(core91.indexOf("url.pathname==='/api/orders/advanced'")<core91.indexOf('legacyWorker.fetch'),'reserved route must execute before the legacy dynamic router');

assert.match(invoiceAi,/TRANSIENT_STATUSES=new Set\(\[408,425,429,500,502,503,504\]\)/,'transient Gemini failures must be classified');
assert.match(invoiceAi,/callModelResilient/,'Gemini calls must use bounded retry handling');
assert.match(invoiceAi,/RETRY_BUDGET_MS=36000/,'AI retry budget must stay bounded below the outer analysis timeout');
assert.match(invoiceAi,/gemini-3\.1-flash-lite/,'fallback Gemini model must remain available');
assert.match(invoiceAi,/resilienceV91:true/,'invoice extraction must expose v91 resilience metadata');

assert.match(index39,/analyzeInvoiceV91/,'v91 invoice accounting wrapper must be active');
assert.match(invoice91,/ai_document_attempts/,'attempts must be tracked separately');
assert.match(invoice91,/MAX\(quantity-1,0\)/,'degraded reads must not consume the verified-document quota');
assert.match(invoice91,/usagePolicyV91:'verified-documents-only'/,'usage policy must be explicit');

assert.match(fileActions,/isMissingStoredDocument/,'missing R2 documents must be detected explicitly');
assert.match(fileActions,/regenerateOrderDocument/,'stale order PDFs must be regenerable');
assert.match(fileActions,/ensureOrderDocument\(order,\{force:true\}\)/,'regeneration must bypass stale cached keys');
assert.match(fileActions,/status:response\.status/,'file fetch failures must preserve HTTP status for recovery');

console.log('v91 production stability contracts: OK');
