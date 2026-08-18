import assert from 'node:assert/strict';
import fs from 'node:fs';
const sw=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
assert.match(sw,/CACHE_VERSION='nuvasto-v83-mobile-auth-invoice'/);
assert.match(sw,/app-mobile-runtime\.js/);
assert.match(sw,/app-copy-policy\.js/);
console.log('v83 release cache: OK');
