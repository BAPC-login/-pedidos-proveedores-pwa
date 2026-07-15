(()=>{
  const BUILD='6.0.0',DB='pedidos-proveedores-profesional';
  let activeOrder=null,activeProvider='',draftOrder=null;
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const number=v=>window.InvoiceReaderV6?.number(v)||Number(v)||0;
  const date=v=>new Date(v).toLocaleDateString('es-CL');
  const money=v=>Number(v||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});

  const openDb=()=>new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  async function get(store,key){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  async function all(store){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error)})}
  async function put(store,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),request=tx.objectStore(store).put(value);request.onsuccess=()=>{if(value.id==null)value.id=request.result};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error)})}
  async function remove(store,key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
  const invoices=(folio,provider='')=>all('invoices').then(rows=>rows.filter(x=>x.folio===folio&&(!provider||x.provider===provider)));
  const statusLabel=s=>s==='complete'?'Completo':s==='partial'?'Parcial':'Pendiente';
  function orderStatus(order){const rows=order.rows||[];if(!rows.length)return'pending';if(rows.every(x=>Number(x.receivedQty)>=Number(x.orderedQty)&&Number(x.orderedQty)>0))return'complete';return rows.some(x=>Number(x.receivedQty)>0)?'partial':'pending'}

  async function syncCurrent(){
    if(!state.currentFolio||!orderRows().length)return;
    const order=await get('orders',state.currentFolio);if(!order)return;
    const previous=new Map((order.rows||[]).map(row=>[String(row.id),row]));
    order.rows=orderRows().map(item=>{const old=previous.get(String(item.id))||{};return{...old,id:item.id,description:item.description,provider:item.provider,category:item.category,unit:item.unit,orderedQty:Number(item.qty)||0,receivedQty:Number(old.receivedQty)||0,reception:old.reception||'pending',unitPrice:old.unitPrice??null}});
    order.providers=[...new Set(order.rows.map(x=>x.provider))];order.totalItems=order.rows.length;order.status=orderStatus(order);order.updatedAt=new Date().toISOString();await put('orders',order);
  }
  const pdfButton=$('#generate');if(pdfButton){const previous=pdfButton.onclick;pdfButton.onclick=async event=>{const result=await previous?.call(pdfButton,event);setTimeout(syncCurrent,100);return result}}

  $('#v-management')?.remove();$$('.nav [data-view="management"]').forEach(button=>button.remove());
  const view=document.createElement('section');view.id='v-management';view.className='view';view.innerHTML=`
    <div class="sectionhead"><div><h2>Gestión de compras</h2><span class="muted">Pedidos, facturas, recepción y precios.</span></div></div>
    <div class="manage-tabs"><button class="active" data-tab="history">Historial</button><button data-tab="reception">Recepción</button><button data-tab="reports">Informes</button></div>
    <div class="manage-panel active" id="panel-history"><div class="card filters"><label class="search"><input id="historySearchV6" placeholder="Buscar folio o proveedor"></label><select id="historyStatusV6"><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="partial">Parcial</option><option value="complete">Completo</option></select></div><div id="historyListV6"></div></div>
    <div class="manage-panel" id="panel-reception"><div id="receptionV6" class="card empty">Selecciona un pedido desde Historial.</div></div>
    <div class="manage-panel" id="panel-reports"><div class="card filters"><select id="reportPeriodV6"><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="90">Últimos 90 días</option></select><select id="reportProviderV6"><option value="">Todos los proveedores</option></select></div><div id="reportsV6"></div></div>`;
  $('main.wrap').appendChild(view);
  const navButton=document.createElement('button');navButton.type='button';navButton.dataset.view='management';navButton.innerHTML='<b>▤</b><span>Gestión</span>';$('.nav').insertBefore(navButton,$('.nav').lastElementChild);
  const oldSwitch=window.switchView;
  window.switchView=function(name){
    if(name!=='management')return oldSwitch(name);
    $$('.view').forEach(item=>item.classList.toggle('active',item.id==='v-management'));$$('.nav button').forEach(item=>item.classList.toggle('active',item.dataset.view==='management'));
    $('#eyebrow').textContent='COMPRAS';$('#pageTitle').textContent='Gestión';window.scrollTo({top:0,behavior:'smooth'});renderHistory();renderReports();
  };
  navButton.onclick=()=>window.switchView('management');
  view.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>showPanel(button.dataset.tab));
  function showPanel(name){view.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));view.querySelectorAll('.manage-panel').forEach(x=>x.classList.toggle('active',x.id==='panel-'+name));if(name==='reports')renderReports()}

  async function renderHistory(){
    const query=norm($('#historySearchV6')?.value),status=$('#historyStatusV6')?.value||'';
    let orders=(await all('orders')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    orders=orders.filter(order=>(!status||order.status===status)&&(!query||norm(`${order.folio} ${(order.providers||[]).join(' ')}`).includes(query)));
    $('#historyListV6').innerHTML=orders.map(order=>`<article class="card history-card"><div><div class="folio">${html(order.folio)}</div><div>${date(order.createdAt)} · ${(order.rows||[]).length} productos · ${(order.providers||[]).length} proveedores</div><div class="history-meta">${html((order.providers||[]).join(', '))}</div></div><div class="history-actions"><span class="status ${order.status}">${statusLabel(order.status)}</span><button class="btn" data-receive="${html(order.folio)}">Recepción</button><button class="btn" data-edit="${html(order.folio)}">Editar pedido</button></div></article>`).join('')||'<div class="card empty">No hay pedidos guardados.</div>';
  }

  async function openReception(folio,provider=''){
    activeOrder=await get('orders',folio);if(!activeOrder)return;activeProvider=provider||activeOrder.providers?.[0]||'';showPanel('reception');renderReception();
  }
  async function renderReception(){
    if(!activeOrder)return;
    const providers=[...new Set(activeOrder.rows.map(row=>row.provider))];if(!providers.includes(activeProvider))activeProvider=providers[0]||'';
    const tabs=providers.map(provider=>{const rows=activeOrder.rows.filter(x=>x.provider===provider),received=rows.filter(x=>Number(x.receivedQty)>0).length;return `<button class="provider-tab ${provider===activeProvider?'active':''}" data-provider="${encodeURIComponent(provider)}"><span>${html(provider)}</span><small>${received}/${rows.length} recibidos</small></button>`}).join('');
    const files=await invoices(activeOrder.folio,activeProvider),rows=activeOrder.rows.filter(row=>row.provider===activeProvider);
    $('#receptionV6').className='';$('#receptionV6').innerHTML=`
      <section class="card"><div class="sectionhead"><div><h3>${html(activeOrder.folio)}</h3><span class="muted">Recepción separada por proveedor.</span></div><button class="btn primary" id="saveReceptionV6">Guardar</button></div><div class="provider-tabs">${tabs}</div></section>
      <section class="card invoice-zone"><div class="sectionhead"><div><h3>Facturas de ${html(activeProvider)}</h3><span class="muted">Puedes asignar varias facturas al mismo proveedor.</span></div></div><label class="invoice-drop"><input id="invoiceUploadV6" type="file" accept="image/*,application/pdf" multiple><b>Tomar foto o seleccionar facturas</b><span>Se leerán productos, cantidades y precios.</span></label><div id="ocrProgressV6"></div><div class="invoice-list">${files.map(invoiceCard).join('')||'<div class="empty">Sin facturas asignadas.</div>'}</div></section>
      <section class="card"><div class="sectionhead"><div><h3>Productos solicitados</h3><span class="muted">Puedes corregir cualquier lectura.</span></div></div><div id="receiveRowsV6">${rows.map(receiveRow).join('')}</div></section>`;
    $$('.provider-tab').forEach(button=>button.onclick=()=>{activeProvider=decodeURIComponent(button.dataset.provider);renderReception()});
    $('#saveReceptionV6').onclick=saveManualReception;
    $('#invoiceUploadV6').onchange=async event=>{for(const file of event.target.files)await processInvoice(file);activeOrder=await get('orders',activeOrder.folio);renderReception();renderHistory();renderReports()};
  }
  const invoiceCard=invoice=>`<article class="invoice-card"><div><b>${html(invoice.name)}</b><div class="history-meta">${invoice.ocrStatus==='ready'?'Leída':invoice.ocrStatus==='error'?'Revisión necesaria':'Procesando'} · ${(invoice.matches||[]).length} coincidencias</div></div><div><button class="btn" data-review="${invoice.id}">Revisar</button><button class="iconbtn danger-icon" data-delete-invoice="${invoice.id}">⌫</button></div></article>`;
  const receiveRow=row=>`<div class="receive-row-v6" data-row="${html(row.id)}"><div><b>${html(row.description)}</b><div class="history-meta">Pedido: ${row.orderedQty} ${html(row.unit)}</div></div><select data-status><option value="pending" ${row.reception==='pending'?'selected':''}>No llegó</option><option value="partial" ${row.reception==='partial'?'selected':''}>Parcial</option><option value="complete" ${row.reception==='complete'?'selected':''}>Llegó</option></select><input data-qty inputmode="decimal" value="${Number(row.receivedQty)||''}" placeholder="Cantidad"><input data-price inputmode="decimal" value="${Number(row.unitPrice)||''}" placeholder="$ unitario"></div>`;

  function progress(text,percent){const box=$('#ocrProgressV6');if(box)box.innerHTML=`<div class="ocr-progress"><div><b>${html(text)}</b><span>${Math.round(percent||0)}%</span></div><div><i style="width:${Math.max(2,percent||0)}%"></i></div></div>`}
  async function processInvoice(file){
    const invoice={folio:activeOrder.folio,provider:activeProvider,name:file.name,type:file.type,size:file.size,file,createdAt:new Date().toISOString(),ocrStatus:'processing',matches:[]};await put('invoices',invoice);progress(`Leyendo ${file.name}`,3);
    try{const text=await InvoiceReaderV6.read(file,progress);invoice.ocrText=text;invoice.matches=InvoiceReaderV6.match(text,activeOrder.rows.filter(x=>x.provider===activeProvider));invoice.ocrStatus='ready';invoice.processedAt=new Date().toISOString();await put('invoices',invoice);await recomputeProvider(activeOrder.folio,activeProvider);progress(`${invoice.matches.length} productos encontrados`,100);toast('Factura leída y cotejada')}
    catch(error){invoice.ocrStatus='error';invoice.ocrError=String(error?.message||error);await put('invoices',invoice);progress('Factura guardada para revisión manual',100);toast('No se pudo leer automáticamente')}
  }
  async function recomputeProvider(folio,provider){
    const order=await get('orders',folio),files=(await invoices(folio,provider)).filter(x=>x.ocrStatus==='ready');if(!order)return;
    for(const row of order.rows.filter(x=>x.provider===provider)){
      let qty=0,total=0,priced=0;
      for(const file of files)for(const match of file.matches||[])if(String(match.rowId)===String(row.id)){const q=Number(match.qty)||0,p=Number(match.unitPrice)||0;qty+=q;if(q&&p){total+=q*p;priced+=q}}
      row.receivedQty=qty;row.unitPrice=priced?Math.round(total/priced):row.unitPrice;row.reception=qty<=0?'pending':qty>=Number(row.orderedQty)?'complete':'partial';
    }
    order.status=orderStatus(order);order.updatedAt=new Date().toISOString();await put('orders',order);
  }
  async function saveManualReception(){
    $$('#receiveRowsV6 [data-row]').forEach(element=>{const row=activeOrder.rows.find(x=>String(x.id)===element.dataset.row);if(!row)return;row.receivedQty=number(element.querySelector('[data-qty]').value);row.unitPrice=number(element.querySelector('[data-price]').value)||null;row.reception=element.querySelector('[data-status]').value;if(row.receivedQty>=row.orderedQty&&row.receivedQty>0)row.reception='complete';else if(row.receivedQty>0&&row.reception==='pending')row.reception='partial'});
    activeOrder.status=orderStatus(activeOrder);activeOrder.updatedAt=new Date().toISOString();await put('orders',activeOrder);toast('Recepción guardada');renderHistory();renderReception();renderReports();
  }

  async function deleteInvoice(id){const invoice=(await all('invoices')).find(x=>String(x.id)===String(id));if(!invoice||!confirm(`¿Eliminar ${invoice.name}?`))return;await remove('invoices',invoice.id);await recomputeProvider(invoice.folio,invoice.provider);activeOrder=await get('orders',invoice.folio);renderReception();renderHistory()}
  async function reviewInvoice(id){
    const invoice=(await all('invoices')).find(x=>String(x.id)===String(id));if(!invoice)return;const order=await get('orders',invoice.folio),rows=order.rows.filter(x=>x.provider===invoice.provider);let dialog=$('#invoiceReviewV6');if(!dialog){dialog=document.createElement('dialog');dialog.id='invoiceReviewV6';document.body.appendChild(dialog)}
    dialog.innerHTML=`<form class="modal invoice-review" method="dialog"><div class="sectionhead"><div><h2>Revisar factura</h2><span class="muted">${html(invoice.name)} · ${html(invoice.provider)}</span></div><button class="iconbtn" value="cancel">✕</button></div><div class="review-grid">${rows.map(row=>{const match=(invoice.matches||[]).find(x=>String(x.rowId)===String(row.id))||{};return `<div class="review-row" data-review-row="${html(row.id)}"><div><b>${html(row.description)}</b><small>${html(match.line||'Sin coincidencia automática')}</small></div><input data-review-qty inputmode="decimal" value="${Number(match.qty)||''}" placeholder="Cant."><input data-review-price inputmode="decimal" value="${Number(match.unitPrice)||''}" placeholder="$ unit."></div>`}).join('')}</div><div class="modalactions"><button class="btn" value="cancel">Cancelar</button><button type="button" class="btn primary" id="applyReviewV6">Aplicar lectura</button></div></form>`;
    dialog.showModal();$('#applyReviewV6').onclick=async()=>{invoice.matches=$$('[data-review-row]').map(element=>{const row=rows.find(x=>String(x.id)===element.dataset.reviewRow),qty=number(element.querySelector('[data-review-qty]').value),unitPrice=number(element.querySelector('[data-review-price]').value);return qty||unitPrice?{rowId:row.id,description:row.description,line:'Corrección manual',qty,unitPrice,confidence:1}:null}).filter(Boolean);invoice.ocrStatus='ready';await put('invoices',invoice);await recomputeProvider(invoice.folio,invoice.provider);activeOrder=await get('orders',invoice.folio);dialog.close();renderReception();renderHistory();toast('Lectura corregida')};
  }

  async function openEditor(folio){draftOrder=structuredClone(await get('orders',folio));if(draftOrder)renderEditor()}
  function renderEditor(){
    let dialog=$('#orderEditorV6');if(!dialog){dialog=document.createElement('dialog');dialog.id='orderEditorV6';document.body.appendChild(dialog)}
    dialog.innerHTML=`<div class="modal order-editor"><div class="sectionhead"><div><h2>Editar ${html(draftOrder.folio)}</h2><span class="muted">Cambia cantidades, elimina o agrega ítems.</span></div><button class="iconbtn" data-close-editor>✕</button></div><div class="edit-order-rows">${draftOrder.rows.map(row=>`<div class="edit-order-row" data-edit-row="${html(row.id)}"><div><b>${html(row.description)}</b><small>${html(row.provider)} · ${html(row.unit)}</small></div><input data-edit-qty inputmode="decimal" value="${row.orderedQty}"><button class="iconbtn danger-icon" data-remove-row="${html(row.id)}">⌫</button></div>`).join('')}</div><div class="card add-product-box"><b>Agregar producto</b><input id="addProductSearchV6" placeholder="Buscar producto o proveedor"><div id="addProductResultsV6"></div></div><div class="modalactions"><button class="btn" data-close-editor>Cancelar</button><button class="btn primary" id="saveEditorV6">Guardar cambios</button></div></div>`;
    if(!dialog.open)dialog.showModal();dialog.querySelectorAll('[data-close-editor]').forEach(x=>x.onclick=()=>dialog.close());dialog.querySelectorAll('[data-remove-row]').forEach(x=>x.onclick=()=>{draftOrder.rows=draftOrder.rows.filter(row=>String(row.id)!==x.dataset.removeRow);renderEditor()});$('#addProductSearchV6').oninput=renderAddResults;$('#saveEditorV6').onclick=saveEditor;renderAddResults();
  }
  function renderAddResults(){const box=$('#addProductResultsV6');if(!box)return;const query=norm($('#addProductSearchV6').value),used=new Set(draftOrder.rows.map(x=>String(x.id))),items=state.items.filter(x=>x.enabled&&!used.has(String(x.id))&&(!query||norm(`${x.description} ${x.provider}`).includes(query))).slice(0,30);box.innerHTML=items.map(item=>`<button class="product-result" type="button" data-add="${html(item.id)}"><span><b>${html(item.description)}</b><small>${html(item.provider)} · ${html(item.unit)}</small></span><strong>Agregar</strong></button>`).join('')||'<div class="empty">Sin resultados</div>';box.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{const item=state.items.find(x=>String(x.id)===button.dataset.add);draftOrder.rows.push({id:item.id,description:item.description,provider:item.provider,category:item.category,unit:item.unit,orderedQty:1,receivedQty:0,reception:'pending',unitPrice:null});renderEditor()})}
  async function saveEditor(){
    $$('#orderEditorV6 [data-edit-row]').forEach(element=>{const row=draftOrder.rows.find(x=>String(x.id)===element.dataset.editRow);if(row)row.orderedQty=Math.max(0,number(element.querySelector('[data-edit-qty]').value))});draftOrder.rows=draftOrder.rows.filter(x=>x.orderedQty>0);draftOrder.providers=[...new Set(draftOrder.rows.map(x=>x.provider))];draftOrder.totalItems=draftOrder.rows.length;draftOrder.status=orderStatus(draftOrder);draftOrder.updatedAt=new Date().toISOString();await put('orders',draftOrder);
    state.currentFolio=draftOrder.folio;state.order={};for(const row of draftOrder.rows)if(state.items.some(x=>String(x.id)===String(row.id)))state.order[row.id]={qty:row.orderedQty,unit:row.unit};persist();renderAll();$('#orderEditorV6').close();renderHistory();toast('Pedido actualizado y cargado como pedido actual');
  }

  async function renderReports(){
    const days=Number($('#reportPeriodV6')?.value||30),provider=$('#reportProviderV6')?.value||'',cut=Date.now()-days*86400000,orders=(await all('orders')).filter(order=>new Date(order.createdAt).getTime()>=cut),providers=[...new Set(orders.flatMap(order=>(order.rows||[]).map(row=>row.provider)))].sort(),select=$('#reportProviderV6');
    if(select){const old=select.value;select.innerHTML='<option value="">Todos los proveedores</option>'+providers.map(x=>`<option>${html(x)}</option>`).join('');select.value=old}
    const totals={};orders.flatMap(order=>order.rows||[]).filter(row=>Number(row.receivedQty)>0&&(!provider||row.provider===provider)).forEach(row=>{const total=totals[row.description]||{qty:0,value:0};total.qty+=Number(row.receivedQty);total.value+=Number(row.receivedQty)*(Number(row.unitPrice)||0);totals[row.description]=total});
    const rows=Object.entries(totals).sort((a,b)=>b[1].qty-a[1].qty),max=Math.max(1,...rows.map(x=>x[1].qty));$('#reportsV6').innerHTML=`<div class="card"><h3>Compras recibidas</h3><p class="muted">Cantidades y gasto estimado según facturas registradas.</p>${rows.map(([name,total])=>`<div class="report-bar"><div class="report-label"><span>${html(name)}</span><b>${total.qty} · ${money(total.value)}</b></div><div class="report-track"><div class="report-fill" style="width:${total.qty/max*100}%"></div></div></div>`).join('')||'<div class="empty">Sin recepciones en este período.</div>'}</div>`;
  }

  view.addEventListener('click',event=>{const receive=event.target.closest('[data-receive]'),edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete-invoice]'),review=event.target.closest('[data-review]');if(receive)openReception(receive.dataset.receive);if(edit)openEditor(edit.dataset.edit);if(del)deleteInvoice(del.dataset.deleteInvoice);if(review)reviewInvoice(review.dataset.review)});
  $('#historySearchV6').oninput=renderHistory;$('#historyStatusV6').onchange=renderHistory;$('#reportPeriodV6').onchange=renderReports;$('#reportProviderV6').onchange=renderReports;
  const version=$('#buildVersion');if(version)version.textContent='v'+BUILD;
})();
