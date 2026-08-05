const round3=value=>Math.round((Number(value)||0)*1000)/1000;
const text=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/×/g,'X').replace(/[^A-Z0-9.,()/%X]+/g,' ').replace(/\s+/g,' ').trim();
const numeric=value=>{if(typeof value==='number')return Number.isFinite(value)?value:0;let raw=String(value??'').trim().replace(/\s|\$/g,'');if(!raw)return 0;if(raw.includes(',')&&raw.includes('.'))raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');else if(raw.includes(','))raw=raw.replace(',','.');else if(/^\d{1,3}(?:\.\d{3})+$/.test(raw))raw=raw.replace(/\./g,'');const result=Number(raw);return Number.isFinite(result)?result:0};

function packFromUnit(unit){
  const label=text(unit);
  const explicit=label.match(/\((\d{1,3})\)/)||label.match(/(?:CAJA|PACK|DISPLAY)\s*(?:DE\s*)?(\d{1,3})\b/);
  if(explicit)return Math.max(1,Number(explicit[1])||1);
  if(/DISPLAY/.test(label))return 24;
  return 1;
}

function explicitPack(source){
  const label=text(source);
  const patterns=[
    /(?:^|\s)(\d{1,3})\s*X\s*\d{2,4}\s*(?:ML|CC)\b/,
    /(?:ML|CC)\s*X\s*0?(\d{1,3})\b/,
    /(?:^|\s)X\s*0?(\d{1,3})(?=\s|$)/,
    /(?:CAJA|PACK|DISPLAY)\s*(?:DE\s*)?(\d{1,3})\b/,
    /(?:C|CONT|CONTENIDO)\s*[\/.:-]?\s*(\d{1,3})(?=\s|$)/,
    /(?:CAJA|PACK)\s+(?:CON\s+)?(\d{1,3})\s+(?:BOTELLAS?|UNIDADES?|UND|UNID)\b/
  ];
  for(const pattern of patterns){const match=label.match(pattern);if(match)return Math.max(1,Number(match[1])||1)}
  return 0;
}

function isBaseUnitDescription(source){
  const label=text(source);
  return /\b(BOTELLAS?|UNIDADES?|UNIDAD|UND|UNID)\b/.test(label)&&!/\b(CAJA|PACK|DISPLAY)\b/.test(label)&&!explicitPack(label);
}

function words(value){return new Set(text(value).split(' ').filter(word=>word.length>2&&!/^(CAJA|PACK|DISPLAY|BOTELLA|BOTELLAS|UNIDAD|UNIDADES|UND|UNID|ML|CC|LITRO|LITROS)$/.test(word)&&!/^\d+$/.test(word)))}
function similarity(left,right){const a=words(left),b=words(right);if(!a.size||!b.size)return 0;let hit=0;for(const word of a)if(b.has(word))hit++;return hit/Math.max(a.size,b.size)}

function findProduct(line,products){
  const ids=[line.productId,line.matchedOrderProductId,line.suggestedProductId].map(String).filter(Boolean);
  for(const id of ids){const product=products.find(item=>String(item.productId)===id);if(product)return product}
  const source=line.sourceLine||line.descriptionOriginal||line.description||'';
  return products.map(product=>({product,score:similarity(source,product.description)})).sort((a,b)=>b.score-a.score)[0]?.score>=.55?products.map(product=>({product,score:similarity(source,product.description)})).sort((a,b)=>b.score-a.score)[0].product:null;
}

function unitLabel(product,pack){
  const raw=String(product?.unit||'').trim();
  if(raw)return raw;
  return pack>1?`CAJA (${pack})`:'UNIDAD';
}

function conversionText({invoiceQuantity,invoicePack,totalUnits,orderPack,equivalent,product,orderedQty}){
  const invoiceSide=invoicePack>1?`${round3(invoiceQuantity)} formato${invoiceQuantity===1?'':'s'} × ${invoicePack}`:`${round3(totalUnits)} unidad${totalUnits===1?'':'es'}`;
  const orderSide=`${round3(equivalent)} ${unitLabel(product,orderPack).toLowerCase()}`;
  const expected=orderedQty>0?` · pedido: ${round3(orderedQty)} ${unitLabel(product,orderPack).toLowerCase()}`:'';
  return `${invoiceSide} = ${orderSide}${expected}`;
}

function normalizeLine(line,products,warnings,index){
  const source=line.sourceLine||line.descriptionOriginal||line.description||`Línea ${index+1}`;
  const product=findProduct(line,products);
  const orderPack=Math.max(1,numeric(product?.unitsPerOrderUnit)||packFromUnit(product?.unit));
  const invoiceQuantity=Math.max(0,numeric(line.invoiceQuantity??line.packageQty??line.quantity));
  const detectedPack=explicitPack(source);
  let invoicePack=detectedPack||Math.max(1,numeric(line.packSize)||1);
  if(isBaseUnitDescription(source))invoicePack=1;
  if(!detectedPack&&invoicePack>1&&/\b(BOTELLAS?|UNIDADES?|UNIDAD|UND|UNID)\b/.test(text(source)))invoicePack=1;
  const totalUnits=round3(invoiceQuantity*invoicePack);
  const equivalent=product?round3(totalUnits/orderPack):0;
  const orderedQty=Math.max(0,numeric(product?.orderedQty));
  const difference=product&&orderedQty>0?round3(equivalent-orderedQty):0;
  let quantityStatus='unverified';
  if(product&&orderedQty>0)quantityStatus=Math.abs(difference)<=.01?'exact':difference<0?'partial':'excess';
  const conversionSummary=product?conversionText({invoiceQuantity,invoicePack,totalUnits,orderPack,equivalent,product,orderedQty}):`${round3(invoiceQuantity)} × ${invoicePack} = ${totalUnits} unidades`;
  if(product&&orderedQty>0&&quantityStatus!=='exact')warnings.push(`${product.description}: la factura equivale a ${equivalent} ${unitLabel(product,orderPack)}, pero el pedido indica ${orderedQty}.`);
  const baseConfidence=Math.max(0,Math.min(1,numeric(line.confidence??line.matchConfidence)));
  const confidence=quantityStatus==='exact'?Math.max(baseConfidence,.86):quantityStatus==='unverified'?baseConfidence:Math.min(baseConfidence,.69);
  const reason=[line.matchReason&&String(line.matchReason).startsWith('Coincidencia')?line.matchReason:'Coincidencia revisada contra el pedido',conversionSummary].filter(Boolean).join(' · ');
  return{
    ...line,
    productId:product?.productId||line.productId||line.matchedOrderProductId||'',
    matchedOrderProductId:product?.productId||line.matchedOrderProductId||'',
    description:product?.description||line.description||source,
    packageQty:invoiceQuantity,
    invoiceQuantity,
    packSize:invoicePack,
    units:totalUnits,
    totalUnits,
    orderPackSize:orderPack,
    orderedFormatQty:equivalent,
    receivedOrderQty:equivalent,
    orderedQty,
    quantityDifference:difference,
    quantityStatus,
    conversionSummary,
    confidence,
    matchConfidence:confidence,
    matchReason:reason,
    unitInterpretation:invoicePack===1?'base-units':'packaged-units',
    normalizationVersion:26
  };
}

export function normalizeInvoiceAnalysis(analysis,context={}){
  if(!analysis||typeof analysis!=='object')return analysis;
  const invoice=analysis.invoice&&typeof analysis.invoice==='object'?analysis.invoice:{};
  const sourceLines=Array.isArray(invoice.lines)?invoice.lines:Array.isArray(invoice.items)?invoice.items:[];
  if(!sourceLines.length)return analysis;
  const products=Array.isArray(context.products)?context.products.map(product=>({...product,unitsPerOrderUnit:Math.max(1,numeric(product.unitsPerOrderUnit)||packFromUnit(product.unit)),orderedQty:Math.max(0,numeric(product.orderedQty))})):[];
  const warnings=[...(Array.isArray(invoice.warnings)?invoice.warnings:[]),...(Array.isArray(analysis.warnings)?analysis.warnings:[])];
  const lines=sourceLines.map((line,index)=>normalizeLine(line,products,warnings,index));
  const uniqueWarnings=[...new Set(warnings.map(value=>String(value||'').trim()).filter(Boolean))];
  const matched=lines.filter(line=>line.productId).length;
  const exact=lines.filter(line=>line.quantityStatus==='exact').length;
  const review=lines.filter(line=>['partial','excess'].includes(line.quantityStatus)).length;
  return{
    ...analysis,
    normalizationVersion:26,
    invoice:{...invoice,lines,items:lines,warnings:uniqueWarnings,matchSummary:{...(invoice.matchSummary||{}),matched,exactQuantities:exact,quantityReview:review,total:lines.length}},
    warnings:uniqueWarnings
  };
}
