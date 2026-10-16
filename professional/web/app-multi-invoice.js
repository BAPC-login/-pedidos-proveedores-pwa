import {$,$$,esc,state,api,toast,money,date,clearResponseCache} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';
import {showInvoiceCompletionV104} from './app-invoice-completion-v104.js';

const VERSION='38';
const MAX_DOCUMENTS=5;
const preV36Fetch=window.fetch.bind(window);
const DOCUMENT_TYPES=[['33','Factura electrónica'],['34','Factura exenta'],['39','Boleta electrónica'],['52','Guía de despacho electrónica'],['61','Nota de crédito electrónica'],['SC','Documento sin cargo'],['0','Otro documento']];
const DOCUMENT_TYPE_VALUES=new Set(DOCUMENT_TYPES.map(([value])=>value));
const TRIGGERS=['#attachInvoice','#attachInvoiceBottom','#v18AttachInvoice','#v18AttachInvoiceBottom','#v30AttachInvoice','#v30AttachInvoiceBottom','#v30GoInvoice','[data-v16-invoice]','[data-v30-order-invoice]','[data-v38-order-documents]','[data-action="analyze-invoice"]'].join(',');
let queue=null,opening=false,enhanceScheduled=false,previewUrls=[];

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const attachableOrder=order=>order&&(order.publicState||order.status)!=='editing'&&!['draft','cancelled'].includes(String(order.status||''));
const canUpload=()=>['owner','admin','receiver','finance','purchaser'].includes(String(state.me?.user?.role||''));
const fileSize=value=>value>=1024*1024?`${(value/1024/1024).toFixed(2)} MB`:`${Math.max(1,Math.round(value/1024))} KB`;
const integer=value=>Number(String(value??'').replace(/[^0-9-]/g,''))||0;
const decimal=value=>{const raw=String(value??'').trim().replace(/\s|\$/g,'');if(!raw)return 0;let normalized=raw;if(raw.includes(',')&&raw.includes('.'))normalized=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');else if(raw.includes(','))normalized=raw.replace(',','.');const number=Number(normalized);return Number.isFinite(number)?number:0};
const unitMoney=value=>{const number=Math.max(0,decimal(value));return `$${number.toLocaleString('es-CL',{minimumFractionDigits:Number.isInteger(number)?0:1,maximumFractionDigits:2})}`};
const kindLabel=kind=>kind==='free'?'Sin cargo':'Factura';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function injectStyles(){
  if($('#nuvastoMultiInvoiceV38Styles'))return;
  const style=document.createElement('style');style.id='nuvastoMultiInvoiceV38Styles';style.textContent=`
    .v38-upload-copy{display:grid;gap:5px}.v38-upload-copy strong{font-size:12px}.v38-upload-copy small{color:var(--muted);font-size:8px;line-height:1.45}
    .v38-selected-list{display:grid;gap:9px;margin-top:10px}.v38-selected-empty{padding:18px;border:1px dashed var(--line);border-radius:14px;text-align:center;color:var(--muted);font-size:9px}
    .v38-selected-file{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(155px,.55fr);gap:10px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:14px;background:var(--soft);min-width:0}
    .v38-file-number{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary);font-weight:950}.v38-file-copy{min-width:0}.v38-file-copy strong,.v38-file-copy small{display:block}.v38-file-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v38-file-copy small{margin-top:4px;color:var(--muted);font-size:8px}.v38-selected-file select{width:100%}
    .v38-batch-note{display:grid;gap:5px;padding:13px 14px;border:1px solid color-mix(in srgb,var(--primary) 25%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--primary) 6%,var(--card))}.v38-batch-note strong{font-size:11px}.v38-batch-note p{margin:0;color:var(--muted);font-size:8px;line-height:1.5}
    .v38-review-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:12px;padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}.v38-review-index{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--primary);color:#fff;font-weight:950}.v38-review-head strong,.v38-review-head small{display:block}.v38-review-head small{margin-top:4px;color:var(--muted);font-size:8px;overflow-wrap:anywhere}.v38-kind{padding:6px 9px;border-radius:999px;background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary);font-size:7px;font-weight:950;text-transform:uppercase}.v38-kind.free{background:color-mix(in srgb,var(--success) 13%,var(--card));color:var(--success)}
    .v38-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.v38-summary article{padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}.v38-summary strong,.v38-summary small{display:block}.v38-summary strong{font-size:16px}.v38-summary small{margin-top:4px;color:var(--muted);font-size:7px;text-transform:uppercase;letter-spacing:.08em}
    .v38-money-input{font-variant-numeric:tabular-nums}.v38-document-free{border-color:color-mix(in srgb,var(--success) 36%,var(--line))!important}.v38-document-free [name=isFree]{pointer-events:none}.v38-document-free .v38-money-input{opacity:.7;background:var(--soft)!important}
    .v38-price-breakdown{grid-column:1/-1;display:grid;gap:4px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--success) 22%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--success) 5%,var(--card))}.v38-price-breakdown strong{font-size:9px}.v38-price-breakdown p{margin:0;color:var(--muted);font-size:8px;line-height:1.45}.v38-price-breakdown.review{border-color:color-mix(in srgb,var(--warning) 30%,var(--line));background:color-mix(in srgb,var(--warning) 5%,var(--card))}
    .v38-error-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.v38-manual-row{border-style:dashed!important}.v38-manual-row .v30-reconcile-status{background:var(--soft)!important;color:var(--muted)!important}
    @media(max-width:620px){.v38-selected-file{grid-template-columns:auto minmax(0,1fr)}.v38-selected-file label{grid-column:1/-1}.v38-review-head{grid-template-columns:auto minmax(0,1fr)}.v38-kind{grid-column:1/-1;width:max-content}.v38-summary{grid-template-columns:1fr 1fr}.v38-summary article:last-child{grid-column:1/-1}.v38-error-actions{grid-template-columns:1fr}}
  `;document.head.append(style);
}

async function loadSources(){
  const [orders,products,suppliers,locations]=await Promise.all([
    api('/api/orders',{fresh:true,timeout:20000}),api('/api/products',{fresh:true,timeout:20000}),api('/api/suppliers',{fresh:true,timeout:20000}),api('/api/locations',{fresh:true,timeout:20000})
  ]);
  state.cache.orders=orders.orders||[];state.cache.products=products.products||[];state.cache.suppliers=suppliers.suppliers||[];state.cache.locations=locations.locations||[];
}

function beginAnalysisTransition(){const dialog=$('#modal');if(!dialog?.open)return;dialog.classList.add('invoice-analysis-transition');dialog.setAttribute('aria-busy','true')}
function endAnalysisTransition(){const dialog=$('#modal');if(!dialog)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{dialog.classList.remove('invoice-analysis-transition');dialog.removeAttribute('aria-busy')}))}
function typeOptions(selected){const safe=DOCUMENT_TYPE_VALUES.has(String(selected||''))?String(selected):'0';return DOCUMENT_TYPES.map(([value,label])=>`<option value="${value}" ${safe===value?'selected':''}>${esc(label)}</option>`).join('')}
function tokens(value){return new Set(String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(' ').filter(token=>token.length>1&&!['DE','DEL','LA','EL','Y','CON','SIN','UNIDAD','CAJA','PACK','DISPLAY'].includes(token)))}
function similarity(left,right){const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;let hits=0;for(const token of a)if(b.has(token)||[...b].some(other=>other.startsWith(token)||token.startsWith(other)))hits++;return hits/Math.max(a.size,b.size)}
function lineSource(line,index){return line.sourceLine||line.descriptionOriginal||line.sourceDescription||line.description||`Línea ${index+1}`}
function scoreLabel(value,manual=false){if(manual)return'Ingreso manual';const score=Number(value||0);return score>=.8?'Coincidencia alta':score>=.55?'Coincidencia media':'Revisión manual'}
function conversion(line,manual=false){if(manual)return'Completa cantidad y valores únicamente desde el documento visible.';if(line.conversionSummary)return line.conversionSummary;const qty=Number(line.packageQty??line.invoiceQuantity??0),pack=Number(line.packSize||1),units=Number(line.units||qty*pack),orderPack=Number(line.orderPackSize||1);return orderPack>1?`Documento: ${units} unidades = ${Number((units/orderPack).toFixed(3))} formatos de ${orderPack}`:`Documento: ${units} unidades`}
function supplierItems(order){const ordered=new Map((order.items||[]).filter(item=>item.productId).map(item=>[String(item.productId),{id:String(item.productId),name:item.description,unit:item.orderUnit,pack:Number(item.unitsPerOrderUnit||1),ordered:true,relationId:item.supplierProductId||''}]));const others=[];for(const product of state.cache.products||[]){if(!product.active||ordered.has(String(product.id)))continue;const relation=(product.suppliers||[]).find(item=>String(item.supplierId)===String(order.supplierId));if(!relation)continue;others.push({id:String(product.id),name:relation.supplierProductName||product.name,unit:relation.orderUnit,pack:Number(relation.unitsPerOrderUnit||1),ordered:false,relationId:relation.id})}return{ordered:[...ordered.values()],others:others.sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}))}}
function productOptions(order,selected=''){const options=values=>values.map(item=>`<option value="${esc(item.id)}" data-extra="${item.ordered?'0':'1'}" data-pack="${item.pack}" data-relation-id="${esc(item.relationId)}" ${item.id===String(selected)?'selected':''}>${esc(item.name)} · ${esc(item.unit||'UNIDAD')}</option>`).join('');const catalog=supplierItems(order);return`<option value="">Sin vincular · revisar línea</option><optgroup label="Productos del pedido">${options(catalog.ordered)}</optgroup><optgroup label="Otros productos de este proveedor">${options(catalog.others)}</optgroup>`}
function canRegisterInvoiceReception(order){return ['owner','admin','receiver'].includes(String(state.me?.user?.role||''))&&!['draft','received','reconciled','closed','cancelled'].includes(String(order?.status||''))}
function acceptedDefault(line,order,manual=false){if(manual||!canRegisterInvoiceReception(order))return 0;const qty=Number(line.packageQty??line.invoiceQuantity??0),pack=Number(line.packSize||1),physical=Math.max(0,qty*pack);const ordered=(order.items||[]).find(item=>String(item.productId)===String(line.productId));if(!ordered)return physical;const perOrder=Math.max(.001,Number(ordered.unitsPerOrderUnit||1)),pending=Math.max(0,Number(ordered.quantityOrdered||0)-Number(ordered.quantityReceived||0));return Math.round(Math.min(physical/perOrder,pending)*1000)/1000;}
function renderUnifiedInvoiceLines(lines,order,kind,manual){
  const enabled=canRegisterInvoiceReception(order);
  const count=(order.items||[]).length;
  return `<section class="v100-invoice-reception">
    <header class="v100-invoice-title"><div><span class="eyebrow">FACTURA Y RECEPCIÓN · MISMA LISTA</span><h3>Cotejo línea por línea</h3><p>Confirma qué llegó. Las incidencias y el costeo están ocultos hasta desplegarlos; los productos extras se vinculan al catálogo del proveedor.</p></div><span class="v100-counter">${lines.length} líneas · ${count} solicitadas</span></header>
    ${enabled?'<label class="v100-receive-switch"><input type="checkbox" name="markReceived" checked><span><strong>Guardar factura y confirmar recepción</strong><small>Desmarca solo si estás registrando el documento sin recibir físicamente los productos.</small></span></label>':'<div class="v30-inline-notice"><strong>Solo registro documental</strong><p>Este pedido ya está recepcionado/cerrado o tu rol no tiene permiso de recepción. No se duplicará el movimiento de inventario.</p></div>'}
    <div class="v100-invoice-list">${lines.map((line,i)=>{
      const manualRow=manual||line.manualTemplate,forced=kind==='free'||line.isFree;
      const match=(order.items||[]).find(item=>String(item.productId)===String(line.productId));
      const qty=Number(line.packageQty??line.invoiceQuantity??0),pack=Number(line.packSize||1),unit=match?.orderUnit||'unidad';
      const received=acceptedDefault(line,order,manualRow);
      const source=match?`Pedido ${Number(match.quantityOrdered||0)} ${unit} · recibido ${Number(match.quantityReceived||0)} · factura ${qty*pack} unidades físicas`:(line.productId?'No solicitado · producto del proveedor':'Sin producto vinculado · selecciona o crea');
      return `<article class="v100-invoice-row ${match?'v100-ordered':'v100-extra'}" data-invoice-line="${i}" data-printed-final-unit="${esc(forced||manualRow?'':line.printedFinalUnitPrice??line.finalUnitPrice??'')}">
        <div class="v100-line-description"><strong>${esc(lineSource(line,i))}</strong><small>${esc(source)}</small><small class="v100-match-state">${esc(match?'Pedido · coincide':'Factura · no solicitado')}${manualRow?' · entrada manual':''}</small></div>
        <label class="field v100-quantity"><span>Recibido</span><input type="number" name="accepted" min="0" step="0.001" inputmode="decimal" value="${received}" ${enabled?'':'disabled'} aria-label="Cantidad recibida de ${esc(lineSource(line,i))}"></label>
        <button type="button" class="v96-reception-toggle v100-invoice-toggle" aria-expanded="false" aria-controls="v100InvoiceExtra${i}" data-v100-invoice-toggle aria-label="Ver cotejo e incidencias de ${esc(lineSource(line,i))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="v100-line-link"><label class="field"><span>Producto asignado · ${match?'pedido':'proveedor'}</span><select name="productId">${productOptions(order,line.productId)}</select></label>
          <button type="button" class="btn small" data-v100-create-toggle aria-label="Crear producto y vincular al proveedor">+ Crear producto</button></div>
        <div class="v100-new-product" hidden><label class="field"><span>Nombre del producto nuevo</span><input name="newProductName" maxlength="200" value="${esc(lineSource(line,i))}"></label><label class="field"><span>Formato proveedor</span><select name="newProductUnit"><option value="UNIDAD">Unidad</option><option value="CAJA">Caja</option><option value="PACK">Pack</option><option value="DISPLAY">Display</option></select></label><label class="field"><span>Unidades por formato</span><input name="newProductPack" type="number" min=".001" step=".001" value="${Math.max(.001,pack)}"></label><button class="btn primary" type="button" data-v100-create-save>Crear y vincular</button></div>
        <div class="v100-invoice-extra" id="v100InvoiceExtra${i}" hidden>
          <div class="v100-invoice-fields"><label class="field"><span>Cantidad según factura</span><input name="packageQty" type="number" min="0" step=".001" inputmode="decimal" value="${qty}"></label><label class="field"><span>Unidades por formato</span><input name="packSize" type="number" min=".001" step=".001" inputmode="decimal" value="${pack}"></label><label class="field"><span>Total unidades facturadas</span><output data-units>${Number(line.units??qty*pack)}</output></label>
          ${lineMoneyField(forced?0:line.grossLineTotal,forced)}<label class="field"><span>Precio bruto por unidad</span><output data-price>${esc(unitMoney(forced?0:(line.printedFinalUnitPrice??line.finalUnitPrice??line.grossUnitPrice??0)))}</output></label>
          <label class="check-card"><input type="checkbox" name="isFree" ${forced?'checked':''} ${kind==='free'?'disabled':''}><span>Bonificado · $0</span></label>
          <label class="field"><span>Incidencia</span><select name="qualityType"><option value="">Sin incidencia</option><option value="missing">Faltante</option><option value="damaged">Dañado</option><option value="expired">Vencido</option><option value="temperature">Temperatura</option><option value="overage">Excedente</option><option value="lot">Lote</option><option value="note">Otra</option></select></label>
          <label class="field"><span>Cantidad rechazada</span><input name="rejected" type="number" min="0" step=".001" value="0" inputmode="decimal"></label><label class="field"><span>Observación de recepción</span><input name="qualityNote" placeholder="Describe la incidencia"></label><label class="field"><span>Lote</span><input name="lotNumber"></label><label class="field"><span>Vencimiento</span><input name="expiresAt" type="date"></label><label class="field"><span>Nota de factura</span><input name="freeReason" value="${esc(line.freeReason||line.notes||(kind==='free'?'Documento sin cargo':''))}"></label>
          ${priceBreakdown(line,forced,manualRow)}</div>
        </div>
      </article>`}).join('')}</div></section>`;
}

