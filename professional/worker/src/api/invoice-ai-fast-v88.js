const DEFAULT_MODEL='gemini-3.5-flash';
const FALLBACK_MODEL='gemini-3.1-flash-lite';
const PRIMARY_TIMEOUT_MS=26000;
const REPAIR_TIMEOUT_MS=22000;
const TRANSIENT_STATUSES=new Set([408,425,429,500,502,503,504]);
const RETRY_DELAYS_MS=[450,1100];
const RETRY_BUDGET_MS=36000;

const money={type:'NUMBER'};
const schema={type:'OBJECT',properties:{
  supplierName:{type:'STRING'},supplierRut:{type:'STRING'},invoiceNumber:{type:'STRING'},invoiceDate:{type:'STRING'},currency:{type:'STRING'},documentType:{type:'STRING'},documentTypeCode:{type:'STRING'},
  totals:{type:'OBJECT',properties:{subtotal:money,discount:money,net:money,freight:money,additionalTax:money,additionalTaxes:{type:'ARRAY',items:{type:'OBJECT',properties:{label:{type:'STRING'},value:money},required:['label','value']}},vat:money,other:money,exempt:money,total:money},required:['subtotal','discount','net','freight','additionalTax','additionalTaxes','vat','other','exempt','total']},
  payment:{type:'OBJECT',properties:{detected:{type:'BOOLEAN'},method:{type:'STRING'},reference:{type:'STRING'},date:{type:'STRING'},amount:money},required:['detected','method','reference','date','amount']},
  items:{type:'ARRAY',items:{type:'OBJECT',properties:{
    code:{type:'STRING'},description:{type:'STRING'},quantity:{type:'NUMBER'},quantityHeader:{type:'STRING'},unit:{type:'STRING'},packSize:{type:'NUMBER'},packEvidence:{type:'STRING'},
    unitPriceNet:money,unitPriceHeader:{type:'STRING'},discountPct:{type:'NUMBER'},discountAmountLine:money,
    lineTotal:money,lineTotalHeader:{type:'STRING'},lineTotalKind:{type:'STRING'},netLineTotal:money,freightLine:money,vatLine:money,additionalTaxLine:money,otherLineCharges:money,grossLineTotal:money,
    printedFinalUnitPrice:money,finalUnitPriceHeader:{type:'STRING'},sourcePrintedFinalUnitPrice:money,sourceFinalUnitPriceHeader:{type:'STRING'},finalUnitPriceBasis:{type:'STRING'},
    isFree:{type:'BOOLEAN'},freeReason:{type:'STRING'},readConfidence:{type:'NUMBER'},uncertainFields:{type:'ARRAY',items:{type:'STRING'}}
  },required:['code','description','quantity','quantityHeader','unit','packSize','packEvidence','unitPriceNet','unitPriceHeader','discountPct','discountAmountLine','lineTotal','lineTotalHeader','lineTotalKind','netLineTotal','freightLine','vatLine','additionalTaxLine','otherLineCharges','grossLineTotal','printedFinalUnitPrice','finalUnitPriceHeader','sourcePrintedFinalUnitPrice','sourceFinalUnitPriceHeader','finalUnitPriceBasis','isFree','freeReason','readConfidence','uncertainFields']}},
  warnings:{type:'ARRAY',items:{type:'STRING'}}
},required:['supplierName','supplierRut','invoiceNumber','invoiceDate','currency','documentType','documentTypeCode','totals','payment','items','warnings']};

