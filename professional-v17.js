(function(root){
  'use strict';
  if(root.__PEDIDOS_PROFESSIONAL_V17__)return;
  root.__PEDIDOS_PROFESSIONAL_V17__=true;

  const State=root.PedidosState,Orders=root.PedidosOrders,DB=root.PedidosDB,PDF=root.PedidosPDF,AI=root.PedidosAI;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date=value=>{try{return new Date(value).toLocaleDateString('es-CL')}catch{return'—'}};
  const statusText=value=>value==='complete'?'Completo':value==='partial'?'Parcial':'Pendiente';
  let historyRevision=0,historyBusy=false,pdfUrl='';

  function toast(message){
    const node=$('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._timer);node._timer=setTimeout(()=>node.classList.remove('show'),3000);
  }
  function profile(){return State.value.profile||(State.value.profile={})}
  function provider(id,fallback=''){return State.provider(id)||{id,name:fallback||'Proveedor',logoSize:24}}
  function setTop(view){
    const titles={order:['PEDIDO ACTUAL','Preparar pedido'],files:['DOCUMENTOS','Archivos PDF'],management:['COMPRAS','Gestión profesional'],data:['CATÁLOGOS','Base de datos'],profile:['CONFIGURACIÓN','Perfil']};
    const value=titles[view]||titles.order;
    if($('#eyebrow'))$('#eyebrow').childNodes[0].textContent=value[0]+' ';
    if($('#pageHeading'))$('#pageHeading').textContent=value[1];
    const show=view==='order'||view==='files';$('#clearDraft')?.classList.toggle('hidden',!show);$('#generateOrder')?.classList.toggle('hidden',!show);
    if($('#generateOrder'))$('#generateOrder').textContent=view==='order'?'Emitir pedido':'PDFs';
  }
  function safeSwitchView(view){
    $$('.view').forEach(node=>node.classList.toggle('active',node.id===`view-${view}`));
    $$('.nav-btn').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
    setTop(view);window.scrollTo({top:0,behavior:'instant'});
  }
  function safeManagementTab(tab){
    $$('[data-management-tab]').forEach(button=>button.classList.toggle('active',button.dataset.managementTab===tab));
    $$('.management-panel').forEach(panel=>panel.classList.toggle('active',panel.id===`management-${tab}`));
  }
  function providerRows(order){
    const ids=order.providerIds?.length?order.providerIds:[...new Set((order.rows||[]).map(row=>row.providerId).filter(Boolean))];
    return ids.map(id=>({id,name:provider(id,(order.rows||[]).find(row=>row.providerId===id)?.providerName).name,count:(order.rows||[]).filter(row=>row.providerId===id).length})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }

  async function ensureCurrentOrderRecord(){
    const folio=State.value.currentOrderFolio,rows=State.draftRows();
    if(!folio||!rows.length)return null;
    let order=await Orders.get(folio);
    if(!order||!(order.rows||[]).length)order=await Orders.saveDraft();
    return order;
  }

  function orderLifecycleCard(order){
    const existing=$('#orderLifecycle');
    const rows=State.draftRows();
    const html=`<div class="order-lifecycle-card"><div><span class="native-eyebrow">ESTADO DEL PEDIDO</span><strong>${order?.folio?`Pedido ${esc(order.folio)}`:'Borrador sin emitir'}</strong><small>${order?.folio?'Guardado en historial y disponible para recepción.':'Completa cantidades y presiona “Emitir pedido”.'}</small></div><div class="order-lifecycle-side"><span class="status ${esc(order?.status||'pending')}">${order?.folio?statusText(order.status):`${rows.length} ítems`}</span></div></div>`;
    if(existing)existing.outerHTML=`<div id="orderLifecycle">${html}</div>`;
    else $('#view-order')?.insertAdjacentHTML('afterbegin',`<div id="orderLifecycle">${html}</div>`);
  }
  async function refreshOrderLifecycle(){
    const folio=State.value.currentOrderFolio,order=folio?await Orders.get(folio):null;orderLifecycleCard(order);
  }

  async function emitOrder(){
    const button=$('#generateOrder');if(button?.dataset.busy==='1')return;
    try{
      if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Emitiendo…'}
      let order=await Orders.saveDraft();
      order.issuedAt=order.issuedAt||new Date().toISOString();order.lifecycle='issued';
      await Orders.save(order);
      const stored=await Orders.get(order.folio);
      if(!stored||!(stored.rows||[]).length)throw new Error('El pedido no quedó registrado en el historial');
      State.value.currentOrderFolio=stored.folio;State.persist();
      await Promise.all([renderHistoryStable(),renderFilesStable(stored)]);
      await refreshOrderLifecycle();safeSwitchView('files');toast(`Pedido ${stored.folio} emitido y guardado`);
    }catch(error){console.error(error);toast(error.message||'No se pudo emitir el pedido')}
    finally{if(button){button.dataset.busy='0';button.disabled=false;button.textContent='PDFs'}}
  }

  async function pdfOptions(order,providerId){
    const fallback=(order.rows||[]).find(row=>row.providerId===providerId)?.providerName||'',entry=provider(providerId,fallback);
    return{order,provider:{...entry,logo:await DB.assetDataUrl(`provider:${providerId}`)},profile:profile(),logos:{logo1:await DB.assetDataUrl('profile:logo1'),logo2:await DB.assetDataUrl('profile:logo2'),logo1Size:profile().logoSize,logo2Size:profile().logo2Size}};
  }
  async function handlePdf(order,providerId,mode){
    const entry=provider(providerId,(order.rows||[]).find(row=>row.providerId===providerId)?.providerName||'Proveedor');
    try{
      const blob=await PDF.blob(await pdfOptions(order,providerId)),name=PDF.fileName(order,entry);
      if(mode==='preview'){
        if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=URL.createObjectURL(blob);$('#pdfTitle').textContent=`${order.folio} · ${entry.name}`;$('#pdfFrame').src=pdfUrl;$('#pdfDialog').showModal();return;
      }
      if(mode==='share'&&await PDF.share(blob,name,`Pedido ${entry.name}`))return;
      PDF.download(blob,name);
    }catch(error){console.error(error);toast(error.message||'No se pudo generar el PDF')}
  }
  async function renderFilesStable(order=null){
    order=order||(State.value.currentOrderFolio?await Orders.get(State.value.currentOrderFolio):null);
    const list=$('#filesList');if(!list)return;
    if(!order){$('#filesFolio').textContent='—';list.innerHTML='<div class="card empty">Emite un pedido para crear sus documentos.</div>';return}
    $('#filesFolio').textContent=order.folio;
    list.innerHTML=providerRows(order).map(entry=>`<article class="card file-card native-file-card"><div><span class="native-eyebrow">PROVEEDOR</span><h3>${esc(entry.name)}</h3><span class="muted">${entry.count} ítems · ${esc(order.folio)}</span></div><div class="file-actions"><button class="btn" data-v17-pdf="preview" data-provider="${esc(entry.id)}">Vista previa</button><button class="btn primary" data-v17-pdf="download" data-provider="${esc(entry.id)}">Descargar</button><button class="btn" data-v17-pdf="share" data-provider="${esc(entry.id)}">Compartir</button></div></article>`).join('')||'<div class="card empty">Este pedido no contiene proveedores.</div>';
  }

  async function renderHistoryStable(){
    if(historyBusy){historyRevision++;return}
    historyBusy=true;const revision=++historyRevision,container=$('#historyList');
    try{
      if(!container)return;
      container.innerHTML='<div class="history-loading"><i></i><i></i><i></i></div>';
      await ensureCurrentOrderRecord();
      let orders=await Orders.list();
      const query=(root.PedidosCore?.normalizeText($('#historySearch')?.value||''))||'',filter=$('#historyStatus')?.value||'';
      orders=orders.filter(order=>(!filter||order.status===filter)&&(!query||root.PedidosCore.normalizeText(`${order.folio} ${(order.providers||[]).join(' ')} ${(order.rows||[]).map(row=>row.description).join(' ')}`).includes(query)));
      if(revision!==historyRevision)return;
      container.innerHTML=orders.map(order=>{
        const providers=providerRows(order).map(entry=>`<div class="provider-order-row"><div><b>${esc(entry.name)}</b><small>${entry.count} ítems</small></div><div class="provider-order-actions"><button class="btn small" data-history-edit="${esc(order.folio)}" data-provider="${esc(entry.id)}">Editar</button><button class="btn small" data-history-reception="${esc(order.folio)}" data-provider="${esc(entry.id)}">Recepción</button><button class="btn small" data-history-pdf="${esc(order.folio)}" data-provider="${esc(entry.id)}">PDF</button></div></div>`).join('');
        const current=State.value.currentOrderFolio===order.folio?'<span class="current-order-chip">Pedido vigente</span>':'';
        return`<article class="card order-card native-order-card"><div class="order-top"><div><div class="folio">${esc(order.folio)} ${current}</div><div class="muted">${date(order.createdAt)} · ${order.totalItems||order.rows?.length||0} productos</div></div><span class="status ${esc(order.status||'pending')}">${statusText(order.status)}</span></div><div class="provider-order-list">${providers||'<div class="muted">Sin proveedores</div>'}</div><div class="manage-actions"><button class="btn small" data-history-add-provider="${esc(order.folio)}">Agregar proveedor</button><button class="btn small" data-history-load="${esc(order.folio)}">Cargar pedido</button><button class="btn small danger" data-history-delete="${esc(order.folio)}">Eliminar</button></div></article>`;
      }).join('')||'<div class="card empty"><b>No hay pedidos emitidos.</b><br><span>Ve a Pedido, completa cantidades y presiona “Emitir pedido”.</span></div>';
    }catch(error){console.error(error);if(container)container.innerHTML=`<div class="card empty"><b>No se pudo cargar el historial.</b><br>${esc(error.message||error)}<br><button class="btn primary" id="retryHistory">Reintentar</button></div>`}
    finally{historyBusy=false;if(revision!==historyRevision)setTimeout(renderHistoryStable,0)}
  }

  async function renderHeaderPreview(){
    const box=$('#headerPreview');if(!box)return;
    const current=profile(),[logo1,logo2]=await Promise.all([DB.assetDataUrl('profile:logo1'),DB.assetDataUrl('profile:logo2')]);
    const justify={left:'flex-start',center:'center',right:'flex-end'}[current.logoAlignX||'center'],align={top:'flex-start',center:'center',bottom:'flex-end'}[current.logoAlignY||'center'];
    const logos=[logo1&&`<img src="${logo1}" alt="Logo principal" style="max-width:${Number(current.logoSize)||42}mm;max-height:78px;object-fit:contain">`,logo2&&`<img src="${logo2}" alt="Logo secundario" style="max-width:${Number(current.logo2Size)||28}mm;max-height:58px;object-fit:contain">`].filter(Boolean).join('');
    const logoArea=`<div class="preview-logo-area" style="justify-content:${justify};align-items:${align}">${logos||'<span class="muted">Sin logos</span>'}</div>`;
    const info=`<table class="preview-info"><tr><th>RAZÓN SOCIAL</th><td>${esc(current.companyName||'')}</td></tr><tr><th>RUT</th><td>${esc(current.rut||'')}</td></tr><tr><th>DIRECCIÓN</th><td>${esc(current.address||'')}</td></tr><tr><th>LOCAL</th><td>${esc(current.location||'')}</td></tr></table>`;
    let header=current.logoPosition==='top'?`${logoArea}${info}`:current.logoPosition==='bottom'?`${info}${logoArea}`:current.logoPosition==='right'?`<div class="preview-side right">${info}${logoArea}</div>`:`<div class="preview-side">${logoArea}${info}</div>`;
    box.innerHTML=`<div class="preview-document">${header}<div class="preview-table-head" style="background:${current.tableHeaderColor||'#48484c'}">DESCRIPCIÓN <span>CANTIDAD　 UNIDAD</span></div></div>`;
  }
  function syncProfileControls(){
    if($('#logoAlignX'))$('#logoAlignX').value=profile().logoAlignX||'center';if($('#logoAlignY'))$('#logoAlignY').value=profile().logoAlignY||'center';
  }
  function saveAlignment(){
    if(!$('#logoAlignX')||!$('#logoAlignY'))return;
    profile().logoAlignX=$('#logoAlignX').value||'center';profile().logoAlignY=$('#logoAlignY').value||'center';State.persist();renderHeaderPreview();
  }

  function ensureAiCard(){
    if($('#aiSettingsCard'))return;
    const previewCard=$('#headerPreview')?.closest('.card');
    previewCard?.insertAdjacentHTML('afterend',`<section class="card ai-card" id="aiSettingsCard"><div class="section-head"><div><span class="native-eyebrow">LECTURA INTELIGENTE</span><h3>Gemini para facturas</h3><span class="muted">Interpreta cajas, unidades, impuestos, precios finales y coteja contra el pedido.</span></div><span class="ai-status" id="aiStatusBadge">Comprobando…</span></div><label class="ai-switch"><input type="checkbox" id="aiEnabled"><span>Usar Gemini cuando haya conexión</span></label><label class="field"><span>Endpoint seguro del analizador</span><input id="aiEndpoint" inputmode="url" autocomplete="off"></label><div class="ai-actions"><button class="btn" type="button" id="testAi">Probar conexión</button><small id="aiStatusText" class="muted">OCR local queda activo como respaldo offline.</small></div></section>`);
  }
  async function updateAiStatus(){
    ensureAiCard();const config=AI.settings();$('#aiEnabled').checked=config.enabled!==false;$('#aiEndpoint').value=config.endpoint||AI.DEFAULT_ENDPOINT;
    const status=await AI.health(),badge=$('#aiStatusBadge');badge.textContent=status.ok?'IA conectada':'OCR de respaldo';badge.classList.toggle('online',status.ok);$('#aiStatusText').textContent=status.message;
  }
  function saveAiSettings(){
    const config=AI.settings();config.enabled=$('#aiEnabled').checked;config.endpoint=String($('#aiEndpoint').value||AI.DEFAULT_ENDPOINT).trim().replace(/\/$/,'');State.persist();updateAiStatus();
  }

  function installNativeEnhancements(){
    profile().logoAlignX=profile().logoAlignX||'center';profile().logoAlignY=profile().logoAlignY||'center';State.value.settings=State.value.settings||{};State.value.settings.ai=State.value.settings.ai||{enabled:true,endpoint:AI.DEFAULT_ENDPOINT};State.persist();
    const marker=$('#buildVersion');if(marker)marker.textContent='v9.0.0';
    syncProfileControls();renderHeaderPreview();refreshOrderLifecycle();ensureAiCard();updateAiStatus();
    setTimeout(async()=>{await ensureCurrentOrderRecord();if($('[data-management-tab="history"]')?.classList.contains('active'))renderHistoryStable()},250);
  }

  document.addEventListener('click',event=>{
    const emit=event.target.closest('#generateOrder');
    if(emit&&$('#view-order')?.classList.contains('active')){event.preventDefault();event.stopImmediatePropagation();emitOrder();return}
    const pdfButton=event.target.closest('[data-v17-pdf]');
    if(pdfButton){event.preventDefault();event.stopImmediatePropagation();Orders.get(State.value.currentOrderFolio).then(order=>order&&handlePdf(order,pdfButton.dataset.provider,pdfButton.dataset.v17Pdf));return}
    const nav=event.target.closest('[data-view]');
    if(nav){
      safeSwitchView(nav.dataset.view);
      if(nav.dataset.view==='management'){event.preventDefault();event.stopImmediatePropagation();if($('[data-management-tab="history"]')?.classList.contains('active'))setTimeout(renderHistoryStable,40);return}
      if(nav.dataset.view==='files')setTimeout(()=>renderFilesStable(),40);
      if(nav.dataset.view==='profile')setTimeout(()=>{syncProfileControls();renderHeaderPreview();updateAiStatus()},80);
    }
    const tab=event.target.closest('[data-management-tab]');
    if(tab){safeManagementTab(tab.dataset.managementTab);tab.scrollIntoView({block:'nearest',inline:'nearest'});if(tab.dataset.managementTab==='history'){event.preventDefault();event.stopImmediatePropagation();renderHistoryStable()}}
    if(event.target.closest('#retryHistory'))renderHistoryStable();
    if(event.target.closest('#clearDraft'))setTimeout(refreshOrderLifecycle,220);
    if(event.target.closest('#testAi')){event.preventDefault();updateAiStatus()}
    if(event.target.closest('[data-history-delete],[data-history-load],[data-history-edit],[data-history-reception],[data-history-add-provider]'))setTimeout(()=>{renderHistoryStable();refreshOrderLifecycle()},500);
  },true);
  document.addEventListener('input',event=>{
    if(event.target.matches('#historySearch')){event.stopImmediatePropagation();renderHistoryStable()}
    if(event.target.matches('#logoAlignX,#logoAlignY'))saveAlignment();
    if(event.target.matches('#companyLogoSize,#companyLogo2Size'))setTimeout(renderHeaderPreview,20);
    if(event.target.matches('#orderList [data-qty]'))setTimeout(refreshOrderLifecycle,30);
  },true);
  document.addEventListener('change',event=>{
    if(event.target.matches('#historyStatus')){event.stopImmediatePropagation();renderHistoryStable()}
    if(event.target.matches('#logoAlignX,#logoAlignY'))saveAlignment();
    if(event.target.matches('#logoPosition,#companyLogoSize,#companyLogo2Size,#headerColor'))setTimeout(renderHeaderPreview,30);
    if(event.target.matches('#aiEnabled,#aiEndpoint'))saveAiSettings();
  },true);
  $('#pdfDialog')?.addEventListener('close',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=''});
  window.addEventListener('online',updateAiStatus);window.addEventListener('offline',updateAiStatus);
  window.addEventListener('pageshow',()=>setTimeout(()=>{syncProfileControls();renderHeaderPreview();refreshOrderLifecycle()},100));

  const start=()=>setTimeout(installNativeEnhancements,180);
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})(globalThis);
