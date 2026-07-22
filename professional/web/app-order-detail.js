import {$,$$,esc,money,date,state,api,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';

const labels={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};
const actionLabels={requested:'Emitir solicitud',approved:'Aprobar',rejected:'Rechazar',sent:'Marcar como enviado',confirmed:'Proveedor confirmó',partially_received:'Recepción parcial',received:'Marcar recibido',reconciled:'Conciliar factura',closed:'Cerrar pedido',cancelled:'Anular pedido',draft:'Volver a borrador'};
const roleWeight={readonly:10,finance:40,receiver:50,purchaser:60,approver:70,admin:80,owner:100};
const requiredWeight={requested:60,sent:60,confirmed:60,cancelled:60,approved:70,rejected:70,partially_received:50,received:50,reconciled:40,closed:40,draft:80};
const statusLabel=value=>labels[value]||value;
const metric=(label,value,note)=>`<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function fetchStoredDocument(key){
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el documento')}
  const blob=await response.blob();return {blob,url:URL.createObjectURL(blob)};
}

async function openStoredDocument(key,name='pedido.pdf',mode='preview'){
  const popup=mode==='preview'?window.open('about:blank','_blank'):null;
  try{
    const {blob,url}=await fetchStoredDocument(key);const file=new File([blob],name,{type:blob.type||'application/pdf'});
    if(mode==='share'&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:name,files:[file]});URL.revokeObjectURL(url);return}
    if(mode==='download'){const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove()}
    else if(popup)popup.location.href=url;else window.open(url,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(error){popup?.close();throw error}
}

async function openReception(order){
  openModal({eyebrow:'RECEPCIÓN',title:order.folio,subtitle:`${order.supplierName} · registra solo lo realmente aceptado`,size:'large',body:`<div class="table-card"><table class="data-table"><thead><tr><th>Producto</th><th>Pendiente</th><th>Aceptado</th><th>Rechazado</th></tr></thead><tbody>${order.items.map(item=>{const pending=Math.max(0,Number(item.quantityOrdered)-Number(item.quantityReceived));return`<tr data-reception-line="${esc(item.id)}"><td data-label="Producto"><strong>${esc(item.description)}</strong><br><small>${esc(item.orderUnit)}</small></td><td data-label="Pendiente">${pending}</td><td data-label="Aceptado"><input class="input" name="accepted" type="number" min="0" step="0.001" value="${pending}" inputmode="decimal"></td><td data-label="Rechazado"><input class="input" name="rejected" type="number" min="0" step="0.001" placeholder="0" inputmode="decimal"></td></tr>`}).join('')}</tbody></table></div><label class="field" style="margin-top:14px"><span>Observaciones</span><textarea name="notes" placeholder="Diferencias, daños o comentarios de entrega"></textarea></label>`,submitLabel:'Confirmar recepción',onSubmit:async form=>{const items=$$('[data-reception-line]').map(row=>({orderItemId:row.dataset.receptionLine,quantityAccepted:Number(row.querySelector('[name=accepted]').value||0),quantityRejected:Number(row.querySelector('[name=rejected]').value||0)}));await api(`/api/orders/${order.id}/receptions`,{method:'POST',json:{items,notes:form.get('notes')}});toast('Recepción registrada y PDF actualizado');await navigate('orders')}});
}

function unitOptions(selected){const values=[selected,'UNIDAD','CAJA','DISPLAY','PACK','KG','LITRO'].filter(Boolean).map(value=>String(value).toUpperCase());return [...new Set(values)].map(value=>`<option value="${esc(value)}" ${value===String(selected||'').toUpperCase()?'selected':''}>${esc(value)}</option>`).join('')}

async function openEditOrder(order){
  const productPayload=await api('/api/products');
  const entries=(productPayload.products||[]).filter(product=>(product.costCenters||[]).some(center=>center.id===order.costCenterId)).map(product=>({product,relation:(product.suppliers||[]).find(relation=>relation.supplierId===order.supplierId)})).filter(entry=>entry.relation).sort((a,b)=>(a.product.categoryName||'').localeCompare(b.product.categoryName||'','es')||a.product.name.localeCompare(b.product.name,'es'));
  const currentMap=new Map(order.items.map(item=>[item.productId,item]));
  const values=new Map(entries.map(entry=>{const current=currentMap.get(entry.product.id);return [entry.product.id,{quantity:current?.quantityOrdered||'',orderUnit:String(current?.orderUnit||entry.relation.orderUnit||'UNIDAD').toUpperCase(),pack:Number(current?.unitsPerOrderUnit||entry.relation.unitsPerOrderUnit||1)}]}));
  openModal({eyebrow:'EDITAR PEDIDO',title:order.folio,subtitle:`${order.supplierName} · cambia cantidad, formato o unidades por caja/display. Al guardar se genera una nueva revisión del PDF.`,size:'order',body:`<div class="order-builder"><section class="order-context"><label class="field"><span>Proveedor</span><input value="${esc(order.supplierName)}" disabled></label><label class="field"><span>Local</span><input value="${esc(order.locationName)}" disabled></label><label class="field"><span>Centro de costo</span><input value="${esc(order.costCenterName)}" disabled></label><label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date" value="${esc(order.deliveryDate||'')}"></label></section><section class="order-catalog"><div class="order-catalog-head"><label class="field order-search"><span>Buscar</span><input id="editOrderSearch" placeholder="Producto o categoría"></label><div class="order-selection"><strong id="editSelectedCount">${order.items.length}</strong><span>productos seleccionados</span></div></div><div id="editOrderProducts" class="order-product-list"></div></section><label class="field"><span>Notas para el proveedor</span><textarea name="notes">${esc(order.notes||'')}</textarea></label></div>`,submitLabel:'Guardar y regenerar PDF',onSubmit:async form=>{saveVisible();const items=[];for(const entry of entries){const value=values.get(entry.product.id);if(!value||Number(value.quantity)<=0)continue;items.push({supplierProductId:entry.relation.id,productId:entry.product.id,description:entry.product.name,quantity:Number(value.quantity),orderUnit:value.orderUnit,unitsPerOrderUnit:Number(value.pack||1),expectedGrossUnitPrice:Number(entry.relation.lastGrossUnitPrice||0)})}if(!items.length)throw new Error('El pedido debe conservar al menos un producto');await api(`/api/orders/${order.id}`,{method:'PATCH',json:{costCenterId:order.costCenterId,deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),items}});for(const item of items){await api(`/api/products/${item.productId}/suppliers`,{method:'POST',json:{supplierId:order.supplierId,orderUnit:item.orderUnit,unitsPerOrderUnit:item.unitsPerOrderUnit,supplierProductName:item.description}})}toast('Pedido, formatos y PDF actualizados');await navigate('orders');setTimeout(()=>openOrderDetail(order.id),50)}});
  function saveVisible(){$$('#editOrderProducts [data-edit-product]').forEach(row=>{const value=values.get(row.dataset.editProduct);value.quantity=row.querySelector('[data-edit-quantity]').value;value.orderUnit=row.querySelector('[data-edit-unit]').value;value.pack=Number(row.querySelector('[data-edit-pack]').value||1)})}
  function updateCount(){saveVisible();$('#editSelectedCount').textContent=[...values.values()].filter(value=>Number(value.quantity)>0).length}
  function render(){saveVisible();const query=$('#editOrderSearch').value.trim().toLowerCase();const filtered=entries.filter(entry=>!query||`${entry.product.name} ${entry.product.categoryName||''}`.toLowerCase().includes(query));$('#editOrderProducts').innerHTML=filtered.map(entry=>{const value=values.get(entry.product.id);return`<article class="master-row" data-edit-product="${esc(entry.product.id)}"><div class="master-product"><strong>${esc(entry.product.name)}</strong><small>${esc(entry.product.categoryName||'Sin categoría')}</small></div><select data-edit-unit>${unitOptions(value.orderUnit)}</select><input data-edit-pack type="number" min="0.001" step="0.001" value="${value.pack}" inputmode="decimal" aria-label="Unidades por formato"><label class="master-quantity"><input class="master-qty" data-edit-quantity type="number" min="0" step="0.001" value="${esc(value.quantity)}" placeholder="0" inputmode="decimal" enterkeyhint="next"></label></article>`}).join('')||'<div class="empty-state compact-empty"><p>Sin coincidencias.</p></div>';$$('[data-edit-quantity]').forEach(input=>{input.onfocus=()=>input.select();input.oninput=updateCount;input.onkeydown=event=>{if(event.key!=='Enter')return;event.preventDefault();saveVisible();const fields=$$('[data-edit-quantity]');const next=fields[fields.indexOf(input)+1];if(next){next.focus();next.select()}else $('#modalSubmit')?.focus()}});$$('[data-edit-unit],[data-edit-pack]').forEach(input=>input.oninput=updateCount);updateCount()}
  $('#editOrderSearch').oninput=render;render();
}

