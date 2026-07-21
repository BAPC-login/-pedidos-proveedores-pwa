(function(root){
  'use strict';
  if(root.__PEDIDOS_AI_CLIENT_V19__)return;
  root.__PEDIDOS_AI_CLIENT_V19__=true;

  const DEFAULT_ENDPOINT='https://pedidos-pro-ai.botreservasmultilocal.workers.dev';
  const Invoice=root.PedidosInvoice;
  const Core=root.PedidosCore;
  let lastHealth={ok:false,mode:'ocr',message:'OCR local disponible'};

  const settings=()=>{
    const state=root.PedidosState?.value;
    state.settings=state.settings||{};
    state.settings.ai=state.settings.ai||{enabled:true,endpoint:DEFAULT_ENDPOINT};
    return state.settings.ai;
  };
  const endpoint=()=>String(settings().endpoint||DEFAULT_ENDPOINT).replace(/\/$/,'');
  const progress=(callback,label,percent,detail='')=>typeof callback==='function'&&callback({label,percent,detail});

  async function fetchWithTimeout(url,options={},timeout=75000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
  }
  async function readPayload(response){
    const text=await response.text();
    if(!text)return{};
    try{return JSON.parse(text)}catch{return{error:text.slice(0,500)}}
  }
  function networkMessage(error){
    const message=String(error?.message||error||'');
    if(/Load failed|Failed to fetch|FetchEvent\.respondWith|NetworkError|abort/i.test(message))return'No se pudo conectar con el Worker de Gemini. La app mantendrá la factura pendiente, sin aplicar cantidades ni precios incorrectos.';
    return message;
  }

  async function health(probe=false){
    if(!settings().enabled){lastHealth={ok:false,mode:'ocr',message:'IA desactivada; se usará revisión manual'};return lastHealth}
    if(!navigator.onLine){lastHealth={ok:false,mode:'ocr',message:'Sin conexión; la factura quedará pendiente de revisión'};return lastHealth}
    try{
      const suffix=probe?'&probe=1':'';
      const response=await fetchWithTimeout(`${endpoint()}/health?ts=${Date.now()}${suffix}`,{cache:'no-store',headers:{Accept:'application/json'}},probe?16000:8000);
      const data=await readPayload(response);
      if(!response.ok)throw new Error(data?.probe?.error||data?.error||`HTTP ${response.status}`);
      const configured=!!data.geminiConfigured,probeOk=!probe||!!data.probe?.ok;
      lastHealth={ok:!!data.ok&&configured&&probeOk,mode:configured&&probeOk?'gemini':'manual',model:data.model||'',message:configured&&probeOk?`Gemini conectado · ${data.model||'modelo activo'}`:configured?'La clave existe, pero Gemini no respondió a la prueba real':'Backend activo, pero falta configurar GEMINI_API_KEY',probe:data.probe||null};
    }catch(error){const message=networkMessage(error);lastHealth={ok:false,mode:'manual',message,error:String(error?.message||error)}}
    return lastHealth;
  }

  function showToast(message){
    const node=document.querySelector('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._aiTimer);node._aiTimer=setTimeout(()=>node.classList.remove('show'),4200);
  }
  async function testConnection(button=document.querySelector('#testAi')){
    if(!button||button.dataset.busy==='1')return lastHealth;
    const badge=document.querySelector('#aiStatusBadge'),text=document.querySelector('#aiStatusText'),original=button.textContent||'Probar conexión';
    button.dataset.busy='1';button.disabled=true;button.textContent='Probando…';
    if(badge){badge.textContent='Verificando…';badge.classList.remove('online')}
    if(text)text.textContent='Haciendo una solicitud real a Gemini…';
    try{
      const status=await health(true),time=new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(badge){badge.textContent=status.ok?'IA conectada':'Error de Gemini';badge.classList.toggle('online',status.ok)}
      if(text)text.textContent=status.ok?`Prueba real completada · ${status.model||'modelo activo'} · ${time}`:`${status.message} · ${time}`;
      button.textContent=status.ok?'Verificado ✓':'Reintentar';
      showToast(status.ok?'Gemini respondió correctamente':'La prueba real de Gemini falló; revisa el mensaje mostrado');
      return status;
    }catch(error){
      const message=networkMessage(error);if(badge){badge.textContent='Error de conexión';badge.classList.remove('online')}if(text)text.textContent=message;button.textContent='Reintentar';showToast(message);return{ok:false,error:message};
    }finally{button.dataset.busy='0';button.disabled=false;setTimeout(()=>{if(button.dataset.busy!=='1')button.textContent=original},2200)}
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#testAi');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();testConnection(button);
  },true);

  function normalizeLine(line,products){
    const product=products.find(item=>String(item.productId)===String(line.productId));
    const suggested=products.find(item=>String(item.productId)===String(line.suggestedProductId));
    const packSize=Math.max(1,Number(line.packSize)||1),packageQty=Math.max(0,Number(line.packageQty??line.invoiceQuantity)||0),units=Math.max(0,Number(line.units)||packageQty*packSize);
    const grossLineTotal=Math.max(0,Math.round(Number(line.grossLineTotal)||0)),grossUnitPrice=Math.max(0,Math.round(Number(line.grossUnitPrice)||(units?grossLineTotal/units:0)));
    const orderPack=Core.packFromUnit(product?.unit||'UNIDAD'),receivedOrderQty=Number(line.receivedOrderQty)||(product?(orderPack>1?units/orderPack:units):0);
    return{
      id:line.id||`ai-${crypto.randomUUID?.()||Date.now()}`,
      code:line.code||'',sourceLine:line.sourceLine||line.descriptionOriginal||'',descriptionOriginal:line.descriptionOriginal||line.sourceLine||'',quantityCellRaw:line.quantityCellRaw||'',
      invoiceQuantity:packageQty,productId:product?.productId||'',suggestedProductId:suggested?.productId||'',description:product?.description||line.description||line.descriptionOriginal||'',
      packageQty,packSize,units,contentMl:Number(line.contentMl)||0,alcoholDegree:Number(line.alcoholDegree)||0,
      unitPriceNet:Number(line.unitPriceNet)||0,discountPct:Number(line.discountPct)||0,netLineTotal:Number(line.netLineTotal)||0,freightLine:Number(line.freightLine)||0,vatLine:Number(line.vatLine)||0,additionalTaxLine:Number(line.additionalTaxLine)||0,otherLineCharges:Number(line.otherLineCharges)||0,
      grossPackPrice:Math.max(0,Math.round(Number(line.grossPackPrice)||(packageQty?grossLineTotal/packageQty:grossUnitPrice*packSize))),grossUnitPrice,grossLineTotal,
      receivedOrderQty:Number(receivedOrderQty.toFixed(3)),confidence:Math.max(0,Math.min(1,Number(line.confidence)||0)),matchMethod:line.matchMethod||'',matchScore:Number(line.matchScore)||0,matchReason:line.matchReason||'',notes:line.notes||'',engine:'gemini'
    };
  }

  async function analyzeWithGemini(file,products,onProgress,context={}){
    if(!settings().enabled)throw new Error('IA desactivada');
    if(!navigator.onLine)throw new Error('Sin conexión');
    progress(onProgress,'Preparando factura y pedido PDF',5);
    const form=new FormData();
    form.append('file',file,file.name||'factura');
    if(context.orderFile instanceof Blob)form.append('orderFile',context.orderFile,context.orderFileName||`PEDIDO_${context.folio||'ACTUAL'}.pdf`);
    form.append('context',JSON.stringify({
      locale:'es-CL',currency:'CLP',providerName:context.providerName||'',folio:context.folio||'',
      products:(products||[]).map(item=>({productId:item.productId,description:item.description,unit:item.unit,orderedQty:Number(item.orderedQty)||0}))
    }));
    let estimated=9;
    const timer=setInterval(()=>{estimated=Math.min(76,estimated+4);progress(onProgress,estimated<30?'Enviando factura y pedido PDF':'Gemini compara ambos documentos línea por línea',estimated)},1700);
    try{
      const response=await fetchWithTimeout(`${endpoint()}/v1/invoices/analyze`,{method:'POST',body:form,headers:{'X-Pedidos-Client':'9.2.0'}},120000);
      const payload=await readPayload(response);
      if(!response.ok||!payload.ok){
        const attempts=Array.isArray(payload.attempts)?payload.attempts.map(item=>`${item.model}: ${item.error}`).join(' | '):'';
        throw new Error(payload.error||attempts||`Gemini respondió HTTP ${response.status}`);
      }
      progress(onProgress,'Validando cantidades, formatos e impuestos',88);
      const result=payload.invoice||{};
      const lines=(result.lines||[]).map(line=>normalizeLine(line,products||[])).filter(line=>line.sourceLine||line.productId||line.units>0||line.grossLineTotal>0);
      if(!lines.length)throw new Error('Gemini no detectó líneas de productos en la factura');
      progress(onProgress,payload.comparedOrderPdf?'Factura cotejada contra el pedido PDF':'Factura leída sin PDF de pedido',100);
      lastHealth={ok:true,mode:'gemini',model:payload.model||'',message:`Gemini conectado · ${payload.model||'modelo activo'}`};
      return{
        text:result.rawText||JSON.stringify(result),engine:'gemini',model:payload.model||'',warnings:result.warnings||[],comparedOrderPdf:!!payload.comparedOrderPdf,matchSummary:result.matchSummary||{},
        summary:{engine:'gemini',invoiceNumber:result.invoiceNumber||'',totals:{net:Number(result.totals?.net)||0,tax:(Number(result.totals?.vat)||0)+(Number(result.totals?.additionalTax)||0),freight:Number(result.totals?.freight)||0,additionalTax:Number(result.totals?.additionalTax)||0,vat:Number(result.totals?.vat)||0,total:Number(result.totals?.total)||0,taxFactor:Number(result.totals?.taxFactor)||1.19},lines}
      };
    }finally{clearInterval(timer)}
  }

  if(Invoice?.analyze&&!Invoice.analyze.__aiV19){
    const localAnalyze=Invoice.analyze.bind(Invoice);
    const hybrid=async function(file,products,onProgress,context={}){
      try{return await analyzeWithGemini(file,products,onProgress,context)}
      catch(error){
        const reason=networkMessage(error);console.warn('Gemini no disponible; OCR solo como borrador',error);
        progress(onProgress,'Gemini falló · OCR local solo como borrador',28,reason);
        try{
          const result=await localAnalyze(file,products,update=>progress(onProgress,update.label,Math.max(30,Math.min(96,30+(Number(update.percent)||0)*.65))),context);
          result.engine='ocr';result.fallbackReason=reason;result.warnings=[...(result.warnings||[]),`Gemini no respondió: ${reason}`];
          if(result.summary?.lines)result.summary.lines=result.summary.lines.map(line=>({...line,productId:'',suggestedProductId:line.productId||'',receivedOrderQty:0,confidence:Math.min(.35,Number(line.confidence)||0),engine:'ocr'}));
          progress(onProgress,'OCR terminado · no se aplicaron coincidencias automáticas',100);
          return result;
        }catch(localError){throw new Error(`Gemini: ${reason}. OCR local: ${String(localError.message||localError)}`)}
      }
    };
    hybrid.__aiV19=true;Invoice.analyze=hybrid;
  }

  function loadEnhancements(){
    if(!document.querySelector('link[data-pedidos-v19]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='./assets/patch-v18.css?v=19';link.dataset.pedidosV19='1';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-pedidos-v19]')){
      const script=document.createElement('script');script.src='./assets/invoice-ui-v18.js?v=19';script.defer=true;script.dataset.pedidosV19='1';document.head.appendChild(script);
    }
  }

  root.PedidosAI={DEFAULT_ENDPOINT,settings,endpoint,health,testConnection,analyzeWithGemini,get lastHealth(){return lastHealth}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',loadEnhancements,{once:true}):loadEnhancements();
})(globalThis);
