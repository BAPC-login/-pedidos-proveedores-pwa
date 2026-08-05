import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProfessionalOrderPdfV24} from '../worker/src/pdf-order-v24.js';

const [hotfix,modal,files,storage,pdfApi,app,sw]=await Promise.all([
  readFile(new URL('../web/app-professional-hotfix-v24.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-modal.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-pdf-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(hotfix,/data-v23-next/);
assert.match(hotfix,/keepVisible/);
assert.match(hotfix,/toolbarTop-12/);
assert.match(hotfix,/v24-legal-locked/);
assert.match(hotfix,/position:fixed!important/);
assert.match(hotfix,/app-r2-invoice-keyboard-v26\.js/);
assert.match(modal,/type="submit" id="modalSubmit"/);
assert.match(modal,/frame\.onsubmit=async/);
assert.match(modal,/Creando documento/);
assert.match(files,/currentOrderDocument/);
assert.match(files,/\/api\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/pdf/);
assert.match(files,/Descargar PDF/);
assert.match(storage,/createProfessionalOrderPdfV24/);
assert.match(storage,/pdfVersion:24/);
assert.match(pdfApi,/metadata\.pdfVersion\|\|0\)>=24/);
assert.match(app,/initializeProfessionalHotfixV24/);
assert.match(sw,/(?:v24-professional|nuvasto-v26-r2-invoice-keyboard)/);
assert.match(sw,/app-professional-hotfix-v24\.js/);

const bytes=createProfessionalOrderPdfV24({
  organization:{name:'Empresa'},business:{legalName:'Empresa SpA',rut:'77.777.777-7',address:'Dirección'},branding:{tableHeaderColor:'#22075f'},
  location:{name:'Local',details:{}},requester:{displayName:'Usuario',profile:{}},
  order:{folio:'TEST-001',supplierName:'Proveedor',costCenterName:'Barra',createdAt:'2026-08-04',deliveryDate:'2026-08-05',items:[{description:'Producto',quantity:2,orderUnit:'UNIDAD'}]}
});
const text=new TextDecoder('latin1').decode(bytes);
assert.match(text,/%NuvastoPDFV24/);
assert.doesNotMatch(text,/ re 0\.25\n/);
assert.doesNotMatch(text,/ re 0\.3\n/);
assert.match(text,/FECHA EMISI\\323N/);
assert.match(text,/FECHA ENTREGA/);
assert.match(text,/CENTRO DE COSTO/);
assert.match(text,/PRODUCTOS/);

console.log('workflow v24 professional fixes compatibility: OK');
