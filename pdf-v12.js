(()=>{
  'use strict';
  const PT_PER_MM=72/25.4;
  const A4={w:210*PT_PER_MM,h:297*PT_PER_MM};
  const ascii=s=>new TextEncoder().encode(s);
  const concat=parts=>{const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
  const cp1252Map={0x20ac:128,0x201a:130,0x0192:131,0x201e:132,0x2026:133,0x2020:134,0x2021:135,0x02c6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017d:142,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2013:150,0x2014:151,0x02dc:152,0x2122:153,0x0161:154,0x203a:155,0x0153:156,0x017e:158,0x0178:159};
  function pdfEscape(value){
    let out='';
    for(const char of String(value??'')){
      const code=char.codePointAt(0);let byte=code<=255?code:(cp1252Map[code]??63);
      if(byte===40||byte===41||byte===92)out+='\\'+String.fromCharCode(byte);
      else if(byte<32||byte>126)out+='\\'+byte.toString(8).padStart(3,'0');
      else out+=String.fromCharCode(byte);
    }
    return out;
  }
  const fmt=n=>Number(n.toFixed(3)).toString();
  const mm=n=>n*PT_PER_MM;
  function dataUrlToBytes(dataUrl){const base64=String(dataUrl).split(',')[1]||'';const bin=atob(base64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo procesar una imagen del documento'));img.src=src})}
  async function toJpeg(src,quality=.9){
    if(!src)return null;
    const img=await loadImage(src),max=1400,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const url=canvas.toDataURL('image/jpeg',quality);return{bytes:dataUrlToBytes(url),width:canvas.width,height:canvas.height};
  }
  function estimateWidth(text,size,bold=false){let total=0;for(const c of String(text??'')){if('MW@%'.includes(c))total+=.82;else if('ilI1.,:;|'.includes(c))total+=.28;else if(c===' ')total+=.28;else total+=bold?.57:.52}return total*size}
  function wrapText(text,maxWidth,size,bold=false){
    const paragraphs=String(text??'').split(/\n/),lines=[];
    for(const paragraph of paragraphs){
      const words=paragraph.split(/\s+/).filter(Boolean);if(!words.length){lines.push('');continue}
      let line='';
      for(const word of words){const next=line?line+' '+word:word;if(estimateWidth(next,size,bold)<=maxWidth){line=next;continue}if(line)lines.push(line);if(estimateWidth(word,size,bold)<=maxWidth){line=word;continue}let chunk='';for(const char of word){if(estimateWidth(chunk+char,size,bold)>maxWidth&&chunk){lines.push(chunk);chunk=char}else chunk+=char}line=chunk}
      if(line)lines.push(line);
    }
    return lines;
  }
  class Page{
    constructor(){this.ops=[];this.images=new Set()}
    push(s){this.ops.push(s)}
  }
  class Document{
    constructor(){this.pages=[new Page()];this.pageIndex=0;this.imageMap=new Map();this.images=[];this.meta={}}
    get page(){return this.pages[this.pageIndex]}
    addPage(){this.pages.push(new Page());this.pageIndex=this.pages.length-1;return this}
    setMeta(meta){Object.assign(this.meta,meta||{});return this}
    setStroke(hex='#000000'){const [r,g,b]=hexRgb(hex);this.page.push(`${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} RG`);return this}
    setFill(hex='#000000'){const [r,g,b]=hexRgb(hex);this.page.push(`${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} rg`);return this}
    line(x1,y1,x2,y2,width=.25){this.page.push(`${fmt(mm(width))} w ${fmt(mm(x1))} ${fmt(A4.h-mm(y1))} m ${fmt(mm(x2))} ${fmt(A4.h-mm(y2))} l S`);return this}
    rect(x,y,w,h,mode='S',lineWidth=.25){this.page.push(`${fmt(mm(lineWidth))} w ${fmt(mm(x))} ${fmt(A4.h-mm(y+h))} ${fmt(mm(w))} ${fmt(mm(h))} re ${mode}`);return this}
    text(text,x,y,{size=9,bold=false,align='left',maxWidth=0,lineHeight=1.18,color='#000000'}={}){
      const font=bold?'F2':'F1',[r,g,b]=hexRgb(color),width=maxWidth?mm(maxWidth):0,lines=maxWidth?wrapText(text,width,size,bold):String(text??'').split('\n');
      lines.forEach((line,index)=>{let xx=mm(x);const tw=estimateWidth(line,size,bold);if(align==='center')xx-=tw/2;else if(align==='right')xx-=tw;const yy=A4.h-mm(y)-index*size*lineHeight;this.page.push(`BT /${font} ${fmt(size)} Tf ${fmt(r/255)} ${fmt(g/255)} ${fmt(b/255)} rg 1 0 0 1 ${fmt(xx)} ${fmt(yy)} Tm (${pdfEscape(line)}) Tj ET`)});
      return lines.length;
    }
    async image(src,x,y,w,h){
      if(!src)return null;let image=this.imageMap.get(src);
      if(!image){const jpg=await toJpeg(src);image={...jpg,name:`Im${this.images.length+1}`};this.images.push(image);this.imageMap.set(src,image)}
      const ratio=image.width/image.height;let width=w,height=h;if(!height)height=width/ratio;if(!width)width=height*ratio;const boxRatio=width/height;if(boxRatio>ratio)width=height*ratio;else height=width/ratio;
      this.page.images.add(image.name);this.page.push(`q ${fmt(mm(width))} 0 0 ${fmt(mm(height))} ${fmt(mm(x))} ${fmt(A4.h-mm(y+height))} cm /${image.name} Do Q`);return{w:width,h:height};
    }
    async blob(){
      const objects=[];const add=obj=>{objects.push(obj);return objects.length};
      add(null);add(null);const fontRegular=add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));const fontBold=add(ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
      const imageRefs={};for(const image of this.images){const head=ascii(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`),tail=ascii('\nendstream');imageRefs[image.name]=add(concat([head,image.bytes,tail]))}
      const pageRefs=[];
      for(const page of this.pages){const content=ascii(page.ops.join('\n')),contentRef=add(concat([ascii(`<< /Length ${content.length} >>\nstream\n`),content,ascii('\nendstream')]));const xobjs=[...page.images].map(name=>`/${name} ${imageRefs[name]} 0 R`).join(' ');const resources=`<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >>${xobjs?` /XObject << ${xobjs} >>`:''} >>`;const pageRef=add(ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(A4.w)} ${fmt(A4.h)}] /Resources ${resources} /Contents ${contentRef} 0 R >>`));pageRefs.push(pageRef)}
      objects[1]=ascii(`<< /Type /Pages /Kids [${pageRefs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);objects[0]=ascii('<< /Type /Catalog /Pages 2 0 R >>');
      const header=ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'),parts=[header],offsets=[0];let offset=header.length;
      for(let i=0;i<objects.length;i++){offsets[i+1]=offset;const block=concat([ascii(`${i+1} 0 obj\n`),objects[i],ascii('\nendobj\n')]);parts.push(block);offset+=block.length}
      const xrefOffset=offset;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      parts.push(ascii(xref));return new Blob([concat(parts)],{type:'application/pdf'});
    }
  }
  function hexRgb(hex){const h=String(hex||'#000000').replace('#','').padEnd(6,'0').slice(0,6);return[parseInt(h.slice(0,2),16)||0,parseInt(h.slice(2,4),16)||0,parseInt(h.slice(4,6),16)||0]}
  window.ProfessionalPDF={Document,wrapText,estimateWidth,hexRgb};
})();
