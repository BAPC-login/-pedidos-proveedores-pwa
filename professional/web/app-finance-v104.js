import {$,$$,esc,state,api,money,date,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {previewDocument} from './app-file-actions.js';
import {openRoute} from './app-router-v14.js';

const paymentText={paid:'Pagada',pending:'Pendiente',scheduled:'Programada',overdue:'Vencida',disputed:'Objetada'};
const signed=value=>Number(value)>0?'+'+money(value):Number(value)<0?'-'+money(Math.abs(value)):money(0);
const signedPercent=value=>(Number(value)>0?'+':'')+Number(value||0).toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:2})+'%';
function priceDelta(data){
  const sign=Number(data?.delta||0)>0?'up':Number(data?.delta||0)<0?'down':'flat';
  return '<span class="v104-variation '+sign+'">'+signed(data?.delta||0)+' <b>'+signedPercent(data?.percent||0)+'</b></span>';
}
function comparisonBlock(title,item){
  return '<div class="v104-compare"><strong>'+esc(title)+'</strong>'+
    '<small>'+esc(item.hasHistory?(item.supplierName||'Historial disponible'):'Sin historial: referencia $0 y variación 0')+'</small>'+
    '<div><span>Anterior '+money(item.previousPrice||0)+'</span>'+priceDelta(item)+'</div></div>';
}
function impactLines(lines){
  return '<div class="v104-impact-list">'+(lines||[]).map(line=>
    '<article class="v104-impact-line"><div class="v104-product"><strong>'+esc(line.description||'Producto')+'</strong><small>'+
    esc(line.unit||'unidad')+' · Actual '+money(line.currentPrice||0)+(line.productId?'':' · sin producto vinculado')+'</small></div>'+
    '<div class="v104-impact-compare">'+comparisonBlock('Mismo proveedor',line.sameSupplier||{})+
    comparisonBlock('Otros proveedores',line.otherSupplier||{})+'</div></article>'
  ).join('')+'</div>';
}
export function showPriceImpactModalV104(impact){
  openModal({eyebrow:'EVOLUCIÓN DE PRECIOS',title:'Factura '+(impact.invoiceNumber||''),subtitle:(impact.supplierName||'Proveedor')+
    ' · diferencias por unidad física respecto de compras anteriores.',size:'large',hideSubmit:true,
    body:'<section class="v104-impact-heading"><strong>'+esc(impact.lines?.length||0)+' líneas cotejadas</strong><p>Las referencias corresponden a precios finales unitarios históricos. Sin historial se informa $0 y 0%; no se calcula una variación ficticia.</p></section>'+
      impactLines(impact.lines||[])});
}
export async function openInvoicePriceImpactV104(invoiceId){
  const response=await api('/api/invoices/'+encodeURIComponent(invoiceId)+'/price-impact',{fresh:true,timeout:22000});
  showPriceImpactModalV104(response.impact);
}
function markNav(){
  state.view='finance';state.subview='';
  $$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='finance'));
  if($('#pageEyebrow'))$('#pageEyebrow').textContent='CONTROL FINANCIERO';
  if($('#pageTitle'))$('#pageTitle').textContent='Finanzas';
  $('#primaryAction')?.classList.add('hidden');
}
const option=(id,label)=>'<option value="'+esc(id)+'">'+esc(label)+'</option>';
const statusChip=value=>'<span class="v104-state '+esc(value||'')+'">'+esc(paymentText[value]||'Pendiente')+'</span>';
function invoiceRow(item){
  const documental=item.status==='void'?'Anulada':item.validationStatus==='valid'?'Validada':item.validationStatus==='confirmed_difference'?'Con diferencia':'Registrada';
  return '<tr><td data-label="Fecha">'+esc(date(item.invoiceDate))+'</td>'+
    '<td data-label="Factura"><strong>'+esc(item.invoiceNumber)+'</strong><small>'+esc(item.orderFolios||'Sin folio')+'</small></td>'+
    '<td data-label="Proveedor">'+esc(item.supplierName||'—')+'</td>'+
    '<td data-label="Local">'+esc(item.locations||'—')+'</td>'+
    '<td data-label="Estado"><div class="v104-state-stack"><span>'+esc(documental)+'</span>'+statusChip(item.paymentStatus)+'</div></td>'+
    '<td data-label="Total" class="v104-amount"><strong>'+money(item.grossTotal||0)+'</strong>'+
      (item.dueDate?'<small>Vence '+esc(date(item.dueDate))+'</small>':'')+'</td>'+
    '<td data-label="Acciones"><div class="v104-cell-actions"><button type="button" class="btn small" data-v104-prices="'+esc(item.id)+'">Variación</button>'+
    (item.pdfKey?'<button type="button" class="btn small" data-v104-file="'+esc(item.id)+'">Factura</button>':'')+'</div></td></tr>';
}
export async function renderFinanceInvoicesV104(openLegacy){
  markNav();
  const root=$('#mainContent');
  let page=1,querySerial=0,filters={supplierId:'',from:'',to:'',invoiceNumber:''},lastData=null;
  root.innerHTML='<section class="v104-finance"><header class="v104-finance-head"><div><span class="eyebrow">FINANZAS · DOCUMENTOS TRIBUTARIOS</span><h2>Registro de facturas</h2><p>Facturas, estado de pago y precios históricos en un único lugar.</p></div><div class="v104-finance-tabs"><button type="button" class="btn primary" disabled>Facturas</button><button type="button" class="btn" id="v104Payments">Pagos y proveedores</button></div></header>'+
    '<div class="v104-filter"><label class="field"><span>Proveedor</span><select id="v104Supplier">'+option('','Todos los proveedores')+'</select></label>'+
    '<label class="field"><span>Desde</span><input id="v104From" type="date"></label><label class="field"><span>Hasta</span><input id="v104To" type="date"></label>'+
    '<label class="field v104-number"><span>Número de factura</span><input id="v104InvoiceNumber" autocomplete="off" placeholder="Ej. 54821"></label>'+
    '<button type="button" class="btn" id="v104Clear">Limpiar filtros</button></div>'+
    '<div class="v104-finance-summary" id="v104Summary" role="status">Cargando facturas…</div><div class="v104-table-viewport">'+
    '<table class="v104-invoice-table"><thead><tr><th>Fecha</th><th>Factura / pedido</th><th>Proveedor</th><th>Local</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>'+
    '<tbody id="v104InvoiceRows"><tr><td colspan="7">Cargando…</td></tr></tbody></table></div>'+
    '<div class="v104-pagination" id="v104Pagination"></div></section>';
  $('#v104Payments').onclick=()=>openLegacy?.();
  let supplierData=[];
  try{supplierData=(await api('/api/suppliers',{timeout:20000})).suppliers||[]}catch(error){toast('No se pudieron cargar proveedores: '+error.message,'error')}
  if(state.view!=='finance'||!$('#v104Supplier'))return;
  $('#v104Supplier').innerHTML=option('','Todos los proveedores')+supplierData.map(s=>option(s.id,s.name)).join('');
  function bindRowActions(items){
    const map=new Map(items.map(i=>[String(i.id),i]));
    $$('[data-v104-prices]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await openInvoicePriceImpactV104(button.dataset.v104Prices)}catch(error){toast(error.message,'error')}finally{if(button.isConnected)button.disabled=false}});
    $$('[data-v104-file]').forEach(button=>button.onclick=async()=>{const item=map.get(button.dataset.v104File);if(!item?.pdfKey)return;button.disabled=true;try{await previewDocument(item.pdfKey,item.pdfName||('factura-'+item.invoiceNumber+'.pdf'))}catch(error){toast(error.message,'error')}finally{if(button.isConnected)button.disabled=false}});
  }
  async function load(){
    const serial=++querySerial,qp=new URLSearchParams({page:String(page)});Object.entries(filters).forEach(([key,value])=>{if(value)qp.set(key,value)});
    const target=$('#v104InvoiceRows');if(target)target.innerHTML='<tr><td colspan="7" class="v104-loading">Cargando facturas…</td></tr>';
    try{
      const data=await api('/api/finance/invoice-register?'+qp.toString(),{fresh:true,timeout:25000});
      if(serial!==querySerial||state.view!=='finance'||!$('#v104InvoiceRows'))return;
      lastData=data;$('#v104InvoiceRows').innerHTML=data.invoices?.length?data.invoices.map(invoiceRow).join(''):'<tr><td colspan="7" class="v104-empty">No se encontraron facturas para estos filtros.</td></tr>';
      $('#v104Summary').textContent=data.total+' facturas · Total '+money(data.grossTotal||0);
      $('#v104Pagination').innerHTML='<span>Página '+data.page+' de '+Math.max(1,Math.ceil(data.total/data.limit))+'</span>'+
        '<div><button type="button" class="btn small" id="v104Prev" '+(page<=1?'disabled':'')+'>Anterior</button>'+
        '<button type="button" class="btn small" id="v104Next" '+(!data.hasMore?'disabled':'')+'>Siguiente</button></div>';
      $('#v104Prev').onclick=()=>{page--;load()};
      $('#v104Next').onclick=()=>{page++;load()};
      bindRowActions(data.invoices||[]);
    }catch(error){if(serial!==querySerial||!$('#v104InvoiceRows'))return;$('#v104InvoiceRows').innerHTML='<tr><td colspan="7" class="v104-empty">Error al cargar facturas: '+esc(error.message)+'</td></tr>';$('#v104Summary').textContent='No se pudieron cargar los registros';}
  }
  let timer=0;const apply=()=>{filters={supplierId:$('#v104Supplier').value,from:$('#v104From').value,to:$('#v104To').value,invoiceNumber:$('#v104InvoiceNumber').value.trim()};page=1;clearTimeout(timer);timer=setTimeout(load,180)};
  ['v104Supplier','v104From','v104To'].forEach(id=>$('#'+id).addEventListener('change',apply));
  $('#v104InvoiceNumber').addEventListener('input',apply);
  $('#v104Clear').onclick=()=>{['v104Supplier','v104From','v104To','v104InvoiceNumber'].forEach(id=>$('#'+id).value='');apply()};
  await load();
}
