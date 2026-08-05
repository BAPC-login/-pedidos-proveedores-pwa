import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [frontend,hotfix,index,combined,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-flow-stability-v27.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-professional-hotfix-v24.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v27.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(frontend,/app-regression-guard-v28\.js/);
assert.match(frontend,/supersededBy:'v28'/);
assert.match(frontend,/pathname!=='\/api\/invoices\/analyze'/);
assert.match(frontend,/95000/);
assert.match(hotfix,/app-flow-stability-v27\.js/);
assert.ok(hotfix.indexOf('app-flow-stability-v27.js')<hotfix.indexOf('app-commercial-completion-v25.js'));
assert.match(index,/AI_TIMEOUT_MS=42000/);
assert.match(index,/AI_ATTEMPTS=2/);
assert.match(index,/professional-v27/);
assert.match(index,/invoiceFlowVersion:27/);
assert.match(combined,/index-v27\.js/);
assert.match(combined,/2026\.08\.05\.27/);
assert.match(sw,/v28-regression-suite/);
assert.match(sw,/app-flow-stability-v27\.js/);
assert.match(pkg,/2\.0\.0-alpha\.(?:27|28|29|30|31|32)/);
assert.match(pkg,/workflow-v27\.test\.mjs/);

console.log('workflow v27 backend and v32 compatibility wrapper: OK');
