import assert from 'node:assert/strict';
import fs from 'node:fs';
const sw=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
assert.match(sw,/importScripts\('\.\/sw-release\.js'\)/,'service worker must consume the generated current release');
assert.match(sw,/deleteStaleNuvastoCaches/,'activation must delete stale Nuvasto cache generations');
assert.doesNotMatch(sw,/LEGACY_CACHE_VERSION|PREVIOUS_CACHE_VERSION|PREVIOUS_VERSION/,'no historical cache lineage may remain active');
assert.doesNotMatch(sw,/'\.\/app-mobile-runtime\.js'/,'mobile runtime must remain on-demand instead of install precache');
assert.match(sw,/app-copy-policy\.js/,'copy policy remains in the current critical shell');
console.log('release cache contract: OK · latest-only generation');