const extractionInstruction=`Eres el lector documental de Nuvasto para facturas y documentos comerciales chilenos. Tu tarea es reconocer la ESTRUCTURA REAL del documento y TRANSCRIBIR su evidencia visible. No eres el motor contable: no inventes ni fuerces números para que cuadren.

ORDEN OBLIGATORIO DE TRABAJO:
A. Antes de extraer montos, observa la tabla completa, sus encabezados y el bloque final de totales. Determina qué representa cada columna en ESTA factura. El mismo proveedor puede cambiar de formato entre documentos.
B. Transcribe los valores visibles conservando separados cantidad, unidad/formato, precio unitario, descuento, total de línea, flete, IVA, impuestos adicionales y precio final unitario cuando existan.
C. Solo después clasifica de forma prudente la semántica de los campos. Si una columna es ambigua, usa lineTotalKind='unknown' o finalUnitPriceBasis='unknown'; Nuvasto hará la validación matemática fuera de la IA.

REGLAS OBLIGATORIAS:
1. No inventes productos, cantidades, precios, impuestos, descuentos, fletes, folios, fechas, RUT ni identificadores. Si algo no es legible, usa cadena vacía o 0 y registra el campo en uncertainFields/warnings.
2. Una salida por cada fila comercial real. Excluye filas que sean solamente subtotal, IVA, IABA/ILA, flete global, descuentos globales, depósitos, garantías, servicios o total del documento. Si un cargo es realmente un producto/servicio facturado como línea comercial y no puedes determinarlo, descríbelo y márcalo incierto; no lo conviertas silenciosamente en producto de catálogo.
3. quantity es SOLO la cantidad impresa en la columna de cantidad. quantityHeader conserva el encabezado literal. No multipliques aquí por X6/X12/X24.
4. packSize representa cuántas unidades físicas contiene el formato SOLO cuando la descripción o la unidad lo evidencian claramente (X06, X6, 1000CCX12, CAJA 12, DISPLAY 24). Si no es seguro, usa 1 y explica packEvidence.
5. Si existe una columna “VALOR TOTAL”, “TOTAL”, “IMPORTE TOTAL”, “SUBTOTAL” o equivalente por fila, copia esa celda en lineTotal y el encabezado literal en lineTotalHeader. Clasifica lineTotalKind como 'net', 'gross', 'final' o 'unknown' SOLO si el documento lo permite; no derives la clasificación por costumbre del proveedor.
6. unitPriceNet se llena únicamente si la columna es inequívocamente un precio unitario neto. No lo derives dividiendo montos.
7. discountPct y discountAmountLine se copian solamente si son explícitos. No vuelvas a descontar un valor que ya está reflejado en otro campo.
8. netLineTotal, freightLine, vatLine, additionalTaxLine, otherLineCharges y grossLineTotal se llenan SOLO cuando esos componentes aparecen explícitamente por fila. IABA, ILA, impuesto adicional/específico se consideran additionalTaxLine. No distribuyas impuestos ni fletes por tu cuenta.
9. PRECIO FINAL EXPLÍCITO: reconoce encabezados como “TOTAL X UNIDAD”, “TOTAL/UNIDAD”, “PRECIO UNITARIO FINAL”, “PRECIO UNIT. BRUTO FINAL”, “PRECIO UNITARIO BRUTO FINAL” o equivalentes claros. Copia la cifra literal en sourcePrintedFinalUnitPrice Y printedFinalUnitPrice; copia el encabezado literal en sourceFinalUnitPriceHeader Y finalUnitPriceHeader. Nunca derives este precio.
10. Un precio final explícito puede estar expresado por la cantidad facturada (por ejemplo CA/caja) o por unidades físicas del pack. finalUnitPriceBasis puede ser 'invoice_quantity', 'physical_units' o 'unknown'. No adivines: si no es explícito, usa 'unknown'. Nuvasto comprobará matemáticamente ambas bases contra el total final.
11. El bloque final de totales se copia tal como está impreso: subtotal, discount, net, freight, vat, other, exempt y total. Para IABA/ILA u otros impuestos adicionales: si existe un TOTAL agregado explícito, cópialo en additionalTax; si solo aparecen varias filas/tasas separadas, usa additionalTax=0 y copia cada fila en additionalTaxes con su etiqueta y valor. Nuvasto sumará esas filas de forma determinística. El campo total debe ser exclusivamente el TOTAL FINAL OFICIAL del documento.
12. No asumas que net + freight siempre es correcto: algunos formatos muestran un NETO que ya incorpora flete y otros lo muestran separado. Copia los campos y deja que la aplicación descubra la fórmula mediante aritmética.
13. No asumas que IVA es el único impuesto. Reconoce IVA, IABA, ILA e impuestos adicionales visibles.
14. Bonificaciones/sin cargo se marcan isFree=true y mantienen cantidad; no les inventes precio.
15. Folio y fecha solo se informan cuando son visibles. Nunca uses fecha actual ni datos del pedido como sustituto.
16. payment solo refleja evidencia visible en el documento; no infieras que está pagado por el texto del pedido.
17. readConfidence va de 0 a 1 y debe bajar si una celda está borrosa, cortada, inclinada o parcialmente tapada.
18. Devuelve solo JSON conforme al schema. La aplicación cotejará catálogo, distribuirá cargos cuando corresponda y aplicará la regla final Σ(cantidad × precio final)=total factura.`;

