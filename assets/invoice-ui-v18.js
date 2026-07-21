(function(root){
  'use strict';
  if(root.__PEDIDOS_INVOICE_UI_V19__)return;
  root.__PEDIDOS_INVOICE_UI_V19__=true;

  const State=root.PedidosState,Orders=root.PedidosOrders,DB=root.PedidosDB,Invoice=root.PedidosInvoice,Core=root.PedidosCore,PDF=root.PedidosPDF;
  const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let busy=false,decorateQueued=false,progressToken=0;

  function toast(message){
    const node=$('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._v19Timer);node._v19Timer=setTimeout(()=>node.classList.remove('show'),4600);
  }
  function truncate(value,max=280){const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1)}…`:text}
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
    box.innerHTML=`<div class="progress invoice-progress-v18"><div class="progress-head"><b>${esc(label)}</b><span>${Math.round(safe)}%</span></div><div class="progress-track"><i style="width:${safe}%"></i></div>${detail?`<small>${esc(truncate(detail,200))}</small>`:''}</div>`;
  }
  function clearProgressLater(token,delay=1800){setTimeout(()=>{if(token===progressToken&&$('#invoiceProgress'))$('#invoiceProgress').innerHTML=''},delay)}
  function productContext(order,providerId){
    return(order.rows||[]).filter(row=>row.providerId===providerId).map(row=>({productId:row.productId,description:row.description,unit:row.unit,orderedQty:Number(row.orderedQty)||0}));
  }
  async function buildOrderPdf(order,providerId){
    if(!PDF?.blob)return null;
    const row=(order.rows||[]).find(item=>item.providerId===providerId);
    const entry=State.provider(providerId)||{id:providerId,name:row?.providerName||'Proveedor',logoSize:24};
    const [providerLogo,logo1,logo2]=await Promise.all([
      DB.assetDataUrl(`provider:${providerId}`),DB.assetDataUrl('profile:logo1'),DB.assetDataUrl('profile:logo2')
    ]);
    return PDF.blob({
      order,
      provider:{...entry,id:providerId,name:entry.name||row?.providerName||'Proveedor',logo:providerLogo},
      profile:{...(State.value.profile||{})},
      logos:{logo1,logo2,logo1Size:State.value.profile?.logoSize,logo2Size:State.value.profile?.logo2Size}
    });
  }
  async function clearAppliedData(invoice){
    const prices=(await DB.all('prices')).filter(row=>String(row.invoiceId)===String(invoice.id));
    for(const price of prices)await DB.remove('prices',price.id);
    await Orders.recomputeReception(invoice.folio,invoice.providerId);
  }
  function classifyResult(result){
    const lines=Array.isArray(result?.summary?.lines)?result.summary.lines:[];
    const linked=lines.filter(line=>line.productId).length,unlinked=lines.length-linked;
    return{lines,linked,unlinked,status:lines.length?'review':'error'};
  }
  async function persistResult(invoice,result){
    const classified=classifyResult(result);
    invoice.ocrText=result.text||'';invoice.invoiceNumber=result.summary?.invoiceNumber||'';invoice.taxTotals=result.summary?.totals||{};invoice.lines=classified.lines;
    invoice.engine=result.engine||result.summary?.engine||'unknown';invoice.model=result.model||'';invoice.warnings=result.warnings||[];invoice.fallbackReason=result.fallbackReason||'';invoice.comparedOrderPdf=!!result.comparedOrderPdf;
    invoice.status=classified.status;invoice.error=classified.status==='error'?'No se detectaron líneas de productos en la factura':'';
    invoice.displayName=Core.invoiceDisplayName(invoice.providerName,invoice.invoiceNumber||`SIN-${invoice.id}`,invoice.originalName);
    invoice.analysisSummary={linked:classified.linked,unlinked:classified.unlinked,total:classified.lines.length,engine:invoice.engine,model:invoice.model,comparedOrderPdf:invoice.comparedOrderPdf};
    await Orders.saveInvoice(invoice);
    await Orders.recomputeReception(invoice.folio,invoice.providerId);
    return classified;
  }
  async function analyzeStoredInvoice(invoice,order,providerId){
    const provider=State.provider(providerId)||{name:(order.rows||[]).find(row=>row.providerId===providerId)?.providerName||invoice.providerName||'Proveedor'};
    const token=++progressToken;
    invoice.providerName=provider.name;invoice.status='processing';invoice.error='';invoice.fallbackReason='';invoice.updatedAt=new Date().toISOString();
    await Orders.saveInvoice(invoice);await clearAppliedData(invoice);refreshReception();
    try{
      showProgress('Generando pedido PDF para el cotejo',3);
      const orderFile=await buildOrderPdf(order,providerId);
      const result=await Invoice.analyze(
        invoice.file,
        productContext(order,providerId),
        update=>showProgress(update.label,update.percent,update.detail),
        {providerName:provider.name,folio:order.folio,orderFile,orderFileName:`PEDIDO_${order.folio}_${provider.name}.pdf`}
      );
      const classified=await persistResult(invoice,result);
      const detail=result.engine==='gemini'
        ?`${classified.linked} coincidencias exactas · ${classified.unlinked} líneas no coincidentes · pedido PDF ${result.comparedOrderPdf?'comparado':'no disponible'}`
        :`OCR local: ${classified.lines.length} líneas como borrador, sin aplicar coincidencias automáticas`;
      showProgress(result.engine==='gemini'?'Cotejo terminado · revisa antes de aplicar':'OCR terminado · revisión manual obligatoria',100,detail);
      toast(result.engine==='gemini'
        ?`${invoice.displayName}: ${classified.linked}/${classified.lines.length} líneas cotejadas; confirma el resultado`
        :`${invoice.displayName}: Gemini falló; OCR dejó un borrador sin alterar la recepción`);
    }catch(error){
      const message=String(error.message||error);invoice.status='error';invoice.error=message;invoice.analysisSummary={linked:0,unlinked:0,total:0,engine:'error'};await Orders.saveInvoice(invoice);await Orders.recomputeReception(invoice.folio,invoice.providerId);
      showProgress('No se pudo analizar la factura',100,message);toast(`Error al leer ${invoice.originalName}: ${truncate(message,170)}`);
    }
    refreshReception();clearProgressLater(token,2600);
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
    if(invoice.status==='processing')return'Comparando factura con pedido PDF';
    if(invoice.status==='error')return'Error de lectura';
    if(invoice.status==='review')return'Leída · pendiente de confirmar';
    if(invoice.status==='reviewed')return'Revisada y aplicada';
    return'Pendiente';
  }
  function engineLabel(invoice){
    if(invoice.status==='processing')return'Analizando';
    if(invoice.engine==='gemini')return invoice.model?`Gemini · ${invoice.model}`:'Gemini';
    if(invoice.engine==='ocr')return'OCR borrador';
    return invoice.status==='error'?'Error':'Pendiente';
  }
  async function decorateRow(row){
    const review=row.querySelector('[data-invoice-review]');if(!review)return;
    const id=Number(review.dataset.invoiceReview);if(!id||row.dataset.v19Ready==='1'||row.dataset.v19Decorating==='1')return;
    row.dataset.v19Decorating='1';
    try{
      const invoice=await DB.get('invoices',id);if(!invoice)return;
      row.classList.add('invoice-row-v18');row.dataset.invoiceStatus=invoice.status||'';
      const primary=row.querySelector(':scope > div:first-child');
      const title=primary?.querySelector(':scope > b');if(title){title.classList.add('invoice-title-v18');title.textContent=invoice.displayName||invoice.originalName||'Factura'}
      const small=primary?.querySelector(':scope > small');if(small)small.textContent=statusLabel(invoice);
      primary?.querySelector('.invoice-meta-v18')?.remove();primary?.querySelector('.invoice-error-v18')?.remove();
      const lines=Array.isArray(invoice.lines)?invoice.lines:[],linked=lines.filter(line=>line.productId).length,unlinked=lines.length-linked;
      const meta=document.createElement('div');meta.className='invoice-meta-v18';meta.innerHTML=`<span class="invoice-engine-chip ${esc(invoice.engine||invoice.status||'')}">${esc(engineLabel(invoice))}</span><span>${linked}/${lines.length} coincidentes${unlinked?` · ${unlinked} por revisar`:''}</span>${invoice.comparedOrderPdf?'<span>Pedido PDF cotejado</span>':''}`;primary?.appendChild(meta);
      const detail=invoice.error||invoice.fallbackReason||((invoice.warnings||[])[0]||'');
      if(detail){const error=document.createElement('div');error.className=`invoice-error-v18 ${invoice.status==='error'?'danger':'warning'}`;error.innerHTML=`<b>${invoice.status==='error'?'Motivo del error':invoice.engine==='ocr'?'Gemini no respondió · OCR no aplicado':'Aviso del cotejo'}</b><span>${esc(truncate(detail))}</span>`;primary?.appendChild(error)}
      const actions=row.querySelector('.invoice-actions');if(actions){
        actions.classList.add('invoice-actions-v18');actions.querySelectorAll('button').forEach(button=>button.type='button');
        const view=actions.querySelector('[data-invoice-view]');if(view)view.textContent='Ver factura';
        review.textContent='Revisar cotejo';
        let retry=actions.querySelector('[data-invoice-retry]');
        if(invoice.status==='error'||invoice.status==='review'||invoice.engine==='ocr'||invoice.fallbackReason){
          if(!retry){retry=document.createElement('button');retry.type='button';retry.className='btn small';retry.dataset.invoiceRetry=String(invoice.id);actions.insertBefore(retry,actions.querySelector('[data-invoice-delete]'))}
          retry.textContent='Reprocesar con IA';
        }else retry?.remove();
        const remove=actions.querySelector('[data-invoice-delete]');if(remove){remove.setAttribute('aria-label','Eliminar factura');remove.title='Eliminar factura'}
      }
      const summary=row.querySelector('.invoice-item-summary');
      if(summary&&lines.length){
        const expected=lines.filter(line=>line.productId),unexpected=lines.filter(line=>!line.productId);
        const list=expected.slice(0,6).map(line=>`<div><b>${esc(line.description)}</b><small>${line.packageQty} ${line.packSize>1?'cajas':'unidades'} × ${line.packSize} · ${line.units} un · $${Number(line.grossUnitPrice||0).toLocaleString('es-CL')}/un</small></div>`).join('');
        const warning=unexpected.length?`<div class="invoice-summary-warning"><b>${unexpected.length} línea${unexpected.length>1?'s':''} no coincide${unexpected.length>1?'n':''} con el pedido</b><span>${unexpected.map(line=>esc(line.sourceLine||line.description)).join(' · ')}</span></div>`:'';
        summary.innerHTML=`<div class="invoice-summary-v19"><div class="invoice-summary-head"><span>${lines.length} líneas facturadas</span><b>$${Number(invoice.taxTotals?.total||0).toLocaleString('es-CL')}</b></div>${list}${warning}</div>`;
      }
    }finally{row.dataset.v19Decorating='0';row.dataset.v19Ready='1'}
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
        const safeSuggestion=line?.suggestedProductId&&Number(line.matchScore)>=.5&&!/graduaci[oó]n.*distint/i.test(line.matchReason||'');
        if(select&&!select.value&&safeSuggestion&&[...select.options].some(option=>option.value===String(line.suggestedProductId)))select.value=String(line.suggestedProductId);
        const textarea=element.querySelector('textarea');if(textarea&&line?.matchReason&&!textarea.value.includes('Cotejo IA:'))textarea.value=`${textarea.value}\nCotejo IA: ${line.matchReason}`.trim();
      });
    },140);
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
    const marker=$('#buildVersion');if(marker)marker.textContent='v9.2.0';
  };
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})(globalThis);
