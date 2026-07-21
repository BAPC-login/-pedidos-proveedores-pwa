(function(root){
  'use strict';
  if(root.__PEDIDOS_AI_CLIENT_V20__)return;
  root.__PEDIDOS_AI_CLIENT_V20__=true;

  const DEFAULT_ENDPOINT='https://pedidos-pro-ai.botreservasmultilocal.workers.dev';
  const Invoice=root.PedidosInvoice;
  const Core=root.PedidosCore;
  let lastHealth={ok:false,mode:'manual',message:'Gemini pendiente de verificar'};

  function normalized(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
  function isOnePointFive(description=''){
    const text=normalized(description);
    return /(?:^|\s)1[.,]5\s*(?:L|LT|LTS|LITRO)|1500\s*(?:ML|CC)/.test(text);
  }
  const originalPackFromUnit=Core.packFromUnit.bind(Core);
  Core.packFromUnit=function(unit,description=''){
    const label=normalized(unit);
    if(label.includes('DISPLAY'))return isOnePointFive(description)?6:24;
    return originalPackFromUnit(unit);
  };
  Core.packFromProduct=product=>Core.packFromUnit(product?.unit,product?.description);

  const settings=()=>{
    const state=root.PedidosState?.value;
    state.settings=state.settings||{};
    state.settings.ai=state.settings.ai||{enabled:true,endpoint:DEFAULT_ENDPOINT};
    return state.settings.ai;
  };
  const endpoint=()=>String(settings().endpoint||DEFAULT_ENDPOINT).replace(/\/$/,'');
  const progress=(callback,label,percent,detail='',phase='reading')=>typeof callback==='function'&&callback({label,percent,detail,phase});

  async function fetchWithTimeout(url,options={},timeout=115000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new DOMException('Tiempo máximo agotado','TimeoutError')),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
  }
  async function readPayload(response){
    const text=await response.text();if(!text)return{};
    try{return JSON.parse(text)}catch{return{error:text.slice(0,600)}}
  }
  function friendlyError(error){
    const message=String(error?.message||error||'');
    if(/Timeout|aborted|abort/i.test(message))return'La lectura superó el tiempo máximo. La factura quedó guardada y puedes reprocesarla sin volver a subirla.';
    if(/Load failed|Failed to fetch|FetchEvent\.respondWith|NetworkError/i.test(message))return'Se perdió la conexión con el analizador. La factura quedó guardada para reprocesarla.';
    return message;
  }

  async function health(probe=false){
    if(!settings().enabled)return{ok:false,mode:'manual',message:'Gemini está desactivado'};
    if(!navigator.onLine)return{ok:false,mode:'manual',message:'Sin conexión'};
    try{
      const response=await fetchWithTimeout(`${endpoint()}/health?ts=${Date.now()}${probe?'&probe=1':''}`,{cache:'no-store',headers:{Accept:'application/json'}},probe?18000:9000);
      const data=await readPayload(response);
      if(!response.ok)throw new Error(data?.probe?.error||data?.error||`HTTP ${response.status}`);
      const ready=!!data.geminiConfigured&&(!probe||!!data.probe?.ok);
      lastHealth={ok:!!data.ok&&ready,mode:ready?'gemini':'manual',model:data.model||'',message:ready?`Gemini conectado · ${data.model||'modelo activo'}`:'Gemini no respondió a la prueba real'};
    }catch(error){lastHealth={ok:false,mode:'manual',message:friendlyError(error),error:String(error?.message||error)}}
    return lastHealth;
  }

  function toast(message){
    const node=document.querySelector('#toast');if(!node)return;
    node.textContent=message;node.classList.add('show');clearTimeout(node._aiTimer);node._aiTimer=setTimeout(()=>node.classList.remove('show'),4200);
  }
  async function testConnection(button=document.querySelector('#testAi')){
    if(!button||button.dataset.busy==='1')return lastHealth;
    const badge=document.querySelector('#aiStatusBadge'),text=document.querySelector('#aiStatusText'),original=button.textContent||'Probar conexión';
    button.dataset.busy='1';button.disabled=true;button.textContent='Probando…';
    if(badge){badge.textContent='Verificando…';badge.classList.remove('online')}
    if(text)text.textContent='Realizando una solicitud directa a Gemini…';
    const status=await health(true),time=new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(badge){badge.textContent=status.ok?'IA conectada':'Error de Gemini';badge.classList.toggle('online',status.ok)}
    if(text)text.textContent=`${status.message} · ${time}`;
    button.textContent=status.ok?'Verificado ✓':'Reintentar';button.disabled=false;button.dataset.busy='0';
    toast(status.ok?'Gemini respondió correctamente':status.message);
    setTimeout(()=>{if(button.dataset.busy!=='1')button.textContent=original},2200);
    return status;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#testAi');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();testConnection(button);
  },true);

  async function compressImage(file,onProgress){
    if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)||file.size<1700000)return file;
    progress(onProgress,'Optimizando imagen para una lectura más rápida',7,'Se conserva la nitidez del texto y se reduce el peso del archivo.','preparing');
    try{
      const bitmap=await createImageBitmap(file);
      const maxEdge=3000,scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(!blob||blob.size>=file.size)return file;
      return new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg',lastModified:file.lastModified});
    }catch(error){console.warn('No se pudo optimizar la imagen; se enviará el original',error);return file}
  }

  function startProgressClock(onProgress,attempt=1){
    const started=Date.now();
    const timer=setInterval(()=>{
      const seconds=(Date.now()-started)/1000;
      let percent,label,detail;
      if(seconds<8){percent=12+seconds*2.4;label='Enviando los documentos';detail='Factura y pedido PDF viajan al analizador seguro.'}
      else if(seconds<25){percent=31+(seconds-8)*1.55;label='Gemini está leyendo la factura';detail='Identifica filas, cantidades, formatos, descuentos e impuestos.'}
      else if(seconds<50){percent=57+(seconds-25)*.82;label='Comparando factura y pedido';detail='Valida marca, formato, graduación y unidades por display o caja.'}
      else if(seconds<85){percent=77.5+(seconds-50)*.35;label='Validando el cotejo';detail='Las facturas extensas pueden tardar un poco más. La animación seguirá activa.'}
      else{percent=Math.min(94,89.8+(seconds-85)*.08);label=attempt>1?'Segundo intento de análisis':'Finalizando la lectura';detail='La solicitud continúa activa; no cierres la aplicación.'}
      progress(onProgress,label,Math.min(94,percent),detail,'reading');
    },700);
    return()=>clearInterval(timer);
  }

  function normalizeLine(line,products){
    const product=products.find(item=>String(item.productId)===String(line.productId));
    const suggested=products.find(item=>String(item.productId)===String(line.suggestedProductId));
    const packageQty=Math.max(0,Number(line.packageQty??line.invoiceQuantity)||0);
    const packSize=Math.max(1,Number(line.packSize)||Core.packFromUnit(product?.unit,product?.description)||1);
    const units=Math.max(0,Number(line.units)||packageQty*packSize);
    const grossLineTotal=Math.max(0,Math.round(Number(line.grossLineTotal)||0));
    const grossUnitPrice=Math.max(0,Math.round(Number(line.grossUnitPrice)||(units?grossLineTotal/units:0)));
    const orderPack=Core.packFromUnit(product?.unit||'UNIDAD',product?.description||'');
    const receivedOrderQty=Number(line.receivedOrderQty)||(product?(units/orderPack):0);
    return{
      ...line,id:line.id||`ai-${crypto.randomUUID?.()||Date.now()}`,sourceLine:line.sourceLine||line.descriptionOriginal||'',descriptionOriginal:line.descriptionOriginal||line.sourceLine||'',
      productId:product?.productId||'',suggestedProductId:suggested?.productId||'',description:product?.description||line.description||line.descriptionOriginal||'',
      packageQty,invoiceQuantity:packageQty,packSize,units,grossLineTotal,grossUnitPrice,
      grossPackPrice:Math.max(0,Math.round(Number(line.grossPackPrice)||(packageQty?grossLineTotal/packageQty:grossUnitPrice*packSize))),
      receivedOrderQty:Number(receivedOrderQty.toFixed(3)),confidence:Math.max(0,Math.min(1,Number(line.confidence)||0)),engine:'gemini'
    };
  }

  function buildForm(file,products,context){
    const form=new FormData();form.append('file',file,file.name||'factura');
    if(context.orderFile instanceof Blob)form.append('orderFile',context.orderFile,context.orderFileName||`PEDIDO_${context.folio||'ACTUAL'}.pdf`);
    form.append('context',JSON.stringify({
      locale:'es-CL',currency:'CLP',providerName:context.providerName||'',folio:context.folio||'',
      products:(products||[]).map(item=>({productId:item.productId,description:item.description,unit:item.unit,orderedQty:Number(item.orderedQty)||0,unitsPerOrderUnit:Core.packFromUnit(item.unit,item.description)}))
    }));
    return form;
  }

  async function analyzeWithGemini(originalFile,products,onProgress,context={}){
    if(!settings().enabled)throw new Error('Gemini está desactivado');
    if(!navigator.onLine)throw new Error('No hay conexión a internet');
    const file=await compressImage(originalFile,onProgress);
    let lastError=null;
    for(let attempt=1;attempt<=2;attempt++){
      progress(onProgress,attempt===1?'Preparando cotejo inteligente':'Reconectando con el analizador',attempt===1?9:18,attempt===1?'Se comparará la factura con el PDF real del pedido.':'El primer intento perdió conexión o excedió el tiempo.','preparing');
      const stopClock=startProgressClock(onProgress,attempt);
      try{
        const response=await fetchWithTimeout(`${endpoint()}/v1/invoices/analyze`,{method:'POST',body:buildForm(file,products,context),headers:{'X-Pedidos-Client':'10.0.0'}},attempt===1?105000:120000);
        const payload=await readPayload(response);
        if(!response.ok||!payload.ok){
          const attempts=Array.isArray(payload.attempts)?payload.attempts.map(item=>`${item.model}: ${item.error}`).join(' | '):'';
          const error=new Error(payload.error||attempts||`Gemini respondió HTTP ${response.status}`);error.httpStatus=response.status;throw error;
        }
        progress(onProgress,'Validando resultados y reglas del negocio',96,'Se revisan displays, cajas, precios finales y diferencias con el pedido.','validating');
        const result=payload.invoice||{};
        const lines=(result.lines||[]).map(line=>normalizeLine(line,products||[])).filter(line=>line.sourceLine||line.productId||line.units>0||line.grossLineTotal>0);
        if(!lines.length)throw new Error('Gemini no detectó líneas de productos en la factura');
        progress(onProgress,'Cotejo completado',100,`${result.matchSummary?.matched||0} coincidencias de ${lines.length} líneas.`,'done');
        lastHealth={ok:true,mode:'gemini',model:payload.model||'',message:`Gemini conectado · ${payload.model||'modelo activo'}`};
        return{
          text:result.rawText||JSON.stringify(result),engine:'gemini',model:payload.model||'',warnings:result.warnings||[],comparedOrderPdf:!!payload.comparedOrderPdf,matchSummary:result.matchSummary||{},
          summary:{engine:'gemini',invoiceNumber:result.invoiceNumber||'',totals:{net:Number(result.totals?.net)||0,tax:(Number(result.totals?.vat)||0)+(Number(result.totals?.additionalTax)||0),freight:Number(result.totals?.freight)||0,additionalTax:Number(result.totals?.additionalTax)||0,vat:Number(result.totals?.vat)||0,total:Number(result.totals?.total)||0},lines}
        };
      }catch(error){
        lastError=error;
        const retryable=/Timeout|aborted|Load failed|Failed to fetch|NetworkError/i.test(String(error?.message||error))||[502,503,504].includes(error.httpStatus);
        if(attempt===1&&retryable){progress(onProgress,'La conexión demoró más de lo esperado',16,'Se realizará un segundo intento automáticamente.','retrying');await new Promise(resolve=>setTimeout(resolve,1200));continue}
        break;
      }finally{stopClock()}
    }
    throw new Error(friendlyError(lastError));
  }

  if(Invoice?.analyze&&!Invoice.analyze.__aiV20){
    const hybrid=async function(file,products,onProgress,context={})=>analyzeWithGemini(file,products,onProgress,context);
    hybrid.__aiV20=true;Invoice.analyze=hybrid;
  }

  function loadEnhancements(){
    if(!document.querySelector('link[data-pedidos-v20]')){const link=document.createElement('link');link.rel='stylesheet';link.href='./assets/patch-v18.css?v=20';link.dataset.pedidosV20='1';document.head.appendChild(link)}
    if(!document.querySelector('script[data-pedidos-v20]')){const script=document.createElement('script');script.src='./assets/invoice-ui-v18.js?v=20';script.defer=true;script.dataset.pedidosV20='1';document.head.appendChild(script)}
  }

  root.PedidosAI={DEFAULT_ENDPOINT,settings,endpoint,health,testConnection,analyzeWithGemini,isOnePointFive,get lastHealth(){return lastHealth}};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',loadEnhancements,{once:true}):loadEnhancements();
})(globalThis);
