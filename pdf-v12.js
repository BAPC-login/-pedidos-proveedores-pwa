(function(root){
  'use strict';

  const PT_PER_MM=72/25.4;
  const A4={w:210*PT_PER_MM,h:297*PT_PER_MM};
  const encode=value=>new TextEncoder().encode(value);
  const concat=parts=>{
    const size=parts.reduce((total,part)=>total+part.length,0);
    const output=new Uint8Array(size);
    let offset=0;
    for(const part of parts){output.set(part,offset);offset+=part.length}
    return output;
  };
  const cp1252Map={0x20ac:128,0x201a:130,0x0192:131,0x201e:132,0x2026:133,0x2020:134,0x2021:135,0x02c6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017d:142,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2013:150,0x2014:151,0x02dc:152,0x2122:153,0x0161:154,0x203a:155,0x0153:156,0x017e:158,0x0178:159};

  function pdfEscape(value){
    let output='';
    for(const character of String(value??'')){
      const code=character.codePointAt(0);
      const byte=code<=255?code:(cp1252Map[code]??63);
      if(byte===40||byte===41||byte===92)output+='\\'+String.fromCharCode(byte);
      else if(byte<32||byte>126)output+='\\'+byte.toString(8).padStart(3,'0');
      else output+=String.fromCharCode(byte);
    }
    return output;
  }

  const fmt=value=>Number(Number(value).toFixed(3)).toString();
  const mm=value=>value*PT_PER_MM;
  function dataUrlToBytes(dataUrl){
    const base64=String(dataUrl).split(',')[1]||'';
    const binary=atob(base64);
    const output=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)output[index]=binary.charCodeAt(index);
    return output;
  }
  function loadImage(source){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('No se pudo procesar una imagen del documento'));image.src=source})}
  async function toJpeg(source,quality=.9){
    if(!source)return null;
    const image=await loadImage(source);
    const max=1400;
    const scale=Math.min(1,max/Math.max(image.naturalWidth||1,image.naturalHeight||1));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const url=canvas.toDataURL('image/jpeg',quality);
    return{bytes:dataUrlToBytes(url),width:canvas.width,height:canvas.height};
  }
  function estimateWidth(text,size,bold=false){
    let total=0;
    for(const character of String(text??'')){
      if('MW@%'.includes(character))total+=.82;
      else if('ilI1.,:;|'.includes(character))total+=.28;
      else if(character===' ')total+=.28;
      else total+=bold?.57:.52;
    }
    return total*size;
  }
  function wrapText(text,maxWidth,size,bold=false){
    const lines=[];
    for(const paragraph of String(text??'').split(/\n/)){
      const words=paragraph.split(/\s+/).filter(Boolean);
      if(!words.length){lines.push('');continue}
      let line='';
      for(const word of words){
        const next=line?`${line} ${word}`:word;
        if(estimateWidth(next,size,bold)<=maxWidth){line=next;continue}
        if(line)lines.push(line);
        if(estimateWidth(word,size,bold)<=maxWidth){line=word;continue}
        let chunk='';
        for(const character of word){
          if(estimateWidth(chunk+character,size,bold)>maxWidth&&chunk){lines.push(chunk);chunk=character}else chunk+=character;
        }
        line=chunk;
      }
      if(line)lines.push(line);
    }
    return lines;
  }
  function hexRgb(hex){
    const value=String(hex||'#000000').replace('#','').padEnd(6,'0').slice(0,6);
    return[parseInt(value.slice(0,2),16)||0,parseInt(value.slice(2,4),16)||0,parseInt(value.slice(4,6),16)||0];
  }

  class Page{constructor(){this.ops=[];this.images=new Set()}push(value){this.ops.push(value)}}
  class Document{
    constructor(){this.pages=[new Page()];this.pageIndex=0;this.imageMap=new Map();this.images=[];this.meta={}}
    get page(){return this.pages[this.pageIndex]}
    addPage(){this.pages.push(new Page());this.pageIndex=this.pages.length-1;return this}
    setMeta(meta){Object.assign(this.meta,meta||{});return this}
    setStroke(hex='#000000'){const[r,g,b]=hexRgb(hex);this.page.push(`${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} RG`);return this}
    setFill(hex='#000000'){const[r,g,b]=hexRgb(hex);this.page.push(`${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} rg`);return this}
    line(x1,y1,x2,y2,width=.25){this.page.push(`${fmt(mm(width))} w ${fmt(mm(x1))} ${fmt(A4.h-mm(y1))} m ${fmt(mm(x2))} ${fmt(A4.h-mm(y2))} l S`);return this}
    rect(x,y,w,h,mode='S',lineWidth=.25){this.page.push(`${fmt(mm(lineWidth))} w ${fmt(mm(x))} ${fmt(A4.h-mm(y+h))} ${fmt(mm(w))} ${fmt(mm(h))} re ${mode}`);return this}
    text(text,x,y,{size=9,bold=false,align='left',maxWidth=0,lineHeight=1.18,color='#000000'}={}){
      const font=bold?'F2':'F1';
      const[r,g,b]=hexRgb(color);
      const width=maxWidth?mm(maxWidth):0;
      const lines=maxWidth?wrapText(text,width,size,bold):String(text??'').split('\n');
      lines.forEach((line,index)=>{
        let xx=mm(x);
        const textWidth=estimateWidth(line,size,bold);
        if(align==='center')xx-=textWidth/2;
        else if(align==='right')xx-=textWidth;
        const yy=A4.h-mm(y)-index*size*lineHeight;
        this.page.push(`BT /${font} ${fmt(size)} Tf ${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} rg 1 0 0 1 ${fmt(xx)} ${fmt(yy)} Tm (${pdfEscape(line)}) Tj ET`);
      });
      return lines.length;
    }
    async image(source,x,y,w,h){
      if(!source)return null;
      try{
        let image=this.imageMap.get(source);
        if(!image){
          const jpeg=await toJpeg(source);
          if(!jpeg)return null;
          image={...jpeg,name:`Im${this.images.length+1}`};
          this.images.push(image);this.imageMap.set(source,image);
        }
        const ratio=image.width/image.height;
        let width=w,height=h;
        if(!height)height=width/ratio;
        if(!width)width=height*ratio;
        if(width/height>ratio)width=height*ratio;else height=width/ratio;
        this.page.images.add(image.name);
        this.page.push(`q ${fmt(mm(width))} 0 0 ${fmt(mm(height))} ${fmt(mm(x))} ${fmt(A4.h-mm(y+height))} cm /${image.name} Do Q`);
        return{w:width,h:height};
      }catch(error){
        console.warn('Se omitió una imagen incompatible del PDF',error);
        return null;
      }
    }
    async blob(){
      const objects=[];
      const add=value=>{objects.push(value);return objects.length};
      add(null);add(null);
      const fontRegular=add(encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
      const fontBold=add(encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
      const imageRefs={};
      for(const image of this.images){
        const head=encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
        imageRefs[image.name]=add(concat([head,image.bytes,encode('\nendstream')]));
      }
      const pageRefs=[];
      for(const page of this.pages){
        const content=encode(page.ops.join('\n'));
        const contentRef=add(concat([encode(`<< /Length ${content.length} >>\nstream\n`),content,encode('\nendstream')]));
        const xObjects=[...page.images].map(name=>`/${name} ${imageRefs[name]} 0 R`).join(' ');
        const resources=`<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >>${xObjects?` /XObject << ${xObjects} >>`:''} >>`;
        pageRefs.push(add(encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(A4.w)} ${fmt(A4.h)}] /Resources ${resources} /Contents ${contentRef} 0 R >>`)));
      }
      objects[1]=encode(`<< /Type /Pages /Kids [${pageRefs.map(number=>`${number} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
      objects[0]=encode('<< /Type /Catalog /Pages 2 0 R >>');
      const header=encode('%PDF-1.4\n%PedidosPro\n');
      const parts=[header];
      const offsets=[0];
      let offset=header.length;
      for(let index=0;index<objects.length;index++){
        offsets[index+1]=offset;
        const block=concat([encode(`${index+1} 0 obj\n`),objects[index],encode('\nendobj\n')]);
        parts.push(block);offset+=block.length;
      }
      const xrefOffset=offset;
      let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
      for(let index=1;index<=objects.length;index++)xref+=`${String(offsets[index]).padStart(10,'0')} 00000 n \n`;
      xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      parts.push(encode(xref));
      return new Blob([concat(parts)],{type:'application/pdf'});
    }
  }

  root.ProfessionalPDF={Document,wrapText,estimateWidth,hexRgb};
})(globalThis);

(function(root){
  'use strict';
  const PDF=root.ProfessionalPDF;
  if(!PDF)throw new Error('Motor PDF local no disponible');
  const clamp=(number,min,max)=>Math.min(max,Math.max(min,Number(number)||0));
  const contrast=hex=>{const[r,g,b]=PDF.hexRgb(hex);return(r*299+g*587+b*114)/1000>155?'#111111':'#ffffff'};

  async function drawInfo(doc,x,y,w,profile,folio){
    const rows=[['RAZÓN SOCIAL',profile.companyName],['RUT',profile.rut],['DIRECCIÓN',profile.address],['LOCAL',profile.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})],['FOLIO',folio]];
    const rowH=6.15;
    const labelW=Math.min(38,Math.max(31,w*.28));
    for(let index=0;index<rows.length;index++){
      const yy=y+index*rowH;
      doc.setStroke('#222222').rect(x,yy,labelW,rowH).rect(x+labelW,yy,w-labelW,rowH);
      doc.text(rows[index][0],x+1.2,yy+4.2,{size:6.4,bold:true});
      let size=7;
      while(PDF.estimateWidth(rows[index][1]||'',size)>((w-labelW-3)*72/25.4)&&size>4.6)size-=.2;
      doc.text(rows[index][1]||'',x+labelW+1.3,yy+4.2,{size});
    }
    return y+rows.length*rowH;
  }
  async function drawLogos(doc,logos,x,y,w,h,horizontal){
    const entries=[logos.logo1&&{src:logos.logo1,size:Number(logos.logo1Size)||42},logos.logo2&&{src:logos.logo2,size:Number(logos.logo2Size)||28}].filter(Boolean);
    if(!entries.length)return;
    if(horizontal){
      let cursor=x+4;const slot=w/entries.length;
      for(const entry of entries){await doc.image(entry.src,cursor,y+2,Math.min(entry.size,slot-8),h-4);cursor+=slot}
    }else{
      let cursor=y+2;const slot=(h-4)/entries.length;
      for(const entry of entries){await doc.image(entry.src,x+2,cursor,w-4,slot-3);cursor+=slot}
    }
  }
  async function drawHeader(doc,profile,logos,folio){
    const x=15,y=10,w=180,rowH=6.15,tableH=rowH*6,pos=profile.logoPosition||'left';
    const has=!!(logos.logo1||logos.logo2);
    if(!has){await drawInfo(doc,x,y,w,profile,folio);return y+tableH}
    if(pos==='top'||pos==='bottom'){
      const logoH=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)*.52,20,34);
      doc.setStroke('#222').rect(x,y,w,tableH+logoH);
      if(pos==='top'){await drawLogos(doc,logos,x,y,w,logoH,true);doc.line(x,y+logoH,x+w,y+logoH);await drawInfo(doc,x,y+logoH,w,profile,folio)}
      else{await drawInfo(doc,x,y,w,profile,folio);doc.line(x,y+tableH,x+w,y+tableH);await drawLogos(doc,logos,x,y+tableH,w,logoH,true)}
      return y+tableH+logoH;
    }
    const logoW=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)+9,40,68),infoW=w-logoW;
    doc.setStroke('#222').rect(x,y,w,tableH);
    if(pos==='right'){await drawInfo(doc,x,y,infoW,profile,folio);doc.line(x+infoW,y,x+infoW,y+tableH);await drawLogos(doc,logos,x+infoW,y,logoW,tableH,false)}
    else{await drawLogos(doc,logos,x,y,logoW,tableH,false);doc.line(x+logoW,y,x+logoW,y+tableH);await drawInfo(doc,x+logoW,y,infoW,profile,folio)}
    return y+tableH;
  }
  function providerRows(order,provider){return(order.rows||[]).filter(row=>row.providerId===provider.id||row.providerName===provider.name)}
  async function blob({order,provider,profile,logos={}}){
    if(!order||!provider)throw new Error('Faltan datos para generar el PDF');
    const rows=providerRows(order,provider);
    if(!rows.length)throw new Error('Este proveedor no tiene ítems en el pedido');
    const doc=new PDF.Document().setMeta({title:`Pedido ${order.folio} - ${provider.name}`});
    let y=await drawHeader(doc,profile||{},logos,order.folio)+5;
    const bandH=provider.logo?clamp((Number(provider.logoSize)||24)*.6,14,28):12;
    doc.setStroke('#222').rect(15,y,180,bandH);
    doc.text(`PROVEEDOR: ${provider.name}`,105,y+Math.max(7,bandH*.62),{size:14,bold:true,align:'center',maxWidth:120});
    if(provider.logo)await doc.image(provider.logo,166,y+1,27,bandH-2);
    y+=bandH+4;
    const color=profile?.tableHeaderColor||'#48484c';
    const textColor=contrast(color);
    const tableHead=()=>{
      doc.setFill(color).rect(15,y,180,8,'F');
      doc.text('DESCRIPCIÓN',18,y+5.45,{size:8,bold:true,color:textColor});
      doc.text('CANTIDAD',154,y+5.45,{size:8,bold:true,align:'center',color:textColor});
      doc.text('UNIDAD',169,y+5.45,{size:8,bold:true,color:textColor});
      y+=8;
    };
    tableHead();
    for(const row of rows){
      const description=PDF.wrapText(String(row.description),122*72/25.4,8);
      const unit=PDF.wrapText(String(row.unit),25*72/25.4,8);
      const height=Math.max(7,Math.max(description.length,unit.length)*3.5+2.2);
      if(y+height>285){doc.addPage();y=15;tableHead()}
      doc.setStroke('#222').rect(15,y,128,height).rect(143,y,22,height).rect(165,y,30,height);
      doc.text(description.join('\n'),18,y+4.7,{size:8});
      doc.text(String(row.orderedQty),161,y+4.7,{size:8,align:'right'});
      doc.text(unit.join('\n'),168,y+4.7,{size:8});
      y+=height;
    }
    const output=await doc.blob();
    if(!(output instanceof Blob)||output.size<200)throw new Error('No se pudo construir el documento PDF');
    return output;
  }
  function fileName(order,provider){
    const clean=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/gi,'_').replace(/^_|_$/g,'');
    return`PEDIDO_${clean(order.folio)}_${clean(provider.name)}.pdf`;
  }
  function download(pdfBlob,name){
    const url=URL.createObjectURL(pdfBlob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=name;anchor.rel='noopener';anchor.target='_blank';
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function share(pdfBlob,name,title){
    if(!navigator.share||!navigator.canShare)return false;
    const file=new File([pdfBlob],name,{type:'application/pdf'});
    if(!navigator.canShare({files:[file]}))return false;
    await navigator.share({title,files:[file]});
    return true;
  }
  root.PedidosPDF={blob,fileName,download,share};
})(globalThis);
