(function(root){
  'use strict';
  const Engine=root.ProfessionalPDF;
  const API=root.PedidosPDF;
  if(!Engine||!API||API.blob.__layoutV16)return;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const contrast=hex=>{const[r,g,b]=Engine.hexRgb(hex);return(r*299+g*587+b*114)/1000>155?'#111111':'#ffffff'};
  const imageDimensions=new Map();

  function loadDimensions(source){
    if(!source)return Promise.resolve(null);
    if(imageDimensions.has(source))return imageDimensions.get(source);
    const promise=new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve({width:image.naturalWidth||1,height:image.naturalHeight||1});
      image.onerror=()=>reject(new Error('No se pudo leer un logo'));
      image.src=source;
    }).catch(()=>null);
    imageDimensions.set(source,promise);
    return promise;
  }

  function alignedOffset(space,content,alignment){
    if(alignment==='right'||alignment==='bottom')return Math.max(0,space-content);
    if(alignment==='center'||alignment==='middle')return Math.max(0,(space-content)/2);
    return 0;
  }

  async function fitLogo(doc,entry,box,alignX,alignY){
    const dimensions=await loadDimensions(entry.src);
    if(!dimensions)return;
    const ratio=dimensions.width/dimensions.height;
    const maxWidth=Math.max(1,Math.min(box.w,entry.size||box.w));
    const maxHeight=Math.max(1,box.h);
    let width=maxWidth,height=width/ratio;
    if(height>maxHeight){height=maxHeight;width=height*ratio}
    const x=box.x+alignedOffset(box.w,width,alignX);
    const y=box.y+alignedOffset(box.h,height,alignY);
    await doc.image(entry.src,x,y,width,height);
  }

  async function drawLogoArea(doc,logos,box,orientation,profile){
    const entries=[
      logos.logo1&&{src:logos.logo1,size:Number(logos.logo1Size)||42},
      logos.logo2&&{src:logos.logo2,size:Number(logos.logo2Size)||28}
    ].filter(Boolean);
    if(!entries.length)return;
    const alignX=profile.logoAlignX||'center';
    const alignY=profile.logoAlignY||'center';
    const gap=2.5;
    if(orientation==='horizontal'){
      const slot=(box.w-gap*(entries.length-1))/entries.length;
      for(let index=0;index<entries.length;index++){
        await fitLogo(doc,entries[index],{x:box.x+index*(slot+gap),y:box.y,w:slot,h:box.h},alignX,alignY);
      }
      return;
    }
    const slot=(box.h-gap*(entries.length-1))/entries.length;
    for(let index=0;index<entries.length;index++){
      await fitLogo(doc,entries[index],{x:box.x,y:box.y+index*(slot+gap),w:box.w,h:slot},alignX,alignY);
    }
  }

  async function drawInfo(doc,x,y,w,profile,folio){
    const rows=[
      ['RAZÓN SOCIAL',profile.companyName],['RUT',profile.rut],['DIRECCIÓN',profile.address],
      ['LOCAL',profile.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})],['FOLIO',folio]
    ];
    const rowHeight=6.15;
    const labelWidth=Math.min(38,Math.max(31,w*.28));
    for(let index=0;index<rows.length;index++){
      const yy=y+index*rowHeight;
      doc.setStroke('#222222').rect(x,yy,labelWidth,rowHeight).rect(x+labelWidth,yy,w-labelWidth,rowHeight);
      doc.text(rows[index][0],x+1.2,yy+4.2,{size:6.4,bold:true});
      let size=7;
      while(Engine.estimateWidth(rows[index][1]||'',size)>((w-labelWidth-3)*72/25.4)&&size>4.6)size-=.2;
      doc.text(rows[index][1]||'',x+labelWidth+1.3,yy+4.2,{size});
    }
    return y+rows.length*rowHeight;
  }

  async function drawHeader(doc,profile,logos,folio){
    const x=15,y=10,w=180,rowHeight=6.15,tableHeight=rowHeight*6;
    const position=profile.logoPosition||'left';
    const hasLogos=!!(logos.logo1||logos.logo2);
    if(!hasLogos){await drawInfo(doc,x,y,w,profile,folio);return y+tableHeight}

    if(position==='top'||position==='bottom'){
      const logoHeight=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)*.52,20,36);
      doc.setStroke('#222').rect(x,y,w,tableHeight+logoHeight);
      if(position==='top'){
        await drawLogoArea(doc,logos,{x:x+3,y:y+2,w:w-6,h:logoHeight-4},'horizontal',profile);
        doc.line(x,y+logoHeight,x+w,y+logoHeight);
        await drawInfo(doc,x,y+logoHeight,w,profile,folio);
      }else{
        await drawInfo(doc,x,y,w,profile,folio);
        doc.line(x,y+tableHeight,x+w,y+tableHeight);
        await drawLogoArea(doc,logos,{x:x+3,y:y+tableHeight+2,w:w-6,h:logoHeight-4},'horizontal',profile);
      }
      return y+tableHeight+logoHeight;
    }

    const logoWidth=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)+9,40,72);
    const infoWidth=w-logoWidth;
    doc.setStroke('#222').rect(x,y,w,tableHeight);
    if(position==='right'){
      await drawInfo(doc,x,y,infoWidth,profile,folio);
      doc.line(x+infoWidth,y,x+infoWidth,y+tableHeight);
      await drawLogoArea(doc,logos,{x:x+infoWidth+3,y:y+3,w:logoWidth-6,h:tableHeight-6},'vertical',profile);
    }else{
      await drawLogoArea(doc,logos,{x:x+3,y:y+3,w:logoWidth-6,h:tableHeight-6},'vertical',profile);
      doc.line(x+logoWidth,y,x+logoWidth,y+tableHeight);
      await drawInfo(doc,x+logoWidth,y,infoWidth,profile,folio);
    }
    return y+tableHeight;
  }

  function providerRows(order,provider){
    return(order.rows||[]).filter(row=>row.providerId===provider.id||row.providerName===provider.name);
  }

  async function createBlob({order,provider,profile={},logos={}}){
    if(!order||!provider)throw new Error('Faltan datos para generar el PDF');
    const rows=providerRows(order,provider);
    if(!rows.length)throw new Error('Este proveedor no tiene ítems en el pedido');
    const doc=new Engine.Document().setMeta({title:`Pedido ${order.folio} - ${provider.name}`});
    let y=await drawHeader(doc,profile,logos,order.folio)+5;
    const providerBandHeight=provider.logo?clamp((Number(provider.logoSize)||24)*.6,14,28):12;
    doc.setStroke('#222').rect(15,y,180,providerBandHeight);
    doc.text(`PROVEEDOR: ${provider.name}`,105,y+Math.max(7,providerBandHeight*.62),{size:14,bold:true,align:'center',maxWidth:120});
    if(provider.logo)await fitLogo(doc,{src:provider.logo,size:Number(provider.logoSize)||24},{x:164,y:y+1,w:29,h:providerBandHeight-2},'right','center');
    y+=providerBandHeight+4;

    const headerColor=profile.tableHeaderColor||'#48484c';
    const headerTextColor=contrast(headerColor);
    const tableHeader=()=>{
      doc.setFill(headerColor).rect(15,y,180,8,'F');
      doc.text('DESCRIPCIÓN',18,y+5.45,{size:8,bold:true,color:headerTextColor});
      doc.text('CANTIDAD',154,y+5.45,{size:8,bold:true,align:'center',color:headerTextColor});
      doc.text('UNIDAD',169,y+5.45,{size:8,bold:true,color:headerTextColor});
      y+=8;
    };
    tableHeader();
    for(const row of rows){
      const description=Engine.wrapText(String(row.description),122*72/25.4,8);
      const unit=Engine.wrapText(String(row.unit),25*72/25.4,8);
      const height=Math.max(7,Math.max(description.length,unit.length)*3.5+2.2);
      if(y+height>285){doc.addPage();y=15;tableHeader()}
      doc.setStroke('#222').rect(15,y,128,height).rect(143,y,22,height).rect(165,y,30,height);
      doc.text(description.join('\n'),18,y+4.7,{size:8});
      doc.text(String(row.orderedQty),161,y+4.7,{size:8,align:'right'});
      doc.text(unit.join('\n'),168,y+4.7,{size:8});
      y+=height;
    }
    const blob=await doc.blob();
    if(!(blob instanceof Blob)||blob.size<200)throw new Error('No se pudo construir el documento PDF');
    return blob;
  }

  createBlob.__layoutV16=true;
  API.blob=createBlob;
})(globalThis);
