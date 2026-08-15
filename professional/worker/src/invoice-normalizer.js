import {reconcileInvoicePricing} from './invoice-pricing-matrix.js';
const round3=value=>Math.round((Number(value)||0)*1000)/1000;
const roundPeso=value=>Math.round(Number(value)||0);
const numeric=value=>{if(typeof value==='number')return Number.isFinite(value)?value:0;let raw=String(value??'').trim().replace(/\s|\$/g,'');if(!raw)return 0;if(raw.includes(',')&&raw.includes('.'))raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');else if(raw.includes(','))raw=raw.replace(',','.');else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'');const result=Number(raw);return Number.isFinite(result)?result:0};
const text=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/×/g,'X').replace(/[^A-Z0-9.,()/%X]+/g,' ').replace(/\s+/g,' ').trim();
const expand=value=>text(value).replace(/\bS\s*[/.-]?\s*AZ(?:UCAR)?\b/g,' SIN AZUCAR ').replace(/\bZERO\b|\bLIGHT\b|\bSUGAR FREE\b/g,' SIN AZUCAR ').replace(/\bESP(?:EC)?\.?\b/g,' ESPECIAL ').replace(/\bTRANSP(?:ARENTE)?\.?\b|\bTRANS\.?\b/g,' TRANSPARENTE ').replace(/\bJW\b|\bJOHNNIE\b/g,' JOHNNIE WALKER ').replace(/\bCC\s+ZERO\b/g,' COCA COLA SIN AZUCAR ').replace(/\s+/g,' ').trim();
const STOP=new Set(['DE','DEL','LA','LAS','EL','LOS','Y','CON','SIN','UN','UNA','UND','UNID','UNIDAD','UNIDADES','CAJA','CAJAS','BOT','BOTELLA','BOTELLAS','PACK','DISPLAY','FORMATO','VID','VIDRIO','PET','RETORNABLE','RET','ML','CC','LT','LTS','LITRO','LITROS']);
const identifier=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const usefulIdentifier=value=>{const id=identifier(value);return id.length>=4?id:''};

