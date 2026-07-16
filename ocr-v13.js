(()=>{
  'use strict';
  const CDN=[
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
  ];
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const money=value=>{
    let s=String(value??'').replace(/\s/g,'').replace(/[$]/g,'');
    if(!s)return 0;
    if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,'');
    else s=s.replace(/[^0-9,.-]/g,'').replace(',','.');
    return Number(s)||0;
  };
  const stop=new Set('DE DEL LA EL LOS LAS Y EN CON SIN PARA POR BOTELLA BOTELLAS CAJA CAJAS UNIDAD UNIDADES UND SKU CODIGO PRODUCTO DESCRIPCION LICOR PISCO RON GIN VODKA WHISKY TEQUILA VINO CERVEZA ML CC LT LTS'.split(' '));
  function tokens(value){return norm(value).split(' ').filter(token=>token.length>1&&!stop.has(token)&&!/^(?:19|20)\d{2}$/.test(token))}
  function loadScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(window.Tesseract)return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.src=src;script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo descargar el lector OCR'));document.head.appendChild(script)})}
  async function ensureTesseract(){if(window.Tesseract)return window.Tesseract;let last;for(const src of CDN){try{await loadScript(src);if(window.Tesseract)return window.Tesseract}catch(error){last=error}}throw last||new Error('El lector de facturas necesita conexión la primera vez')}
  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo abrir la fotografía'));img.src=src})}
  async function preprocess(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await loadImage(url),max=2600,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height),pixels=data.data;
      let min=255,maxV=0;for(let i=0;i<pixels.length;i+=4){const g=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];min=Math.min(min,g);maxV=Math.max(maxV,g)}const range=Math.max(30,maxV-min);
      for(let i=0;i<pixels.length;i+=4){let g=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];g=Math.max(0,Math.min(255,(g-min)*255/range));g=g<168?Math.max(0,g*.68):Math.min(255,185+(g-168)*1.25);pixels[i]=pixels[i+1]=pixels[i+2]=g;pixels[i+3]=255}
      ctx.putImageData(data,0,0);return canvas;
    }finally{URL.revokeObjectURL(url)}
  }
  async function recognize(file,onProgress=()=>{}){
    if(!file.type.startsWith('image/'))throw new Error('Para lectura automática usa una fotografía o imagen; el PDF puede guardarse y revisarse manualmente');
    const Tesseract=await ensureTesseract(),canvas=await preprocess(file);onProgress('Preparando imagen',5);
    const options={logger:m=>{if(m.status==='recognizing text')onProgress('Reconociendo texto',Math.round(10+m.progress*85));else if(m.status)onProgress(m.status,8)}};
    const result=await Tesseract.recognize(canvas,'spa+eng',options);onProgress('Lectura terminada',100);return result?.data?.text||'';
  }
  function invoiceNumber(text){
    const source=norm(text),patterns=[/FACTURA(?: ELECTRONICA)?\s*(?:N|NO|NRO|NUMERO|FOLIO)?\s*(\d{3,12})/,/FOLIO\s*(?:N|NO)?\s*(\d{3,12})/,/NRO\s*FACTURA\s*(\d{3,12})/];
    for(const pattern of patterns){const match=source.match(pattern);if(match)return match[1]}return 'SIN-NUMERO';
  }
  function findAmount(text,label){
    const lines=String(text||'').split(/\n+/);for(const line of lines){if(norm(line).includes(label)){const nums=extractNumbers(line).filter(n=>n.value>=1);if(nums.length)return nums.at(-1).value}}return 0;
  }
  function totals(text){
    const net=findAmount(text,'MONTO NETO')||findAmount(text,'NETO'),iva=findAmount(text,'IVA 19')||findAmount(text,'IVA'),total=findAmount(text,'TOTAL');let factor=1.19;if(net&&total&&total/net>1.05&&total/net<1.4)factor=total/net;else if(net&&iva&&iva/net>.1&&iva/net<.3)factor=1+iva/net;return{net,iva,total,taxFactor:factor,detailPricesNet:!!(net&&iva)}
  }
  function extractNumbers(line){
    const pattern=/\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d+)?|\$?\s*\d+(?:[.,]\d+)?/g;return[...String(line).matchAll(pattern)].map(match=>({raw:match[0],value:money(match[0]),index:match.index||0})).filter(item=>Number.isFinite(item.value));
  }
  function packInfo(line){
    const n=norm(line),sizeMatch=n.match(/(?:X|POR)\s*(\d{1,3})\b/)||n.match(/\b(\d{1,3})\s*(?:UN|UND|BOTELLAS)\b/),packSize=sizeMatch?Math.max(1,Number(sizeMatch[1])):1;
    const explicit=n.match(/(?:=|CANT(?:IDAD)?\s*)\s*(\d+(?:[.,]\d+)?)/),qty=explicit?money(explicit[1]):0;
    return{packSize,explicitPackQty:qty};
  }
  function productScore(product,line){
    const pTokens=tokens(product.description),lTokens=tokens(line),set=new Set(lTokens);if(!pTokens.length)return 0;let hits=0,partial=0;
    for(const token of pTokens){if(set.has(token))hits++;else if(lTokens.some(other=>other.length>=3&&(other.includes(token)||token.includes(other))))partial+=.55}
    let score=(hits+partial)/pTokens.length;const compactProduct=norm(product.description).replace(/\s/g,''),compactLine=norm(line).replace(/\s/g,'');if(compactLine.includes(compactProduct)||compactProduct.includes(compactLine))score+=.55;
    const productDigits=(norm(product.description).match(/\d+/g)||[]).filter(x=>x.length<=4),lineDigits=new Set(norm(line).match(/\d+/g)||[]);if(productDigits.length){const digitHits=productDigits.filter(x=>lineDigits.has(x)).length;score+=digitHits/productDigits.length*.22}
    return score;
  }
  function likelyItemLine(line){const n=norm(line);if(n.length<4)return false;if(/^(TOTAL|NETO|IVA|DESCUENTO|SUBTOTAL|FORMA DE PAGO|RUT|GIRO|DIRECCION|TELEFONO|FECHA)/.test(n))return false;return extractNumbers(line).some(x=>x.value>0)}
  function inferLineValues(line,matchedProduct,invoiceTotals){
    const nums=extractNumbers(line),pack=packInfo(line),description=matchedProduct?.description||'',descriptionNums=(norm(description).match(/\d+/g)||[]).map(Number),excluded=new Set(descriptionNums.concat([pack.packSize]));
    const useful=nums.filter(item=>!excluded.has(Math.round(item.value))||item.value>100);
    const small=useful.filter(item=>item.value>0&&item.value<=200&&Number.isInteger(item.value));const prices=useful.filter(item=>item.value>=100);
    let packQty=pack.explicitPackQty||small.find(item=>item.value!==pack.packSize)?.value||1;packQty=Math.max(.001,packQty);
    let lineNet=0,unitNet=0;if(prices.length>=2){const last=prices.at(-1).value,prev=prices.at(-2).value;if(Math.abs(prev*packQty-last)<=Math.max(20,last*.12)){unitNet=prev;lineNet=last}else{lineNet=Math.max(...prices.map(x=>x.value));unitNet=lineNet/packQty}}else if(prices.length===1){lineNet=prices[0].value;unitNet=lineNet/packQty}
    const unitsReceived=packQty*Math.max(1,pack.packSize),factor=invoiceTotals.detailPricesNet?invoiceTotals.taxFactor:1,grossLine=Math.round(lineNet*factor),grossUnit=unitsReceived?Math.round(grossLine/unitsReceived):0;
    return{packQty,packSize:Math.max(1,pack.packSize),unitsReceived,lineNet:Math.round(lineNet),grossLine,grossUnit,unitNet:Math.round(unitNet)};
  }
  function parse(text,products,provider){
    const invoiceTotals=totals(text),raw=String(text||'').split(/\n+/).map(line=>line.trim()).filter(Boolean),lines=[];
    for(let i=0;i<raw.length;i++){lines.push(raw[i]);if(raw[i+1]&&raw[i].length<100)lines.push(raw[i]+' '+raw[i+1])}
    const providerProducts=products.filter(product=>!provider||norm(product.provider)===norm(provider));const candidates=[];
    for(const line of lines){if(!likelyItemLine(line))continue;let best=null,confidence=0;for(const product of providerProducts){const score=productScore(product,line);if(score>confidence){best=product;confidence=score}}if(confidence<.2)continue;const values=inferLineValues(line,best,invoiceTotals);candidates.push({sourceLine:line,productId:best?.id||'',productName:best?.description||'',confidence:Math.min(1,confidence),...values})}
    const unique=[];const seen=new Set();for(const row of candidates.sort((a,b)=>b.confidence-a.confidence)){const key=`${row.productId}|${norm(row.sourceLine).slice(0,80)}`;if(seen.has(key))continue;seen.add(key);unique.push(row)}
    return{invoiceNumber:invoiceNumber(text),...invoiceTotals,lines:unique.sort((a,b)=>a.sourceLine.localeCompare(b.sourceLine,'es'))};
  }
  function recomputeLine(line,taxFactor=1.19,detailPricesNet=true){const packQty=Math.max(0,money(line.packQty)),packSize=Math.max(1,Math.round(money(line.packSize)||1)),unitsReceived=packQty*packSize,lineNet=Math.max(0,money(line.lineNet)),grossLine=Math.round(lineNet*(detailPricesNet?taxFactor:1)),grossUnit=unitsReceived?Math.round(grossLine/unitsReceived):0;return{...line,packQty,packSize,unitsReceived,lineNet,grossLine,grossUnit}}
  window.InvoiceOCR={recognize,parse,recomputeLine,invoiceNumber,totals,money,norm};
})();
