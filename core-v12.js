(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PedidosCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAX_DEFAULT=1.19;
  const STOP=new Set('DE DEL LA EL LOS LAS Y EN CON SIN PARA POR BOTELLA BOTELLAS CAJA CAJAS UNIDAD UNIDADES UND UN SKU CODIGO PRODUCTO DESCRIPCION TOTAL NETO IVA PRECIO UNITARIO VALOR'.split(' '));

  function normalizeText(value){
    return String(value??'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/([A-Za-zÁÉÍÓÚÑ])([0-9])/g,'$1 $2')
      .replace(/([0-9])([A-Za-zÁÉÍÓÚÑ])/g,'$1 $2')
      .toUpperCase().replace(/[^A-Z0-9$%.,=×Xº°#-]+/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  function cleanDescription(value){
    return normalizeText(value)
      .replace(/\b\d{2,4}\s*(?:CC|ML|LTS?|LT|LITROS?)\b/g,' ')
      .replace(/\bX\s*\d{1,3}\b/g,' ')
      .replace(/\b(?:BOTELLAS?|CAJAS?|UNIDADES?|UND)\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  function tokens(value){
    return cleanDescription(value).split(' ').filter(token=>token.length>1&&!STOP.has(token)&&!/^[0-9.,]+$/.test(token));
  }

  function numberFrom(value){
    let raw=String(value??'').trim().replace(/\s/g,'').replace(/\$/g,'');
    if(!raw)return 0;
    raw=raw.replace(/[^0-9,.-]/g,'');
    if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw))return Number(raw.replace(/\./g,'').replace(',','.'))||0;
    if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw))return Number(raw.replace(/,/g,''))||0;
    if(raw.includes(',')&&!raw.includes('.'))raw=raw.replace(',','.');
    else if(raw.includes(',')&&raw.includes('.')){
      if(raw.lastIndexOf(',')>raw.lastIndexOf('.'))raw=raw.replace(/\./g,'').replace(',','.');
      else raw=raw.replace(/,/g,'');
    }
    return Number(raw)||0;
  }

  function parsePackFromText(value){
    const text=normalizeText(value);
    const patterns=[
      /X\s*(\d{1,3})(?:\s|$|=)/,
      /(?:CAJA|PACK|DISPLAY)\s*(?:DE\s*)?(\d{1,3})/,
      /(\d{1,3})\s*(?:UN|UND|UNIDADES|BOTELLAS)(?:\s|$)/
    ];
    for(const pattern of patterns){
      const match=text.match(pattern);if(match){const size=Number(match[1]);if(size>=2&&size<=100)return size}
    }
    return 1;
  }

  function packFromUnit(unit){
    const match=String(unit||'').match(/\((\d+)\)/);return match?Math.max(1,Number(match[1])||1):1;
  }

  function inferCategory(description=''){
    const d=normalizeText(description);
    if(d.startsWith('GIN '))return 'GIN';
    if(d.startsWith('LICOR '))return 'LICORES';
    if(d.startsWith('PISCO '))return 'PISCO';
    if(d.startsWith('RON '))return 'RON';
    if(d.startsWith('TEQUILA '))return 'TEQUILA';
    if(d.startsWith('VOD'))return 'VODKA';
    if(d.startsWith('WHIS'))return 'WHISKY';
    if(d.startsWith('VINO ')||d.startsWith('CLOSS '))return 'VINOS';
    if(d.startsWith('ESP '))return 'ESPUMANTES';
    if(d.startsWith('CERV '))return 'CERVEZAS';
    if(d.startsWith('FENTIMANS '))return 'MIXERS';
    if(d.startsWith('BARRIL '))return 'BARRILES';
    if(d.startsWith('TANQUE '))return 'INSUMOS';
    if(d.startsWith('PULPA ')||d.includes('CONGELAD'))return 'PULPAS Y CONGELADOS';
    if(d.startsWith('CREMA')||d.startsWith('AZUCAR'))return 'ABARROTES';
    if(/^(LATA |REDBULL |PORVENIR |JUGO |TONICA |AGUA )/.test(d))return 'BEBIDAS SIN ALCOHOL';
    return 'OTROS';
  }

  function similarity(a,b){
    const left=tokens(a),right=tokens(b);if(!left.length||!right.length)return 0;
    const rightSet=new Set(right);let hits=0,weighted=0;
    for(const token of left){
      const exact=rightSet.has(token);
      const partial=!exact&&right.some(other=>other.length>=4&&token.length>=4&&(other.includes(token)||token.includes(other)));
      if(exact){hits+=1;weighted+=token.length}
      else if(partial){hits+=.65;weighted+=token.length*.55}
    }
    const coverage=hits/left.length;
    const weight=weighted/Math.max(1,left.reduce((sum,token)=>sum+token.length,0));
    const compactA=cleanDescription(a).replace(/\s/g,''),compactB=cleanDescription(b).replace(/\s/g,'');
    const contains=compactA.length>4&&(compactB.includes(compactA)||compactA.includes(compactB))?.25:0;
    return Math.min(1,coverage*.62+weight*.38+contains);
  }

  function extractInvoiceNumber(text){
    const source=normalizeText(text);
    const patterns=[
      /FACTURA(?:\s+ELECTRONICA)?\s*(?:N|NRO|NUMERO|NO|º|°|#)?\s*[:.-]?\s*(\d{3,12})/,
      /(?:FOLIO|NRO|NUMERO)\s*[:.-]?\s*(\d{3,12})/,
      /(?:N|NO|º|°|#)\s*[:.-]?\s*(\d{4,12})/
    ];
    for(const pattern of patterns){const match=source.match(pattern);if(match)return match[1]}
    return '';
  }

  function findMoneyNearLabel(text,label){
    const lines=String(text||'').split(/\r?\n/).map(line=>normalizeText(line));
    const pattern=new RegExp(`\\b${label}\\b`);
    for(let index=lines.length-1;index>=0;index--){
      if(!pattern.test(lines[index]))continue;
      const values=[...lines[index].matchAll(/\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\$?\s*\d{3,}/g)].map(match=>numberFrom(match[0])).filter(Boolean);
      if(values.length)return values.at(-1);
    }
    return 0;
  }

  function extractTotals(text){
    const net=findMoneyNearLabel(text,'(?:TOTAL\s+)?NETO|SUBTOTAL');
    const tax=findMoneyNearLabel(text,'IVA(?:\s+19%?)?');
    const total=findMoneyNearLabel(text,'TOTAL(?:\s+A\s+PAGAR)?');
    let factor=TAX_DEFAULT;
    if(net>0&&total>=net){const ratio=total/net;if(ratio>=1.05&&ratio<=1.35)factor=ratio}
    else if(net>0&&tax>0){const ratio=(net+tax)/net;if(ratio>=1.05&&ratio<=1.35)factor=ratio}
    return{net,tax,total,taxFactor:factor};
  }

  function numericCandidates(line){
    const results=[];
    const regex=/\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\$?\s*\d+(?:[.,]\d+)?/g;
    for(const match of String(line||'').matchAll(regex))results.push({raw:match[0],value:numberFrom(match[0]),index:match.index||0});
    return results.filter(item=>Number.isFinite(item.value));
  }

  function parseLine(line,taxFactor=TAX_DEFAULT){
    const normalized=normalizeText(line),packSize=parsePackFromText(normalized);
    const explicit=normalized.match(/=\s*(\d+(?:[.,]\d+)?)/);
    const values=numericCandidates(line);
    const specs=[];
    for(const match of normalized.matchAll(/\b(\d{2,4})\s*(?:CC|ML|LTS?|LT|LITROS?)\b/g))specs.push(Number(match[1]));
    if(packSize>1)specs.push(packSize);
    let packageQty=explicit?numberFrom(explicit[1]):0;
    if(!packageQty){
      const small=values.find(item=>item.value>0&&item.value<=100&&Number.isInteger(item.value)&&!specs.includes(item.value));
      if(small)packageQty=small.value;
    }
    if(!packageQty)packageQty=1;
    const moneyValues=values.filter(item=>item.value>=100&&!specs.includes(item.value));
    let netPackPrice=0,netLineTotal=0;
    if(moneyValues.length>=2){
      netLineTotal=moneyValues.at(-1).value;
      const possibleUnit=moneyValues.at(-2).value;
      if(Math.abs(possibleUnit*packageQty-netLineTotal)<=Math.max(20,netLineTotal*.12))netPackPrice=possibleUnit;
      else netPackPrice=netLineTotal/packageQty;
    }else if(moneyValues.length===1){
      netLineTotal=moneyValues[0].value;
      netPackPrice=netLineTotal/packageQty;
    }
    const units=Math.max(1,packageQty*packSize);
    const grossLineTotal=netLineTotal?Math.round(netLineTotal*taxFactor):0;
    const grossPackPrice=netPackPrice?Math.round(netPackPrice*taxFactor):0;
    const grossUnitPrice=grossLineTotal?Math.round(grossLineTotal/units):(grossPackPrice?Math.round(grossPackPrice/packSize):0);
    return{packageQty,packSize,units,netPackPrice:Math.round(netPackPrice||0),netLineTotal:Math.round(netLineTotal||0),grossPackPrice,grossLineTotal,grossUnitPrice};
  }

  function candidateLines(text){
    const raw=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line.length>2);
    const result=[];
    for(let index=0;index<raw.length;index++){
      result.push(raw[index]);
      if(raw[index+1])result.push(`${raw[index]} ${raw[index+1]}`);
    }
    return result;
  }

  function matchInvoice(text,products){
    const totals=extractTotals(text),lines=candidateLines(text),matches=[];
    for(const line of lines){
      if(!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(line))continue;
      let best=null,bestScore=0;
      for(const product of products||[]){
        const score=similarity(product.description,line);
        if(score>bestScore){best=product;bestScore=score}
      }
      if(!best||bestScore<.38)continue;
      const parsed=parseLine(line,totals.taxFactor);
      const orderPack=packFromUnit(best.unit);
      const receivedOrderQty=orderPack>1?parsed.units/orderPack:parsed.units;
      matches.push({
        id:`m-${matches.length+1}`,
        sourceLine:line,
        productId:best.productId||best.id,
        description:best.description,
        confidence:Number(bestScore.toFixed(3)),
        ...parsed,
        receivedOrderQty:Number(receivedOrderQty.toFixed(3))
      });
    }
    const bestByProduct=new Map();
    for(const match of matches){
      const current=bestByProduct.get(match.productId);
      if(!current||match.confidence>current.confidence||(match.grossLineTotal&&!current.grossLineTotal))bestByProduct.set(match.productId,match);
    }
    return{invoiceNumber:extractInvoiceNumber(text),totals,lines:[...bestByProduct.values()]};
  }

  function sanitizePrefix(value){
    const clean=normalizeText(value).replace(/[^A-Z0-9]/g,'').slice(0,5);return clean||'PDD';
  }

  function localDateKey(date=new Date()){
    const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return`${year}${month}${day}`;
  }

  function allocateFolio(existingFolios,prefix,date=new Date()){
    const safePrefix=sanitizePrefix(prefix),dateKey=localDateKey(date),short=dateKey.slice(2);
    const pattern=new RegExp(`^${safePrefix}-${short}-(\\d{3})$`);
    const used=new Set((existingFolios||[]).map(value=>String(value).match(pattern)).filter(Boolean).map(match=>Number(match[1])));
    let sequence=1;while(used.has(sequence))sequence++;
    return`${safePrefix}-${short}-${String(sequence).padStart(3,'0')}`;
  }

  function invoiceDisplayName(provider,invoiceNumber,originalName='factura'){
    const extension=(String(originalName).match(/\.[a-z0-9]{2,5}$/i)||[''])[0].toLowerCase()||'.jpg';
    const safeProvider=normalizeText(provider).replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'PROVEEDOR';
    const safeNumber=String(invoiceNumber||'SIN_NUMERO').replace(/[^A-Za-z0-9-]/g,'');
    return`${safeProvider}_FACTURA_${safeNumber}${extension}`;
  }

  return{TAX_DEFAULT,normalizeText,cleanDescription,tokens,numberFrom,parsePackFromText,packFromUnit,inferCategory,similarity,extractInvoiceNumber,extractTotals,parseLine,matchInvoice,sanitizePrefix,localDateKey,allocateFolio,invoiceDisplayName};
});