function contentMl(value){const label=expand(value),matches=[...label.matchAll(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/g)];if(matches.length){const match=matches[matches.length-1],amount=Number(match[1].replace(',','.'))||0;return /^(L|LT|LTS|LITRO)/.test(match[2])?Math.round(amount*1000):Math.round(amount)}if(/\b1[.,]5\b/.test(label))return 1500;if(/\bLITRO\b|\b1L\b/.test(label))return 1000;const standalone=label.match(/(?:^|\s)(250|330|350|500|591|600|700|750|900|1000|1500|2000)(?=\s|$)/);return standalone?Number(standalone[1]):0}
function packFromUnit(unit){const label=text(unit),explicit=label.match(/\((\d{1,3})\)/)||label.match(/(?:CAJA|PACK|DISPLAY)\s*(?:DE\s*)?(\d{1,3})\b/);if(explicit)return Math.max(1,Number(explicit[1])||1);if(/DISPLAY/.test(label))return 24;return 1}
function explicitPack(source){const label=text(source),patterns=[/(?:^|\s)(\d{1,3})\s*X\s*\d{2,4}\s*(?:ML|CC)\b/,/(?:ML|CC)\s*X\s*0?(\d{1,3})\b/,/(?:^|\s)X\s*0?(\d{1,3})(?=\s|$)/,/(?:CAJA|PACK|DISPLAY)\s*(?:DE\s*)?(\d{1,3})\b/,/(?:C|CONT|CONTENIDO)\s*[\/.:-]?\s*(\d{1,3})(?=\s|$)/,/(?:CAJA|PACK)\s+(?:CON\s+)?(\d{1,3})\s+(?:BOTELLAS?|UNIDADES?|UND|UNID)\b/];for(const pattern of patterns){const match=label.match(pattern);if(match)return Math.max(1,Number(match[1])||1)}return 0}
function isBaseUnitDescription(source){const label=text(source);return /\b(BOTELLAS?|UNIDADES?|UNIDAD|UND|UNID)\b/.test(label)&&!/\b(CAJA|PACK|DISPLAY)\b/.test(label)&&!explicitPack(label)}
function tokens(value){return expand(value).replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g,' ').split(' ').filter(token=>token.length>1&&!STOP.has(token)&&!/^\d+$/.test(token))}
function tokenSimilarity(left,right){if(left===right)return 1;if(left.length>=3&&right.length>=3&&(left.startsWith(right)||right.startsWith(left)))return .82+Math.min(left.length,right.length)/Math.max(left.length,right.length)*.18;return 0}
function trigram(value){const compact=expand(value).replace(/[^A-Z0-9]/g,''),result=new Set();for(let i=0;i<=compact.length-3;i++)result.add(compact.slice(i,i+3));if(!result.size&&compact)result.add(compact);return result}
function similarity(left,right){const a=tokens(left),b=tokens(right);if(!a.length||!b.length)return 0;let coverA=0;for(const token of a)coverA+=Math.max(0,...b.map(other=>tokenSimilarity(token,other)));coverA/=a.length;let coverB=0;for(const token of b)coverB+=Math.max(0,...a.map(other=>tokenSimilarity(token,other)));coverB/=b.length;const ga=trigram(left),gb=trigram(right);let hits=0;for(const gram of ga)if(gb.has(gram))hits++;const tri=ga.size&&gb.size?hits/new Set([...ga,...gb]).size:0;return Math.min(1,coverA*.48+coverB*.34+tri*.18)}
function variantPenalty(left,right){const a=expand(left),b=expand(right);let delta=0;const flags=['SIN AZUCAR','NORMAL','ORIGINAL','BLACK','RED','SILVER','ESPECIAL','TRANSPARENTE'];for(const flag of flags)if(a.includes(flag)&&b.includes(flag))delta+=.04;if((/SIN AZUCAR/.test(a)&&/NORMAL|ORIGINAL/.test(b))||(/NORMAL|ORIGINAL/.test(a)&&/SIN AZUCAR/.test(b)))delta-=.52;if((/\bBLACK\b/.test(a)&&/\bRED\b/.test(b))||(/\bRED\b/.test(a)&&/\bBLACK\b/.test(b)))delta-=.42;return delta}
function scoreCandidate(source,label){if(!source||!label)return 0;let score=similarity(source,label)+variantPenalty(source,label);const a=contentMl(source),b=contentMl(label);if(a&&b)score+=a===b?.20:-.55;const left=expand(source),right=expand(label);if(left===right)score=Math.max(score,.98);else if(left.length>=7&&right.length>=7&&(left.includes(right)||right.includes(left)))score=Math.max(score,.86);return Math.max(0,Math.min(1,score))}
function lineSource(line){return[line.code,line.supplierSku,line.sourceLine,line.descriptionOriginal,line.description].filter(Boolean).join(' ').trim()}
function productLabels(product){return[product.description,product.catalogName,product.supplierProductName,product.supplierName].map(value=>String(value||'').trim()).filter(Boolean)}

function identifierEvidence(line,product,source){
  const lineIds=[line.code,line.supplierSku,line.sku,line.barcode].map(usefulIdentifier).filter(Boolean);
  const productIds=[product.supplierSku,product.barcode].map(usefulIdentifier).filter(Boolean);
  const words=text(source).split(' ').map(usefulIdentifier).filter(Boolean);
  const barcodeId=usefulIdentifier(product.barcode);
  for(const target of productIds){
    const method=target===barcodeId?'barcode':'supplier-sku';
    if(lineIds.includes(target))return{score:1,method,reason:'Coincidencia exacta por identificador del proveedor'};
    if(words.includes(target))return{score:.98,method,reason:'Identificador del proveedor presente en la línea'};
  }
  return null;
}

function productScore(line,product,aliasMap){
  const source=lineSource(line),idHit=identifierEvidence(line,product,source);
  if(idHit)return{product,score:idHit.score,method:idHit.method,reason:idHit.reason,evidence:'identifier'};
  let score=0,method='catalog-name',reason='Coincidencia por nombre, variante y formato',evidence='catalog';
  for(const label of productLabels(product)){
    const candidate=scoreCandidate(source,label);
    if(candidate>score){score=candidate;method=label===product.supplierProductName?'supplier-product-name':'catalog-name';reason=method==='supplier-product-name'?'Coincidencia con el nombre usado por el proveedor':'Coincidencia por nombre, variante y formato';evidence=method}
  }
  for(const alias of aliasMap.get(String(product.productId))||[]){
    const aliasScore=scoreCandidate(source,alias.alias)+Math.min(.12,Math.max(0,numeric(alias.confidence)-.5)*.18)+Math.min(.05,Math.log10(1+Math.max(0,numeric(alias.usageCount)))*.03);
    if(aliasScore>score){score=aliasScore;method='supplier-alias';reason='Coincidencia con descripción histórica confirmada para este proveedor';evidence='historical-alias'}
  }
  return{product,score:Math.min(1,score),method,reason,evidence};
}

