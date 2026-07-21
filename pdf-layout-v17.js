(function(root){
  'use strict';
  const Engine=root.ProfessionalPDF;
  const API=root.PedidosPDF;
  if(!Engine||!API||API.blob.__layoutV17)return;

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const contrast=hex=>{const[r,g,b]=Engine.hexRgb(hex);return(r*299+g*587+b*114)/1000>155?'#111111':'#ffffff'};
  const dimensionsCache=new Map();

  function imageDimensions(source){
    if(!source)return Promise.resolve(null);
    if(dimensionsCache.has(source))return dimensionsCache.get(source);
    const promise=new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth||1,height:image.naturalHeight||1});image.onerror=()=>resolve(null);image.src=source});
    dimensionsCache.set(source,promise);return promise;
  }
  function offset(space,content,alignment){
    if(alignment==='right'||alignment==='bottom')return Math.max(0,space-content);
    if(alignment==='center'||alignment==='middle')return Math.max(0,(space-content)/2);
    return 0;
  }
  async function fitLogo(doc,entry,box,alignX='center',alignY='center'){
    const dimensions=await imageDimensions(entry.src);if(!dimensions)return;
    const ratio=dimensions.width/dimensions.height;
    const requested=Math.max(1,Number(entry.size)||box.w);
    let width=Math.min(box.w,requested),height=width/ratio;
    if(height>box.h){height=box.h;width=height*ratio}
    const x=box.x+offset(box.w,width,alignX),y=box.y+offset(box.h,height,alignY);
    await doc.image(entry.src,x,y,width,height);
  }
  async function drawLogos(doc,logos,box,orientation,profile){
    const entries=[logos.logo1&&{src:logos.logo1,size:Number(logos.logo1Size)||42},logos.logo2&&{src:logos.logo2,size:Number(logos.logo2Size)||28}].filter(Boolean);
    if(!entries.length)return;
    const alignX=profile.logoAlignX||'center',alignY=profile.logoAlignY||'center',gap=3;
    if(entries.length===1){await fitLogo(doc,entries[0],box,alignX,alignY);return}
    if(orientation==='horizontal'){
      const slot=(box.w-gap)/2;
      await fitLogo(doc,entries[0],{x:box.x,y:box.y,w:slot,h:box.h},alignX,alignY);
      await fitLogo(doc,entries[1],{x:box.x+slot+gap,y:box.y,w:slot,h:box.h},alignX,alignY);
    }else{
      const slot=(box.h-gap)/2;
      await fitLogo(doc,entries[0],{x:box.x,y:box.y,w:box.w,h:slot},alignX,alignY);
      await fitLogo(doc,entries[1],{x:box.x,y:box.y+slot+gap,w:box.w,h:slot},alignX,alignY);
    }
  }
  async function drawInfo(doc,x,y,w,profile,folio){
    const rows=[['RAZÓN SOCIAL',profile.companyName],['RUT',profile.rut],['DIRECCIÓN',profile.address],['LOCAL',profile.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})],['FOLIO',folio]];
    const rowHeight=6.15,labelWidth=Math.min(38,Math.max(31,w*.28));
    rows.forEach((row,index)=>{
      const yy=y+index*rowHeight;doc.setStroke('#222').rect(x,yy,labelWidth,rowHeight).rect(x+labelWidth,yy,w-labelWidth,rowHeight);
      doc.text(row[0],x+1.2,yy+4.2,{size:6.4,bold:true});
      let size=7;while(Engine.estimateWidth(row[1]||'',size)>((w-labelWidth-3)*72/25.4)&&size>4.6)size-=.2;
      doc.text(row[1]||'',x+labelWidth+1.3,yy+4.2,{size});
    });
    return y+rows.length*rowHeight;
  }
  async function drawHeader(doc,profile,logos,folio){
    const x=15,y=10,w=180,tableHeight=6.15*6,position=profile.logoPosition||'left';
    if(!(logos.logo1||logos.logo2)){await drawInfo(doc,x,y,w,profile,folio);return y+tableHeight}
    if(position==='top'||position==='bottom'){
      const logoHeight=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)*.58,22,42);
      doc.setStroke('#222').rect(x,y,w,tableHeight+logoHeight);
      const box={x:x+4,y:position==='top'?y+3:y+tableHeight+3,w:w-8,h:logoHeight-6};
      if(position==='top'){
        await drawLogos(doc,logos,box,'horizontal',profile);doc.line(x,y+logoHeight,x+w,y+logoHeight);await drawInfo(doc,x,y+logoHeight,w,profile,folio);
      }else{
        await drawInfo(doc,x,y,w,profile,folio);doc.line(x,y+tableHeight,x+w,y+tableHeight);await drawLogos(doc,logos,box,'horizontal',profile);
      }
      return y+tableHeight+logoHeight;
    }
    const logoWidth=clamp(Math.max(Number(logos.logo1Size)||42,Number(logos.logo2Size)||28)+12,44,76),infoWidth=w-logoWidth;
    doc.setStroke('#222').rect(x,y,w,tableHeight);
    if(position==='right'){
      await drawInfo(doc,x,y,infoWidth,profile,folio);doc.line(x+infoWidth,y,x+infoWidth,y+tableHeight);
      await drawLogos(doc,logos,{x:x+infoWidth+4,y:y+4,w:logoWidth-8,h:tableHeight-8},'vertical',profile);
    }else{
      await drawLogos(doc,logos,{x:x+4,y:y+4,w:logoWidth-8,h:tableHeight-8},'vertical',profile);
      doc.line(x+logoWidth,y,x+logoWidth,y+tableHeight);await drawInfo(doc,x+logoWidth,y,infoWidth,profile,folio);
    }
    return y+tableHeight;
  }
  const providerRows=(order,provider)=>(order.rows||[]).filter(row=>row.providerId===provider.id||row.providerName===provider.name);
  async function createBlob({order,provider,profile={},logos={}}){
    if(!order||!provider)throw new Error('Faltan datos para generar el PDF');
    const rows=providerRows(order,provider);if(!rows.length)throw new Error('Este proveedor no tiene ítems en el pedido');
    const doc=new Engine.Document().setMeta({title:`Pedido ${order.folio} - ${provider.name}`});
    let y=await drawHeader(doc,profile,logos,order.folio)+5;
    const bandHeight=provider.logo?clamp((Number(provider.logoSize)||24)*.6,14,28):12;
    doc.setStroke('#222').rect(15,y,180,bandHeight);doc.text(`PROVEEDOR: ${provider.name}`,105,y+Math.max(7,bandHeight*.62),{size:14,bold:true,align:'center',maxWidth:116});
    if(provider.logo)await fitLogo(doc,{src:provider.logo,size:Number(provider.logoSize)||24},{x:164,y:y+1,w:29,h:bandHeight-2},'right','center');
    y+=bandHeight+4;
    const headerColor=profile.tableHeaderColor||'#48484c',headerText=contrast(headerColor);
    const tableHead=()=>{doc.setFill(headerColor).rect(15,y,180,8,'F');doc.text('DESCRIPCIÓN',18,y+5.45,{size:8,bold:true,color:headerText});doc.text('CANTIDAD',154,y+5.45,{size:8,bold:true,align:'center',color:headerText});doc.text('UNIDAD',169,y+5.45,{size:8,bold:true,color:headerText});y+=8};
    tableHead();
    for(const row of rows){
      const description=Engine.wrapText(String(row.description),122*72/25.4,8),unit=Engine.wrapText(String(row.unit),25*72/25.4,8),height=Math.max(7,Math.max(description.length,unit.length)*3.5+2.2);
      if(y+height>285){doc.addPage();y=15;tableHead()}
      doc.setStroke('#222').rect(15,y,128,height).rect(143,y,22,height).rect(165,y,30,height);doc.text(description.join('\n'),18,y+4.7,{size:8});doc.text(String(row.orderedQty),161,y+4.7,{size:8,align:'right'});doc.text(unit.join('\n'),168,y+4.7,{size:8});y+=height;
    }
    const blob=await doc.blob();if(!(blob instanceof Blob)||blob.size<200)throw new Error('No se pudo construir el documento PDF');return blob;
  }
  createBlob.__layoutV17=true;API.blob=createBlob;
})(globalThis);
