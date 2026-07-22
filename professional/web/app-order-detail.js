import {$,$$,esc,money,date,state,api,toast} from './app-core.js';
import {openModal,closeModal} from './app-modal.js';

const labels={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};
const statusLabel=value=>labels[value]||value;
const metric=(label,value,note)=>`<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function fetchStoredDocument(key){
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el documento')}
  const blob=await response.blob();
  return {blob,url:URL.createObjectURL(blob)};
}

async function openStoredDocument(key,name='pedido.pdf',mode='preview'){
  const popup=mode==='preview'?window.open('about:blank','_blank'):null;
  try{
    const {blob,url}=await fetchStoredDocument(key);
    const file=new File([blob],name,{type:'application/pdf'});
    if(mode==='share'&&navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({title:name,files:[file]});
      URL.revokeObjectURL(url);return;
    }
    if(mode==='download'){
      const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
    }else if(popup)popup.location.href=url;
    else window.open(url,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(error){if(popup)popup.close();throw error}
}

async function openReception(order){
  openModal({
    eyebrow:'RECEPCIÓN',title:order.folio,
    subtitle:`${order.supplierName} · registra solo lo realmente aceptado`,size:'large',
    body:`<div class="table-card"><table class="data-table"><thead><tr><th>Producto</th><th>Pendiente</th><th>Aceptado</th><th>Rechazado</th></tr></thead><tbody>${order.items.map(item=>{const pending=Math.max(0,Number(item.quantityOrdered)-Number(item.quantityReceived));return`<tr data-reception-line="${esc(item.id)}"><td><strong>${esc(item.description)}</strong><br><small>${esc(item.orderUnit)}</small></td><td>${pending}</td><td><input class="input" name="accepted" type="number" min="0" step="0.001" value="${pending}"></td><td><input class="input" name="rejected" type="number" min="0" step="0.001" value="0"></td></tr>`}).join('')}</tbody></table></div><label class="field" style="margin-top:14px"><span>Observaciones</span><textarea name="notes" placeholder="Diferencias, daños o comentarios de entrega"></textarea></label>`,
    submitLabel:'Confirmar recepción',
    onSubmit:async form=>{
      const items=$$('[data-reception-line]').map(row=>({orderItemId:row.dataset.receptionLine,quantityAccepted:Number(row.querySelector('[name=accepted]').value||0),quantityRejected:Number(row.querySelector('[name=rejected]').value||0)}));
      await api(`/api/orders/${order.id}/receptions`,{method:'POST',json:{items,notes:form.get('notes')}});
      toast('Recepción registrada y PDF histórico guardado');
      await navigate('orders');
    }
  });
}

async function openEditOrder(order){
  const productPayload=await api('/api/products');
  const current=new Map(order.items.map(item=>[item.productId,item]));
  const quantities=new Map(order.items.map(item=>[item.productId,Number(item.quantityOrdered||0)]));
  const entries=(productPayload.products||[])
    .filter(product=>(product.costCenters||[]).some(center=>center.id===order.costCenterId))
    .map(product=>({product,relation:(product.suppliers||[]).find(relation=>relation.supplierId===order.supplierId)}))
    .filter(entry=>entry.relation)
    .sort((a,b)=>(a.product.categoryName||'').localeCompare(b.product.categoryName||'','es')||a.product.name.localeCompare(b.product.name,'es'));
  openModal({
    eyebrow:'EDITAR PEDIDO',title:order.folio,subtitle:`${order.supplierName} · modifica cantidades, agrega o quita productos. Se generará una nueva revisión del PDF.`,size:'order',
    body:`<div class="order-builder"><section class="order-context"><label class="field"><span>Proveedor</span><input value="${esc(order.supplierName)}" disabled></label><label class="field"><span>Local</span><input value="${esc(order.locationName)}" disabled></label><label class="field"><span>Centro de costo</span><input value="${esc(order.costCenterName)}" disabled></label><label class="field"><span>Entrega esperada</span><input name="deliveryDate" type="date" value="${esc(order.deliveryDate||'')}"></label></section><section class="order-catalog"><div class="order-catalog-head"><label class="field order-search"><span>Buscar dentro del proveedor</span><input id="editOrderSearch" placeholder="Producto o categoría"></label><div class="order-selection"><strong id="editSelectedCount">${order.items.length}</strong><span>productos seleccionados</span></div></div><div id="editOrderProducts" class="order-product-list"></div></section><label class="field"><span>Notas para el proveedor</span><textarea name="notes">${esc(order.notes||'')}</textarea></label></div>`,
    submitLabel:'Guardar y generar nueva revisión',
    onSubmit:async form=>{
      saveVisible();
      const items=[];
      for(const [productId,quantity] of quantities){
        if(Number(quantity)<=0)continue;
        const entry=entries.find(candidate=>candidate.product.id===productId);if(!entry)continue;
        items.push({supplierProductId:entry.relation.id,productId:entry.product.id,description:entry.product.name,quantity:Number(quantity),orderUnit:entry.relation.orderUnit||'UNIDAD',unitsPerOrderUnit:Number(entry.relation.unitsPerOrderUnit||1),expectedGrossUnitPrice:Number(entry.relation.lastGrossUnitPrice||0)});
      }
      if(!items.length)throw new Error('El pedido debe conservar al menos un producto');
      await api(`/api/orders/${order.id}`,{method:'PATCH',json:{costCenterId:order.costCenterId,deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),items}});
      toast('Pedido actualizado y PDF regenerado');await navigate('orders');setTimeout(()=>openOrderDetail(order.id),0);
    }
  });
  function saveVisible(){
    $$('#editOrderProducts input[data-product-id]').forEach(input=>quantities.set(input.dataset.productId,Number(input.value||0)));
  }
  function updateSelected(){
    saveVisible();$('#editSelectedCount').textContent=[...quantities.values()].filter(value=>Number(value)>0).length;
  }
  const render=()=>{
    saveVisible();
    const query=$('#editOrderSearch').value.trim().toLowerCase();
    const filtered=entries.filter(entry=>!query||`${entry.product.name} ${entry.product.categoryName||''}`.toLowerCase().includes(query));
    $('#editOrderProducts').innerHTML=filtered.map(({product,relation})=>{const format=relation.orderUnit||'UNIDAD';const pack=Number(relation.unitsPerOrderUnit||1);return`<article class="order-product"><div class="order-product-copy"><strong>${esc(product.name)}</strong><small>${esc(product.categoryName||'Sin categoría')} · ${esc(format)}${pack>1?` · ${pack} unidades`:''}</small></div><label class="order-quantity"><span>Cantidad</span><input type="number" min="0" step="0.001" inputmode="decimal" value="${quantities.get(product.id)||0}" data-product-id="${esc(product.id)}"></label></article>`}).join('')||'<div class="empty-state compact-empty"><p>Sin coincidencias.</p></div>';
    $$('#editOrderProducts input[data-product-id]').forEach(input=>input.oninput=updateSelected);updateSelected();
  };
  $('#editOrderSearch').oninput=render;render();
}

export async function openOrderDetail(id){
  const [orderPayload,documentPayload]=await Promise.all([
    api(`/api/orders/${id}`),
    api(`/api/documents?entityType=order&entityId=${encodeURIComponent(id)}`)
  ]);
  const order=orderPayload.order;
  const documents=documentPayload.documents||[];
  const transitions={draft:['requested','cancelled'],requested:['approved','rejected','cancelled'],rejected:['draft','cancelled'],approved:['sent','cancelled'],sent:['confirmed','cancelled'],confirmed:['cancelled'],partially_received:['received','closed','cancelled'],received:['reconciled','closed'],reconciled:['closed']}[order.status]||[];
  const canReceive=['sent','confirmed','partially_received'].includes(order.status)&&['owner','admin','purchaser','approver','receiver'].includes(state.me?.user?.role);
  const canEdit=['draft','rejected'].includes(order.status)&&['owner','admin','purchaser'].includes(state.me?.user?.role);
  const history=documents.length?`<div class="panel-head" style="margin-top:16px"><h3>PDF del proveedor</h3><small>${documents.length} revisión${documents.length===1?'':'es'} archivada${documents.length===1?'':'s'}</small></div><div class="stack">${documents.map(document=>`<article class="panel"><div class="panel-head"><div><strong>${esc(document.name)}</strong><small>Revisión ${document.revision}</small></div><div class="row-actions"><button class="btn small" type="button" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="preview">Vista previa</button><button class="btn small" type="button" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="download">Descargar</button><button class="btn small" type="button" data-document-key="${esc(document.key)}" data-document-name="${esc(document.name)}" data-document-mode="share">Compartir</button></div></div></article>`).join('')}</div>`:'<div class="empty-state"><p>No hay PDF histórico disponible.</p></div>';
  openModal({
    eyebrow:order.folio,title:order.supplierName,subtitle:`${order.locationName} · ${order.costCenterName||'Barra'} · ${statusLabel(order.status)}`,size:'large',
    body:`<div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">${metric('Total',money(order.grossTotal),'Estimado')}${metric('Líneas',order.items.length,'Productos')}${metric('Revisión',order.revision,'Versión')}</div><div class="view-actions" style="margin-top:14px">${canEdit?'<button class="btn primary" type="button" id="editOrder">Editar cantidades y productos</button>':''}${canReceive?'<button class="btn primary" type="button" id="registerReception">Registrar recepción</button>':''}</div><div class="security-note" style="margin-top:14px"><strong>Pedido independiente por proveedor</strong><p>Este folio contiene únicamente productos de ${esc(order.supplierName)}. Solicitado por ${esc(order.requestedBy||'usuario')}.</p></div><div class="table-card" style="margin-top:16px"><table class="data-table"><thead><tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Formato</th></tr></thead><tbody>${order.items.map(item=>`<tr><td>${esc(item.description)}</td><td>${item.quantityOrdered}</td><td>${item.quantityReceived}</td><td>${esc(item.orderUnit)}</td></tr>`).join('')}</tbody></table></div>${history}<div class="activity-list" style="margin-top:16px">${order.events.map(event=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${statusLabel(event.to)}</strong><small>${esc(event.actor||'Sistema')} · ${esc(event.reason||'')}</small></div><span class="activity-time">${date(event.createdAt)}</span></div>`).join('')}</div>`,
    submitLabel:transitions.length?'Cambiar estado':'Cerrar',
    onSubmit:async()=>{
      if(!transitions.length)return;
      const target=prompt(`Nuevo estado: ${transitions.map(statusLabel).join(', ')}`,transitions[0]);if(!target)return;
      const normalized=transitions.find(value=>value===target||statusLabel(value).toLowerCase()===target.toLowerCase());if(!normalized)throw new Error('Estado no permitido');
      await api(`/api/orders/${id}/transition`,{method:'POST',json:{status:normalized,reason:'Actualizado desde la aplicación'}});
      toast('Estado actualizado y nueva versión PDF archivada');await navigate('orders');
    }
  });
  $('#editOrder')?.addEventListener('click',()=>{closeModal('edit');setTimeout(()=>openEditOrder(order),0)});
  $('#registerReception')?.addEventListener('click',()=>{closeModal('reception');setTimeout(()=>openReception(order),0)});
  $$('[data-document-key]').forEach(button=>button.addEventListener('click',async()=>{try{await openStoredDocument(button.dataset.documentKey,button.dataset.documentName,button.dataset.documentMode)}catch(error){toast(error.message,'error')}}));
}
