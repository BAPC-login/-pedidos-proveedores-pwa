const DEFAULT_MODEL='gemini-3.5-flash';
const FALLBACK_MODEL='gemini-3.1-flash-lite';
const PRIMARY_TIMEOUT_MS=26000;
const REPAIR_TIMEOUT_MS=22000;

const money={type:'NUMBER'};
const schema={type:'OBJECT',properties:{supplierName:{type:'STRING'},supplierRut:{type:'STRING'},invoiceNumber:{type:'STRING'},invoiceDate:{type:'STRING'},currency:{type:'STRING'},documentType:{type:'STRING'},documentTypeCode:{type:'STRING'},totals:{type:'OBJECT',properties:{net:money,freight:money,additionalTax:money,vat:money,other:money,total:money},required:['net','freight','additionalTax','vat','other','total']},payment:{type:'OBJECT',properties:{detected:{type:'BOOLEAN'},method:{type:'STRING'},reference:{type:'STRING'},date:{type:'STRING'},amount:money},required:['detected','method','reference','date','amount']},items:{type:'ARRAY',items:{type:'OBJECT',properties:{code:{type:'STRING'},description:{type:'STRING'},quantity:{type:'NUMBER'},quantityHeader:{type:'STRING'},unit:{type:'STRING'},packSize:{type:'NUMBER'},packEvidence:{type:'STRING'},unitPriceNet:money,unitPriceHeader:{type:'STRING'},lineTotal:money,lineTotalHeader:{type:'STRING'},netLineTotal:money,vatLine:money,additionalTaxLine:money,otherLineCharges:money,grossLineTotal:money,printedFinalUnitPrice:money,finalUnitPriceHeader:{type:'STRING'},discountPct:{type:'NUMBER'},isFree:{type:'BOOLEAN'},freeReason:{type:'STRING'},readConfidence:{type:'NUMBER'},uncertainFields:{type:'ARRAY',items:{type:'STRING'}}},required:['code','description','quantity','quantityHeader','unit','packSize','packEvidence','unitPriceNet','unitPriceHeader','lineTotal','lineTotalHeader','netLineTotal','vatLine','additionalTaxLine','otherLineCharges','grossLineTotal','printedFinalUnitPrice','finalUnitPriceHeader','discountPct','isFree','freeReason','readConfidence','uncertainFields']}},warnings:{type:'ARRAY',items:{type:'STRING'}}},required:['supplierName','supplierRut','invoiceNumber','invoiceDate','currency','documentType','documentTypeCode','totals','payment','items','warnings']};

const extractionInstruction=`Eres el lector documental de Nuvasto. Tu trabajo es TRANSCRIBIR evidencia visible de facturas, guías, boletas, notas de crédito y documentos sin cargo; no eres el motor contable ni debes inventar cálculos.

REGLAS OBLIGATORIAS:
1. Copia exactamente los valores impresos. Si algo no es legible, usa cadena vacía o 0 y agrega el nombre del campo a uncertainFields/warnings.
2. No inventes productos, cantidades, precios, impuestos, folios, fechas ni identificadores.
3. Cada fila comercial del documento debe ser un item. Excluye filas que sean solamente IVA, flete, subtotal, descuentos globales o totales del documento.
4. quantity es la cantidad que aparece en la columna de cantidad. packSize solo se informa cuando el formato/descripcion evidencia claramente cuantas unidades contiene el formato; si no, usa 1.
5. Si existe una columna llamada “VALOR TOTAL”, “TOTAL”, “IMPORTE TOTAL” o equivalente por fila, copia ese valor en lineTotal y copia el encabezado literal en lineTotalHeader. NO decidas si ese valor es neto o bruto: Nuvasto lo validará matemáticamente después.
6. unitPriceNet solo corresponde a una columna inequívoca de precio unitario neto. No derives unitPriceNet dividiendo totales.
7. printedFinalUnitPrice solo se usa si el documento trae explícitamente un encabezado tipo “TOTAL X UNIDAD”, “TOTAL/UNIDAD” o equivalente final por unidad. Copia el encabezado en finalUnitPriceHeader.
8. netLineTotal, vatLine, additionalTaxLine, otherLineCharges y grossLineTotal solo se completan si esos componentes aparecen explícitamente por fila. No distribuyas impuestos por tu cuenta.
9. Los totales del documento deben copiarse desde su bloque de totales: net, flete, impuestos adicionales, IVA, otros y total final.
10. Bonificaciones/sin cargo se marcan isFree=true y conservan su cantidad; no les inventes valor.
11. El folio y la fecha solo se informan cuando están visibles. Nunca uses la fecha actual como reemplazo.
12. Devuelve solo JSON conforme al schema. La aplicación hará cotejo de catálogo y validación matemática fuera de la IA.`;

