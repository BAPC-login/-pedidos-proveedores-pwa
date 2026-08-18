import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const scriptIndex=html.indexOf("localStorage.getItem('pp:theme')");
const cssIndex=html.indexOf('styles.css');
assert.ok(scriptIndex>0&&scriptIndex<cssIndex,'theme choice must run before CSS loads');
assert.match(html,/data-nuvasto-native-v80/);
assert.match(html,/data-nuvasto-native-v82/);
console.log('v83 prepaint theme stability: OK');
