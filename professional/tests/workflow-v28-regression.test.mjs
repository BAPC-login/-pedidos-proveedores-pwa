import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const webRoot=new URL('../web/',import.meta.url);
const names=(await readdir(webRoot)).filter(name=>name.endsWith('.js'));
const entries=await Promise.all(names.map(async name=>[name,await readFile(new URL(name,webRoot),'utf8')]));
const web=new Map(entries);
const all=[...web.values()].join('\n');
const modal=web.get('app-modal.js');
const guard=web.get('app-regression-guard-v28.js');
const actions=web.get('app-actions.js');
const invoices=web.get('app-invoices.js');
const orderDetail=web.get('app-order-detail.js');
const v27=web.get('app-flow-stability-v27.js');
const sw=web.get('sw.js');

assert.doesNotMatch(modal,/dialog\.close\('replace'\)/);
assert.match(modal,/modalSequence/);
assert.match(modal,/dialog\.dataset\.modalSequence/);
assert.match(modal,/if\(!dialog\.open\)dialog\.showModal\(\)/);
assert.match(modal,/button:not\(\[type\]\)/);
assert.match(modal,/sameStep/);
assert.match(modal,/closeOnSuccess&&sameStep/);
assert.match(modal,/button\.isConnected/);

assert.match(v27,/app-regression-guard-v28\.js/);
assert.match(v27,/supersededBy:'v28'/);
assert.match(guard,/__NUVASTO_FLOW_OWNER='v28'/);
assert.match(guard,/blockLegacyKeyboardRegistrations/);
assert.match(guard,/button:not\(\[type\]\)/);
assert.match(guard,/event\.submitter!==submit/);
assert.match(guard,/#attachInvoice,#attachInvoiceBottom/);
assert.match(guard,/data-action=\\"analyze-invoice\\"/);
assert.match(guard,/state\.view==='invoices'/);
assert.match(guard,/invoiceOpening/);
assert.match(guard,/event\.stopImmediatePropagation\(\)/);
assert.match(guard,/body\.scrollTop\+=delta/);
assert.doesNotMatch(guard,/behavior:'smooth'/);
assert.match(guard,/unhandledrejection/);
assert.match(guard,/stopProgress/);

assert.match(invoices,/openInvoiceReview/);
assert.match(invoices,/sourceFileId/);
assert.match(invoices,/returnToOrder/);
assert.match(orderDetail,/#attachInvoice/);
assert.match(orderDetail,/#attachInvoiceBottom/);
assert.match(sw,/app-regression-guard-v28\.js/);
assert.match(sw,/v28-regression-suite/);

const actionTokens=new Set();
for(const source of web.values())for(const match of source.matchAll(/data-action=\\?"([^"\\]+)\\?"/g))actionTokens.add(match[1]);
const handledSource=`${actions}\n${guard}`;
for(const action of actionTokens)assert.ok(handledSource.includes(`'${action}'`)||handledSource.includes(`"${action}"`),`Acción sin manejador: ${action}`);

const criticalModules=['app-core.js','app-actions.js','app-modal.js','app-order-detail.js','app-invoices.js','app-navigation-v14.js','app-dashboard-v14.js','app-workflow-v19.js','app-history-v18.js','app-file-actions.js','app-regression-guard-v28.js'];
for(const name of criticalModules)assert.ok(web.get(name)?.length>100,`Módulo crítico ausente o vacío: ${name}`);

assert.doesNotMatch(all,/\.submit\(\)/);
console.log(`workflow v28 regression audit: OK · ${names.length} módulos · ${actionTokens.size} acciones verificadas`);
