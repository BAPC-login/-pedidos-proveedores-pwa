import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../web/app-auth-experience.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/location\.reload\s*\(/);
assert.match(source,/navigator\.credentials\.get/);
assert.match(source,/initializeAuthenticatedPlatform/);
assert.match(source,/showApp\(\)/);
assert.match(source,/openRoute\('dashboard'/);
console.log('v83 biometric in-place login: OK');