function findProduct(line,products,aliasMap){
  const source=lineSource(line),ids=[line.productId,line.matchedOrderProductId,line.suggestedProductId].map(String).filter(Boolean);
  for(const id of ids){
    const product=products.find(item=>String(item.productId)===id);
    if(product){const ranked=productScore(line,product,aliasMap),score=Math.max(ranked.score,numeric(line.confidence??line.matchConfidence));if(score>=.24||!source)return{...ranked,score:Math.max(score,.72),method:ranked.method==='catalog-name'?'document-id':ranked.method,reason:ranked.evidence==='identifier'?ranked.reason:'Coincidencia preservada y validada contra el pedido',secondScore:0}}
  }
  const ranked=products.map(product=>productScore(line,product,aliasMap)).sort((a,b)=>b.score-a.score),best=ranked[0],second=ranked[1]?.score||0;
  if(!best)return{product:null,score:0,method:'unmatched',reason:'Sin candidato',secondScore:0,evidence:'none'};
  const exactEvidence=['identifier','supplier-product-name','historical-alias'].includes(best.evidence)&&best.score>=.72;
  const unique=exactEvidence||best.score>=.42||(best.score>=.30&&best.score-second>=.06);
  return unique?{...best,secondScore:second}:{product:null,score:best.score,method:'unmatched',reason:`Mejor candidato no suficientemente único (${round3(best.score)} vs ${round3(second)})`,secondScore:second,evidence:best.evidence};
}

function unitLabel(product,pack){const raw=String(product?.unit||'').trim();if(raw)return raw;return pack>1?`CAJA (${pack})`:'UNIDAD'}
function conversionText({invoiceQuantity,invoicePack,totalUnits,orderPack,equivalent,product,orderedQty}){const invoiceSide=invoicePack>1?`${round3(invoiceQuantity)} formato${invoiceQuantity===1?'':'s'} × ${invoicePack}`:`${round3(totalUnits)} unidad${totalUnits===1?'':'es'}`,orderSide=`${round3(equivalent)} ${unitLabel(product,orderPack).toLowerCase()}`,expected=orderedQty>0?` · pedido: ${round3(orderedQty)} ${unitLabel(product,orderPack).toLowerCase()}`:'';return`${invoiceSide} = ${orderSide}${expected}`}

function lineNet(line){
  const explicit=numeric(line.netLineTotal??line.netTotal);
  if(explicit>0)return roundPeso(explicit);
  const gross=numeric(line.grossLineTotal??line.grossTotal??line.lineTotal??line.total),tax=numeric(line.taxLineTotal??line.vatLine??line.taxTotal),additional=numeric(line.additionalTaxLineTotal??line.additionalTaxLine??line.additionalTax),other=numeric(line.otherLineCharges);
  if(gross>0&&gross>=tax+additional+other)return roundPeso(gross-tax-additional-other);
  return 0;
}