function toBase64(buffer){const bytes=new Uint8Array(buffer);let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
function num(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,n):0}
function text(value){return String(value||'').trim()}
function close(a,b,tolerance){return Math.abs(num(a)-num(b))<=Math.max(tolerance,Math.round(Math.max(num(a),num(b))*0.002))}
function natureFor(context={}){return String(context.documentNature||'').toLowerCase()==='free'?'free':'invoice'}
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
  const lineValues=valuedItems.map(item=>num(item.lineTotal||item.grossLineTotal||item.netLineTotal));
  if(lineValues.some(value=>value<=0))return{ok:false,reason:'partial-line-values',documentTotal};
  const sum=lineValues.reduce((a,b)=>a+b,0),known=[num(totals.freight),num(totals.vat),num(totals.additionalTax),num(totals.other)],targets=new Set([documentTotal,num(totals.net)]);
  for(let mask=0;mask<(1<<known.length);mask++){let outside=0;for(let i=0;i<known.length;i++)if(mask&(1<<i))outside+=known[i];if(documentTotal-outside>0)targets.add(documentTotal-outside)}
  const ok=[...targets].some(target=>target>0&&close(sum,target,2));
  return{ok,reason:ok?'sum-reconciles':'line-sum-does-not-reconcile',sum,documentTotal,targets:[...targets].filter(Boolean)};
}
function parseCandidate(payload){const textValue=payload?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';if(!textValue)throw new Error('Gemini no devolvió contenido estructurado');return JSON.parse(textValue)}
async function callModel(env,{model,mime,data,prompt,thinkingLevel,timeoutMs}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({system_instruction:{parts:[{text:extractionInstruction}]},contents:[{role:'user',parts:[{inline_data:{mime_type:mime,data}},{text:prompt}]}],generationConfig:{thinkingConfig:{thinkingLevel},responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:6144}})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(payload?.error?.message||`Gemini HTTP ${response.status}`),{status:response.status});return{raw:parseCandidate(payload),usage:payload.usageMetadata||null}}finally{clearTimeout(timer)}}
function basePrompt(fileName,nature){return`Lee el documento “${String(fileName||'documento').slice(0,180)}”. ${nature==='free'?'Está clasificado por el usuario como documento sin cargo: conserva productos y cantidades visibles y no inventes montos.':'Extrae primero folio, fecha, cabecera y totales, luego cada fila comercial.'} Respeta literalmente los encabezados de columnas de cantidad y valores. Si una columna dice VALOR TOTAL, transcríbela como lineTotal sin decidir si es neta o bruta. No cotejes productos ni hagas cálculos contables.`}
function repairPrompt(fileName,math,nature){return`Segunda lectura dirigida del documento “${String(fileName||'documento').slice(0,180)}”. La primera extracción no superó la validación determinística (${String(math.reason||'sin cierre')}; suma=${num(math.sum)}, total documento=${num(math.documentTotal)}). Relee SOLO evidencia visible con especial cuidado en ${nature==='free'?'descripciones y cantidades':'folio, fecha, cantidad, encabezados de precio/valor por fila, valores de cada fila y bloque de neto/IVA/impuestos/flete/total'}. No fuerces una suma ni completes campos por contexto: si un valor no se ve, deja 0 o vacío y marca incertidumbre. Devuelve nuevamente el documento completo según el schema.`}

export async function analyzeInvoiceFastV88(env,file,context={}){
  if(!env.GEMINI_API_KEY)throw Object.assign(new Error('Gemini no está configurado'),{status:503,code:'missing_api_key'});
  const mime=file.type||(/\.pdf$/i.test(file.name||'')?'application/pdf':'image/jpeg'),data=toBase64(await file.arrayBuffer()),primary=env.GEMINI_MODEL||DEFAULT_MODEL,nature=natureFor(context),attempts=[];
  try{
    const first=await callModel(env,{model:primary,mime,data,prompt:basePrompt(file.name,nature),thinkingLevel:'minimal',timeoutMs:PRIMARY_TIMEOUT_MS}),math=candidateMath(first.raw,nature);
    if(math.ok)return{ok:true,model:primary,usage:first.usage,invoice:first.raw,verification:{stage:'deterministic-precheck',...math},attempts};
    attempts.push({model:primary,stage:'primary',reason:math.reason});
    const repaired=await callModel(env,{model:primary,mime,data,prompt:repairPrompt(file.name,math,nature),thinkingLevel:'medium',timeoutMs:REPAIR_TIMEOUT_MS}),repairedMath=candidateMath(repaired.raw,nature);
    if(!repairedMath.ok)throw Object.assign(new Error('La lectura no pudo verificarse contra la evidencia visible del documento'),{code:'invoice_math_unverified',details:{math:repairedMath}});
    return{ok:true,model:primary,usage:repaired.usage,invoice:repaired.raw,verification:{stage:'targeted-repair',...repairedMath},attempts};
  }catch(error){
    attempts.push({model:primary,stage:'primary-or-repair',error:String(error?.message||error),status:Number(error?.status||0)});
    if(error?.code==='invoice_math_unverified')throw Object.assign(error,{attempts});
    try{const fallback=await callModel(env,{model:FALLBACK_MODEL,mime,data,prompt:basePrompt(file.name,nature),thinkingLevel:'minimal',timeoutMs:PRIMARY_TIMEOUT_MS}),math=candidateMath(fallback.raw,nature);if(!math.ok)throw Object.assign(new Error('La lectura alternativa tampoco pudo verificarse'),{code:'invoice_math_unverified',details:{math}});return{ok:true,model:FALLBACK_MODEL,usage:fallback.usage,invoice:fallback.raw,verification:{stage:'fallback-verified',...math},attempts}}catch(fallbackError){attempts.push({model:FALLBACK_MODEL,stage:'fallback',error:String(fallbackError?.message||fallbackError),status:Number(fallbackError?.status||0)});throw Object.assign(new Error('Nuvasto no obtuvo una lectura verificable del documento.'),{code:fallbackError?.code||error?.code||'analysis_failed',attempts})}
  }
}

export const invoiceExtractionPromptV88=extractionInstruction;