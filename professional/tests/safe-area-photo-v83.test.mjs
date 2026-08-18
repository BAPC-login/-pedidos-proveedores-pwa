import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../web/app-mobile-runtime.js',import.meta.url),'utf8');
assert.match(source,/safe-area-inset-top/);
assert.match(source,/safe-area-inset-left/);
assert.match(source,/removeAttribute\('capture'\)/);
assert.match(source,/library-files-camera/);
console.log('v83 safe area and photo picker: OK');