function fallbackPricing(line,totalUnits,invoiceQuantity){
  const net=lineNet(line),printed=round3(numeric(line.printedFinalUnitPrice??line.finalUnitPrice)),header=text(line.finalUnitPriceHeader),printedValid=printed>0&&/TOTAL.*UNIDAD|UNIDAD.*TOTAL/.test(header),readGross=roundPeso(numeric(line.grossLineTotal??line.grossTotal??line.lineTotal??line.total)),components=net+roundPeso(numeric(line.taxLineTotal??line.vatLine??line.taxTotal))+roundPeso(numeric(line.additionalTaxLineTotal??line.additionalTaxLine??line.additionalTax))+roundPeso(numeric(line.otherLineCharges)),gross=Math.max(0,readGross||components),readUnit=round3(numeric(line.grossUnitPrice??line.unitPriceGross??line.unitPrice));
  if(printedValid&&totalUnits){const extended=roundPeso(printed*totalUnits);return{netLineTotal:net,allocatedVat:0,allocatedAdditionalTax:0,allocatedOtherCharges:0,grossLineTotal:extended,grossUnitPrice:printed,grossPackPrice:invoiceQuantity?roundPeso(extended/invoiceQuantity):0,readGrossLineTotal:readGross,readGrossUnitPrice:printed,printedFinalUnitPrice:printed,finalUnitPrice:printed,finalUnitPriceRaw:String(line.finalUnitPriceRaw||''),finalUnitPriceHeader:String(line.finalUnitPriceHeader||''),priceDifference:0,priceDifferencePct:0,priceSource:'printed-final-unit',priceVerified:true,taxAllocationMethod:'supplier-total-x-unidad'};}
  return{netLineTotal:net,allocatedVat:0,allocatedAdditionalTax:0,allocatedOtherCharges:0,grossLineTotal:gross,grossUnitPrice:gross&&totalUnits?roundPeso(gross/totalUnits):readUnit,grossPackPrice:gross&&invoiceQuantity?roundPeso(gross/invoiceQuantity):roundPeso(numeric(line.grossPackPrice)),readGrossLineTotal:readGross,readGrossUnitPrice:readUnit,printedFinalUnitPrice:0,priceDifference:0,priceDifferencePct:0,priceSource:gross?'document-line-fallback':'unavailable',priceVerified:false,taxAllocationMethod:'unverified'};
}

