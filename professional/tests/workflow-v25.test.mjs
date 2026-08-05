import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [completion,hotfix,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-commercial-completion-v25.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-professional-hotfix-v24.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(completion,/function normalizeMasterDates/);
assert.match(completion,/setScopeAll/);
assert.match(completion,/scope\?\.value==='except'&&!configuredExceptions\(\)/);
assert.match(completion,/Selecciona Hoy, Mañana o una fecha de entrega/);
assert.match(completion,/\.delivery-base-buttons \[data-delivery-base\]/);
assert.match(completion,/document\.addEventListener\('submit'/);
assert.match(completion,/function scrollableAncestor/);
assert.match(completion,/v25-keyboard-spacer/);
assert.match(completion,/toolbarTop\(\)/);
assert.match(completion,/rect\.bottom-visibleBottom\+24/);
assert.match(completion,/visualViewport\?\.addEventListener\('resize'/);
assert.match(completion,/NuvastoDiagnostics/);
assert.match(completion,/SKIP_WAITING/);
assert.match(hotfix,/app-commercial-completion-v25\.js/);
assert.match(sw,/(?:v25-commercial-completion-date-keyboard|nuvasto-v26-r2-invoice-keyboard)/);
assert.match(sw,/app-commercial-completion-v25\.js/);
assert.match(pkg,/2\.0\.0-alpha\.(?:25|26)/);
assert.match(pkg,/workflow-v25\.test\.mjs/);

console.log('workflow v25 commercial completion compatibility: OK');
