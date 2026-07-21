(function(root){
  'use strict';
  if(root.__PEDIDOS_INVOICE_UI_V18__)return;
  root.__PEDIDOS_INVOICE_UI_V18__=true;

  const State=root.PedidosState,Orders=root.PedidosOrders,DB=root.PedidosDB,Invoice=root.PedidosInvoice,Core=root.PedidosCore;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let busy=false,decorateQueued=false,progressToken=0;

  function toast(message){
    const node=$('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._v18Timer);node._v18Timer=setTimeout(()=>node.classList.remove('show'),4200);
  }
  function truncate(value,max=260){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text}
  function activeContext(){
    const rootNode=$('#receptionContent');if(!rootNode)return null;
    const active=rootNode.querySelector('[data-reception-provider].active')||rootNode.querySelector('[data-reception-provider]');
    const folio=rootNode.querySelector(':scope > .card h3')?.textContent?.trim()||'';
    const providerId=active?.dataset.receptionProvider||'';
    return folio&&providerId?{folio,providerId,active}:null;
  }
  function refreshReception(){
    const current=$('#receptionContent [data-reception-provider].active')||$('#receptionContent [data-reception-provider]');
    if(current){current.click();return}
    document.querySelector('[data-management-tab="reception"]')?.click();
  }
  function showProgress(label,percent,detail=''){
    const box=$('#invoiceProgress');if(!box)return;
    const safe=Math.max(0,Math.min(100,Number(percent)||0));
    box.innerHTML=`<div class="progress invoice-progress-v18"><div class="progress-head"><b>${esc(label)}</b><span>${Math.round(safe)}%</span></div><div class="progress-track"><i style="width:${safe}%"></i></div>${detail?`<small>${esc(truncate(detail,180))}</small>`:''}</div>`;
  }
  function clearProgressLater(token,delay=1400){setTimeout(()=>{if(token===progressToken&&$('#invoiceProgress'))$('#invoiceProgress').innerHTML=''},delay)}
  function productContext(order,providerId){
    return(order.rows||[]).filter(row=>row.providerId===providerId).map(row=>({productId:row.productId,description:row.description,unit:row.unit,orderedQty:Number(row.orderedQty)||0}));
  }
  function classifyResult(result){
    const lines=Array.isArray(result?.summary?.lines)?result.summary.lines:[];
    const linked=lines.filter(line=>line.productId).length,unlinked=lines.length-linked;
    return{lines,linked,unlinked,status:!lines.length?'error':unlinked?'review':'read'};
  }
  async function persistResult(invoice,result){
    const classified=classifyResult(result);
    invoice.ocrText=result.text||'';invoice.invoiceNumber=result.summary?.invoiceNumber||'';invoice.taxTotals=result.summary?.totals||{};invoice.lines=classified.lines;
    invoice.engine=result.engine||result.summary?.engine||'unknown';invoice.model=result.model||'';invoice.warnings=result.warnings||[];invoice.fallbackReason=result.fallbackReason||'';
    invoice.status=classified.status;invoice.error=classified.status==='error'?'No se detectaron líneas de productos en la factura':'';
    invoice.displayName=Core.invoiceDisplayName(invoice.providerName,invoice.invoiceNumber||`SIN-${invoice.id}`,invoice.originalName);
    invoice.analysisSummary={linked:classified.linked,unlinked:classified.unlinked,total:classified.lines.length,engine:invoice.engine,model:invoice.model};
    await Orders.saveInvoice(invoice);
    return classified;
  }
  async function analyzeStoredInvoice(invoice,order,providerId){
    const provider=State.provider(providerId)||{name:(order.rows||[]).find(row=>row.providerId===providerId)?.providerName||invoice.providerName||'Proveedor'};
    const token=++progressToken;
    invoice.providerName=provider.name;invoice.status='processing';invoice.error='';invoice.fallbackReason='';invoice.updatedAt=new Date().toISOString();
    await Orders.saveInvoice(invoice);refreshReception();
    try{
      const result=await Invoice.analyze(invoice.file,productContext(order,providerId),update=>showProgress(update.label,update.percent,update.detail),{providerName:provider.name,folio:order.folio});
      const classified=await persistResult(invoice,result);
      showProgress(classified.unlinked?'Factura leída · faltan productos por confirmar':'Factura cotejada correctamente',100,classified.unlinked?`${classified.linked} coincidencias y ${classified.unlinked} líneas por revisar`:`${classified.linked} productos vinculados`);
      if(classified.status==='read')toast(`${invoice.displayName}: ${classified.linked} productos cotejados automáticamente`);
      else if(classified.status==='review')toast(`${invoice.displayName}: lectura terminada; revisa ${classified.unlinked} líneas sin vincular`);
      else toast(`${invoice.displayName}: no se detectaron líneas; revisa la imagen o registra manualmente`);
    }catch(error){
      const message=String(error.message||error);invoice.status='error';invoice.error=message;invoice.analysisSummary={linked:0,unlinked:0,total:0,engine:'error'};await Orders.saveInvoice(invoice);
      showProgress('No se pudo analizar la factura',100,message);toast(`Error al leer ${invoice.originalName}: ${truncate(message,150)}`);
    }
    refreshReception();clearProgressLater(token,2200);
  }
  async function processFiles(files){
    if(busy||!files.length)return;
    const context=activeContext();if(!context)return toast('No se pudo identificar el pedido o proveedor activo');
    const order=await Orders.get(context.folio);if(!order)return toast('Pedido no encontrado');
    busy=true;
    try{
      for(const file of files){
        const provider=State.provider(context.providerId)||{name:(order.rows||[]).find(row=>row.providerId===context.providerId)?.providerName||'Proveedor'};
        const invoice={folio:order.folio,providerId:context.providerId,providerName:provider.name,originalName:file.name,file,createdAt:new Date().toISOString(),status:'processing',lines:[],engine:'pending'};
        await Orders.saveInvoice(invoice);
        await analyzeStoredInvoice(invoice,order,context.providerId);
      }
    }finally{busy=false}
  }
  async function retryInvoice(id){
    if(busy)return;
    const invoice=await DB.get('invoices',Number(id));if(!invoice)return toast('Factura no encontrada');
    if(!invoice.file)return toast('El archivo original ya no está disponible para reintentar');
    const order=await Orders.get(invoice.folio);if(!order)return toast('Pedido no encontrado');
    busy=true;try{await analyzeStoredInvoice(invoice,order,invoice.providerId)}finally{busy=false}
  }
  function statusLabel(invoice){
    if(invoice.status==='processing')return'Procesando con IA';
    if(invoice.status==='error')return'Error de lectura';
    if(invoice.status==='review')return'Requiere revisión';
    if(invoice.status==='reviewed')return'Revisada y aplicada';
    if(invoice.engine==='ocr')return'Leída con OCR local';
    return'Leída con Gemini';
  }
  function engineLabel(invoice){
    if(invoice.status==='processing')return'Analizando';
    if(invoice.engine==='gemini')return invoice.model?`Gemini · ${invoice.model}`:'Gemini';
    if(invoice.engine==='ocr')return'OCR local';
    return invoice.status==='error'?'Error':'Pendiente';
  }
  async function decorateRow(row){
    const review=row.querySelector('[data-invoice-review]');if(!review)return;
    const id=Number(review.dataset.invoiceReview);if(!id||row.dataset.v18Decorating==='1')return;
    row.dataset.v18Decorating='1';
    try{
      const invoice=await DB.get('invoices',id);if(!invoice)return;
      row.classList.add('invoice-row-v18');row.dataset.invoiceStatus=invoice.status||'';
      const primary=row.querySelector(':scope > div:first-child');
      const title=primary?.querySelector(':scope > b');if(title){title.classList.add('invoice-title-v18');title.textContent=invoice.displayName||invoice.originalName||'Factura'}
      const small=primary?.querySelector(':scope > small');if(small)small.textContent=statusLabel(invoice);
      primary?.querySelector('.invoice-meta-v18')?.remove();primary?.querySelector('.invoice-error-v18')?.remove();
      const lines=Array.isArray(invoice.lines)?invoice.lines:[],linked=lines.filter(line=>line.productId).length,unlinked=lines.length-linked;
      const meta=document.createElement('div');meta.className='invoice-meta-v18';meta.innerHTML=`<span class="invoice-engine-chip ${esc(invoice.engine||invoice.status||'')}">${esc(engineLabel(invoice))}</span><span>${linked} vinculados${unlinked?` · ${unlinked} por revisar`:''}</span>`;primary?.appendChild(meta);
      const detail=invoice.error||invoice.fallbackReason||((invoice.warnings||[])[0]||'');
      if(detail){const error=document.createElement('div');error.className=`invoice-error-v18 ${invoice.status==='error'?'danger':'warning'}`;error.innerHTML=`<b>${invoice.status==='error'?'Motivo del error':'Aviso del analizador'}</b><span>${esc(truncate(detail))}</span>`;primary?.appendChild(error)}
      const actions=row.querySelector('.invoice-actions');if(actions){
        actions.classList.add('invoice-actions-v18');actions.querySelectorAll('button').forEach(button=>button.type='button');
        const view=actions.querySelector('[data-invoice-view]');if(view)view.textContent='Ver factura';
        review.textContent='Revisar productos';
        let retry=actions.querySelector('[data-invoice-retry]');
        if(invoice.status==='error'||invoice.status==='review'||invoice.fallbackReason){
          if(!retry){retry=document.createElement('button');retry.type='button';retry.className='btn small';retry.dataset.invoiceRetry=String(invoice.id);actions.insertBefore(retry,actions.querySelector('[data-invoice-delete]'))}
          retry.textContent='Reintentar IA';
        }else retry?.remove();
        const remove=actions.querySelector('[data-invoice-delete]');if(remove){remove.setAttribute('aria-label','Eliminar factura');remove.title='Eliminar factura'}
      }
      const summary=row.querySelector('.invoice-item-summary');
      if(summary&&lines.length&&!linked){summary.innerHTML=`<div class="invoice-summary-warning"><b>${lines.length} líneas extraídas</b><span>La factura sí fue leída. Abre “Revisar productos” para confirmar a qué ítem corresponde cada línea.</span></div>`}
    }finally{row.dataset.v18Decorating='0';row.dataset.v18Ready='1'}
  }
  function queueDecorate(){
    if(decorateQueued)return;decorateQueued=true;
    queueMicrotask(async()=>{decorateQueued=false;for(const row of $$('.invoice-row'))await decorateRow(row)})
  }
  function applySuggestedSelections(id){
    setTimeout(async()=>{
      const dialog=$('#invoiceReviewDialog');if(!dialog?.open)return;
      const invoice=await DB.get('invoices',Number(id));if(!invoice)return;
      const lines=invoice.lines||[];
      $$('#invoiceReviewRows [data-review-index]').forEach((element,index)=>{
        const line=lines[index],select=element.querySelector('[data-review-product]');
        if(select&&!select.value&&line?.suggestedProductId&&[...select.options].some(option=>option.value===String(line.suggestedProductId)))select.value=String(line.suggestedProductId);
      });
    },120);
  }

  document.addEventListener('change',event=>{
    if(event.target?.id!=='invoiceInput')return;
    event.preventDefault();event.stopImmediatePropagation();
    const files=[...(event.target.files||[])];event.target.value='';processFiles(files);
  },true);
  document.addEventListener('click',event=>{
    const retry=event.target.closest?.('[data-invoice-retry]');if(retry){event.preventDefault();event.stopImmediatePropagation();retryInvoice(retry.dataset.invoiceRetry);return}
    const review=event.target.closest?.('[data-invoice-review]');if(review)applySuggestedSelections(review.dataset.invoiceReview);
  },true);

  const observer=new MutationObserver(queueDecorate);
  const start=()=>{
    const reception=$('#receptionContent');if(reception)observer.observe(reception,{childList:true,subtree:true});
    queueDecorate();
    const marker=$('#buildVersion');if(marker)marker.textContent='v9.1.0';
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})(globalThis);
