import assert from 'node:assert/strict';
import fs from 'node:fs';
const multi=fs.readFileSync(new URL('../web/app-multi-invoice.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../web/app-bootstrap.js',import.meta.url),'utf8');
assert.match(bootstrap,/app-copy-policy\.js/,'copy policy must load before platform features');
assert.match(multi,/Matriz de precio cerrada/,'legacy invoice checkout still contains technical copy that policy must sanitize before paint');
console.log('v83 user-facing copy gate: OK');
