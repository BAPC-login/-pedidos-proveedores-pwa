import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [guard,app,sw]=await Promise.all([
  readFile(new URL('../web/app-screen-state-hotfix.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(guard,/const screens=/);
assert.match(guard,/node\.hidden=!visible/);
assert.match(guard,/node\.inert=!visible/);
assert.match(guard,/node\.style\.setProperty\('display','none','important'\)/);
assert.match(guard,/#startupScreen\[hidden\],#authScreen\[hidden\],#appShell\[hidden\]/);
assert.match(guard,/document\.body\.dataset\.uiScreen=screen/);
assert.match(guard,/MutationObserver/);
assert.match(app,/initializeScreenStateHotfix/);
assert.ok(app.indexOf('initializeScreenStateHotfix()')<app.indexOf('initializeNuvastoV23()'),'screen guard must run before v23 styles');
assert.match(sw,/(?:nuvasto-v23-auth-keyboard-startup-recovery-screen-state-hotfix|nuvasto-v26-r2-invoice-keyboard)/);
assert.match(sw,/app-screen-state-hotfix\.js/);

console.log('workflow v23 exclusive screen state compatibility: OK');
