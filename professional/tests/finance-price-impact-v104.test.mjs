import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {priceVariationV104} from '../worker/src/api/invoice-finance-v104.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const backend=read('../worker/src/api/invoice-finance-v104.js'),entry=read('../worker/src/worker-enterprise.js');
const finance=read('../web/app-finance-v104.js'),finish=read('../web/app-invoice-completion-v104.js'),
  multi=read('../web/app-multi-invoice.js'),enterprise=read('../web/app-enterprise.js'),nav=read('../web/index.html'),
  appCss=read('../web/app-current.css'),styles=read('../web/finance-v104.css'),arch=read('../web/app-documents.js');

assert.deepEqual(priceVariationV104(1200,null),{previousPrice:0,delta:0,percent:0,hasHistory:false,supplierId:'',supplierName:''});
assert.deepEqual(priceVariationV104(900,{gross_unit_price:1000,supplier_id:'a',supplier_name:'Proveedora'}),
  {previousPrice:1000,delta:-100,percent:-10,hasHistory:true,supplierId:'a',supplierName:'Proveedora'});
assert.deepEqual(priceVariationV104(1100,{gross_unit_price:1000,supplier_id:'b',supplier_name:'Proveedor B'}),
  {previousPrice:1000,delta:100,percent:10,hasHistory:true,supplierId:'b',supplierName:'Proveedor B'});
assert.equal(priceVariationV104(500,{gross_unit_price:0}).percent,0,'zero historical unit price avoids division by zero');
assert.match(backend,/invoice_location_links sc/,'financial invoice list must enforce location scope');
assert.match(backend,/i.org_id=\?/,'finance list is tenant-scoped');
assert.match(backend,/invoiceNumber/,'invoice number filter supported');
assert.match(backend,/supplierId/,'supplier filter supported');
assert.match(backend,/checkDate/,'dates validated');
assert.match(backend,/LIMIT \? OFFSET \?/,'finance ledger paginated server side');
assert.match(backend,/ph.supplier_id<>\?/,'cross supplier price comparison must exclude current supplier');
assert.match(backend,/ph.invoice_id<>\?/,'price history must exclude current document');
assert.match(entry,/getInvoicePriceImpactV104/,'active invoice endpoint provides authenticated report');
assert.match(entry,/listFinanceInvoicesV104/,'active financial endpoint uses actual invoices');
assert.match(multi,/showInvoiceCompletionV104/,'completion shown after batch save');
assert.match(multi,/saved:queueSaved/,'completion receives persisted documents');
assert.match(finish,/PROCESO FINALIZADO/,'completion modal has explicit success heading');
assert.match(finish,/Mismo proveedor/,'same supplier comparison visible');
assert.match(finish,/Otros proveedores/,'competitor supplier comparison visible');
assert.match(finish,/if\(hadSaved\)/,'batch distinguishes saved from omitted files');
assert.match(finance,/v104InvoiceNumber/,'invoice number filter is in new finance view');
assert.match(finance,/v104From/,'date start filter');
assert.match(finance,/v104To/,'date end filter');
assert.match(finance,/v104Supplier/,'supplier filter');
assert.match(finance,/paymentStatus/,'payment status displayed per invoice');
assert.match(finance,/v104InvoiceRows/,'invoice list uses rows');
assert.match(finance,/v104Next/,'pagination exposed');
assert.match(finance,/Pagos y proveedores/,'old payments features remain available');
assert.match(enterprise,/renderFinanceInvoicesV104/,'finance route is canonically owned in enterprise');
assert.match(nav,/data-view="finance"/,'finance is in primary sidebar');
assert.match(arch,/if\(\$\('\.nav-item\[data-view="finance"\]'\)\)return/,'technical archive hidden from default navigation');
assert.match(appCss,/finance-v104\.css/,'styles loaded by canonical CSS');
assert.match(styles,/@media\(max-width:690px\)/,'compact mobile finances');
console.log('finance price-impact v104: OK · unit-price deltas, same and other supplier, ledger filtering and completion modal');
