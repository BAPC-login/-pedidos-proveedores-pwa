import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integerCostShares,supplierWeights,validateSupplierCostPolicy} from '../../worker/src/supplier-cost-allocation.js';
import {reconcileInvoicePricing} from '../../worker/src/invoice-cost-reconciliation.js';
import {buildInternalInvoiceXml,parseOriginalDteXml,verifyPhotoAgainstDte} from '../worker/src/invoice-xml-evidence-v96.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

// Exact CLP apportionment, including stable deterministic remainders.
assert.deepEqual(integerCostShares(100,[1,1,1]),[34,33,33]);
assert.deepEqual(integerCostShares(301,[200,100]),[201,100]);
assert.throws(()=>integerCostShares(10,[0,0]),/without positive/);
assert.deepEqual(supplierWeights([{invoiceQuantity:1,packSize:6},{invoiceQuantity:2,packSize:12}],[100,300],'physical_units'),[6,24]);
assert.deepEqual(supplierWeights([{invoiceQuantity:1},{invoiceQuantity:2}],[100,300],'invoice_quantity'),[1,2]);
assert.equal(supplierWeights([],[],'manual_review'),null);
assert.throws(()=>validateSupplierCostPolicy({freight:'random_rule'}),/Invalid supplier/);

const lines=[
  {invoiceQuantity:2,packSize:6,totalUnits:12,netLineTotal:2000},
  {invoiceQuantity:1,packSize:12,totalUnits:12,netLineTotal:1000}
];
const policy={freight:'invoice_quantity',other:'net_value',vat:'net_value',additionalTax:'net_value'};
const priced=reconcileInvoicePricing(lines,{net:3000,freight:300,total:3300},[],policy);
assert.equal(priced.verified,true);
assert.equal(priced.balanced,true);
assert.equal(lines[0].allocatedFreight,200);
assert.equal(lines[1].allocatedFreight,100);
assert.equal(lines[0].grossLineTotal+lines[1].grossLineTotal,3300);
assert.equal(lines[0].taxAllocationMethod,'supplier-cost-policy-v96');

const review=[
  {invoiceQuantity:2,totalUnits:2,netLineTotal:2000},
  {invoiceQuantity:1,totalUnits:1,netLineTotal:1000}
];
const warnings=[];
const flagged=reconcileInvoicePricing(review,{net:3000,freight:300,total:3300},warnings,{...policy,freight:'manual_review'});
assert.equal(flagged.verified,false,'manual_review must never silently approve a guess');
assert.ok(warnings.some(w=>w.includes('evidencia suficiente')));

const photo={invoice:{supplierName:'Distribuidora & Compañía',supplierRut:'76000000-K',invoiceNumber:'123',
  invoiceDate:'2026-10-15',totals:{net:3000,vat:570,total:3570},
  lines:[{description:'Cerveza <sin cargo>',invoiceQuantity:1,packSize:6,grossLineTotal:3570}]}};
const evidence=buildInternalInvoiceXml(photo);
assert.match(evidence,/origin="photo-derived" authenticatedDTE="false"/);
assert.match(evidence,/Distribuidora &amp; Compañía/);
assert.match(evidence,/Cerveza &lt;sin cargo&gt;/);
const xml='<DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>123</Folio><FchEmis>2026-10-15</FchEmis></IdDoc><Emisor><RUTEmisor>76000000-K</RUTEmisor></Emisor><Totales><MntNeto>3000</MntNeto><IVA>570</IVA><MntTotal>3570</MntTotal></Totales></Encabezado><Detalle><NmbItem>Cerveza</NmbItem><QtyItem>1</QtyItem><PrcItem>3000</PrcItem><MontoItem>3000</MontoItem></Detalle></Documento></DTE>';
const dte=parseOriginalDteXml(xml);
assert.equal(dte.folio,'123');
assert.equal(dte.lines[0].quantity,1);
assert.equal(verifyPhotoAgainstDte(photo,dte).verified,true);
assert.deepEqual(verifyPhotoAgainstDte({invoice:{...photo.invoice,totals:{total:4000}}},dte).discrepancies,['total']);
assert.throws(()=>parseOriginalDteXml('<!DOCTYPE foo [ <!ENTITY x SYSTEM "file:///x"> ]><DTE/>'),/entidades/);

// Cross-cutting workflow contracts: asynchronous, auditable, no invisible bulk archive.
const queue=read('../worker/src/api/invoice-async-v96.js');
const worker=read('../worker/src/worker-core.js');
const selection=read('../web/app-order-selection.js');
const detail=read('../web/app-order-detail-v30.js');
const invoice=read('../web/app-invoice-v30.js');
assert.match(queue,/UNIQUE\(org_id,user_id,idempotency_key\)/);
assert.match(queue,/status='processing'/);
assert.match(queue,/processInvoiceAnalysisJobs/);
assert.match(worker,/invoice_order_links/);
assert.match(worker,/receptions WHERE order_id=\? AND org_id=\? AND status='completed'/);
assert.match(worker,/\/api\/orders\/:id\/finalize/);
assert.match(worker,/transitionUrl\.pathname=.*transition/,'finalize must delegate to the canonical transition URL');
assert.match(detail,/name="notes" maxlength="500"/);
assert.match(invoice,/\/api\/invoices\/analyze\/async/);
assert.match(invoice,/Retomar lectura previa/);
assert.match(selection,/const targetChecked=control.checked/);
assert.match(selection,/for\(const input of changed\)input.checked=targetChecked/);

// Execute the actual checkbox binding logic with a minimal DOM double. This
// specifically catches a one-element selector masquerading as a collection.
function checkboxNode(){
  return{checked:false,dataset:{},listeners:{},
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
    dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn.call(this,event)},
    closest(){return{querySelector(){return{textContent:''}}}}};
}
const checkboxes=[checkboxNode(),checkboxNode(),checkboxNode()],master=checkboxNode();
const selectionCode=selection.slice(selection.indexOf(String.fromCharCode(10))+1)
  .replace('export function initializeOrderSelection()','function initializeOrderSelection()');
const twoDollar=String.fromCharCode(36,36);
const selectAllFactory=new Function('$',twoDollar,'document','MutationObserver','Event','requestAnimationFrame',
  selectionCode+String.fromCharCode(10)+'return {enhance}');
const dom={querySelectorAll:selector=>selector==='[data-v67-select]'?checkboxes:[]};
const wrapper={querySelector:()=>master},bulkBar={querySelector:()=>wrapper};
const {enhance}=selectAllFactory(sel=>sel==='.v67-bulkbar'?bulkBar:null,sel=>sel==='[data-v67-select]'?checkboxes:[],
  dom,class {},class {constructor(type){this.type=type}},handler=>handler());
enhance();
master.checked=true;master.dispatchEvent({type:'change'});
assert.deepEqual(checkboxes.map(node=>node.checked),[true,true,true],
  'one select-all event must select all items exactly once');
master.checked=false;master.dispatchEvent({type:'change'});
assert.deepEqual(checkboxes.map(node=>node.checked),[false,false,false]);
checkboxes[0].checked=true;checkboxes[0].dispatchEvent({type:'change'});
assert.equal(master.indeterminate,true,'partial selections must preserve indeterminate control');

console.log('Invoice async XML, supplier allocation, selection, and closure contracts: OK');