function toBase64(buffer){const bytes=new Uint8Array(buffer);let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
function num(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,n):0}
function text(value){return String(value||'').trim()}
function close(a,b,tolerance=2){return Math.abs(num(a)-num(b))<=Math.max(0,Number(tolerance)||0)}
function natureFor(context={}){return String(context.documentNature||'').toLowerCase()==='free'?'free':'invoice'}
function quantityFor(item,basis){const invoice=num(item?.quantity),pack=Math.max(1,num(item?.packSize)||1);return basis==='physical_units'?invoice*pack:invoice}
function explicitFinalPrice(item){return num(item?.sourcePrintedFinalUnitPrice)||num(item?.printedFinalUnitPrice)}

function canonicalizeExtractedTotals(raw){
  if(!raw||typeof raw!=='object')return raw;
  const totals=raw.totals&&typeof raw.totals==='object'?raw.totals:(raw.totals={});
  const breakdown=Array.isArray(totals.additionalTaxes)?totals.additionalTaxes:[];
  const breakdownTotal=breakdown.reduce((sum,item)=>sum+num(item?.value),0);
  if(!num(totals.additionalTax)&&breakdownTotal>0)totals.additionalTax=breakdownTotal;
  return raw;
}

function candidateEvidence(raw,nature='invoice'){
  const items=Array.isArray(raw?.items)?raw.items:[];
  if(!items.length)return{ok:false,reason:'missing-lines'};
  if(items.some(item=>!text(item.description)))return{ok:false,reason:'missing-line-description'};
  if(!items.some(item=>num(item.quantity)>0))return{ok:false,reason:'missing-quantities'};
  if(nature==='invoice'&&!text(raw?.invoiceNumber))return{ok:false,reason:'missing-invoice-number'};
  return{ok:true,reason:'visible-evidence-present'};
}
function candidateMath(raw,nature='invoice'){
  const evidence=candidateEvidence(raw,nature),items=Array.isArray(raw?.items)?raw.items:[],totals=raw?.totals||{},documentTotal=num(totals.total);
  if(!evidence.ok)return{ok:false,reason:evidence.reason,documentTotal};
  if(nature==='free')return{ok:true,reason:'free-document-visible-lines',documentTotal,freeDocument:true};
  if(!documentTotal)return{ok:false,reason:'missing-document-total'};
  const valuedItems=items.filter(item=>!item.isFree);
  if(!valuedItems.length)return{ok:false,reason:'missing-valued-lines',documentTotal};

  const printed=valuedItems.filter(item=>explicitFinalPrice(item)>0);
  if(printed.length===valuedItems.length){
    const invoiceQuantityTotal=printed.reduce((sum,item)=>sum+explicitFinalPrice(item)*quantityFor(item,'invoice_quantity'),0);
    const physicalUnitsTotal=printed.reduce((sum,item)=>sum+explicitFinalPrice(item)*quantityFor(item,'physical_units'),0);
    if(close(invoiceQuantityTotal,documentTotal,2)||close(physicalUnitsTotal,documentTotal,2)){
      const finalUnitPriceBasis=Math.abs(documentTotal-invoiceQuantityTotal)<=Math.abs(documentTotal-physicalUnitsTotal)?'invoice_quantity':'physical_units';
      return{ok:true,reason:'printed-final-unit-reconciles',documentTotal,finalUnitPriceBasis,invoiceQuantityTotal,physicalUnitsTotal};
    }
  }

  const lineValues=valuedItems.map(item=>num(item.grossLineTotal)||num(item.lineTotal)||num(item.netLineTotal));
  if(lineValues.some(value=>value<=0))return{ok:false,reason:'partial-line-values',documentTotal,printedFinalPrices:printed.length};
  const sumLines=lineValues.reduce((a,b)=>a+b,0);
  const componentRows=valuedItems.map(item=>num(item.netLineTotal)+num(item.freightLine)+num(item.vatLine)+num(item.additionalTaxLine)+num(item.otherLineCharges));
  const componentSum=componentRows.reduce((a,b)=>a+b,0);
  if(componentRows.every(value=>value>0)&&close(componentSum,documentTotal,2))return{ok:true,reason:'line-components-reconcile',sum:componentSum,documentTotal};

  const known=[num(totals.freight),num(totals.vat),num(totals.additionalTax),num(totals.other)],targets=new Set([documentTotal,num(totals.net)]);
  const subtotalAfterDiscount=Math.max(0,num(totals.subtotal)-num(totals.discount));if(subtotalAfterDiscount)targets.add(subtotalAfterDiscount);
  for(let mask=0;mask<(1<<known.length);mask++){let outside=0;for(let i=0;i<known.length;i++)if(mask&(1<<i))outside+=known[i];if(documentTotal-outside>0)targets.add(documentTotal-outside)}
  const ok=[...targets].some(target=>target>0&&close(sumLines,target,2));
  return{ok,reason:ok?'sum-reconciles':'line-sum-does-not-reconcile',sum:sumLines,componentSum,documentTotal,targets:[...targets].filter(Boolean),printedFinalPrices:printed.length};
}
function parseCandidate(payload){const textValue=payload?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';if(!textValue)throw new Error('Gemini no devolvió contenido estructurado');return JSON.parse(textValue)}
async function callModel(env,{model,mime,data,prompt,thinkingLevel,timeoutMs}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({system_instruction:{parts:[{text:extractionInstruction}]},contents:[{role:'user',parts:[{inline_data:{mime_type:mime,data}},{text:prompt}]}],generationConfig:{thinkingConfig:{thinkingLevel},responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:8192}})}),payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(payload?.error?.message||`Gemini HTTP ${response.status}`),{status:response.status,code:`gemini_http_${response.status}`});
    return{raw:parseCandidate(payload),usage:payload.usageMetadata||null};
  }catch(error){
    if(error?.name==='AbortError'||Number(error?.code)===20)throw Object.assign(new Error('Gemini superó el tiempo de espera de lectura.'),{status:408,code:'ai_timeout'});
    throw error;
  }finally{clearTimeout(timer)}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function transient(error){const status=Number(error?.status||0);if(TRANSIENT_STATUSES.has(status))return true;const message=String(error?.message||'').toLowerCase();return /\b(429|500|502|503|504)\b|temporar|unavailable|overload|rate.?limit/.test(message)}