function reconcileLines(source,order,nature){
  const groups=supplierItems(order),products=[...groups.ordered,...groups.others].map(item=>({id:item.id,name:item.name,pack:item.pack,ordered:item.ordered}));
  return (Array.isArray(source)?source:[]).map((line,index)=>{
    let resolved={...line};
    if(!resolved.productId||!products.some(product=>String(product.id)===String(resolved.productId))){resolved={...resolved,productId:'',supplierProductId:''};const best=products.map(product=>({product,score:similarity(lineSource(resolved,index),product.name)})).sort((a,b)=>b.score-a.score)[0];if(best?.score>=.83)resolved={...resolved,productId:best.product.id,description:best.product.name,orderPackSize:best.product.pack,confidence:Math.max(Number(resolved.confidence||0),best.score),matchMethod:best.product.ordered?'nuvasto_order_match':'nuvasto_supplier_catalog'}}
    if(nature==='free')resolved={...resolved,isFree:true,grossLineTotal:0,netLineTotal:0,grossUnitPrice:0,freeReason:resolved.freeReason||'Documento sin cargo'};
    return resolved;
  });
}
function manualLines(analysis,order,nature){
  const source=Array.isArray(analysis.manualCandidates)&&analysis.manualCandidates.length?analysis.manualCandidates:order.items.map(item=>({productId:item.productId,description:item.description,orderUnit:item.orderUnit,orderedQty:item.quantityOrdered,unitsPerOrderUnit:item.unitsPerOrderUnit}));
  return source.map((item,index)=>({id:`manual-${index+1}`,manualTemplate:true,productId:String(item.productId||''),description:String(item.description||`Producto ${index+1}`),sourceDescription:String(item.description||`Producto ${index+1}`),packageQty:0,invoiceQuantity:0,packSize:Math.max(.001,Number(item.unitsPerOrderUnit||1)),units:0,totalUnits:0,grossLineTotal:0,grossUnitPrice:0,confidence:0,matchMethod:'manual-user-entry',isFree:nature==='free',freeReason:nature==='free'?'Documento sin cargo':''}));
}

