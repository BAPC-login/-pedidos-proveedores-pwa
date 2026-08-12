import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const combined=read('../worker/src/combined.js');
const router=read('worker/src/router.js');
const professional=read('web/app-professional.js');
const retiredR52=read('web/app-r52-operations.js');
assert.ok(combined.includes("professional/worker/src/router.js"),'combined worker must use canonical router');
assert.ok(router.includes("from './routes/index.js'"),'router must resolve domains through route modules');
assert.ok(!router.includes('function isV44')&&!router.includes('function isV41'),'canonical router must not contain version predicate sprawl');
assert.ok(professional.includes("from './app-orders.js'")&&professional.includes("from './app-catalog.js'")&&professional.includes("from './app-procurement.js'"),'professional bootstrap must use semantic feature owners');
for(const name of ['app-orders.js','app-catalog.js','app-documents.js','app-invoice-review.js','app-enterprise.js','app-procurement.js','app-master-edit.js','app-reception.js','app-operations-dashboard.js'])assert.ok(fs.existsSync(`web/${name}`),`${name} must exist`);
for(const name of ['app-v32-orders.js','app-v32-catalog.js','app-v41-enterprise.js','app-v44-procurement-os.js','app-v44-master-edit.js','app-v44-receiving-plus.js','app-v40-operations.js'])assert.ok(read(`web/${name}`).length<90,`${name} must be compatibility-only`);
for(const name of ['worker-core.js','worker-enterprise.js','worker-ordering.js','worker-lifecycle.js','worker-procurement.js'])assert.ok(fs.existsSync(`worker/src/${name}`),`${name} must exist`);
for(const name of ['index-v40.js','index-v41.js','index-v42.js','index-v43.js','index-v44.js'])assert.ok(read(`worker/src/${name}`).length<80,`${name} must be compatibility-only`);
assert.ok(retiredR52.length<220&&!retiredR52.includes('window.fetch'),'R52 request shield must stay retired');
const webFiles=fs.readdirSync('web').filter(name=>name.endsWith('.js'));for(const name of webFiles){const source=read(`web/${name}`);assert.equal((source.match(/window\.fetch\s*=/g)||[]).length,0,`${name} must not replace global fetch`)}
console.log('architecture gate: OK');
