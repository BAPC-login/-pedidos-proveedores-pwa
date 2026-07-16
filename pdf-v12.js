(function(root){
  'use strict';
  const core=()=>root.PedidosCore;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const rgb=hex=>{const clean=String(hex||'#48484c').replace('#','').padEnd(6,'0').slice(0,6);return[parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)]};
  const contrast=hex=>{const [r,g,b]=rgb(hex);return(r*299+g*587+b*114)/1000>155?[20,20,20]:[255,255,255]};

  function requirePdf(){if(!root.jspdf?.jsPDF)throw new Error('El generador PDF local no terminó de instalarse. Abre la app una vez con internet y vuelve a intentar.');return root.jspdf.jsPDF}
  function imageDimensions(doc,source,width,maxHeight){
    const properties=doc.getImageProperties(source);let height=width*properties.height/properties.width;
    if(height>maxHeight){width*=maxHeight/height;height=maxHeight}
    return{width,height};
  }
  function addImage(doc,source,x,y,width,maxHeight){
    if(!source)return null;
    try{const size=imageDimensions(doc,source,width,maxHeight);doc.addImage(source,undefined,x,y,size.width,size.height,undefined,'FAST');return size}catch(error){console.warn('Imagen omitida del PDF',error);return null}
  }
  function fitText(doc,text,maxWidth,start=7.2,min=5){let size=start;doc.setFontSize(size);while(size>min&&doc.getTextWidth(String(text||''))>maxWidth){size-=.2;doc.setFontSize(size)}return size}

  function drawInfoRows(doc,x,y,width,profile){
    const rows=[['RAZÓN SOCIAL',profile.companyName],['RUT',profile.rut],['DIRECCIÓN',profile.address],['LOCAL',profile.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})]],rowHeight=6,labelWidth=Math.min(38,Math.max(30,width*.28));
    doc.setDrawColor(30);doc.setLineWidth(.25);
    rows.forEach(([label,value],index)=>{
      const yy=y+index*rowHeight;doc.rect(x,yy,labelWidth,rowHeight);doc.rect(x+labelWidth,yy,width-labelWidth,rowHeight);
      doc.setFont('helvetica','bold');doc.setFontSize(6.6);doc.text(label,x+1.3,yy+4.1);
      doc.setFont('helvetica','normal');fitText(doc,value,width-labelWidth-3,7,5);doc.text(String(value||''),x+labelWidth+1.4,yy+4.1);
    });
    return y+rows.length*rowHeight;
  }

  function drawCompanyLogos(doc,logos,x,y,width,height,horizontal=true){
    const entries=[logos.logo1&&{source:logos.logo1,size:Number(logos.logo1Size)||42},logos.logo2&&{source:logos.logo2,size:Number(logos.logo2Size)||28}].filter(Boolean);
    if(!entries.length)return;
    if(horizontal){
      const sizes=entries.map(entry=>{try{return{...entry,...imageDimensions(doc,entry.source,Math.min(entry.size,width*.45),height-4)}}catch{return null}}).filter(Boolean);
      const total=sizes.reduce((sum,item)=>sum+item.width,0)+Math.max(0,sizes.length-1)*4;let cursor=x+(width-total)/2;
      sizes.forEach(item=>{addImage(doc,item.source,cursor,y+(height-item.height)/2,item.width,height-4);cursor+=item.width+4});
    }else{
      const each=(height-4)/entries.length;let cursor=y+2;
      entries.forEach(entry=>{try{const size=imageDimensions(doc,entry.source,Math.min(entry.size,width-5),each-2);addImage(doc,entry.source,x+(width-size.width)/2,cursor,size.width,each-2);cursor+=each}catch{}});
    }
  }

  function drawHeader(doc,profile,logos){
    const x=15,y=10,width=180,tableHeight=30,position=profile.logoPosition||'left',hasLogo=!!(logos.logo1||logos.logo2);
    if(!hasLogo){drawInfoRows(doc,x,y,width,profile);return y+tableHeight}
    doc.setDrawColor(30);doc.setLineWidth(.25);
    if(position==='top'||position==='bottom'){
      const bandHeight=clamp(Math.max(logos.logo1Size||42,logos.logo2Size||28)*.48,18,34);doc.rect(x,y,width,tableHeight+bandHeight);
      if(position==='top'){drawCompanyLogos(doc,logos,x,y,width,bandHeight,true);doc.line(x,y+bandHeight,x+width,y+bandHeight);drawInfoRows(doc,x,y+bandHeight,width,profile)}
      else{drawInfoRows(doc,x,y,width,profile);doc.line(x,y+tableHeight,x+width,y+tableHeight);drawCompanyLogos(doc,logos,x,y+tableHeight,width,bandHeight,true)}
      return y+tableHeight+bandHeight;
    }
    const logoWidth=clamp(Math.max(logos.logo1Size||42,logos.logo2Size||28)+8,38,66),infoWidth=width-logoWidth;doc.rect(x,y,width,tableHeight);
    if(position==='right'){drawInfoRows(doc,x,y,infoWidth,profile);doc.line(x+infoWidth,y,x+infoWidth,y+tableHeight);drawCompanyLogos(doc,logos,x+infoWidth,y,logoWidth,tableHeight,false)}
    else{drawCompanyLogos(doc,logos,x,y,logoWidth,tableHeight,false);doc.line(x+logoWidth,y,x+logoWidth,y+tableHeight);drawInfoRows(doc,x+logoWidth,y,infoWidth,profile)}
    return y+tableHeight;
  }

  function providerRows(order,providerId,providerName){return(order.rows||[]).filter(row=>providerId?row.providerId===providerId:row.providerName===providerName)}

  async function createProviderDocument({order,provider,profile,logos={}}){
    const JsPDF=requirePdf(),doc=new JsPDF({unit:'mm',format:'a4'}),rows=providerRows(order,provider.id,provider.name);
    doc.setProperties({title:`Pedido ${order.folio} - ${provider.name}`,subject:'Orden de compra por proveedor',creator:'Pedidos Proveedores PWA'});
    let y=drawHeader(doc,profile,logos)+5;

    const providerBandHeight=provider.logo?Math.max(14,Math.min(28,(Number(provider.logoSize)||24)*.55)):12;
    doc.setDrawColor(35);doc.setLineWidth(.25);doc.rect(15,y,180,providerBandHeight);
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(`FOLIO: ${order.folio}`,18,y+5);
    doc.setFontSize(14);doc.text(`PROVEEDOR: ${provider.name}`,105,y+Math.max(7,providerBandHeight*.58),{align:'center',maxWidth:118});
    if(provider.logo){
      try{const width=clamp(Number(provider.logoSize)||24,10,46),size=imageDimensions(doc,provider.logo,width,providerBandHeight-2);addImage(doc,provider.logo,193-size.width,y+(providerBandHeight-size.height)/2,size.width,providerBandHeight-2)}catch{}
    }
    y+=providerBandHeight+4;

    const color=profile.tableHeaderColor||'#48484c',[r,g,b]=rgb(color),textColor=contrast(color);
    const tableHeader=()=>{doc.setFillColor(r,g,b);doc.rect(15,y,180,8,'F');doc.setTextColor(...textColor);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('DESCRIPCIÓN',18,y+5.3);doc.text('CANTIDAD',151,y+5.3,{align:'center'});doc.text('UNIDAD',171,y+5.3);doc.setTextColor(0);y+=8};
    tableHeader();doc.setFont('helvetica','normal');
    for(const row of rows){
      const description=doc.splitTextToSize(String(row.description),122),unit=doc.splitTextToSize(String(row.unit),25),height=Math.max(7,Math.max(description.length,unit.length)*3.2+2.2);
      if(y+height>286){doc.addPage();y=15;tableHeader()}
      doc.rect(15,y,128,height);doc.rect(143,y,22,height);doc.rect(165,y,30,height);doc.setFontSize(8);doc.text(description,18,y+4.6);doc.text(String(row.orderedQty),161,y+4.8,{align:'right'});doc.text(unit,168,y+4.6);y+=height;
    }
    if(!rows.length){doc.setFontSize(10);doc.text('Este proveedor no tiene productos en el pedido.',18,y+8)}
    return doc;
  }

  async function blob(options){const document=await createProviderDocument(options);return document.output('blob')}
  function fileName(order,provider){return`PEDIDO_${String(order.folio).replace(/[^A-Z0-9-]/gi,'_')}_${String(provider.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/gi,'_')}.pdf`}
  function download(pdfBlob,name){const url=URL.createObjectURL(pdfBlob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.rel='noopener';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  async function share(pdfBlob,name,title){if(!navigator.share||!navigator.canShare)return false;const file=new File([pdfBlob],name,{type:'application/pdf'});if(!navigator.canShare({files:[file]}))return false;await navigator.share({title,files:[file]});return true}

  root.PedidosPDF={createProviderDocument,blob,fileName,download,share};
})(globalThis);