function moneyField(name,label,value,disabled=false){const amount=Math.max(0,integer(value));return `<label class="field"><span>${esc(label)}</span><input class="v38-money-input" type="text" inputmode="numeric" autocomplete="off" data-v38-money-display="${esc(name)}" value="${esc(money(amount))}" ${disabled?'disabled':''}><input type="hidden" name="${esc(name)}" value="${amount}"></label>`}
function lineMoneyField(value,disabled=false){const amount=Math.max(0,integer(value));return `<label class="field"><span>Total final de la línea</span><input class="v38-money-input" type="text" inputmode="numeric" autocomplete="off" data-v38-line-money value="${esc(money(amount))}" ${disabled?'disabled':''}><input type="hidden" name="grossLineTotal" value="${amount}"></label>`}
function pricingMethodLabel(line){const value=String(line.taxAllocationMethod||line.priceSource||'').toLowerCase();if(value.includes('printed')||value.includes('final-unit'))return'Precio final impreso';if(value.includes('column')||value.includes('matrix'))return'Suma de columnas del documento';if(value.includes('proportional')||value.includes('allocation'))return'Distribución según totales del documento';if(value.includes('fallback')||value.includes('unverified'))return'Revisión manual de la línea';return'Validación matemática del documento'}
function priceBreakdown(line,forced=false,manual=false){if(forced||manual)return'';const printed=decimal(line.printedFinalUnitPrice??line.finalUnitPrice);if(printed>0&&String(line.priceSource||'')==='printed-final-unit')return`<div class="v38-price-breakdown ${line.priceVerified?'':'review'}"><strong>Precio final impreso · Total x Unidad</strong><p>La factura informa ${esc(unitMoney(printed))} por unidad. Nuvasto usa ese valor solo porque la columna existe y el documento cierra matemáticamente.</p></div>`;const net=integer(line.netLineTotal),freight=integer(line.allocatedFreight??line.freightLine),vat=integer(line.allocatedVat??line.vatLine),additional=integer(line.allocatedAdditionalTax??line.additionalTaxLine),other=integer(line.allocatedOtherCharges??line.otherLineCharges),parts=[];if(net)parts.push(`Neto ${money(net)}`);if(freight)parts.push(`Flete ${money(freight)}`);if(vat)parts.push(`IVA ${money(vat)}`);if(additional)parts.push(`Adicional ${money(additional)}`);if(other)parts.push(`Otros ${money(other)}`);if(!parts.length)return`<div class="v38-price-breakdown review"><strong>Precio pendiente de verificación</strong><p>No hay suficientes componentes impresos para cerrar esta línea.</p></div>`;return`<div class="v38-price-breakdown ${line.priceVerified?'':'review'}"><strong>${line.priceVerified?'Matriz de precio cerrada':'Matriz con revisión pendiente'}</strong><p>${esc(parts.join(' + '))} = ${money(integer(line.grossLineTotal))}. Método: ${esc(pricingMethodLabel(line))}.</p></div>`}
function pricingAudit(invoice,manual=false){if(manual)return'';const summary=invoice.pricingSummary||{},matrix=summary.matrix||{},hasEvidence=Boolean(summary.method)||Number(invoice.totals?.total||0)>0||Number(summary.documentTotalComputed||0)>0;if(!hasEvidence)return'';const delta=Number(summary.checksumDelta||0),verified=summary.verified===true;return`<section class="v38-batch-note"><strong>${verified?'Cierre matemático verificado':'Cierre matemático por revisar'}</strong><p>Método: ${esc(String(summary.method||'sin determinar').replaceAll('-',' '))}. Total impreso ${money(Number(invoice.totals?.total||0))} · total reconstruido ${money(Number(summary.documentTotalComputed||0))} · diferencia ${money(Math.abs(delta))}.${matrix.adjustments?.length?` Se reconciliaron ${matrix.adjustments.length} columna${matrix.adjustments.length===1?'':'s'} contra los totales impresos.`:''}</p></section>`}

