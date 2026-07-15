(()=>{
  const normalize=text=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9$%.,]+/g,' ').replace(/\s+/g,' ').trim();
  const stop=new Set('DE DEL LA EL LOS LAS Y EN CON SIN BOTELLA BOTELLAS CAJA CAJAS UNIDAD UNIDADES UND UN SKU CODIGO PRODUCTO DESCRIPCION TOTAL NETO IVA'.split(' '));
  const tokens=text=>normalize(text).split(' ').filter(x=>x.length>1&&!stop.has(x)&&!/^[0-9.,]+$/.test(x));
  const number=value=>{
    const s=String(value??'').trim().replace(/\s/g,'');
    if(!s)return 0;
    if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))return Number(s.replace(/\./g,'').replace(',','.'));
    return Number(s.replace(/[^0-9,.-]/g,'').replace(',','.'))||0;
  };
  const load=(src,id)=>new Promise((resolve,reject)=>{
    if(document.getElementById(id))return resolve();
    const script=document.createElement('script');script.id=id;script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
  });
  async function ensureLibraries(){
    if(!window.Tesseract)await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','tesseract-v6');
    if(!window.pdfjsLib){
      await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjs-v6');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }
  async function imageToCanvas(file){
    const url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{const i=new Image;i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
      const max=2200,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
    }finally{URL.revokeObjectURL(url)}
  }
  async function ocr(canvas,onProgress){
    const result=await Tesseract.recognize(canvas,'spa',{logger:message=>{
      if(message.status==='recognizing text')onProgress?.('Reconociendo texto',10+message.progress*85);
    }});
    return result.data.text||'';
  }
  async function readPdf(file,onProgress){
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let text='';
    for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,6);pageNumber++){
      onProgress?.(`Leyendo página ${pageNumber} de ${pdf.numPages}`,pageNumber/pdf.numPages*35);
      const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),plain=content.items.map(item=>item.str).join(' ');
      if(plain.replace(/\s/g,'').length>80){text+='\n'+plain;continue}
      const viewport=page.getViewport({scale:1.7}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;text+='\n'+await ocr(canvas,onProgress);
    }
    return text;
  }
  async function read(file,onProgress){
    await ensureLibraries();onProgress?.(`Preparando ${file.name}`,3);
    if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))return readPdf(file,onProgress);
    return ocr(await imageToCanvas(file),onProgress);
  }
  function score(description,line){
    const wanted=tokens(description),available=new Set(tokens(line));if(!wanted.length)return 0;
    let hits=0;for(const token of wanted)if(available.has(token)||[...available].some(x=>x.includes(token)||token.includes(x)))hits++;
    let value=hits/wanted.length;if(normalize(line).includes(normalize(description)))value+=.55;return value;
  }
  function parseNumbers(line,description,orderedQty){
    const specifications=(normalize(description).match(/\d+(?:[.,]\d+)?/g)||[]).map(number);
    const found=[...String(line).matchAll(/\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d+)?|\$?\s*\d+(?:,\d+)?/g)].map(match=>({raw:match[0],value:number(match[0])})).filter(x=>x.value>0);
    const useful=found.filter(x=>!specifications.some(spec=>Math.abs(spec-x.value)<.001));
    const quantities=useful.filter(x=>Number.isInteger(x.value)&&x.value<=100),prices=useful.filter(x=>x.value>=100);
    let qty=quantities[0]?.value||0,unitPrice=0;
    if(prices.length>=2&&qty){
      const total=prices.at(-1).value,previous=prices.at(-2).value;
      unitPrice=Math.abs(previous*qty-total)<=Math.max(5,total*.08)?previous:total/qty;
    }else if(prices.length)unitPrice=prices.at(-1).value;
    if(!qty&&Number(orderedQty)===1&&prices.length)qty=1;
    return{qty,unitPrice:Math.round(unitPrice||0)};
  }
  function match(text,rows){
    const raw=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),lines=[];
    for(let i=0;i<raw.length;i++){lines.push(raw[i]);if(raw[i+1])lines.push(raw[i]+' '+raw[i+1])}
    return rows.map(row=>{
      let best='',confidence=0;
      for(const line of lines){const value=score(row.description,line);if(value>confidence){confidence=value;best=line}}
      if(confidence<.38)return null;
      const parsed=parseNumbers(best,row.description,row.orderedQty);
      return{rowId:row.id,description:row.description,line:best,qty:parsed.qty,unitPrice:parsed.unitPrice,confidence:Math.min(1,confidence)};
    }).filter(Boolean);
  }
  window.InvoiceReaderV6={read,match,number,normalize};
})();
