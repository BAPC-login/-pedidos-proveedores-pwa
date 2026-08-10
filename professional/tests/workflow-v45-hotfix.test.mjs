import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const [files,app,runtime,core,index,current,css,sw,combined,pkg,r51,r52,indexHtml,schema]=await Promise.all([
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-runtime-current.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v45.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-current.js',import.meta.url),'utf8'),
  readFile(new URL('../web/native-performance.css',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../web/app-r51-ux.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-r52-operations.js',import.meta.url),'utf8'),
  readFile(new URL('../web/index.html',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8')
]);

assert.doesNotMatch(files,/openShareReady|Compartir ahora|ARCHIVO LISTO/);
for(const token of ['prepareOrderShare','navigator.share','data-v43-context','v29ShareSelected','v19ShareSelected','native-share-preparing'])assert.match(files,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(files,/IntersectionObserver/);assert.match(files,/MutationObserver/);

assert.match(app,/CLIENT_RELEASE='2026\.08\.10\.60'/);assert.match(app,/verifyClientRelease/);assert.match(app,/seedResponseCache/);assert.match(app,/initializeCurrentRuntime\(\)/);assert.doesNotMatch(app,/window\.fetch=async/);
assert.match(runtime,/initializeMasterOrderingV42/);assert.match(runtime,/initializeR51UX/);assert.match(runtime,/__nuvastoR52FetchShield=true/);assert.match(runtime,/import\('\.\/app-r52-operations\.js'\)/);
assert.match(core,/pendingRequests/);assert.match(core,/HOT_OPERATIONAL/);assert.match(core,/options\.cancelOnNavigate===true/);assert.match(core,/apiBackoffUntil/);
for(const token of ['r51BulkShare','r51CenterFilter','hydrateEditOrder','keyboardSafety','Por emitir'])assert.match(r51,new RegExp(token));
for(const token of ['Lista maestra del proveedor','Guardar y actualizar PDF','Recibido y pagado','Recibido parcialmente','Atrasado · factura pendiente','screen-bootstrap-v52','r52OpsHealth','virtualizeHistory','installRequestShield'])assert.match(r52,new RegExp(token));
assert.match(indexHtml,/app-runtime-current\.js/);assert.equal((indexHtml.match(/<script\s+type="module"/g)||[]).length,1);assert.doesNotMatch(indexHtml,/src="\.\/app-r52-operations\.js"/);assert.match(schema,/performance-indexes-r52/);assert.match(schema,/idx_orders_org_status_updated/);

assert.match(index,/path==='\/api\/screen-bootstrap-v52'/);assert.match(index,/screen-bootstrap-r52/);
assert.match(current,/CURRENT_RELEASE='2026\.08\.10\.60'/);assert.match(current,/core-hotpath/);assert.match(current,/orders-hotpath/);
assert.match(combined,/index-current\.js/);assert.match(combined,/consolidated-r60/);
assert.match(css,/\.native-share-preparing/);assert.match(sw,/nuvasto-v60-consolidated-runtime/);assert.match(sw,/app-runtime-current\.js/);assert.match(pkg,/workflow-v45-hotfix\.test\.mjs/);

for(const file of ['../web/app-file-actions.js','../web/app.js','../web/app-runtime-current.js','../web/app-core.js','../web/app-r51-ux.js','../web/app-r52-operations.js','../web/app-experience-keyboard.js','../worker/src/index-v45.js','../worker/src/index-current.js','../worker/src/schema.js'])execFileSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{stdio:'inherit'});
console.log('workflow r60 compatibility: r52 operations preserved behind one frontend entrypoint: OK');