function reviewBody(analysis,lines,order,item,index,total,manual=false){
  const invoice=analysis.invoice||{},totals=invoice.totals||{},free=item.kind==='free',aiRead=manual||analysis.degraded?0:lines.length,aiMatched=manual||analysis.degraded?0:lines.filter(line=>line.productId).length,warnings=[...new Set([...(analysis.warnings||[]),...(invoice.warnings||[])].map(value=>String(value||'').trim()).filter(Boolean))];
  const rawType=free?'SC':(invoice.documentTypeCode||invoice.documentType||'0'),type=DOCUMENT_TYPE_VALUES.has(String(rawType))?String(rawType):'0';
  const manualNotice=manual?'<section class="v30-inline-notice"><strong>Ingreso manual explícito</strong><p>Los productos que aparecen abajo provienen del pedido, no de la IA. Nuvasto no marcará ninguna cantidad, precio, folio ni fecha como leída: completa solamente lo que puedas comprobar en el documento.</p></section>':'';
  return `<section class="v38-review-head"><span class="v38-review-index">${index+1}</span><div><strong>${esc(item.file.name)}</strong><small>${fileSize(item.file.size)} · documento ${index+1} de ${total}</small></div><span class="v38-kind ${free?'free':''}">${kindLabel(item.kind)}</span></section>${manualNotice}${free?'<section class="v38-batch-note"><strong>Documento completo sin cargo</strong><p>Todas sus líneas se guardarán con precio $0. Debes confirmar manualmente las cantidades si la lectura automática no fue verificable.</p></section>':''}${warnings.length&&!manual?`<section class="v30-inline-notice"><strong>Observaciones de lectura</strong><p>${warnings.map(esc).join(' · ')}</p></section>`:''}${pricingAudit(invoice,manual)}<section class="v38-summary"><article><strong>${aiRead}</strong><small>Líneas leídas por IA</small></article><article><strong>${aiMatched}/${aiRead}</strong><small>Vínculos IA</small></article><article><strong>${analysis.elapsedMs?`${Math.round(analysis.elapsedMs/1000)} s`:'—'}</strong><small>Procesamiento</small></article></section><div class="v30-field-grid"><label class="field"><span>Tipo de documento</span><select name="documentType">${typeOptions(type)}</select></label><label class="field"><span>Número de documento</span><input name="invoiceNumber" value="${esc(invoice.invoiceNumber||'')}" required></label><label class="field"><span>Fecha</span><input name="invoiceDate" type="date" value="${esc(invoice.invoiceDate||'')}" required></label>${moneyField('net','Neto',free?0:totals.net,free)}${moneyField('vat','IVA',free?0:(totals.vat||totals.tax),free)}${moneyField('additionalTax','Impuesto adicional',free?0:totals.additionalTax,free)}${moneyField('freight','Flete',free?0:totals.freight,free)}${moneyField('other','Otros cargos',free?0:totals.other,free)}${moneyField('total','Total',free?0:totals.total,free)}</div>${renderUnifiedInvoiceLines(lines,order,item.kind,manual)}`;
}

