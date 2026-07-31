import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [history,historySemantic,master,pdfUi,fileActions,pdf,storage,pdfApi,scoped,app,serviceWorker]=await Promise.all([
  readFile(new URL('../web/app-history-v18.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-history-semantic-v20.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-master-v18.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-pdf-v18.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app-file-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/pdf-order-v22.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/storage.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/order-pdf-v19.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-scoped.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8')
]);

assert.match(history,/Pedido N°/);
assert.match(history,/Ver detalle/);
assert.match(history,/Ingresar factura y cotejar IA/);
assert.match(history,/Precios y cotejo del pedido/);
assert.match(history,/Factura N°/);
assert.match(history,/Recepciones/);
assert.match(history,/Realizado por/);
assert.match(history,/Total compra/);
assert.match(history,/registerRouteRenderer\('history',renderHistoryV18\)/);
assert.match(historySemantic,/Pendiente de factura/);
assert.match(historySemantic,/invoicedGrossTotal/);

assert.match(master,/v18-master-nav/);
assert.match(master,/Siguiente ↵/);
assert.match(master,/data-master-prev/);
assert.match(master,/data-master-done/);
assert.match(master,/visualViewport/);
assert.match(master,/order-file-supplier\{display:grid!important/);
assert.match(master,/Seleccionar proveedor/);
assert.match(master,/Formato de compra/);
assert.match(master,/v18-single-supplier/);
assert.match(master,/v16-next-quantity\{display:none!important/);

assert.match(pdf,/FECHA EMISIÓN/);
assert.match(pdf,/FECHA ENTREGA/);
assert.match(pdf,/SOLICITADO POR/);
assert.match(pdf,/CENTRO DE COSTO/);
assert.match(pdf,/PRODUCTOS/);
assert.match(pdf,/PROVEEDOR:/);
assert.match(pdf,/supplierLogo/);
assert.match(pdf,/companyLogo/);
assert.match(pdf,/createProfessionalOrderPdfV22/);
assert.match(storage,/createProfessionalOrderPdfV22/);
assert.match(storage,/pdfVersion:22/);
assert.match(storage,/costCenterName/);
assert.match(pdfApi,/pdfVersion\|\|0\)>=19/);
assert.match(fileActions,/\/api\/orders\/\$\{encodeURIComponent\(order.id\)\}\/pdf/);
assert.doesNotMatch(fileActions,/if\(order\.pdfKey\)return/);
assert.match(pdfUi,/ensureOrderDocument/);
assert.match(scoped,/historyCardsV18:true/);
assert.match(scoped,/masterSupplierSwitch:true/);
assert.match(scoped,/pdfLayoutV18:true/);
assert.match(app,/initializeMasterV18/);
assert.match(app,/initializeHistoryV18/);
assert.match(app,/initializePdfV18/);
assert.match(app,/initializeHistorySemanticV20/);
assert.match(serviceWorker,/(?:v19-workflow-r2|v20-professional-sso|nuvasto-v21-brand-platform|nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard)/);
assert.match(serviceWorker,/app-history-v18\.js/);
assert.match(serviceWorker,/app-master-v18\.js/);
assert.match(serviceWorker,/app-pdf-v18\.js/);

console.log('workflow v18 compatibility under Nuvasto v23: OK');