async function callModelResilient(env,args,{attempts,stage,startedAt,maxRetries=2}={}){let lastError;for(let retry=0;retry<=maxRetries;retry++){try{return await callModel(env,args)}catch(error){lastError=error;attempts?.push({model:args.model,stage,retry,status:Number(error?.status||0),error:String(error?.message||error)});const withinBudget=Date.now()-Number(startedAt||Date.now())<RETRY_BUDGET_MS;if(retry>=maxRetries||!transient(error)||!withinBudget||error?.name==='AbortError')throw error;await sleep(RETRY_DELAYS_MS[Math.min(retry,RETRY_DELAYS_MS.length-1)])}}throw lastError}
function basePrompt(fileName,nature){return`Lee el documento “${String(fileName||'documento').slice(0,180)}”. ${nature==='free'?'Está clasificado por el usuario como documento sin cargo: conserva productos y cantidades visibles y no inventes montos.':'Primero identifica la estructura real de la tabla y el significado de sus columnas; después extrae folio, fecha, totales y todas las filas comerciales.'} Presta especial atención a cantidad, unidad/pack, VALOR TOTAL, precio unitario neto, PRECIO UNIT. BRUTO FINAL/Total x Unidad, flete, IVA e impuestos adicionales. Copia evidencia; no cotejes catálogo ni fuerces la cuadratura.`}
function repairPrompt(fileName,math,nature){return`Segunda lectura dirigida del documento “${String(fileName||'documento').slice(0,180)}”. La primera extracción no superó la validación determinística (${String(math.reason||'sin cierre')}; suma=${num(math.sum||math.componentSum)}, total documento=${num(math.documentTotal)}). Relee SOLO evidencia visible con especial cuidado en ${nature==='free'?'descripciones y cantidades':'encabezados reales, cantidad facturada, tamaño de pack, si el precio final corresponde a cantidad facturada o unidades físicas, cada total de línea y el bloque subtotal/descuento/neto/flete/IVA/IABA-ILA/otros/total'}. No fuerces una suma, no redistribuyas cargos y no completes campos por contexto: si un valor no se ve, usa 0/vacío y márcalo incierto. Devuelve nuevamente el documento completo según el schema.`}