function bindMoney(root=document){
  root.querySelectorAll('[data-v38-money-display]').forEach(display=>{if(display.dataset.bound)return;display.dataset.bound='1';const hidden=display.nextElementSibling;display.addEventListener('focus',()=>{display.value=String(integer(hidden.value));requestAnimationFrame(()=>display.select())});display.addEventListener('input',()=>{hidden.value=String(Math.max(0,integer(display.value)))});display.addEventListener('blur',()=>display.value=money(hidden.value))});
  root.querySelectorAll('[data-v38-line-money]').forEach(display=>{if(display.dataset.bound)return;display.dataset.bound='1';const hidden=display.nextElementSibling;display.addEventListener('focus',()=>{display.value=String(integer(hidden.value));requestAnimationFrame(()=>display.select())});display.addEventListener('input',()=>{hidden.value=String(Math.max(0,integer(display.value)));const row=display.closest('[data-invoice-line]');if(row)row.dataset.printedFinalUnit='';row?.dispatchEvent(new Event('v38:math'))});display.addEventListener('blur',()=>display.value=money(hidden.value))});
}
function bindUnifiedInvoiceReception(order,lines){
  const allowedCreate=['owner','admin','purchaser'].includes(String(state.me?.user?.role||''));
  const register=$('[name=markReceived]');
  function syncReceiptState(){
    const enabled=Boolean(register?.checked);
    $('[data-invoice-line] [name=accepted],[data-invoice-line] [name=rejected]').forEach(input=>input.disabled=!enabled);
  }
  register?.addEventListener('change',syncReceiptState);syncReceiptState();
  $('[data-invoice-line]').forEach((row,index)=>{
    const toggle=row.querySelector('[data-v100-invoice-toggle]'),panel=row.querySelector('.v100-invoice-extra');
    toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));panel.hidden=open;});
    const createToggle=row.querySelector('[data-v100-create-toggle]'),createPanel=row.querySelector('.v100-new-product');
    if(!allowedCreate){createToggle.disabled=true;createToggle.title='Requiere permiso de Compras para crear productos';}
    createToggle?.addEventListener('click',()=>{if(allowedCreate)createPanel.hidden=!createPanel.hidden;});
    const select=row.querySelector('[name=productId]');
    select?.addEventListener('change',()=>{
      const value=select.value,ordered=(order.items||[]).find(item=>String(item.productId)===value);
      const billed=Number(row.querySelector('[name=packageQty]').value||0)*Number(row.querySelector('[name=packSize]').value||1);
      const amount=ordered?Math.min(billed/Math.max(.001,Number(ordered.unitsPerOrderUnit||1)),Math.max(0,Number(ordered.quantityOrdered||0)-Number(ordered.quantityReceived||0))):billed;
      const accepted=row.querySelector('[name=accepted]');
      if(accepted&&register?.checked)accepted.value=String(Math.round(amount*1000)/1000);
      row.classList.toggle('v100-extra',!ordered);row.classList.toggle('v100-ordered',Boolean(ordered));
      const label=row.querySelector('.v100-match-state');if(label)label.textContent=ordered?'Pedido · coincide':value?'Factura · extra del proveedor':'Sin vincular';
    });
    row.querySelector('[data-v100-create-save]')?.addEventListener('click',async event=>{
      const button=event.currentTarget,productName=row.querySelector('[name=newProductName]').value.trim();
      if(!productName){toast('Escribe el nombre del producto','error');return}
      const already=(state.cache.products||[]).find(product=>product.name.toLocaleLowerCase('es')===productName.toLocaleLowerCase('es')&&product.active!==false);
      if(already&&(already.suppliers||[]).some(item=>item.supplierId===order.supplierId)){toast('Ya existe con este proveedor. Selecciónalo en la lista','error');return}
      const pack=Number(row.querySelector('[name=newProductPack]').value),unit=row.querySelector('[name=newProductUnit]').value;
      if(!Number.isFinite(pack)||pack<=0){toast('El formato debe tener unidades válidas','error');return}
      button.disabled=true;button.textContent='Creando…';
      try{
        const created=already?{product:already}:await api('/api/products',{method:'POST',json:{name:productName,baseUnit:'UNIDAD',contentUnit:'unidad',contentValue:0,costCenterIds:order.costCenterId?[order.costCenterId]:[]}});
        const productId=created.product?.id;
        if(!productId)throw new Error('No se pudo confirmar la creación del producto');
        await api('/api/products/'+encodeURIComponent(productId)+'/suppliers',{method:'POST',json:{supplierId:order.supplierId,supplierProductName:productName,orderUnit:unit,unitsPerOrderUnit:pack,quantityMultiple:1}});
        const data=await api('/api/products',{fresh:true,timeout:20000});state.cache.products=data.products||[];
        $('[data-invoice-line] [name=productId]').forEach(other=>{
          const chosen=other===select?productId:other.value;
          other.innerHTML=productOptions(order,chosen);other.value=chosen;
          other.dispatchEvent(new Event('change',{bubbles:false}));
        });
        createPanel.hidden=true;toast(already?'Producto existente vinculado al proveedor':'Producto creado y vinculado al proveedor');
      }catch(error){toast(error.message||'No se pudo crear el producto','error')}
      finally{button.disabled=false;button.textContent='Crear y vincular'}
    });
  });
}

function bindLineMath(nature){
  $$('[data-invoice-line]').forEach(row=>{
    const calculate=()=>{const qty=Number(row.querySelector('[name=packageQty]').value||0),pack=Number(row.querySelector('[name=packSize]').value||1),checkbox=row.querySelector('[name=isFree]'),free=nature==='free'||checkbox.checked,totalDisplay=row.querySelector('[data-v38-line-money]'),totalHidden=row.querySelector('[name=grossLineTotal]'),printed=decimal(row.dataset.printedFinalUnit||0);if(free){totalHidden.value='0';totalDisplay.value=money(0);totalDisplay.disabled=true}else totalDisplay.disabled=false;const units=qty*pack;if(!free&&printed>0&&units>0){totalHidden.value=String(Math.round(printed*units));totalDisplay.value=money(totalHidden.value)}const total=free?0:Number(totalHidden.value||0);row.querySelector('[data-units]').textContent=String(Math.round(units*1000)/1000);row.querySelector('[data-price]').textContent=free?money(0):(printed>0?unitMoney(printed):money(units?Math.round(total/units):0))};
    row.querySelectorAll('[name=packageQty],[name=packSize],[name=isFree]').forEach(input=>input.addEventListener('input',calculate));row.addEventListener('v38:math',calculate);calculate();
  });
}

