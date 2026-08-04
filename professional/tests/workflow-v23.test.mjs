import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [v23,app,appCore,sw,pkg]=await Promise.all([
  readFile(new URL('../web/app-nuvasto-v23.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-core.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

assert.match(v23,/Política de privacidad/);
assert.match(v23,/Términos de uso/);
assert.match(v23,/Seguridad y acceso/);
assert.match(v23,/Nuvasto no vende información personal/);
assert.match(v23,/Cloudflare Access/);
assert.match(v23,/env\(safe-area-inset-top\)/);
assert.match(v23,/\.btn\.primary,.bottom-create\{border:0!important/);
assert.match(v23,/installLegacyKeyboardBlock/);
assert.match(v23,/legacyQuantityListener/);
assert.match(v23,/\.v18-master-nav,.v22-master-nav\{display:none!important\}/);
assert.match(v23,/\.v23-master-nav\.keyboard-open/);
assert.match(v23,/keyboardInset\(\)>110/);
assert.match(v23,/document\.activeElement===activeQuantity/);
assert.match(v23,/pointerdown/);
assert.match(v23,/event\.preventDefault\(\);event\.stopPropagation\(\);action\(\)/);
assert.match(v23,/input\.focus\(\{preventScroll:true\}\)/);
assert.match(v23,/window\.visualViewport\?\.addEventListener\('resize'/);
assert.match(v23,/bar\.classList\.toggle\('keyboard-open',open\)/);
assert.match(v23,/activeQuantity=null;\n  current\?\.blur\(\)/);
assert.match(v23,/initializeNuvastoV23/);

assert.match(app,/initializeNuvastoV23/);
assert.ok(app.indexOf('initializeNuvastoV23()')<app.indexOf('initializeMasterV18()'),'v23 must block legacy v18 keyboard listeners first');
assert.ok(app.indexOf('initializeNuvastoV23()')<app.indexOf('initializeNuvastoUXV22()'),'v23 must block legacy v22 keyboard listeners first');
assert.match(app,/startupWatchdog=setTimeout/);
assert.match(app,/recoverStartup/);
assert.match(app,/timeout:8000/);
assert.match(app,/updateSyncChip\(\)\.catch/);
assert.match(app,/initialize\(\)\.catch/);
assert.match(appCore,/DEFAULT_REQUEST_TIMEOUT=15000/);
assert.match(appCore,/requestTimeoutError/);
assert.match(appCore,/indexeddb_timeout/);
assert.match(appCore,/request\.onblocked/);
assert.match(sw,/nuvasto-v23-auth-keyboard-startup-recovery/);
assert.match(sw,/app-nuvasto-v23\.js/);
assert.match(pkg,/2\.0\.0-alpha\.(?:23|24)/);
assert.match(pkg,/workflow-v23\.test\.mjs/);

console.log('workflow v23 compatibility under Nuvasto v24: OK');
