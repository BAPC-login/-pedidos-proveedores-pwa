(function(root){
  'use strict';
  if(root.__PEDIDOS_INVOICE_UI_V20__)return;
  root.__PEDIDOS_INVOICE_UI_V20__=true;

  const State=root.PedidosState,Orders=root.PedidosOrders,DB=root.PedidosDB,Invoice=root.PedidosInvoice,Core=root.PedidosCore,PDF=root.PedidosPDF;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let busy=false,decorateQueued=false,progressToken=0,loaderStarted=0,loaderClock=null;

  function toast(message){
    const node=$('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._v20Timer);node._v20Timer=setTimeout(()=>node.classList.remove('show'),4600);
  }
  function truncate(value,max=300){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text}

  function ensureLoader(){
    let overlay=$('#invoiceAiOverlay');if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='invoiceAiOverlay';overlay.className='invoice-ai-overlay hidden';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
    overlay.innerHTML=`<div class="invoice-ai-card">
      <div class="invoice-ai-brand"><span class="invoice-ai-spark">✦</span><span>LECTURA INTELIGENTE</span></div>
      <div class="invoice-ai-visual"><div class="invoice-ai-ring" id="invoiceAiRing"><div class="invoice-ai-ring-core"><strong id="invoiceAiPercent">0%</strong><span>procesando</span></div></div><div class="invoice-ai-orbit-dot"></div></div>
      <div class="invoice-ai-copy"><div class="invoice-ai-phase" id="invoiceAiPhase">Preparando</div><h3 id="invoiceAiTitle">Preparando factura</h3><p id="invoiceAiDetail">La factura se comparará con el pedido PDF del proveedor.</p></div>
      <div class="invoice-ai-steps"><span data-loader-step="prepare">Preparar</span><span data-loader-step="read">Leer</span><span data-loader-step="compare">Cotejar</span><span data-loader-step="validate">Validar</span></div>
      <div class="invoice-ai-footer"><span class="invoice-ai-pulse"><i></i>Proceso seguro en Cloudflare</span><time id="invoiceAiElapsed">00:00</time></div>
    </div>`;
    document.body.appendChild(overlay);return overlay;
  }
  function formatElapsed(ms){const seconds=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(seconds/60);return`${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
  function startLoaderClock(){
    clearInterval(loaderClock);loaderStarted=Date.now();
    loaderClock=setInterval(()=>{const time=$('#invoiceAiElapsed');if(time)time.textContent=formatElapsed(Date.now()-loaderStarted)},500);
  }
  function loaderStep(percent){return percent<18?'prepare':percent<52?'read':percent<88?'compare':'validate'}
  function showProgress(label,percent,detail='',phase='reading'){
    const overlay=ensureLoader(),safe=Math.max(0,Math.min(100,Number(percent)||0));
    if(overlay.classList.contains('hidden')){overlay.classList.remove('hidden');document.body.classList.add('invoice-ai-busy');startLoaderClock()}
    overlay.classList.toggle('complete',phase==='done'||safe>=100);overlay.classList.toggle('retrying',phase==='retrying');overlay.classList.remove('error');
    $('#invoiceAiRing')?.style.setProperty('--invoice-progress',`${safe*3.6}deg`);
    if($('#invoiceAiPercent'))$('#invoiceAiPercent').textContent=`${Math.round(safe)}%`;
    if($('#invoiceAiTitle'))$('#invoiceAiTitle').textContent=label||'Procesando factura';
    if($('#invoiceAiDetail'))$('#invoiceAiDetail').textContent=detail||'Gemini compara la factura con el pedido PDF.';
    if($('#invoiceAiPhase'))$('#invoiceAiPhase').textContent=phase==='retrying'?'REINTENTO AUTOMÁTICO':phase==='validating'?'VALIDACIÓN FINAL':phase==='done'?'LISTO':'GEMINI + PEDIDO PDF';
    const active=loaderStep(safe),order=['prepare','read','compare','validate'],activeIndex=order.indexOf(active);
    $$('[data-loader-step]').forEach((node,index)=>{node.classList.toggle('active',index===activeIndex);node.classList.toggle('done',index<activeIndex||safe>=100)});
    const inline=$('#invoiceProgress');if(inline)inline.innerHTML='';
  }
  function showLoaderError(message){
    const overlay=ensureLoader();overlay.classList.remove('hidden','complete','retrying');overlay.classList.add('error');document.body.classList.add('invoice-ai-busy');
    $('#invoiceAiRing')?.style.setProperty('--invoice-progress','360deg');if($('#invoiceAiPercent'))$('#invoiceAiPercent').textContent='!';
    if($('#invoiceAiPhase'))$('#invoiceAiPhase').textContent='REVISIÓN NECESARIA';if($('#invoiceAiTitle'))$('#invoiceAiTitle').textContent='No se pudo completar la lectura';if($('#invoiceAiDetail'))$('#invoiceAiDetail').textContent=truncate(message,220);
  }
  function hideLoader(delay=900){
    setTimeout(()=>{const overlay=$('#invoiceAiOverlay');if(!overlay)return;overlay.classList.add('hidden');overlay.classList.remove('complete','retrying','error');document.body.classList.remove('invoice-ai-busy');clearInterval(loaderClock);loaderClock=null},delay);
  }

  function activeContext(){
    const rootNode=$('#receptionContent');if(!rootNode)return null;
    const active=rootNode.querySelector('[data-reception-provider].active')||rootNode.querySelector('[data-reception-provider]');
    const folio=rootNode.querySelector(':scope > .card h3')?.textContent?.trim()||'';
    const providerId=active?.dataset.receptionProvider||'';
    return folio&&providerId?{folio,providerId}:null;
  }
  function refreshReception(){const current=$('#receptionContent [data-reception-provider].active')||$('#receptionContent [data-reception-provider]');current?.click()}
  function productContext(order,providerId){return(order.rows||[]).filter(row=>row.providerId===providerId).map(row=>({productId:row.productId,description:row.description,unit:row.unit,orderedQty:Number(row.orderedQty)||0}))}
  async function buildOrderPdf(order,providerId){
    if(!PDF?.blob)return null;
    const row=(order.rows||[]).find(item=>item.providerId===providerId),entry=State.provider(providerId)||{id:providerId,name:row?.providerName||'Proveedor',logoSize:24};
    const [providerLogo,logo1,logo2]=await Promise.all([DB.assetDataUrl(`provider:${providerId}`),DB.assetDataUrl('profile:logo1'),DB.assetDataUrl('profile:logo2')]);
    return PDF.blob({order,provider:{...entry,id:providerId,name:entry.name||row?.providerName||'Proveedor',logo:providerLogo},profile:{...(State.value.profile||{})},logos:{logo1,logo2,logo1Size:State.value.profile?.logoSize,logo2Size:State.value.profile?.logo2Size}});
  }
  async function clearAppliedData(invoice){
    const prices=(await DB.all('prices')).filter(row=>String(row.invoiceId)===String(invoice.id));for(const price of prices)await DB.remove('prices',price.id);
    await Orders.recomputeReception(invoice.folio,invoice.providerId);
  }
  function classifyResult(result){const lines=Array.isArray(result?.summary?.lines)?result.summary.lines:[],linked=lines.filter(line=>line.productId).length;return{lines,linked,unlinked:lines.length-linked,status:lines.length?'review':'error'}}
  async function persistResult(invoice,result){
    const classified=classifyResult(result);invoice.ocrText=result.text||'';invoice.invoiceNumber=result.summary?.invoiceNumber||'';invoice.taxTotals=result.summary?.totals||{};invoice.lines=classified.lines;
    invoice.engine=result.engine||'gemini';invoice.model=result.model||'';invoice.warnings=result.warnings||[];invoice.comparedOrderPdf=!!result.comparedOrderPdf;invoice.status=classified.status;invoice.error=classified.status==='error'?'No se detectaron líneas de productos':'';
    invoice.displayName=Core.invoiceDisplayName(invoice.providerName,invoice.invoiceNumber||`SIN-${invoice.id}`,invoice.originalName);invoice.analysisSummary={linked:classified.linked,unlinked:classified.unlinked,total:classified.lines.length,engine:invoice.engine,model:invoice.model,comparedOrderPdf:invoice.comparedOrderPdf};
    await Orders.saveInvoice(invoice);await Orders.recomputeReception(invoice.folio,invoice.providerId);return classified;
  }
  async function analyzeStoredInvoice(invoice,order,providerId,filePosition=''){
    const provider=State.provider(providerId)||{name:(order.rows||[]).find(row=>row.providerId===providerId)?.providerName||invoice.providerName||'Proveedor'},token=++progressToken;
    invoice.providerName=provider.name;invoice.status='processing';invoice.error='';invoice.updatedAt=new Date().toISOString();await Orders.saveInvoice(invoice);await clearAppliedData(invoice);refreshReception();
    try{
      showProgress('Generando el pedido PDF',3,filePosition||'Se prepara el documento que Gemini usará como referencia.','preparing');
      const orderFile=await buildOrderPdf(order,providerId);
      const result=await Invoice.analyze(invoice.file,productContext(order,providerId),update=>showProgress(update.label,update.percent,update.detail,update.phase),{providerName:provider.name,folio:order.folio,orderFile,orderFileName:`PEDIDO_${order.folio}_${provider.name}.pdf`});
      const classified=await persistResult(invoice,result);
      showProgress('Factura lista para revisar',100,`${classified.linked} coincidencias exactas · ${classified.unlinked} líneas por revisar. Nada se aplica hasta confirmar.','done');
      toast(`${invoice.displayName}: ${classified.linked}/${classified.lines.length} líneas cotejadas`);hideLoader(1300);
    }catch(error){
      const message=String(error.message||error);invoice.status='error';invoice.error=message;invoice.analysisSummary={linked:0,unlinked:0,total:0,engine:'error'};await Orders.saveInvoice(invoice);await Orders.recomputeReception(invoice.folio,invoice.providerId);
      showLoaderError(message);toast(`No se pudo leer ${invoice.originalName}. Puedes usar “Reprocesar con IA”.`);hideLoader(3200);
    }
    if(token===progressToken)refreshReception();
  }
  async function processFiles(files){
    if(busy||!files.length)return;
    const context=activeContext();if(!context)return toast('No se pudo identificar el pedido o proveedor activo');
    const order=await Orders.get(context.folio);if(!order)return toast('Pedido no encontrado');
    busy=true;
    try{
      for(let index=0;index<files.length;index++){
        const file=files[index],provider=State.provider(context.providerId)||{name:(order.rows||[]).find(row=>row.providerId===context.providerId)?.providerName||'Proveedor'};
        const invoice={folio:order.folio,providerId:context.providerId,providerName:provider.name,originalName:file.name,file,createdAt:new Date().toISOString(),status:'processing',lines:[],engine:'pending'};
        await Orders.saveInvoice(invoice);await analyzeStoredInvoice(invoice,order,context.providerId,files.length>1?`Factura ${index+1} de ${files.length}`:'');
      }
    }finally{busy=false}
  }
  async function retryInvoice(id){
    if(busy)return;const invoice=await DB.get('invoices',Number(id));if(!invoice)return toast('Factura no encontrada');if(!invoice.file)return toast('El archivo original ya no está disponible');
    const order=await Orders.get(invoice.folio);if(!order)return toast('Pedido no encontrado');busy=true;try{await analyzeStoredInvoice(invoice,order,invoice.providerId,'Reprocesando factura guardada')}finally{busy=false}
  }

  function statusLabel(invoice){if(invoice.status==='processing')return'Comparando factura con pedido PDF';if(invoice.status==='error')return'Lectura pendiente';if(invoice.status==='review')return'Leída · pendiente de confirmar';if(invoice.status==='reviewed')return'Revisada y aplicada';return'Pendiente'}
  function engineLabel(invoice){if(invoice.status==='processing')return'Analizando';if(invoice.engine==='gemini')return invoice.model?`Gemini · ${invoice.model}`:'Gemini';return invoice.status==='error'?'Error':'Pendiente'}
  async function decorateRow(row){
    const review=row.querySelector('[data-invoice-review]'),id=Number(review?.dataset.invoiceReview);if(!id||row.dataset.v20Ready==='1'||row.dataset.v20Decorating==='1')return;row.dataset.v20Decorating='1';
    try{
      const invoice=await DB.get('invoices',id);if(!invoice)return;row.classList.add('invoice-row-v18');row.dataset.invoiceStatus=invoice.status||'';
      const primary=row.querySelector(':scope > div:first-child'),title=primary?.querySelector(':scope > b'),small=primary?.querySelector(':scope > small');if(title){title.classList.add('invoice-title-v18');title.textContent=invoice.displayName||invoice.originalName||'Factura'}if(small)small.textContent=statusLabel(invoice);
      primary?.querySelector('.invoice-meta-v18')?.remove();primary?.querySelector('.invoice-error-v18')?.remove();
      const lines=Array.isArray(invoice.lines)?invoice.lines:[],linked=lines.filter(line=>line.productId).length,unlinked=lines.length-linked;
      const meta=document.createElement('div');meta.className='invoice-meta-v18';meta.innerHTML=`<span class="invoice-engine-chip ${esc(invoice.engine||invoice.status||'')}">${esc(engineLabel(invoice))}</span><span>${linked}/${lines.length} coincidentes${unlinked?` · ${unlinked} por revisar`:''}</span>${invoice.comparedOrderPdf?'<span>PDF cotejado</span>':''}`;primary?.appendChild(meta);
      const detail=invoice.error||((invoice.warnings||[])[0]||'');if(detail){const warning=document.createElement('div');warning.className=`invoice-error-v18 ${invoice.status==='error'?'danger':'warning'}`;warning.innerHTML=`<b>${invoice.status==='error'?'Motivo del error':'Aviso del cotejo'}</b><span>${esc(truncate(detail))}</span>`;primary?.appendChild(warning)}
      const actions=row.querySelector('.invoice-actions');if(actions){actions.classList.add('invoice-actions-v18');actions.querySelectorAll('button').forEach(button=>button.type='button');const view=actions.querySelector('[data-invoice-view]');if(view)view.textContent='Ver factura';review.textContent='Revisar cotejo';let retry=actions.querySelector('[data-invoice-retry]');if(invoice.status==='error'||invoice.status==='review'){if(!retry){retry=document.createElement('button');retry.type='button';retry.className='btn small';retry.dataset.invoiceRetry=String(invoice.id);actions.insertBefore(retry,actions.querySelector('[data-invoice-delete]'))}retry.textContent='Reprocesar con IA'}else retry?.remove()}
      const summary=row.querySelector('.invoice-item-summary');if(summary&&lines.length){const matched=lines.filter(line=>line.productId),unmatched=lines.filter(line=>!line.productId);summary.innerHTML=`<div class="invoice-summary-v19"><div class="invoice-summary-head"><span>${lines.length} líneas facturadas</span><b>$${Number(invoice.taxTotals?.total||0).toLocaleString('es-CL')}</b></div>${matched.slice(0,8).map(line=>`<div><b>${esc(line.description)}</b><small>${line.packageQty} × ${line.packSize} · ${line.units} un · $${Number(line.grossUnitPrice||0).toLocaleString('es-CL')}/un</small></div>`).join('')}${unmatched.length?`<div class="invoice-summary-warning"><b>${unmatched.length} línea${unmatched.length>1?'s':''} sin coincidencia exacta</b><span>${unmatched.map(line=>esc(line.sourceLine||line.description)).join(' · ')}</span></div>`:''}</div>`}
    }finally{row.dataset.v20Decorating='0';row.dataset.v20Ready='1'}
  }
  function queueDecorate(){if(decorateQueued)return;decorateQueued=true;queueMicrotask(async()=>{decorateQueued=false;for(const row of $$('.invoice-row'))await decorateRow(row)})}
  function applyReviewEnhancements(id){
    setTimeout(async()=>{
      const dialog=$('#invoiceReviewDialog');if(!dialog?.open)return;const invoice=await DB.get('invoices',Number(id));if(!invoice)return;const lines=invoice.lines||[],products=dialog._products||[];
      $$('#invoiceReviewRows [data-review-index]').forEach((element,index)=>{const line=lines[index],select=element.querySelector('[data-review-product]');const suggestion=line?.suggestedProductId&&Number(line.matchScore)>=.52&&!/graduaci[oó]n|volumen.*vs/i.test(line.matchReason||'');if(select&&!select.value&&suggestion&&[...select.options].some(option=>option.value===String(line.suggestedProductId)))select.value=String(line.suggestedProductId);const product=products.find(item=>String(item.productId)===String(select?.value||line?.productId||line?.suggestedProductId));const pack=element.querySelector('[data-review-pack]');if(pack&&product&&normalizeDisplay(product.unit)){const expected=Core.packFromUnit(product.unit,product.description);if(!Number(pack.value)||Number(pack.value)===24||Number(pack.value)===6)pack.value=expected}});
    },160);
  }
  function normalizeDisplay(unit){return String(unit||'').toUpperCase().includes('DISPLAY')}

  function correctDraftUnits(){const output=$('#summaryUnits');if(!output)return;const rows=State.draftRows();output.textContent=Math.round(rows.reduce((sum,row)=>sum+Number(row.orderedQty||0)*Core.packFromUnit(row.unit,row.description),0))}

  function ensureNewOrderDialog(){
    let dialog=$('#newOrderDialogV20');if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='newOrderDialogV20';dialog.className='new-order-dialog';dialog.innerHTML=`<div class="new-order-modal"><div class="new-order-icon">＋</div><div><span class="new-order-kicker">CICLO DE COMPRA</span><h2>Comenzar un nuevo pedido</h2><p id="newOrderMessage">El pedido actual quedará en el historial y la lista se vaciará.</p></div><div class="new-order-summary"><span>Folio actual</span><b id="newOrderFolio">Sin folio emitido</b></div><div class="new-order-actions"><button class="btn" type="button" data-new-order-cancel>Cancelar</button><button class="btn primary" type="button" data-new-order-confirm>Cerrar y comenzar</button></div></div>`;document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-new-order-cancel]'))dialog.close()});
    dialog.querySelector('[data-new-order-confirm]').addEventListener('click',closeAndStartOrder);return dialog;
  }
  function openNewOrder(){const dialog=ensureNewOrderDialog(),folio=State.value.currentOrderFolio,rows=State.draftRows();$('#newOrderFolio').textContent=folio||'Sin folio emitido';$('#newOrderMessage').textContent=folio?`El folio ${folio} se cerrará y seguirá disponible en el historial. La lista actual de ${rows.length} ítems se vaciará.`:`La lista actual de ${rows.length} ítems se vaciará y el próximo pedido recibirá un folio nuevo.`;dialog.showModal()}
  async function closeAndStartOrder(){
    const button=$('#newOrderDialogV20 [data-new-order-confirm]');if(button.disabled)return;button.disabled=true;button.textContent='Preparando…';
    try{
      const folio=State.value.currentOrderFolio;if(folio){const order=await Orders.get(folio);if(order){order.closedAt=new Date().toISOString();order.lifecycle='closed';order.closed=true;await Orders.save(order)}}
      State.value.draft={};State.value.currentOrderFolio=null;State.persist();sessionStorage.setItem('pedidos:new-order-ready','1');location.reload();
    }catch(error){button.disabled=false;button.textContent='Cerrar y comenzar';toast(error.message||'No se pudo iniciar el nuevo pedido')}
  }
  function ensureNewOrderButton(){
    const actions=$('.top-actions'),generate=$('#generateOrder');if(!actions||!generate)return;
    let button=$('#newOrderV20');if(!button){button=document.createElement('button');button.id='newOrderV20';button.type='button';button.className='btn new-order-btn';button.innerHTML='<span>＋</span> Nuevo pedido';button.addEventListener('click',openNewOrder);actions.insertBefore(button,generate)}
    const clear=$('#clearDraft');if(clear)clear.textContent='Vaciar lista';
    const sync=()=>button.classList.toggle('hidden',generate.classList.contains('hidden'));sync();new MutationObserver(sync).observe(generate,{attributes:true,attributeFilter:['class']});
  }

  document.addEventListener('change',event=>{if(event.target?.id!=='invoiceInput')return;event.preventDefault();event.stopImmediatePropagation();const files=[...(event.target.files||[])];event.target.value='';processFiles(files)},true);
  document.addEventListener('click',event=>{const retry=event.target.closest?.('[data-invoice-retry]');if(retry){event.preventDefault();event.stopImmediatePropagation();retryInvoice(retry.dataset.invoiceRetry);return}const review=event.target.closest?.('[data-invoice-review]');if(review)applyReviewEnhancements(review.dataset.invoiceReview)},true);
  document.addEventListener('input',event=>{if(event.target.matches?.('[data-qty]'))setTimeout(correctDraftUnits,0)},true);document.addEventListener('change',event=>{if(event.target.matches?.('[data-unit]'))setTimeout(correctDraftUnits,0)},true);

  const observer=new MutationObserver(()=>{queueDecorate();correctDraftUnits()});
  const start=()=>{
    const reception=$('#receptionContent');if(reception)observer.observe(reception,{childList:true,subtree:true});const orderList=$('#orderList');if(orderList)observer.observe(orderList,{childList:true,subtree:true});
    ensureNewOrderButton();ensureNewOrderDialog();queueDecorate();correctDraftUnits();const marker=$('#buildVersion');if(marker)marker.textContent='v10.0.0';
    if(sessionStorage.getItem('pedidos:new-order-ready')){sessionStorage.removeItem('pedidos:new-order-ready');setTimeout(()=>toast('Nuevo pedido listo · folio anterior cerrado'),500)}
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})(globalThis);
