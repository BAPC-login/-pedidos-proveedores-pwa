import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [files,app,index,css,sw,combined,pkg]=await Promise.all([
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v45.js',import.meta.url),'utf8'),
  readFile(new URL('../web/native-performance.css',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.doesNotMatch(files,/openShareReady|Compartir ahora|ARCHIVO LISTO/);
for(const token of ['prepareOrderShare','navigator.share','data-v43-context','v29ShareSelected','v19ShareSelected','native-share-preparing'])assert.match(files,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(files,/document\.addEventListener\('click'.*true\)/s);
assert.match(files,/IntersectionObserver/);
assert.match(files,/MutationObserver/);

assert.match(app,/CLIENT_RELEASE='2026\.08\.08\.50'/);
assert.match(app,/verifyClientRelease/);
assert.match(app,/NuvastoExperienceV43\?\.primeOperations/);
assert.match(app,/guardedInflight/);
assert.match(app,/GUARDED_TTL=2\*60\*1000/);
assert.match(app,/seedResponseCache/);
assert.doesNotMatch(app,/api\('\/api\/orders',\{persist:true,ttl:20000/);
assert.doesNotMatch(app,/api\('\/api\/invoices',\{persist:true,ttl:30000/);
assert.doesNotMatch(app,/api\('\/api\/notifications',\{persist:true,ttl:20000/);

assert.match(index,/path==='\/api\/operations-bootstrap-v45'\|\|path==='\/api\/operations-bootstrap-v43'/);
assert.match(index,/RELEASE='2026\.08\.08\.50'/);
for(const token of ['directNativeShareV45:true','legacyBootstrapAliasV45:true','clientReleaseHandshakeV45:true'])assert.match(index,new RegExp(token));

assert.match(css,/\.native-share-preparing/);
assert.match(css,/\.mobile-workspace-button>span,.mobile-workspace-button>b\{display:none!important\}/);
assert.match(css,/grid-template-areas:'back heading \. actions' 'search search search search'/);
assert.match(sw,/nuvasto-v50-safari-navigation/);
assert.match(combined,/direct-share-runtime · 2026\.08\.07\.47/);
assert.match(combined,/request-coalescing-hotfix · 2026\.08\.08\.48/);
assert.match(combined,/PLATFORM_RELEASE='2026\.08\.08\.50'/);
assert.match(pkg,/workflow-v45-hotfix\.test\.mjs/);

for(const file of ['../web/app-file-actions.js','../web/app.js','../worker/src/index-v45.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow r48 hotfix direct share, request coalescing, single bootstrap and stale-client handshake: OK');