function allocateIntegerPool(total,weights){
  const target=Math.max(0,roundPeso(total)),safe=weights.map(value=>Math.max(0,numeric(value))),basis=safe.reduce((sum,value)=>sum+value,0);
  if(!target||!basis)return safe.map(()=>0);
  const exact=safe.map(value=>target*value/basis),assigned=exact.map(Math.floor),remainder=target-assigned.reduce((sum,value)=>sum+value,0),ranking=exact.map((value,index)=>({index,fraction:value-assigned[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(let index=0;index<remainder;index++)assigned[ranking[index%ranking.length].index]++;
  return assigned;
}

function invoiceTotals(raw={}){return{net:Math.max(0,roundPeso(raw.net)),freight:Math.max(0,roundPeso(raw.freight)),vat:Math.max(0,roundPeso(raw.vat??raw.tax)),additionalTax:Math.max(0,roundPeso(raw.additionalTax)),other:Math.max(0,roundPeso(raw.other)),total:Math.max(0,roundPeso(raw.total))}}

function allocateInvoicePricing(lines,rawTotals,warnings){return reconcileInvoicePricing(lines,rawTotals,warnings)}

function normalizeLine(line,products,aliasMap,warnings,index){
  const source=lineSource(line)||`Línea ${index+1}`,match=findProduct(line,products,aliasMap),product=match.product,orderPack=Math.max(1,numeric(product?.unitsPerOrderUnit)||packFromUnit(product?.unit)),invoiceQuantity=Math.max(0,numeric(line.invoiceQuantity??line.packageQty??line.quantity)),detectedPack=explicitPack(source);
  let invoicePack=detectedPack||Math.max(1,numeric(line.packSize)||1);
  if(isBaseUnitDescription(source))invoicePack=1;
  if(!detectedPack&&invoicePack>1&&/\b(BOTELLAS?|UNIDADES?|UNIDAD|UND|UNID)\b/.test(text(source)))invoicePack=1;
  const totalUnits=round3(invoiceQuantity*invoicePack),equivalent=product?round3(totalUnits/orderPack):0,orderedQty=Math.max(0,numeric(product?.orderedQty)),difference=product&&orderedQty>0?round3(equivalent-orderedQty):0;
  let quantityStatus='unverified';
  if(product&&orderedQty>0)quantityStatus=Math.abs(difference)<=.01?'exact':difference<0?'partial':'excess';
  const conversionSummary=product?conversionText({invoiceQuantity,invoicePack,totalUnits,orderPack,equivalent,product,orderedQty}):`${round3(invoiceQuantity)} × ${invoicePack} = ${totalUnits} unidades`;
  if(product&&orderedQty>0&&quantityStatus!=='exact')warnings.push(`${product.description}: la factura equivale a ${equivalent} ${unitLabel(product,orderPack)}, pero el pedido indica ${orderedQty}.`);
  const baseConfidence=Math.max(0,Math.min(1,Math.max(numeric(line.confidence??line.matchConfidence),match.score||0))),confidence=quantityStatus==='exact'?Math.max(baseConfidence,.88):quantityStatus==='unverified'?baseConfidence:Math.min(baseConfidence,.74),reason=[match.reason,line.matchReason,conversionSummary].filter(Boolean).join(' · '),description=product?.description||line.description||source,isFree=line.isFree===true,pricing=isFree?{netLineTotal:0,allocatedVat:0,allocatedAdditionalTax:0,allocatedOtherCharges:0,grossLineTotal:0,grossUnitPrice:0,grossPackPrice:0,readGrossLineTotal:roundPeso(numeric(line.grossLineTotal)),readGrossUnitPrice:roundPeso(numeric(line.grossUnitPrice)),priceDifference:0,priceDifferencePct:0,priceSource:'free',priceVerified:true,taxAllocationMethod:'free'}:fallbackPricing(line,totalUnits,invoiceQuantity);
  return{...line,...pricing,productId:product?.productId||'',matchedOrderProductId:product?.productId||'',suggestedProductId:product?.productId||line.suggestedProductId||'',description,packageQty:invoiceQuantity,invoiceQuantity,packSize:invoicePack,units:totalUnits,totalUnits,orderPackSize:orderPack,orderedFormatQty:equivalent,receivedOrderQty:equivalent,orderedQty,quantityDifference:difference,quantityStatus,conversionSummary,confidence,matchConfidence:confidence,matchMethod:product?match.method:(line.matchMethod||'unmatched'),matchReason:reason,matchCandidateScore:round3(match.score||0),matchSecondScore:round3(match.secondScore||0),matchEvidence:match.evidence||'',unitInterpretation:invoicePack===1?'base-units':'packaged-units',normalizationVersion:78,reconciliationEngine:'adaptive-price-matrix-v78'};
}

export function normalizeInvoiceAnalysis(analysis,context={}){
  if(!analysis||typeof analysis!=='object')return analysis;
  const invoice=analysis.invoice&&typeof analysis.invoice==='object'?analysis.invoice:{},sourceLines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[];
  if(!sourceLines.length)return analysis;
  const products=Array.isArray(context.products)?context.products.map(product=>({...product,description:String(product.description||product.catalogName||product.supplierProductName||''),unitsPerOrderUnit:Math.max(1,numeric(product.unitsPerOrderUnit)||packFromUnit(product.unit)),orderedQty:Math.max(0,numeric(product.orderedQty))})):[],aliasMap=new Map();
  for(const raw of Array.isArray(context.aliases)?context.aliases:[]){const productId=String(raw.productId||'');if(!productId||!raw.alias)continue;if(!aliasMap.has(productId))aliasMap.set(productId,[]);aliasMap.get(productId).push({alias:String(raw.alias),confidence:numeric(raw.confidence),usageCount:numeric(raw.usageCount)})}
  const warnings=[...(Array.isArray(invoice.warnings)?invoice.warnings:[]),...(Array.isArray(analysis.warnings)?analysis.warnings:[])],lines=sourceLines.map((line,index)=>normalizeLine(line,products,aliasMap,warnings,index)),pricingSummary=allocateInvoicePricing(lines,invoice.totals||{},warnings),uniqueWarnings=[...new Set(warnings.map(value=>String(value||'').trim()).filter(Boolean))],matched=lines.filter(line=>line.productId).length,exact=lines.filter(line=>line.quantityStatus==='exact').length,review=lines.filter(line=>['partial','excess'].includes(line.quantityStatus)).length,priceVerified=lines.filter(line=>line.priceVerified).length;
  return{...analysis,normalizationVersion:78,reconciliationEngine:'adaptive-price-matrix-v78',priceReconciliation:pricingSummary.method,invoice:{...invoice,lines,items:lines,warnings:uniqueWarnings,pricingSummary,matchSummary:{...(invoice.matchSummary||{}),matched,unmatched:lines.length-matched,exactQuantities:exact,quantityReview:review,priceVerified,total:lines.length,engine:'adaptive-price-matrix-v78'}},warnings:uniqueWarnings};
}
