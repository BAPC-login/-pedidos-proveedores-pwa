import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const app=read('web/app.js');
const shell=read('web/index.html');
const master=read('web/app-master-v18.js');
const files=read('web/app-file-actions.js');
const orders=read('web/app-v32-orders.js');
const catalog=read('web/app-v32-catalog.js');
const sw=read('web/sw.js');

assert.equal((app.match(/window\.fetch\s*=/g)||[]).length,0,'app.js must not wrap global fetch');
assert.ok(!shell.includes('app-r52-stability.js'),'retired R52 stability script must not load');
assert.ok(!shell.includes('app-r54-consolidation.js'),'retired R54 facade must not load');
assert.ok(shell.includes('app-r56-mobile.js'),'canonical mobile layer must load directly');
assert.ok(!master.includes('v18-master-nav')||master.includes('.v18-master-nav{display:none!important}'),'legacy custom keyboard must remain disabled');
assert.ok(!master.includes("addEventListener('focusin'"),'master list must not steal native focus');
assert.ok(!master.includes("addEventListener('keydown'"),'master list must not hijack Enter');
assert.ok(!files.includes('IntersectionObserver'),'sharing must not generate PDFs from viewport observation');
assert.ok(!files.includes('MutationObserver'),'sharing must not scan the whole DOM');
assert.ok(orders.includes("order.status==='draft'"),'Por emitir must be sourced from drafts');
assert.ok(orders.includes("order.status!=='draft'&&order.status!=='cancelled'"),'History must exclude drafts and cancelled orders');
assert.equal((catalog.match(/data-v32-photo=/g)||[]).length,1,'product card must expose one photo action');
assert.ok(sw.includes('nuvasto-v57-canonical-runtime'),'service worker release must be canonical v57');
console.log('canonical runtime regression gate: OK');
