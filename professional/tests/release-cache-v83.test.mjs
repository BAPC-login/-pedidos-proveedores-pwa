import assert from 'node:assert/strict';
import fs from 'node:fs';
const sw=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
assert.match(sw,/PREVIOUS_CACHE_VERSION='nuvasto-v83-mobile-auth-invoice'/,'v84 cutover must identify the prior v83 cache');
assert.doesNotMatch(sw,/'\.\/app-mobile-runtime\.js'/,'mobile runtime must remain on-demand instead of install precache');
assert.match(sw,/app-copy-policy\.js/);
console.log('v83 release cache compatibility: OK');