function transitionsFor(status){return {draft:['requested','cancelled'],requested:['approved','rejected','cancelled'],rejected:['draft','cancelled'],approved:['sent','cancelled'],sent:['confirmed','partially_received','received','cancelled'],confirmed:['partially_received','received','cancelled'],partially_received:['received','closed','cancelled'],received:['reconciled','closed'],reconciled:['closed']}[status]||[]}
function allowedTransition(target){return (roleWeight[state.me?.user?.role]||0)>=(requiredWeight[target]||100)}

async function applyTransition(order,target){
  let reason='Actualizado desde la aplicación';
  if(['rejected','cancelled'].includes(target)){reason=prompt(target==='rejected'?'Motivo del rechazo':'Motivo de la anulación','')||'';if(!reason)return}
  if(!confirm(`¿Cambiar ${order.folio} de ${statusLabel(order.status)} a ${statusLabel(target)}?`))return;
  await api(`/api/orders/${order.id}/transition`,{method:'POST',json:{status:target,reason}});toast(`Pedido actualizado a ${statusLabel(target)}`);closeModal('transition');await navigate('orders');
}

async function deleteDraft(order){
  if(!confirm(`¿Eliminar el borrador ${order.folio}? Se eliminará solo este borrador y no se tocará ningún pedido emitido.`))return;
  await api(`/api/orders/${order.id}`,{method:'DELETE'});toast('Borrador eliminado');closeModal('deleted');await navigate('orders');
}

