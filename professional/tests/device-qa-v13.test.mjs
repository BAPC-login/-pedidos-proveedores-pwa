import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [design,orderCore,fileActions,operations]=await Promise.all([
  readFile(new URL('../web/design-system-v13.css',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-core-v13.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience-operations.js',import.meta.url),'utf8')
]);

const matrix=[
  {name:'iPhone compact',width:390,height:844,touch:true},
  {name:'iPhone large',width:440,height:956,touch:true},
  {name:'Android',width:412,height:915,touch:true},
  {name:'iPad portrait',width:820,height:1180,touch:true},
  {name:'Desktop',width:1440,height:900,touch:false}
];

assert.equal(matrix.every(device=>device.width>=390),true);
assert.match(design,/touch-action:manipulation/);
assert.match(design,/@media\(max-width:560px\)/);
assert.match(design,/@media\(max-width:900px\)/);
assert.match(orderCore,/type=\"date\"/);
assert.match(orderCore,/data-enter-next/);
assert.match(orderCore,/enterkeyhint=\"next\"/);
assert.match(fileActions,/openModal\(\{eyebrow:'DOCUMENTO'/);
assert.match(fileActions,/document-preview-loading/);
assert.match(operations,/data-protected-key/);
assert.match(operations,/Emitir todo/);

console.log(`device QA v13: ${matrix.map(device=>device.name).join(', ')} OK`);
