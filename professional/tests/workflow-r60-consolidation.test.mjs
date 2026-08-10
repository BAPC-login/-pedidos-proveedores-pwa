import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [current,combined,app,core,sw]=await Promise.all([
  readFile(new URL('../worker/src/index-current.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(current,/CURRENT_RELEASE='2026\.08\.10\.60'/);
assert.match(current,/X-Nuvasto-Runtime','consolidated-r60/);
assert.match(current,/return\[base,'core-hotpath'\]/);
assert.match(current,/return\[v40,'orders-hotpath'\]/);
assert.match(combined,/index-current\.js/);
assert.doesNotMatch(combined,/platformWorker from '\.\.\/\.\.\/professional\/worker\/src\/index-v45\.js'/);
assert.match(app,/CLIENT_RELEASE='2026\.08\.10\.60'/);
assert.doesNotMatch(app,/window\.fetch=async/);
assert.doesNotMatch(app,/guardedInflight/);
assert.match(core,/HOT_OPERATIONAL/);
assert.match(core,/options\.cancelOnNavigate===true/);
assert.match(core,/pendingRequests\.has\(cacheKey\)/);
assert.match(sw,/nuvasto-v60-consolidated-runtime/);

for(const file of ['../worker/src/index-current.js','../../worker/src/combined.js','../web/app.js','../web/app-core.js','../web/sw.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow r60 consolidated dispatcher, single request coordinator and PWA cutover: OK');
