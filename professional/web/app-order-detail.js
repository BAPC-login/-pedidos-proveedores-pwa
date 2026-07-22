import {$,$$,esc,money,date,state,api,toast} from './app-core.js';
import {openModal} from './app-modal.js';

const labels={draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'};
const statusLabel=value=>labels[value]||value;
const metric=(label,value,note)=>`<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`;
const navigate=async view=>(await import('./app-views.js')).navigate(view);

async function openStoredDocument(key){
  const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});
  if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el documento')}
  const url=URL.createObjectURL(await response.blob());
  window.open(url,'_blank','noopener');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function openReception(order){
  openModal({
    eyebrow:'RECEPCIÓN',title:order.folio,
    subtitle:`${order.supplierName} · registra solo lo realmente aceptado`,
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

export async function openOrderDetail(id){
  const [orderPayload,documentPayload]=await Promise.all([
    api(`/api/orders/${id}`),
    api(`/api/documents?entityType=order&entityId=${encodeURIComponent(id)}`)
  ]);
  const order=orderPayload.order;
  const documents=documentPayload.documents||[];
  const transitions={draft:['requested','cancelled'],requested:['approved','rejected','cancelled'],rejected:['draft','cancelled'],approved:['sent','cancelled'],sent:['confirmed','cancelled'],confirmed:['cancelled'],partially_received:['received','closed','cancelled'],received:['reconciled','closed'],reconciled:['closed']}[order.status]||[];
  const canReceive=['sent','confirmed','partially_received'].includes(order.status)&&['owner','admin','purchaser','approver','receiver'].includes(state.me?.user?.role);
  const history=documents.length?`<div class="panel-head" style="margin-top:16px"><h3>PDF históricos del folio</h3><small>${documents.length} versión${documents.length===1?'':'es'}</small></div><div class="stack">${documents.map(document=>`<button class="btn small" type="button" data-document-key="${esc(document.key)}">Abrir ${esc(document.name)} · revisión ${document.revision}</button>`).join('')}</div>`:'<div class="empty-state"><p>No hay PDF histórico disponible.</p></div>';
  openModal({
    eyebrow:order.folio,title:order.supplierName,subtitle:`${order.locationName} · ${order.costCenterName||'Barra'} · ${statusLabel(order.status)}`,
    body:`<div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">${metric('Total',money(order.grossTotal),'Estimado')}${metric('Líneas',order.items.length,'Productos')}${metric('Revisión',order.revision,'Versión')}</div>${canReceive?'<div class="view-actions" style="margin-top:14px"><button class="btn primary" type="button" id="registerReception">Registrar recepción</button></div>':''}<div class="table-card" style="margin-top:16px"><table class="data-table"><thead><tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Precio</th></tr></thead><tbody>${order.items.map(item=>`<tr><td>${esc(item.description)}</td><td>${item.quantityOrdered} ${esc(item.orderUnit)}</td><td>${item.quantityReceived}</td><td>${money(item.expectedGrossUnitPrice)}</td></tr>`).join('')}</tbody></table></div>${history}<div class="activity-list" style="margin-top:16px">${order.events.map(event=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${statusLabel(event.to)}</strong><small>${esc(event.actor||'Sistema')} · ${esc(event.reason||'')}</small></div><span class="activity-time">${date(event.createdAt)}</span></div>`).join('')}</div>`,
    submitLabel:transitions.length?'Cambiar estado':'Cerrar',
    onSubmit:async()=>{
      if(!transitions.length)return;
      const target=prompt(`Nuevo estado: ${transitions.map(statusLabel).join(', ')}`,transitions[0]);
      if(!target)return;
      const normalized=transitions.find(value=>value===target||statusLabel(value).toLowerCase()===target.toLowerCase());
      if(!normalized)throw new Error('Estado no permitido');
      await api(`/api/orders/${id}/transition`,{method:'POST',json:{status:normalized,reason:'Actualizado desde la aplicación'}});
      toast('Estado actualizado y nueva versión PDF archivada');
      await navigate('orders');
    }
  });
  $('#registerReception')?.addEventListener('click',()=>{$('#modal').close();setTimeout(()=>openReception(order),0)});
  $$('[data-document-key]').forEach(button=>button.addEventListener('click',async()=>{try{await openStoredDocument(button.dataset.documentKey)}catch(error){toast(error.message,'error')}}));
}
