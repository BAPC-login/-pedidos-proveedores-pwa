(function(root){
  'use strict';
  if(root.__PEDIDOS_AI_CLIENT_V18__)return;
  root.__PEDIDOS_AI_CLIENT_V18__=true;

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

  async function health(probe=false){
    if(!settings().enabled){lastHealth={ok:false,mode:'ocr',message:'IA desactivada; se usará OCR local'};return lastHealth}
    if(!navigator.onLine){lastHealth={ok:false,mode:'ocr',message:'Sin conexión; se usará OCR local'};return lastHealth}
    try{
      const suffix=probe?'&probe=1':'';
      const response=await fetchWithTimeout(`${endpoint()}/health?ts=${Date.now()}${suffix}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}},probe?16000:8000);
      const data=await readPayload(response);
      if(!response.ok)throw new Error(data?.probe?.error||data?.error||`HTTP ${response.status}`);
      const configured=!!data.geminiConfigured,probeOk=!probe||!!data.probe?.ok;
      lastHealth={ok:!!data.ok&&configured&&probeOk,mode:configured&&probeOk?'gemini':'ocr',model:data.model||'',message:configured&&probeOk?`Gemini conectado · ${data.model||'modelo activo'}`:configured?'La clave existe, pero Gemini no respondió a la prueba real':'Backend activo, pero falta configurar GEMINI_API_KEY',probe:data.probe||null};
    }catch(error){lastHealth={ok:false,mode:'ocr',message:`Gemini no disponible: ${String(error.message||error)}`,error:String(error.message||error)}}
    return lastHealth;
  }

  function showToast(message){
    const node=document.querySelector('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._aiTimer);node._aiTimer=setTimeout(()=>node.classList.remove('show'),3600);
  }
  async function testConnection(button=document.querySelector('#testAi')){
    if(!button||button.dataset.busy==='1')return lastHealth;
    const badge=document.querySelector('#aiStatusBadge'),text=document.querySelector('#aiStatusText'),original=button.textContent||'Probar conexión';
    button.dataset.busy='1';button.disabled=true;button.textContent='Probando…';
    if(badge){badge.textContent='Verificando…';badge.classList.remove('online')}
    if(text)text.textContent='Haciendo una solicitud real a Gemini, no solo revisando la clave…';
    try{
      const status=await health(true),time=new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      if(badge){badge.textContent=status.ok?'IA conectada':'Error de Gemini';badge.classList.toggle('online',status.ok)}
      if(text)text.textContent=status.ok?`Prueba real completada · ${status.model||'modelo activo'} · ${time}`:`${status.message} · ${time}`;
      button.textContent=status.ok?'Verificado ✓':'Reintentar';
      showToast(status.ok?'Gemini respondió correctamente':'La prueba real de Gemini falló; revisa el mensaje mostrado');
      return status;
    }catch(error){
      const message=String(error.message||error);if(badge){badge.textContent='Error de conexión';badge.classList.remove('online')}if(text)text.textContent=message;button.textContent='Reintentar';showToast(`Error al probar Gemini: ${message}`);return{ok:false,error:message};
    }finally{button.dataset.busy='0';button.disabled=false;setTimeout(()=>{if(button.dataset.busy!=='1')button.textContent=original},2200)}
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#testAi');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();testConnection(button);
  },true);

  function normalizeLine(line,products){
    const product=products.find(item=>String(item.productId)===String(line.productId));
    const suggested=products.find(item=>String(item.productId)===String(line.suggestedProductId));
    const packSize=Math.max(1,Number(line.packSize)||1),packageQty=Math.max(0,Number(line.packageQty)||0),units=Math.max(0,Number(line.units)||packageQty*packSize);
    const grossLineTotal=Math.max(0,Math.round(Number(line.grossLineTotal)||0)),grossUnitPrice=Math.max(0,Math.round(Number(line.grossUnitPrice)||(units?grossLineTotal/units:0)));
    const orderPack=Core.packFromUnit(product?.unit||'UNIDAD'),receivedOrderQty=Number(line.receivedOrderQty)||(product?(orderPack>1?units/orderPack:units):0);
    return{
      id:line.id||`ai-${crypto.randomUUID?.()||Date.now()}`,sourceLine:line.sourceLine||line.descriptionOriginal||'',descriptionOriginal:line.descriptionOriginal||line.sourceLine||'',
      productId:product?.productId||'',suggestedProductId:suggested?.productId||'',description:product?.description||line.description||line.descriptionOriginal||'',
      packageQty,packSize,units,grossPackPrice:Math.max(0,Math.round(Number(line.grossPackPrice)||(packageQty?grossLineTotal/packageQty:grossUnitPrice*packSize))),
      grossUnitPrice,grossLineTotal,receivedOrderQty:Number(receivedOrderQty.toFixed(3)),confidence:Math.max(0,Math.min(1,Number(line.confidence)||0)),
      matchMethod:line.matchMethod||'',matchScore:Number(line.matchScore)||0,sku:line.sku||'',contentMl:Number(line.contentMl)||0,engine:'gemini'
    };
  }

  async function analyzeWithGemini(file,products,onProgress,context={}){
    if(!settings().enabled)throw new Error('IA desactivada');
    if(!navigator.onLine)throw new Error('Sin conexión');
    progress(onProgress,'Preparando factura para Gemini',6);
    const form=new FormData();
    form.append('file',file,file.name||'factura');
    form.append('context',JSON.stringify({locale:'es-CL',currency:'CLP',providerName:context.providerName||'',products:(products||[]).map(item=>({productId:item.productId,description:item.description,unit:item.unit,orderedQty:Number(item.orderedQty)||0}))}));
    let estimated=10;
    const timer=setInterval(()=>{estimated=Math.min(72,estimated+4);progress(onProgress,estimated<34?'Enviando factura al analizador IA':'Gemini está leyendo y cotejando la factura',estimated)},1700);
    try{
      const response=await fetchWithTimeout(`${endpoint()}/v1/invoices/analyze`,{method:'POST',body:form,headers:{'X-Pedidos-Client':'9.1.0'}},105000);
      const payload=await readPayload(response);
      if(!response.ok||!payload.ok){
        const attempts=Array.isArray(payload.attempts)?payload.attempts.map(item=>`${item.model}: ${item.error}`).join(' | '):'';
        throw new Error(payload.error||attempts||`Gemini respondió HTTP ${response.status}`);
      }
      progress(onProgress,'Validando cantidades, impuestos y precios',88);
      const result=payload.invoice||{};
      const lines=(result.lines||[]).map(line=>normalizeLine(line,products||[])).filter(line=>line.sourceLine||line.productId||line.units>0||line.grossLineTotal>0);
      if(!lines.length)throw new Error('Gemini no detectó líneas de productos en la factura');
      progress(onProgress,'Factura procesada con Gemini',100);
      lastHealth={ok:true,mode:'gemini',model:payload.model||'',message:`Gemini conectado · ${payload.model||'modelo activo'}`};
      return{text:result.rawText||JSON.stringify(result),engine:'gemini',model:payload.model||'',warnings:result.warnings||[],summary:{engine:'gemini',invoiceNumber:result.invoiceNumber||'',totals:{net:Number(result.totals?.net)||0,tax:Number(result.totals?.tax)||0,total:Number(result.totals?.total)||0,taxFactor:Number(result.totals?.taxFactor)||1.19},lines}};
    }finally{clearInterval(timer)}
  }

  if(Invoice?.analyze&&!Invoice.analyze.__aiV18){
    const localAnalyze=Invoice.analyze.bind(Invoice);
    const hybrid=async function(file,products,onProgress,context={}){
      try{return await analyzeWithGemini(file,products,onProgress,context)}
      catch(error){
        const reason=String(error.message||error);console.warn('Gemini no disponible; se utilizará OCR local',error);
        progress(onProgress,'Gemini falló · iniciando OCR local',26,reason);
        try{
          const result=await localAnalyze(file,products,update=>progress(onProgress,update.label,Math.max(28,Math.min(99,28+(Number(update.percent)||0)*.7))),context);
          result.engine='ocr';result.fallbackReason=reason;result.warnings=[...(result.warnings||[]),`Gemini no respondió: ${reason}`];
          progress(onProgress,'OCR local terminado · revisa las coincidencias',100);
          return result;
        }catch(localError){throw new Error(`Gemini: ${reason}. OCR local: ${String(localError.message||localError)}`)}
      }
    };
    hybrid.__aiV18=true;Invoice.analyze=hybrid;
  }

  function loadV18Enhancements(){
    if(!document.querySelector('link[data-pedidos-v18]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='./assets/patch-v18.css?v=18';link.dataset.pedidosV18='1';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-pedidos-v18]')){
      const script=document.createElement('script');script.src='./assets/invoice-ui-v18.js?v=18';script.defer=true;script.dataset.pedidosV18='1';document.head.appendChild(script);
    }
  }

  root.PedidosAI={DEFAULT_ENDPOINT,settings,endpoint,health,testConnection,analyzeWithGemini,get lastHealth(){return lastHealth}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',loadV18Enhancements,{once:true}):loadV18Enhancements();
})(globalThis);
