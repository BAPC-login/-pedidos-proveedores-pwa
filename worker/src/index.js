const DEFAULT_MODEL='gemini-3.5-flash';
const FALLBACK_MODELS=['gemini-3.1-flash-lite','gemini-2.5-flash'];
const MAX_FILE_BYTES=12*1024*1024;
const STOP_WORDS=new Set(['DE','DEL','LA','LAS','EL','LOS','UN','UNA','UND','UNID','UNIDAD','UNIDADES','CAJA','CAJAS','BOT','BOTELLA','BOTELLAS','BEB','BEBIDA','BEBIDAS','PROD','PRODUCTO','PACK','FORMATO']);

const corsHeaders=origin=>({
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type,X-Pedidos-Client',
  'Access-Control-Max-Age':'86400',
  'Vary':'Origin'
});
function allowedOrigin(request,env){
  const origin=request.headers.get('Origin')||'';
  const configured=String(env.ALLOWED_ORIGINS||'https://bapc-login.github.io,http://localhost:8788,http://127.0.0.1:8788').split(',').map(value=>value.trim()).filter(Boolean);
  if(!origin)return configured[0]||'*';
  return configured.some(value=>origin===value||origin.startsWith(`${value}:`))?origin:'';
}
function json(data,status=200,origin='*'){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...corsHeaders(origin)}});
}
function number(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9.,]+/g,' ').replace(/\s+/g,' ').trim()}
function contentMl(text){
  const value=normalize(text);
  const match=value.match(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/);
  if(!match)return 0;
  const amount=number(match[1].replace(',','.'));
  return /^(?:L|LT)/.test(match[2])?Math.round(amount*1000):Math.round(amount);
}
function canonical(value){
  let text=normalize(value);
  const ml=contentMl(text);
  text=text.replace(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/g,ml?` ${ml}ML `:' ');
  return text.replace(/\bZERO\b/g,'SIN AZUCAR').replace(/\bLIGHT\b/g,'SIN AZUCAR').replace(/\bSUGAR FREE\b/g,'SIN AZUCAR').replace(/\s+/g,' ').trim();
}
function tokens(value){return canonical(value).split(' ').filter(token=>token.length>1&&!STOP_WORDS.has(token))}
function packFromUnit(unit){const match=String(unit||'').match(/\((\d+)\)/);return match?Math.max(1,Number(match[1])):1}
function packFromText(text){const match=String(text||'').toUpperCase().match(/(?:X|×)\s*(\d{1,3})(?:\b|\D)/);return match?Math.max(1,Number(match[1])):1}
function similarity(a,b){
  const at=tokens(a),bt=tokens(b);if(!at.length||!bt.length)return 0;
  const aa=new Set(at),bb=new Set(bt);let hit=0;
  for(const token of aa)if(bb.has(token))hit++;
  const union=new Set([...aa,...bb]).size||1;
  const jaccard=hit/union;
  const coverage=hit/Math.min(aa.size,bb.size);
  const ac=canonical(a).replace(/\s+/g,''),bc=canonical(b).replace(/\s+/g,'');
  const substring=ac&&bc&&(ac.includes(bc)||bc.includes(ac))?1:0;
  const aml=contentMl(a),bml=contentMl(b),content=aml&&bml?(aml===bml?1:0):0.35;
  return Math.min(1,jaccard*.45+coverage*.35+substring*.12+content*.08);
}
function bestProduct(line,products){
  const requested=String(line.productId||'');
  const exact=products.find(product=>String(product.productId)===requested);
  if(exact)return{product:exact,score:1,method:'gemini-id',candidate:exact};
  const ranked=(products||[]).map(product=>({product,score:similarity(line.descriptionOriginal||line.description||'',product.description)})).sort((a,b)=>b.score-a.score);
  const winner=ranked[0]||{product:null,score:0},second=ranked[1]?.score||0;
  const safe=winner.score>=0.34||(winner.score>=0.27&&winner.score-second>=0.08);
  return{product:safe?winner.product:null,score:winner.score,method:safe?'fuzzy':'unmatched',candidate:winner.product};
}
function toBase64(arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);let binary='';const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,offset+chunk));
  return btoa(binary);
}
function responseSchema(context={}){
  const ids=[...new Set((context.products||[]).map(product=>String(product.productId||'')).filter(Boolean))];
  return{
    type:'OBJECT',
    properties:{
      supplierName:{type:'STRING'},supplierRut:{type:'STRING'},invoiceNumber:{type:'STRING'},invoiceDate:{type:'STRING'},currency:{type:'STRING'},
      totals:{type:'OBJECT',properties:{net:{type:'NUMBER'},tax:{type:'NUMBER'},total:{type:'NUMBER'}},required:['net','tax','total']},
      items:{type:'ARRAY',items:{type:'OBJECT',properties:{
        descriptionOriginal:{type:'STRING'},sku:{type:'STRING'},productId:{type:'STRING',...(ids.length?{enum:['',...ids]}:{})},confidence:{type:'NUMBER'},
        packageQty:{type:'NUMBER'},packSize:{type:'NUMBER'},units:{type:'NUMBER'},contentMl:{type:'NUMBER'},
        netLineTotal:{type:'NUMBER'},taxLineTotal:{type:'NUMBER'},grossLineTotal:{type:'NUMBER'},grossUnitPrice:{type:'NUMBER'},notes:{type:'STRING'}
      },required:['descriptionOriginal','productId','confidence','packageQty','packSize','units','netLineTotal','grossLineTotal']}},
      warnings:{type:'ARRAY',items:{type:'STRING'}}
    },required:['supplierName','invoiceNumber','totals','items','warnings']
  };
}
function buildPrompt(context){
  const products=(context.products||[]).map(product=>({productId:String(product.productId),description:String(product.description),unit:String(product.unit||'UNIDAD'),orderedQty:number(product.orderedQty)}));
  return `Eres un analista experto en facturas chilenas de alimentos, bebidas y licores. Lee visualmente el documento completo, incluidas tablas, glosas, impuestos adicionales, descuentos, cantidades y formatos de caja. Devuelve exclusivamente JSON conforme al esquema solicitado.

PROVEEDOR ESPERADO: ${String(context.providerName||'no informado')}

OBJETIVO:
1. Extraer proveedor, RUT, número y fecha de factura.
2. Extraer neto, suma de impuestos y total final.
3. Extraer cada producto facturado, incluso cuando la glosa esté abreviada.
4. Interpretar expresiones como MISTRAL35-1000CCX12=1 como 1 caja, 12 unidades y 1000 cc por unidad.
5. Distinguir cantidad de cajas, unidades por caja y unidades totales.
6. Calcular el valor final de la línea con descuentos e impuestos. Cuando el impuesto solo aparezca a nivel de factura, informa netLineTotal y deja grossLineTotal en 0 para que el servidor lo prorratee.
7. Vincular cada línea solamente con uno de los productId entregados. Usa productId vacío cuando no exista una coincidencia suficientemente segura. No inventes productos.
8. confidence debe estar entre 0 y 1.
9. No confundas códigos, descuentos, subtotales o impuestos con productos.

PRODUCTOS ESPERADOS DEL PEDIDO:
${JSON.stringify(products)}

REGLAS DE PRECIOS:
- Todos los números deben ser valores numéricos sin símbolos de moneda ni separadores de miles.
- grossUnitPrice corresponde al precio final por botella/unidad, no por caja.
- Si una línea representa cajas, units = packageQty * packSize.
- Si no puedes determinar un dato, usa 0 o cadena vacía y agrega una advertencia.
- Conserva la descripción original exacta en descriptionOriginal.`;
}
async function parseGeminiResponse(response,model){
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=payload?.error?.message||`Gemini HTTP ${response.status}`;
    const error=new Error(message);error.status=response.status;error.model=model;throw error;
  }
  const text=payload?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
  if(!text)throw new Error(`Gemini (${model}) no devolvió contenido estructurado`);
  try{return{data:JSON.parse(text),usage:payload.usageMetadata||null,model}}
  catch{throw new Error(`Gemini (${model}) devolvió JSON inválido`)}
}
async function callGemini(env,model,mimeType,data,context){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body={
    contents:[{role:'user',parts:[{inline_data:{mime_type:mimeType,data}},{text:buildPrompt(context)}]}],
    generationConfig:{temperature:0.05,responseMimeType:'application/json',responseSchema:responseSchema(context),maxOutputTokens:16384}
  };
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify(body)});
  return parseGeminiResponse(response,model);
}
async function probeGemini(env){
  const model=env.GEMINI_MODEL||DEFAULT_MODEL;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({contents:[{parts:[{text:'Responde exactamente OK'}]}],generationConfig:{temperature:0,maxOutputTokens:8}})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.error?.message||`Gemini HTTP ${response.status}`);
  return{model,ok:!!payload?.candidates?.length};
}
async function callWithFallbacks(env,mimeType,data,context){
  const models=[env.GEMINI_MODEL||DEFAULT_MODEL,...FALLBACK_MODELS].filter((value,index,array)=>value&&array.indexOf(value)===index);
  const attempts=[];
  for(const model of models){
    try{return await callGemini(env,model,mimeType,data,context)}
    catch(error){attempts.push({model,error:String(error.message||error),status:error.status||0})}
  }
  const combined=attempts.map(item=>`${item.model}: ${item.error}`).join(' | ');
  const error=new Error(combined||'Gemini no respondió');error.attempts=attempts;throw error;
}
function validateInvoice(raw,context){
  const products=context.products||[],totals={net:Math.max(0,number(raw.totals?.net)),tax:Math.max(0,number(raw.totals?.tax)),total:Math.max(0,number(raw.totals?.total))};
  if(!totals.tax&&totals.total>totals.net)totals.tax=totals.total-totals.net;
  const taxFactor=totals.net>0&&totals.total>=totals.net?totals.total/totals.net:1.19;
  const warnings=[...(Array.isArray(raw.warnings)?raw.warnings:[])];
  const lines=(Array.isArray(raw.items)?raw.items:[]).map((line,index)=>{
    const matched=bestProduct(line,products),product=matched.product,candidate=matched.candidate;
    const packageQty=Math.max(0,number(line.packageQty)||1);
    const inferredPack=packFromText(line.descriptionOriginal||line.description),packSize=Math.max(1,number(line.packSize)||inferredPack||1);
    const units=Math.max(0,number(line.units)||packageQty*packSize);
    const netLineTotal=Math.max(0,number(line.netLineTotal)),taxLineTotal=Math.max(0,number(line.taxLineTotal));
    let grossLineTotal=Math.max(0,number(line.grossLineTotal));
    if(!grossLineTotal&&netLineTotal)grossLineTotal=Math.round(netLineTotal*(taxLineTotal?1+taxLineTotal/netLineTotal:taxFactor));
    const grossUnitPrice=Math.max(0,Math.round(number(line.grossUnitPrice)||(units?grossLineTotal/units:0)));
    const grossPackPrice=Math.max(0,Math.round(packageQty?grossLineTotal/packageQty:grossUnitPrice*packSize));
    const orderPack=packFromUnit(product?.unit||'UNIDAD'),receivedOrderQty=orderPack>1?units/orderPack:units;
    const confidence=Math.max(0,Math.min(1,Math.max(number(line.confidence),matched.score||0)));
    if(!product)warnings.push(`Línea sin coincidencia segura: ${line.descriptionOriginal||`línea ${index+1}`}`);
    return{
      id:`gemini-${index+1}`,sourceLine:String(line.descriptionOriginal||''),descriptionOriginal:String(line.descriptionOriginal||''),sku:String(line.sku||''),
      productId:product?.productId||'',suggestedProductId:!product&&candidate?.productId?String(candidate.productId):'',description:product?.description||String(line.descriptionOriginal||''),confidence,matchMethod:matched.method,matchScore:Number((matched.score||0).toFixed(4)),
      packageQty,packSize,units,contentMl:number(line.contentMl)||contentMl(line.descriptionOriginal),
      netLineTotal:Math.round(netLineTotal),taxLineTotal:Math.round(taxLineTotal),grossLineTotal:Math.round(grossLineTotal),grossPackPrice,grossUnitPrice,
      receivedOrderQty:Number(receivedOrderQty.toFixed(3)),notes:String(line.notes||'')
    };
  });
  const lineGross=lines.reduce((sum,line)=>sum+line.grossLineTotal,0);
  if(totals.total&&lineGross&&Math.abs(lineGross-totals.total)>Math.max(500,totals.total*.08))warnings.push('La suma de líneas no coincide exactamente con el total de la factura; revisa descuentos, flete o impuestos globales.');
  if(!lines.length)warnings.push('Gemini no detectó líneas de productos en el documento.');
  return{
    supplierName:String(raw.supplierName||''),supplierRut:String(raw.supplierRut||''),invoiceNumber:String(raw.invoiceNumber||''),invoiceDate:String(raw.invoiceDate||''),currency:String(raw.currency||'CLP'),
    totals:{...totals,taxFactor:Number(taxFactor.toFixed(5))},lines,warnings:[...new Set(warnings.filter(Boolean))],rawText:JSON.stringify(raw)
  };
}
async function analyze(request,env,origin){
  if(!env.GEMINI_API_KEY)return json({ok:false,error:'GEMINI_API_KEY no está configurada en el Worker',code:'missing_api_key'},503,origin);
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File))return json({ok:false,error:'Debes adjuntar una imagen o PDF',code:'missing_file'},400,origin);
  if(file.size>MAX_FILE_BYTES)return json({ok:false,error:'La factura supera el máximo seguro de 12 MB',code:'file_too_large'},413,origin);
  let context={};try{context=JSON.parse(String(form.get('context')||'{}'))}catch{return json({ok:false,error:'Contexto de pedido inválido',code:'invalid_context'},400,origin)}
  const mimeType=file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'image/jpeg');
  if(!/^image\//.test(mimeType)&&mimeType!=='application/pdf')return json({ok:false,error:'Formato no compatible. Usa imagen o PDF.',code:'unsupported_type'},415,origin);
  const data=toBase64(await file.arrayBuffer());
  const result=await callWithFallbacks(env,mimeType,data,context);
  return json({ok:true,model:result.model,usage:result.usage,invoice:validateInvoice(result.data,context)},200,origin);
}
export default{
  async fetch(request,env){
    const origin=allowedOrigin(request,env);
    if(!origin)return json({ok:false,error:'Origen no autorizado'},403,'null');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health'){
      const base={ok:true,service:'pedidos-pro-ai',geminiConfigured:!!env.GEMINI_API_KEY,model:env.GEMINI_MODEL||DEFAULT_MODEL};
      if(url.searchParams.get('probe')!=='1'||!env.GEMINI_API_KEY)return json(base,200,origin);
      try{return json({...base,probe:await probeGemini(env)},200,origin)}catch(error){return json({...base,ok:false,probe:{ok:false,error:String(error.message||error)}},502,origin)}
    }
    if(request.method==='POST'&&url.pathname==='/v1/invoices/analyze'){
      try{return await analyze(request,env,origin)}catch(error){console.error(error);return json({ok:false,error:String(error.message||'No se pudo analizar la factura'),code:'gemini_failed',attempts:error.attempts||[]},502,origin)}
    }
    return json({ok:false,error:'Ruta no encontrada'},404,origin);
  }
};
