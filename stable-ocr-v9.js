(()=>{
  const NORMALIZE=value=>String(value??'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9$%.,/+-]+/g,' ')
    .replace(/\s+/g,' ').trim();

  const STOP=new Set(`DE DEL LA EL LOS LAS Y EN CON SIN PARA POR BOTELLA BOTELLAS CAJA CAJAS
    UNIDAD UNIDADES UND UN SKU CODIGO PRODUCTO DESCRIPCION TOTAL NETO IVA SUBTOTAL PRECIO VALOR
    CANTIDAD CANT IMPORTE DSCTO DESCUENTO`.split(/\s+/));

  const number=value=>{
    let text=String(value??'').trim().replace(/\s/g,'').replace(/\$/g,'');
    if(!text)return 0;
    if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text))text=text.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text))text=text.replace(/,/g,'');
    else text=text.replace(/[^0-9,.-]/g,'').replace(',','.');
    const parsed=Number(text);
    return Number.isFinite(parsed)?parsed:0;
  };

  const tokens=value=>NORMALIZE(value).split(' ').filter(token=>
    token.length>1&&!STOP.has(token)&&!/^[0-9.,/+%-]+$/.test(token)
  );

  const loadScript=(src,id)=>new Promise((resolve,reject)=>{
    if(document.getElementById(id))return resolve();
    const script=document.createElement('script');
    script.id=id;script.src=src;script.async=true;
    script.onload=resolve;script.onerror=()=>reject(new Error(`No se pudo cargar ${id}`));
    document.head.appendChild(script);
  });

  async function ensureLibraries(){
    if(!window.Tesseract){
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','stable-tesseract');
    }
    if(!window.pdfjsLib){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','stable-pdfjs');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  async function imageCanvas(file){
    const url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{
        const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=url;
      });
      const longest=Math.max(image.naturalWidth,image.naturalHeight);
      const scale=Math.min(2.2,2800/Math.max(1,longest));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);

      const data=context.getImageData(0,0,canvas.width,canvas.height);
      const pixels=data.data;
      for(let index=0;index<pixels.length;index+=4){
        const gray=pixels[index]*.299+pixels[index+1]*.587+pixels[index+2]*.114;
        const contrasted=Math.max(0,Math.min(255,(gray-128)*1.35+128));
        pixels[index]=pixels[index+1]=pixels[index+2]=contrasted;
      }
      context.putImageData(data,0,0);
      return canvas;
    }finally{URL.revokeObjectURL(url)}
  }

  async function recognize(canvas,onProgress){
    const result=await window.Tesseract.recognize(canvas,'spa',{
      logger:message=>{
        if(message.status==='recognizing text')onProgress?.('Reconociendo texto',15+message.progress*80);
        else if(message.status==='loading language traineddata')onProgress?.('Cargando idioma',8);
      }
    });
    return result?.data?.text||'';
  }

  async function readPdf(file,onProgress){
    const documentPdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const parts=[];
    for(let pageNumber=1;pageNumber<=Math.min(documentPdf.numPages,8);pageNumber++){
      onProgress?.(`Leyendo página ${pageNumber} de ${documentPdf.numPages}`,pageNumber/documentPdf.numPages*35);
      const page=await documentPdf.getPage(pageNumber);
      const textContent=await page.getTextContent();
      const plain=textContent.items.map(item=>item.str).join(' ').trim();
      if(plain.replace(/\s/g,'').length>100){parts.push(plain);continue;}
      const viewport=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      parts.push(await recognize(canvas,onProgress));
    }
    return parts.join('\n');
  }

  async function read(file,onProgress){
    await ensureLibraries();
    onProgress?.(`Preparando ${file.name}`,3);
    if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))return readPdf(file,onProgress);
    return recognize(await imageCanvas(file),onProgress);
  }

  const windows=text=>{
    const raw=String(text||'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
    const result=[];
    for(let index=0;index<raw.length;index++){
      result.push(raw[index]);
      if(raw[index+1])result.push(`${raw[index]} ${raw[index+1]}`);
      if(raw[index+2])result.push(`${raw[index]} ${raw[index+1]} ${raw[index+2]}`);
    }
    return result;
  };

  function similarity(description,line){
    const desired=tokens(description),actual=tokens(line);
    if(!desired.length||!actual.length)return 0;
    let hits=0;
    for(const token of desired){
      if(actual.some(candidate=>candidate===token||candidate.includes(token)||token.includes(candidate)))hits++;
    }
    const coverage=hits/desired.length;
    const precision=hits/Math.max(actual.length,desired.length);
    const direct=NORMALIZE(line).includes(NORMALIZE(description))?.55:0;
    return coverage*.72+precision*.28+direct;
  }

  function parseLine(line,description,orderedQty){
    const descriptionNumbers=(NORMALIZE(description).match(/\d+(?:[.,]\d+)?/g)||[]).map(number);
    const occurrences=[...String(line).matchAll(/\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\$?\s*\d+(?:[.,]\d+)?/g)]
      .map(match=>({raw:match[0],value:number(match[0]),index:match.index||0}))
      .filter(item=>item.value>0&&!descriptionNumbers.some(spec=>Math.abs(spec-item.value)<.001));

    const plausibleQty=occurrences.filter(item=>Number.isInteger(item.value)&&item.value<=Math.max(200,Number(orderedQty||0)*12));
    const monetary=occurrences.filter(item=>item.value>=100);
    let qty=plausibleQty[0]?.value||0;
    if(!qty&&Number(orderedQty)===1&&monetary.length)qty=1;

    let unitPrice=0;
    if(qty&&monetary.length>=2){
      const total=monetary.at(-1).value;
      const candidate=monetary.at(-2).value;
      if(Math.abs(candidate*qty-total)<=Math.max(20,total*.1))unitPrice=candidate;
      else unitPrice=Math.round(total/qty);
    }else if(monetary.length){
      unitPrice=monetary.at(-1).value;
      if(qty>1&&unitPrice>1000)unitPrice=Math.round(unitPrice/qty);
    }
    return{qty,unitPrice:Math.round(unitPrice||0)};
  }

  function match(text,rows){
    const candidates=windows(text);
    return rows.map(row=>{
      let bestLine='',confidence=0;
      for(const line of candidates){
        const score=similarity(row.description,line);
        if(score>confidence){confidence=score;bestLine=line;}
      }
      if(confidence<.34)return null;
      const parsed=parseLine(bestLine,row.description,row.orderedQty);
      return{
        rowId:row.id,
        description:row.description,
        line:bestLine,
        qty:parsed.qty,
        unitPrice:parsed.unitPrice,
        confidence:Math.min(1,confidence)
      };
    }).filter(Boolean);
  }

  window.StableInvoiceReader={read,match,number,normalize:NORMALIZE};
})();