async function createInvoice(payload){
  const response=await preV36Fetch('/api/invoices',{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  if(!response.ok||result.ok===false)throw Object.assign(new Error(result.error||'No se pudo guardar el documento'),{status:response.status,code:result.code,details:result.details});
  clearResponseCache();state.cache.dashboard=null;state.cache.orders=[];state.cache.invoices=[];return {...(result.invoice||result.result||result),reception:result.reception||null,receptionError:result.receptionError||'',receptionErrorCode:result.receptionErrorCode||''};
}

async function openReview(analysis,item,{manual=false}={}){
  if(!queue?.active)return;
  const invoice=analysis.invoice||{},source=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[],lines=manual?manualLines(analysis,queue.order,item.kind):reconcileLines(source,queue.order,item.kind),position=queue.index,total=queue.items.length;
  if(!lines.length){showQueueError(Object.assign(new Error('La IA no encontró líneas verificables en este archivo. Reintenta la lectura o usa el ingreso manual.'),{code:'invoice_lines_not_detected'}),item,analysis);return}
  openModal({eyebrow:`DOCUMENTO ${position+1} DE ${total}`,title:`Revisar ${kindLabel(item.kind).toLowerCase()}`,subtitle:manual?'Ingreso manual: confirma únicamente los datos visibles en el documento.':'Confirma este documento de manera independiente antes de continuar con el siguiente.',size:'large',closeOnSuccess:false,body:reviewBody(analysis,lines,queue.order,item,position,total,manual),submitLabel:item.kind==='free'?'Guardar documento sin cargo':'Guardar factura y continuar',onSubmit:async form=>{
    const rejected=new Set(),rows=$('[data-invoice-line]'),shouldReceive=Boolean(form.get('markReceived'))&&canRegisterInvoiceReception(queue.order);
    const reviewed=rows.map((row,index)=>{
      const original=lines[index],select=row.querySelector('[name=productId]'),productId=select.value,
        option=select.selectedOptions?.[0],ordered=(queue.order.items||[]).find(item=>String(item.productId)===String(productId)),
        packageQty=Number(row.querySelector('[name=packageQty]').value||0),packSize=Number(row.querySelector('[name=packSize]').value||1),
        units=packageQty*packSize,isFree=item.kind==='free'||row.querySelector('[name=isFree]').checked,
        grossLineTotal=isFree?0:Number(row.querySelector('[name=grossLineTotal]').value||0),
        printedFinalUnitPrice=isFree?0:decimal(row.dataset.printedFinalUnit||0),
        accepted=Number(row.querySelector('[name=accepted]').value||0),rejectedQty=Number(row.querySelector('[name=rejected]').value||0);
      if([packageQty,packSize,units,accepted,rejectedQty].some(qty=>!Number.isFinite(qty)||qty<0)||packSize<=0)throw new Error('Cantidad inválida en línea '+(index+1));
      const factor=ordered?Math.max(.001,Number(ordered.unitsPerOrderUnit||1)):1,
        remaining=ordered?Math.max(0,Number(ordered.quantityOrdered||0)-Number(ordered.quantityReceived||0)):Infinity;
      if(shouldReceive&&(accepted+rejectedQty)*factor>units+.001)throw new Error('Recibido + rechazado supera lo indicado en factura en línea '+(index+1));
      if(shouldReceive&&ordered&&accepted>remaining+.001&&row.querySelector('[name=qualityType]').value!=='overage')throw new Error('Se supera lo pendiente del pedido en línea '+(index+1));
      if(shouldReceive&&!productId&&(accepted>0||rejectedQty>0))throw new Error('Vincula el producto antes de recibir la línea '+(index+1));
      return {...original,productId,supplierProductId:option?.dataset.relationId||original.supplierProductId||'',
        sourceDescription:lineSource(original,index),packageQty,invoiceQuantity:packageQty,packSize,units,totalUnits:units,grossLineTotal,
        grossUnitPrice:isFree?0:(printedFinalUnitPrice>0?printedFinalUnitPrice:(units?Math.round(grossLineTotal/units):0)),
        printedFinalUnitPrice,finalUnitPrice:printedFinalUnitPrice||original.finalUnitPrice||0,
        priceSource:printedFinalUnitPrice>0?'printed-final-unit':original.priceSource,isFree,
        freeReason:isFree?(row.querySelector('[name=freeReason]').value||'Documento sin cargo'):'',
        extraAccepted:Boolean(productId&&!ordered&&accepted>0),receivedUnits:shouldReceive?Number((accepted*factor).toFixed(3)):0,
        rejectedUnits:shouldReceive?Number((rejectedQty*factor).toFixed(3)):0,
        qualityType:row.querySelector('[name=qualityType]').value,
        qualityNote:row.querySelector('[name=qualityNote]').value,
        lotNumber:row.querySelector('[name=lotNumber]').value,
        expiresAt:row.querySelector('[name=expiresAt]').value,
        rejectedByPolicy:false,policyAction:original.policyAction||'review',matchMethod:manual?'manual-user-entry':original.matchMethod,
        confidence:manual?0:Number(original.confidence||0)};
    });
    const linked=reviewed.filter((line,index)=>!rejected.has(index)&&line.productId);
    if(!linked.length)throw new Error('Vincula al menos una línea con un producto del pedido o del catálogo del proveedor.');
    if(!linked.some(line=>Number(line.units||0)>0))throw new Error('Ingresa al menos una cantidad visible del documento antes de guardarlo.');
    if(shouldReceive&&!reviewed.some(line=>line.receivedUnits>0||line.rejectedUnits>0))throw new Error('Confirma alguna cantidad recibida o desmarca la recepción para guardar solo la factura.');
    const free=item.kind==='free',documentTotal=Number(form.get('total')||0);
    if(!free&&documentTotal<=0)throw new Error('Confirma el total visible de la factura antes de guardarla.');
    if(!free&&linked.some(line=>!line.isFree&&(Number(line.units||0)<=0||Number(line.grossLineTotal||0)<=0)))throw new Error('Cada línea con valor debe tener cantidad y total de línea verificables. Marca como bonificada solo una línea realmente sin cargo.');
    const payload={supplierId:queue.supplierId,locationId:queue.locationId,orderIds:[queue.orderId],invoiceNumber:String(form.get('invoiceNumber')||'').trim(),invoiceDate:String(form.get('invoiceDate')||'').trim(),currency:'CLP',documentType:free?'SC':form.get('documentType'),documentNature:item.kind,documentFileName:item.file.name,batchSessionId:queue.id,batchPosition:position+1,batchTotal:total,extraItemsDecision:'review',markReceived:shouldReceive,receptionDate:new Date().toISOString().slice(0,10),totals:{net:free?0:Number(form.get('net')||0),vat:free?0:Number(form.get('vat')||0),additionalTax:free?0:Number(form.get('additionalTax')||0),freight:free?0:Number(form.get('freight')||0),other:free?0:Number(form.get('other')||0),total:free?0:documentTotal},aiModel:manual?'manual-user-entry':(analysis.model||'nuvasto'),sourceFileId:analysis.sourceFile?.id||'',aiConfidence:manual?0:linked.length/Math.max(1,reviewed.filter((line,index)=>!rejected.has(index)).length),lines:reviewed};
    const saved=await createInvoice(payload);
    queue.saved.push({id:saved.id||'',number:payload.invoiceNumber,kind:item.kind,fileName:item.file.name,receptionError:saved.receptionError||'',received:!!saved.reception});
    if(shouldReceive){if(saved.receptionError)toast('Factura guardada; recepción pendiente: '+saved.receptionError,'error');else toast('Factura y recepción registradas');}
    if(saved.reception&&!saved.receptionError){
      const updated=await api('/api/orders/'+encodeURIComponent(queue.orderId),{fresh:true,timeout:18000}).catch(()=>null);
      if(updated?.order)queue.order=updated.order;
    }
    if(queue.index<queue.items.length-1){queue.index++;toast(`Documento ${position+1} de ${total} guardado. Continuando con el siguiente…`);await processCurrent();return saved}
    await finishQueue();return saved;
  }});
  bindMoney($('#modalBody'));bindLineMath(item.kind);bindUnifiedInvoiceReception(queue.order,lines);endAnalysisTransition();
}

async function processCurrent(){
  if(!queue?.active)return;const item=queue.items[queue.index],position=queue.index,total=queue.items.length;queue.processing=true;beginAnalysisTransition();const started=performance.now();
  try{
    const products=queue.order.items.map(product=>({productId:product.productId,description:product.description,unit:product.orderUnit,orderedQty:product.quantityOrdered,unitsPerOrderUnit:product.unitsPerOrderUnit})),upload=new FormData();
    upload.append('file',item.file,item.file.name);upload.append('context',JSON.stringify({orderId:queue.orderId,supplierId:queue.supplierId,providerName:queue.order.supplierName,folio:queue.order.folio,products,aliases:queue.aliases.map(alias=>({productId:alias.productId,alias:alias.alias,confidence:alias.confidence,usageCount:alias.usageCount})),locationId:queue.locationId,fileName:item.file.name,documentNature:item.kind,batchPosition:position+1,batchTotal:total}));
    const response=await api('/api/invoices/analyze',{method:'POST',body:upload,timeout:68000});queue.processing=false;if(!queue?.active)return;const analysis=response.analysis||{},source=Array.isArray(analysis.invoice?.lines)?analysis.invoice.lines:Array.isArray(analysis.invoice?.items)?analysis.invoice.items:[];
    const remaining=360-(performance.now()-started);if(remaining>0)await sleep(remaining);
    if(analysis.degraded||!source.length||(item.kind!=='free'&&analysis.documentMathVerified===false)){endAnalysisTransition();showQueueError(Object.assign(new Error('La IA no obtuvo una lectura verificable. No se mostrarán datos del pedido como si hubieran sido leídos desde la factura.'),{code:analysis.providerErrorCode||'invoice_unverified'}),item,analysis);return}
    await openReview(analysis,item);
  }catch(error){queue.processing=false;endAnalysisTransition();console.error('v38_document_analysis_failed',error);showQueueError(error,item)}
}

function showQueueError(error,item,analysis=null){
  if(!queue?.active)return;endAnalysisTransition();const position=queue.index,total=queue.items.length,message=error?.code==='request_timeout'||error?.code==='analysis_timeout'?'La lectura excedió el tiempo disponible. Puedes reintentar este archivo sin perder los demás.':(error?.message||'No se pudo procesar este documento.'),canManual=Boolean(analysis?.sourceFile?.id||analysis?.manualCandidates?.length);
  openModal({eyebrow:`DOCUMENTO ${position+1} DE ${total}`,title:'No se pudo verificar el documento',subtitle:item.file.name,size:'large',hideSubmit:true,body:`<section class="v30-inline-notice error"><strong>No se aceptaron datos no verificados</strong><p>${esc(message)}</p></section><section class="v38-batch-note"><strong>El archivo no se perdió</strong><p>${canManual?'Puedes reintentar la IA o entrar a revisión manual. En modo manual, los productos del pedido se muestran solo como plantilla y todos los campos documentales parten vacíos o en cero.':'Reintenta la lectura. Si la carga falló antes de almacenar el archivo, el ingreso manual no se habilita para evitar registrar un documento sin original.'}</p></section><div class="v38-error-actions"><button class="btn primary" type="button" id="v38RetryDocument">Reintentar IA</button>${canManual?'<button class="btn" type="button" id="v38ManualDocument">Ingresar manualmente</button>':''}<button class="btn" type="button" id="v38SkipDocument">Omitir este archivo</button></div>`});
  $('#v38RetryDocument').onclick=()=>processCurrent();if(canManual&&$('#v38ManualDocument'))$('#v38ManualDocument').onclick=()=>openReview(analysis||{},item,{manual:true});$('#v38SkipDocument').onclick=async()=>{queue.skipped.push({fileName:item.file.name,reason:message});if(queue.index<queue.items.length-1){queue.index++;await processCurrent()}else await finishQueue()};
}

async function finishQueue(){
  if(!queue)return;const completed=queue.saved.length,skipped=queue.skipped.length,queueSaved=[...queue.saved],queueSkipped=[...queue.skipped],returnOrderId=queue.orderId,summary=completed===1?'1 documento guardado y vinculado':`${completed} documentos guardados y vinculados`,hadSaved=completed>0;queue.active=false;window.NuvastoInvoiceQueue=null;queue=null;endAnalysisTransition();closeModal(hadSaved?'saved':'cancelled');if(hadSaved){const pendingReceipt=queueSaved.filter(item=>item.receptionError).length;toast(pendingReceipt?summary+'; '+pendingReceipt+' recepción(es) requieren revisión':skipped?`${summary}; ${skipped} omitido${skipped===1?'':'s'}`:summary,pendingReceipt?'error':undefined)}else toast('No se guardó ningún documento','error');if(hadSaved)await showInvoiceCompletionV104({saved:queueSaved,skipped:queueSkipped,orderId:returnOrderId});else if(returnOrderId)await (await import('./app-order-detail-v30.js')).openOrderDetail(returnOrderId);else await openRoute('finance','',{replace:true});
}

function revokePreviews(){previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[]}
function renderSelection(input){
  revokePreviews();const target=$('#v38SelectedDocuments'),files=[...(input?.files||[])];if(!target)return;
  if(!files.length){target.innerHTML='<div class="v38-selected-empty">Selecciona entre 1 y 5 facturas o documentos sin cargo.</div>';return}
  target.innerHTML=files.map((file,index)=>{if(String(file.type||'').startsWith('image/'))previewUrls.push(URL.createObjectURL(file));return `<article class="v38-selected-file"><span class="v38-file-number">${index+1}</span><div class="v38-file-copy"><strong>${esc(file.name)}</strong><small>${fileSize(file.size)} · ${esc(file.type||'archivo')}</small></div><label class="field"><span>Clasificación independiente</span><select data-v38-kind="${index}"><option value="invoice">Factura / documento con valor</option><option value="free">Sin cargo / bonificado</option></select></label></article>`}).join('');
}

function pendingContext(orders){const supplierIds=[...new Set(orders.map(order=>order.supplierId))],suppliers=state.cache.suppliers.filter(item=>supplierIds.includes(item.id));return `<label class="field"><span>Proveedor</span><select name="supplierId" id="v38Supplier">${suppliers.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label class="field"><span>Local</span><select name="locationId" id="v38Location"></select></label><label class="field full"><span>Pedido a vincular</span><select name="orderId" id="v38Order" required></select></label>`}

async function openMultiDocuments(options={}){
  if(opening)return;opening=true;
  try{
    await loadSources();let preset=null;if(options.orderId)preset=(await api(`/api/orders/${encodeURIComponent(options.orderId)}`,{fresh:true,timeout:20000})).order;
    const available=state.cache.orders.filter(attachableOrder);if(!preset&&!available.length)return toast('No hay pedidos disponibles para vincular documentos','error');
    if(preset&&!attachableOrder(preset))return toast('Los pedidos en borrador o anulados no admiten documentos. Los pedidos recibidos o cerrados sí pueden recibir facturas posteriores.','error');
    const context=preset?`<section class="v30-section full"><div><span class="eyebrow">PEDIDO VINCULADO</span><h3>${esc(preset.folio)} · ${esc(preset.supplierName)}</h3><p>${esc(preset.locationName)} · ${esc(preset.costCenterName||'Centro de costo')} · admite múltiples facturas y documentos incluso después de la recepción.</p></div></section><input type="hidden" name="supplierId" value="${esc(preset.supplierId)}"><input type="hidden" name="locationId" value="${esc(preset.locationId)}"><input type="hidden" name="orderId" value="${esc(preset.id)}">`:pendingContext(available);
    openModal({eyebrow:'ETAPA 2 · DOCUMENTOS',title:'Adjuntar documentos al pedido',subtitle:'Selecciona hasta 5 archivos por vez. No existe un límite de una sola factura por folio.',size:'large',closeOnSuccess:false,body:`<div class="v30-field-grid">${context}<label class="field full"><span>Facturas y documentos sin cargo</span><div class="v38-upload-copy"><strong>Seleccionar uno o varios documentos</strong><small>PDF o fotografías completas, nítidas y tomadas de frente.</small></div><input id="v38Files" name="files" type="file" accept="application/pdf,image/*" multiple required></label></div><div class="v38-selected-list" id="v38SelectedDocuments"><div class="v38-selected-empty">Selecciona entre 1 y 5 facturas o documentos sin cargo.</div></div><section class="v38-batch-note"><strong>El límite de 5 es solo por carga</strong><p>Puedes volver a este mismo folio y adjuntar más documentos después. Cada archivo conserva su número, fecha, total, líneas y original en R2.</p></section>`,submitLabel:'Procesar documentos',onSubmit:async form=>{
      const input=$('#v38Files'),files=[...(input?.files||[])];if(!files.length)throw new Error('Selecciona al menos un documento.');if(files.length>MAX_DOCUMENTS)throw new Error(`Puedes procesar hasta ${MAX_DOCUMENTS} documentos por vez.`);
      const orderId=String(form.get('orderId')||''),supplierId=String(form.get('supplierId')||''),locationId=String(form.get('locationId')||''),order=preset?.id===orderId?preset:(await api(`/api/orders/${encodeURIComponent(orderId)}`,{fresh:true,timeout:20000})).order;
      if(!attachableOrder(order))throw new Error('Este pedido está en borrador o anulado y no admite documentos.');const kinds=files.map((file,index)=>({file,kind:$(`[data-v38-kind="${index}"]`)?.value==='free'?'free':'invoice'})),aliases=(await api(`/api/aliases?supplierId=${encodeURIComponent(supplierId)}`,{fresh:true,timeout:20000}).catch(()=>({aliases:[]}))).aliases||[];
      queue={id:crypto.randomUUID(),active:true,processing:false,index:0,items:kinds,saved:[],skipped:[],order,orderId,supplierId,locationId,aliases,returnToHistory:options.returnToHistory!==false};window.NuvastoInvoiceQueue={active:true,id:queue.id,total:kinds.length,orderId};revokePreviews();await processCurrent();
    }});
    const input=$('#v38Files');input?.addEventListener('change',()=>{if(input.files.length>MAX_DOCUMENTS){toast(`Selecciona un máximo de ${MAX_DOCUMENTS} documentos por carga`,'error');input.value=''}renderSelection(input)});renderSelection(input);
    if(!preset){const supplier=$('#v38Supplier'),location=$('#v38Location'),order=$('#v38Order');const syncOrders=()=>{const list=available.filter(item=>item.supplierId===supplier.value&&item.locationId===location.value);order.innerHTML=list.map(item=>`<option value="${esc(item.id)}">${esc(item.folio)} · ${esc(item.costCenterName||'Centro')} · ${Number(item.invoiceCount||0)} documento${Number(item.invoiceCount||0)===1?'':'s'} vinculado${Number(item.invoiceCount||0)===1?'':'s'}</option>`).join('');$('#modalSubmit').disabled=!list.length};const syncLocations=()=>{const list=available.filter(item=>item.supplierId===supplier.value),locations=[...new Map(list.map(item=>[item.locationId,item.locationName])).entries()];location.innerHTML=locations.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');syncOrders()};supplier.onchange=syncLocations;location.onchange=syncOrders;syncLocations()}
  }finally{opening=false}
}

async function resolveOrderId(trigger){
  const direct=trigger?.dataset?.v38OrderDocuments||trigger?.dataset?.v30OrderInvoice||trigger?.dataset?.v16Invoice||trigger?.dataset?.orderId||'';if(direct)return direct;
  if(!state.cache.orders.length){const payload=await api('/api/orders',{fresh:true,timeout:20000});state.cache.orders=payload.orders||[]}
  const candidates=[$('#modalEyebrow')?.textContent,$('#modalTitle')?.textContent].map(value=>String(value||'').trim()).filter(Boolean);
  for(const candidate of candidates){const order=state.cache.orders.find(item=>String(item.folio||'').trim()===candidate);if(order?.id)return order.id}
  return'';
}
function interceptInvoiceEntry(){
  window.addEventListener('click',async event=>{
    const primary=event.target.closest?.('#primaryAction'),trigger=event.target.closest?.(TRIGGERS)||(primary&&state.view==='invoices'?primary:null);if(!trigger)return;
    event.preventDefault();event.stopImmediatePropagation();const orderId=await resolveOrderId(trigger).catch(()=>''),button=trigger;button.disabled=true;
    try{await openMultiDocuments(orderId?{orderId,returnToHistory:true}:{})}catch(error){toast(error.message||'No se pudo abrir el ingreso de documentos','error')}finally{if(button.isConnected)button.disabled=false}
  },true);
}
function enhanceOrderActions(){
  if(!canUpload())return;
  $$('[data-v30-order-invoice]').forEach(button=>{const id=button.dataset.v30OrderInvoice,order=state.cache.orders.find(item=>item.id===id);button.dataset.v38OrderDocuments=id;button.textContent=Number(order?.invoiceCount||0)>0?'Agregar documentos':'Subir documentos'});
  $$('.v30-order-card .v30-order-actions').forEach(actions=>{const reference=actions.querySelector('[data-v30-order-open]'),id=reference?.dataset.v30OrderOpen,order=state.cache.orders.find(item=>item.id===id);if(!id||!attachableOrder(order)||actions.querySelector('[data-v38-order-documents]'))return;const button=document.createElement('button');button.className='btn primary';button.type='button';button.dataset.v38OrderDocuments=id;button.textContent=Number(order.invoiceCount||0)>0?'Agregar documentos':'Subir documentos';actions.prepend(button)});
  const heading=[...$$('#modalBody h3')].find(node=>normalize(node.textContent)==='facturas vinculadas');if(!heading)return;const folio=String($('#modalEyebrow')?.textContent||'').trim(),order=state.cache.orders.find(item=>String(item.folio||'')===folio);if(!attachableOrder(order))return;const section=heading.closest('.v30-section,.v18-detail-section');if(!section||section.querySelector('[data-v38-order-documents]'))return;const button=document.createElement('button');button.className='btn small primary';button.type='button';button.dataset.v38OrderDocuments=order.id;button.textContent=section.querySelector('.v30-item-card,.v18-detail-row')?'Agregar documentos':'Subir documentos';const head=heading.closest('.v30-section-head,header');if(head)head.append(button);else section.prepend(button);
}
function scheduleEnhance(){if(enhanceScheduled)return;enhanceScheduled=true;requestAnimationFrame(()=>{enhanceScheduled=false;enhanceOrderActions()})}

export function initializeMultiInvoiceV38(){injectStyles();interceptInvoiceEntry();new MutationObserver(scheduleEnhance).observe(document.body||document.documentElement,{subtree:true,childList:true});document.addEventListener('pedidos:view-rendered',scheduleEnhance);$('#modal')?.addEventListener('close',()=>{revokePreviews();endAnalysisTransition();if(queue?.active){queue.active=false;window.NuvastoInvoiceQueue=null;queue=null}});scheduleEnhance();window.NuvastoMultiInvoice=Object.freeze({version:VERSION,open:openMultiDocuments,maxDocuments:MAX_DOCUMENTS})}

initializeMultiInvoiceV38();
