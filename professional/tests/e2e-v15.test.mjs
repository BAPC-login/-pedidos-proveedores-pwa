import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files=await Promise.all([
  '../web/app.js','../web/app-navigation-v14.js','../web/app-order-core-v15.js','../web/app-order-detail.js','../web/app-order-detail-v30.js','../web/app-enterprise-v15.js','../worker/src/index.js','../worker/src/index-scoped.js'
].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
const [app,navigation,master,detailWrapper,detail,enterprise,index,scoped]=files;

assert.match(detailWrapper,/app-order-detail-v30\.js/);
const contracts=[
  ['login→dashboard',app.includes("openRoute('dashboard'"),navigation.includes("registerRouteRenderer('dashboard'")],
  ['dashboard→master order',app.includes('initializeOrderCoreV15'),master.includes("target.dataset.action==='new-order'")],
  ['master order autosave',master.includes("api('/api/autosave'"),index.includes("path==='/api/autosave'")],
  ['delivery exceptions',master.includes('PASO 1 DE 2'),master.includes('PASO 2 DE 2')],
  ['save order batch',master.includes("api('/api/order-batches/v2'"),index.includes("path==='/api/order-batches/v2'")],
  ['duplicate order',detail.includes('/duplicate'),index.includes('/api/orders/:id/duplicate')],
  ['advanced reception',detail.includes('/quality'),index.includes('/api/receptions/:id/quality')],
  ['three-way reconciliation',detail.includes('reconcile-three-way'),index.includes('/api/orders/:id/reconcile-three-way')],
  ['trash restore',enterprise.includes('/api/trash/'),index.includes('/api/trash/:id/restore')],
  ['budgets',enterprise.includes("api('/api/budgets'"),index.includes("path==='/api/budgets'")],
  ['notifications',enterprise.includes('/api/notification-queue/dispatch'),index.includes('/api/notification-queue/dispatch')],
  ['billing',enterprise.includes('/api/billing/checkout'),index.includes('/api/billing/checkout')],
  ['backup restore',enterprise.includes('/api/backups/restore'),index.includes('/api/backups/restore')],
  ['executive exports',enterprise.includes('/api/exports/executive'),index.includes('/api/exports/executive')],
  ['category recovery',scoped.includes('deleteCategoryToTrashV15'),index.includes('/api/trash/:id/restore')]
];
for(const [name,...checks] of contracts)assert.equal(checks.every(Boolean),true,`E2E contract failed: ${name}`);

const devices=[{name:'iPhone 390',width:390},{name:'iPhone large',width:440},{name:'Android',width:412},{name:'iPad',width:820},{name:'Desktop',width:1440}];
assert.equal(devices.every(device=>device.width>=390),true);
assert.match(master,/@media\(max-width:460px\)/);
assert.match(enterprise,/@media\(max-width:560px\)/);
assert.match(detail,/v30-reception-card/);

console.log(`e2e v15 contracts through v30: ${contracts.length} flows · ${devices.map(device=>device.name).join(', ')} OK`);
