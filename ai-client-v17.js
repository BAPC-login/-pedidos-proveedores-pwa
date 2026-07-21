(function(root){
  'use strict';
  if(root.__PEDIDOS_AI_CLIENT_V17__)return;
  root.__PEDIDOS_AI_CLIENT_V17__=true;

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
  const progress=(callback,label,percent)=>typeof callback==='function'&&callback({label,percent});

  async function fetchWithTimeout(url,options={},timeout=75000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
  }

  async function health(){
    if(!settings().enabled){lastHealth={ok:false,mode:'ocr',message:'IA desactivada; se usará OCR local'};return lastHealth}
    if(!navigator.onLine){lastHealth={ok:false,mode:'ocr',message:'Sin conexión; se usará OCR local'};return lastHealth}
    try{
      const response=await fetchWithTimeout(`${endpoint()}/health`,{headers:{Accept:'application/json'}},8000);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      lastHealth={ok:!!data.ok&&!!data.geminiConfigured,mode:data.geminiConfigured?'gemini':'ocr',model:data.model||'',message:data.geminiConfigured?`Gemini conectado · ${data.model||'modelo activo'}`:'Backend activo, pero falta configurar GEMINI_API_KEY'};
    }catch(error){lastHealth={ok:false,mode:'ocr',message:'Gemini no disponible; OCR local seguirá funcionando',error:String(error.message||error)}}
    return lastHealth;
  }

  function normalizeLine(line,products){
    const product=products.find(item=>String(item.productId)===String(line.productId));
    const packSize=Math.max(1,Number(line.packSize)||1);
    const packageQty=Math.max(0,Number(line.packageQty)||0);
    const units=Math.max(0,Number(line.units)||packageQty*packSize);
    const grossLineTotal=Math.max(0,Math.round(Number(line.grossLineTotal)||0));
    const grossUnitPrice=Math.max(0,Math.round(Number(line.grossUnitPrice)||(units?grossLineTotal/units:0)));
    const orderPack=Core.packFromUnit(product?.unit||'UNIDAD');
    const receivedOrderQty=Number(line.receivedOrderQty)||(orderPack>1?units/orderPack:units);
    return{
      id:line.id||`ai-${crypto.randomUUID?.()||Date.now()}`,
      sourceLine:line.sourceLine||line.descriptionOriginal||'',
      productId:product?.productId||line.productId||'',
      description:product?.description||line.description||line.descriptionOriginal||'',
      packageQty,packSize,units,
      grossPackPrice:Math.max(0,Math.round(Number(line.grossPackPrice)||(packageQty?grossLineTotal/packageQty:grossUnitPrice*packSize))),
      grossUnitPrice,grossLineTotal,
      receivedOrderQty:Number(receivedOrderQty.toFixed(3)),
      confidence:Math.max(0,Math.min(1,Number(line.confidence)||0)),
      sku:line.sku||'',contentMl:Number(line.contentMl)||0,
      engine:'gemini'
    };
  }

  async function analyzeWithGemini(file,products,onProgress){
    if(!settings().enabled)throw new Error('IA desactivada');
    if(!navigator.onLine)throw new Error('Sin conexión');
    progress(onProgress,'Enviando factura al analizador IA',8);
    const form=new FormData();
    form.append('file',file,file.name||'factura');
    form.append('context',JSON.stringify({locale:'es-CL',currency:'CLP',products:(products||[]).map(item=>({productId:item.productId,description:item.description,unit:item.unit,orderedQty:Number(item.orderedQty)||0}))}));
    const response=await fetchWithTimeout(`${endpoint()}/v1/invoices/analyze`,{method:'POST',body:form,headers:{'X-Pedidos-Client':'9.0.0'}},90000);
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw new Error(payload.error||`Gemini respondió HTTP ${response.status}`);
    progress(onProgress,'Validando cantidades, impuestos y precios',88);
    const result=payload.invoice||{};
    const lines=(result.lines||[]).map(line=>normalizeLine(line,products||[])).filter(line=>line.productId&&(line.units>0||line.grossUnitPrice>0));
    progress(onProgress,'Factura procesada con Gemini',100);
    lastHealth={ok:true,mode:'gemini',model:payload.model||'',message:`Gemini conectado · ${payload.model||'modelo activo'}`};
    return{
      text:result.rawText||JSON.stringify(result),
      engine:'gemini',
      model:payload.model||'',
      warnings:result.warnings||[],
      summary:{
        engine:'gemini',
        invoiceNumber:result.invoiceNumber||'',
        totals:{net:Number(result.totals?.net)||0,tax:Number(result.totals?.tax)||0,total:Number(result.totals?.total)||0,taxFactor:Number(result.totals?.taxFactor)||1.19},
        lines
      }
    };
  }

  if(Invoice?.analyze&&!Invoice.analyze.__aiV17){
    const localAnalyze=Invoice.analyze.bind(Invoice);
    const hybrid=async function(file,products,onProgress){
      try{return await analyzeWithGemini(file,products,onProgress)}
      catch(error){
        console.warn('Gemini no disponible; se utilizará OCR local',error);
        progress(onProgress,'Gemini no disponible · usando OCR local',4);
        const result=await localAnalyze(file,products,onProgress);
        result.engine='ocr';result.fallbackReason=String(error.message||error);
        return result;
      }
    };
    hybrid.__aiV17=true;
    Invoice.analyze=hybrid;
  }

  root.PedidosAI={DEFAULT_ENDPOINT,settings,endpoint,health,analyzeWithGemini,get lastHealth(){return lastHealth}};
})(globalThis);
