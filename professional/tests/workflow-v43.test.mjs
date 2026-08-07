import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [lifecycle,index,frontend,core,entry,combined,sw,pkg,deploy]=await Promise.all([
  readFile(new URL('../worker/src/api/experience-v43.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v43.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v43-experience.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-v32-entry.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../../.github/workflows/deploy-cloudflare.yml',import.meta.url),'utf8')
]);

for(const token of ['setProductActiveV43','product.disable','product.enable','preservedHistory','preservedSupplierLinks'])assert.match(lifecycle,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
for(const token of ['2.0.0-alpha.43','operations-bootstrap-v43','single-roundtrip-bootstrap-v43','productLifecycleV43','professionalDashboardV43','processNavigationV43','floatingOrderActionsV43','settingsPolicyDedupV43'])assert.match(index,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
for(const token of ['Sin categoría','__none__','3. Productos dentro de cada categoría','v43-order-sheet','variationVsPrevious','costCenterSpend','categorySpend','v43-context-menu','v43-more-sheet','data-v43-policy','seedResponseCache','v43-collapsed','Deshabilitar','Reactivar'])assert.match(frontend,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(core,/seedResponseCache/);assert.match(core,/STALE_FALLBACK_MAX_AGE/);assert.match(core,/api_stale_fallback/);
assert.match(entry,/initializeExperienceV43/);assert.match(entry,/app-v43-experience\.js/);
assert.match(combined,/index-v43\.js/);assert.match(combined,/2026\.08\.07\.44/);
assert.match(sw,/nuvasto-v43-fast-ux-process-navigation/);assert.match(sw,/app-v43-experience\.js/);
assert.match(pkg,/workflow-v43\.test\.mjs/);assert.match(pkg,/index-v43\.js/);assert.match(pkg,/app-v43-experience\.js/);assert.match(pkg,/2\.0\.0-alpha\.36/);
assert.match(deploy,/nuvasto\/production/);

for(const file of ['../worker/src/api/experience-v43.js','../worker/src/index-v43.js','../web/app-v43-experience.js','../web/app-core.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'pipe'});
console.log('workflow v43 PWA speed, product lifecycle, professional dashboard and process navigation: OK');