export async function openOrderDetail(id){
  const [orderPayload,documentPayload,invoicePayload]=await Promise.all([
    api(`/api/orders/${encodeURIComponent(id)}`),
    api(`/api/documents?entityType=order&entityId=${encodeURIComponent(id)}`),
    api(`/api/orders/${encodeURIComponent(id)}/invoices`)
  ]);
  const order=orderPayload.order;
  const documents=documentPayload.documents||[];
  const invoices=invoicePayload.invoices||[];
  const transitions=transitionsFor(order.status).filter(allowedTransition);
  const canReceive=['sent','confirmed','partially_received'].includes(order.status)&&['owner','admin','purchaser','approver','receiver'].includes(state.me?.user?.role);
  const canEdit=['draft','rejected'].includes(order.status)&&['owner','admin','purchaser'].includes(state.me?.user?.role);
  const canInvoice=order.status!=='cancelled'&&['owner','admin','purchaser','approver','receiver','finance'].includes(state.me?.user?.role);

  const history=documents.length
    ?`<div class="panel-head" style="margin-top:16px"><h3>PDF del proveedor</h3><small>${documents.length} revisión${documents.length===1?'':'es'}</small></div><div class="stack">${documents.map(document=>`<article class="panel"><div class="panel-head"><div><strong>${esc(document.name)}</strong><small>Revisión ${document.revision}</small></div><div class="row-actions"><button class="btn small" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="preview">Vista previa</button><button class="btn small" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="download">Descargar</button><button class="btn small" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="share">Compartir</button></div></div></article>`).join('')}</div>`
    :`<section class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>PDF del proveedor</h3><small>El pedido existe; el documento puede generarse ahora.</small></div><button class="btn primary" id="ensureOrderPdf">Generar PDF</button></div></section>`;

  const invoiceSection=`<section class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Facturas y cotejo</h3><small>${invoices.length?`${invoices.length} factura${invoices.length===1?'':'s'} vinculada${invoices.length===1?'':'s'}`:'Aún no se ha cargado una factura para este pedido'}</small></div>${canInvoice?'<button class="btn primary" id="attachInvoice">Adjuntar factura con IA</button>':''}</div>${invoices.length?`<div class="stack">${invoices.map(invoice=>`<article class="panel"><div class="panel-head"><div><strong>Factura ${esc(invoice.invoiceNumber)}</strong><small>${date(invoice.invoiceDate)} · ${money(invoice.grossTotal)} · ${esc(invoice.status==='review'?'En revisión':invoice.status)}</small></div>${invoice.pdfKey?`<button class="btn small" data-invoice-file="${esc(invoice.pdfKey)}" data-invoice-name="${esc(invoice.pdfName||`factura-${invoice.invoiceNumber}.pdf`)}">Abrir original</button>`:''}</div></article>`).join('')}</div>`:'<div class="auth-note">Carga el PDF o una fotografía. Gemini lo comparará con este folio y guardará el precio final por unidad.</div>'}</section>`;

  openModal({
    eyebrow:order.folio,
    title:order.supplierName,
    subtitle:`${order.locationName} · ${order.costCenterName||'Barra'} · ${statusLabel(order.status)}`,
    size:'large',
    hideSubmit:true,
    body:`<div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">${metric('Estado',statusLabel(order.status),'Flujo actual')}${metric('Líneas',order.items.length,'Productos')}${metric('Facturas',invoices.length,'Vinculadas')}</div><section class="panel" style="margin-top:14px"><div class="panel-head"><div><h3>Gestión del pedido</h3><small>Este folio no cambia al avanzar de estado.</small></div></div><div class="view-actions">${canInvoice?'<button class="btn primary" id="attachInvoiceTop">Adjuntar factura y cotejar</button>':''}${canEdit?'<button class="btn" id="editOrder">Editar productos y formatos</button>':''}${canReceive?'<button class="btn primary" id="registerReception">Registrar recepción</button>':''}${transitions.map(target=>`<button class="btn ${target==='cancelled'||target==='rejected'?'danger':'primary'}" data-transition="${target}">${esc(actionLabels[target]||statusLabel(target))}</button>`).join('')}${order.status==='draft'?'<button class="btn danger" id="deleteDraftOrder">Eliminar borrador</button>':''}</div></section><div class="security-note" style="margin-top:14px"><strong>Flujo central</strong><p>Pedido emitido desde la lista maestra → folio por proveedor → factura adjunta → cotejo IA → historial de precios.</p></div><div class="table-card" style="margin-top:16px"><table class="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Formato</th><th>Unidades/formato</th><th>Recibido</th></tr></thead><tbody>${order.items.map(item=>`<tr><td data-label="Producto">${esc(item.description)}</td><td data-label="Cantidad">${item.quantityOrdered}</td><td data-label="Formato">${esc(item.orderUnit)}</td><td data-label="Unidades/formato">${item.unitsPerOrderUnit}</td><td data-label="Recibido">${item.quantityReceived}</td></tr>`).join('')}</tbody></table></div>${invoiceSection}${history}<div class="activity-list" style="margin-top:16px">${order.events.map(event=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${statusLabel(event.to)}</strong><small>${esc(event.actor||'Sistema')} · ${esc(event.reason||'')}</small></div><span class="activity-time">${date(event.createdAt)}</span></div>`).join('')}</div>`
  });

  const attach=async()=>{closeModal('invoice');const {openInvoiceAnalysis}=await import('./app-invoices.js');setTimeout(()=>openInvoiceAnalysis({orderId:order.id,returnToOrder:true}),0)};
  $('#attachInvoice')?.addEventListener('click',attach);
  $('#attachInvoiceTop')?.addEventListener('click',attach);
  $('#editOrder')?.addEventListener('click',()=>{closeModal('edit');setTimeout(()=>openEditOrder(order),0)});
  $('#registerReception')?.addEventListener('click',()=>{closeModal('reception');setTimeout(()=>openReception(order),0)});
  $('#deleteDraftOrder')?.addEventListener('click',()=>deleteDraft(order).catch(error=>toast(error.message,'error')));
  $('#ensureOrderPdf')?.addEventListener('click',async()=>{try{await api(`/api/orders/${order.id}/pdf`,{method:'POST',json:{}});toast('PDF generado');closeModal('pdf');setTimeout(()=>openOrderDetail(order.id),80)}catch(error){toast(error.message,'error')}});
  $$('[data-transition]').forEach(button=>button.onclick=()=>applyTransition(order,button.dataset.transition).catch(error=>toast(error.message,'error')));
  $$('[data-document-key]').forEach(button=>button.onclick=()=>openStoredDocument(button.dataset.documentKey,button.dataset.documentName,button.dataset.documentMode).catch(error=>toast(error.message,'error')));
  $$('[data-invoice-file]').forEach(button=>button.onclick=()=>openStoredDocument(button.dataset.invoiceFile,button.dataset.invoiceName,'preview').catch(error=>toast(error.message,'error')));
}
