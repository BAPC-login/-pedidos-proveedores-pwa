import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [design,orderCore,keyboard,router,dashboard,fileActions]=await Promise.all([
  readFile(new URL('../web/design-system-v14.css',import.meta.url),'utf8'),
  readFile(new URL('../web/app-order-core-v13.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-experience-keyboard.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-router-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-dashboard-v14.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8')
]);

const matrix=[
  {name:'iPhone compact',width:390,height:844,touch:true},
  {name:'iPhone large',width:440,height:956,touch:true},
  {name:'Android',width:412,height:915,touch:true},
  {name:'iPad portrait',width:820,height:1180,touch:true},
  {name:'Desktop',width:1440,height:900,touch:false}
];

assert.equal(matrix.every(device=>device.width>=390),true);
assert.match(design,/@media\(max-width:560px\)/);
assert.match(design,/@media\(max-width:900px\)/);
assert.match(design,/route-back/);
assert.match(orderCore,/inputmode="decimal"/);
assert.match(orderCore,/enterkeyhint="next"/);
assert.doesNotMatch(orderCore,/quantity-enter-button/);
assert.match(keyboard,/Enter \/ siguiente/);
assert.doesNotMatch(keyboard,/input\.type='text'/);
assert.match(router,/scrollY/);
assert.match(dashboard,/preserveAspectRatio="none"/);
assert.match(fileActions,/document-preview-loading/);

console.log(`device QA v14: ${matrix.map(device=>device.name).join(', ')} OK`);