export async function analyzeInvoiceFastV88(env,file,context={}){
  if(!env.GEMINI_API_KEY)throw Object.assign(new Error('Gemini no está configurado'),{status:503,code:'missing_api_key'});
  const mime=file.type||(/\.pdf$/i.test(file.name||'')?'application/pdf':'image/jpeg'),data=toBase64(await file.arrayBuffer()),primary=env.GEMINI_MODEL||DEFAULT_MODEL,nature=natureFor(context),attempts=[],startedAt=Date.now();
  try{
    const first=await callModelResilient(env,{model:primary,mime,data,prompt:basePrompt(file.name,nature),thinkingLevel:'minimal',timeoutMs:PRIMARY_TIMEOUT_MS},{attempts,stage:'primary',startedAt,maxRetries:2});canonicalizeExtractedTotals(first.raw);const math=candidateMath(first.raw,nature);
    if(math.ok)return{ok:true,model:primary,usage:first.usage,invoice:first.raw,verification:{stage:'deterministic-precheck',...math},attempts,resilienceV91:true,structureAwarePricingV96:true};
    attempts.push({model:primary,stage:'primary-validation',reason:math.reason});
    const repaired=await callModelResilient(env,{model:primary,mime,data,prompt:repairPrompt(file.name,math,nature),thinkingLevel:'medium',timeoutMs:REPAIR_TIMEOUT_MS},{attempts,stage:'repair',startedAt,maxRetries:1});canonicalizeExtractedTotals(repaired.raw);const repairedMath=candidateMath(repaired.raw,nature);
    if(!repairedMath.ok)throw Object.assign(new Error('La lectura no pudo verificarse contra la evidencia visible del documento'),{code:'invoice_math_unverified',details:{math:repairedMath}});
    return{ok:true,model:primary,usage:repaired.usage,invoice:repaired.raw,verification:{stage:'targeted-repair',...repairedMath},attempts,resilienceV91:true,structureAwarePricingV96:true};
  }catch(error){
    attempts.push({model:primary,stage:'primary-or-repair-final',error:String(error?.message||error),status:Number(error?.status||0)});
    if(error?.code==='invoice_math_unverified')throw Object.assign(error,{attempts});
    try{const fallback=await callModelResilient(env,{model:FALLBACK_MODEL,mime,data,prompt:basePrompt(file.name,nature),thinkingLevel:'minimal',timeoutMs:PRIMARY_TIMEOUT_MS},{attempts,stage:'fallback',startedAt,maxRetries:1});canonicalizeExtractedTotals(fallback.raw);const math=candidateMath(fallback.raw,nature);if(!math.ok)throw Object.assign(new Error('La lectura alternativa tampoco pudo verificarse'),{code:'invoice_math_unverified',details:{math}});return{ok:true,model:FALLBACK_MODEL,usage:fallback.usage,invoice:fallback.raw,verification:{stage:'fallback-verified',...math},attempts,resilienceV91:true,structureAwarePricingV96:true}}catch(fallbackError){attempts.push({model:FALLBACK_MODEL,stage:'fallback-final',error:String(fallbackError?.message||fallbackError),status:Number(fallbackError?.status||0)});throw Object.assign(new Error('Nuvasto no obtuvo una lectura verificable del documento.'),{code:fallbackError?.code||error?.code||'analysis_failed',attempts,resilienceV91:true})}
  }
}

export const invoiceExtractionPromptV88=extractionInstruction;
