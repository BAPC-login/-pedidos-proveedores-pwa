import {XMLParser} from 'fast-xml-parser';

// An OCR-generated XML is internal evidence, NEVER a signed SII DTE.
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const field=(name,value)=>`<${name}>${escape(value)}</${name}>`;
export function buildInternalInvoiceXml(analysis){
  const invoice=analysis?.invoice||{},totals=invoice.totals||{},items=invoice.lines||invoice.items||[];
  const header=['supplierName','supplierRut','invoiceNumber','invoiceDate','currency','documentType','documentTypeCode'].map(k=>field(k,invoice[k])).join('');
  const amount=['subtotal','discount','net','freight','vat','additionalTax','other','exempt','total'].map(k=>field(k,totals[k]??0)).join('');
  const evidence=invoice.logisticsEvidence||{},logistics=['freightBasis','otherBasis','freightIncludedInNet','evidenceHeader','evidenceText','confidence','reviewStatus','recommendation'].map(k=>field(k,evidence[k]??'')).join('');
  const audit=['verified','balanced','method','checksumDelta','sourceFinalPriceBasis'].map(k=>field(k,invoice.pricingSummary?.[k]??'')).join('');
  const lines=items.map((item,index)=>`<Line number="${index+1}">${['code','sourceDescription','description','invoiceQuantity','packSize','totalUnits','netLineTotal','grossLineTotal','finalLineTotal','finalUnitPrice','sourcePrintedFinalUnitPrice','printedFinalUnitPrice','priceSource','readConfidence','allocatedFreight','allocatedOtherCharges','allocatedVat','allocatedAdditionalTax','taxAllocationMethod'].map(k=>field(k,item[k])).join('')}</Line>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><NuvastoInvoiceEvidence origin="photo-derived" authenticatedDTE="false" version="2">${header}<Totals>${amount}</Totals><LogisticsEvidence>${logistics}</LogisticsEvidence><PricingAudit>${audit}</PricingAudit><Lines>${lines}</Lines></NuvastoInvoiceEvidence>`;
}
const first=x=>Array.isArray(x)?x[0]:x;
const n=value=>Number(String(value??'0').replace(',','.'))||0;
const s=value=>String(value??'').trim();
export function parseOriginalDteXml(xml){
  if(xml.length>5*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML DTE con entidades o tamaño no admitido');
  const parsed=new XMLParser({removeNSPrefix:true,ignoreAttributes:false,parseTagValue:false,processEntities:false}).parse(xml);
  const dte=first(parsed?.DTE||first(parsed?.EnvioDTE?.SetDTE)?.DTE||first(parsed?.SetDTE)?.DTE);
  const document=first(dte?.Documento),header=document?.Encabezado;
  const id=header?.IdDoc||{},issuer=header?.Emisor||{},totals=header?.Totales||{};
  if(!document||!s(id.Folio)||!s(issuer.RUTEmisor)||!s(totals.MntTotal)||n(totals.MntTotal)<=0)throw new Error('El archivo no corresponde a un DTE chileno con folio, emisor y total');
  const lines=(Array.isArray(document.Detalle)?document.Detalle:[document.Detalle]).filter(Boolean).map(row=>({
    code:s(first(row.CdgItem)?.VlrCodigo),description:s(row.NmbItem||row.DscItem),quantity:n(row.QtyItem),
    unitNet:n(row.PrcItem),lineNet:n(row.MontoItem),exempt:Boolean(s(row.IndExe))
  }));
  if(!lines.length||!lines.every(row=>row.quantity>0&&row.description))throw new Error('El XML DTE no contiene líneas comerciales verificables');
  return{origin:'original-dte-unverified-signature',folio:s(id.Folio),rut:s(issuer.RUTEmisor),
    date:s(id.FchEmis),documentType:s(id.TipoDTE),total:n(totals.MntTotal),
    net:n(totals.MntNeto),vat:n(totals.IVA),exempt:n(totals.MntExe),lines};
}
export function verifyPhotoAgainstDte(analysis,dte){
  const inv=analysis?.invoice||{},total=Number(inv.totals?.total||0),normalizeRut=v=>s(v).toUpperCase().replace(/[^0-9K]/g,'');
  const issues=[];
  if(inv.invoiceNumber&&s(inv.invoiceNumber)!==dte.folio)issues.push('folio');
  if(inv.supplierRut&&normalizeRut(inv.supplierRut)!==normalizeRut(dte.rut))issues.push('rut_emisor');
  if(total>0&&Math.abs(total-dte.total)>2)issues.push('total');
  if(inv.invoiceDate&&s(inv.invoiceDate).slice(0,10)!==dte.date)issues.push('fecha');
  if(!inv.supplierRut)issues.push('rut_emisor_no_visible');
  if(!inv.invoiceDate)issues.push('fecha_no_visible');
  if(!inv.invoiceNumber)issues.push('folio_no_visible');
  if(total<=0)issues.push('total_no_visible');
  return{verified:issues.length===0,discrepancies:issues,originalDte:dte};
}

const xmlNode=root=>first(root?.NuvastoInvoiceEvidence);
const xmlNumber=value=>{
  if(value===undefined||value===null||String(value).trim()==='')return 0;
  const n=Number(String(value).trim().replace(',','.'));
  if(!Number.isFinite(n)||n<0)throw new Error('XML interno contiene un monto o cantidad inválida');
  return n;
};
export function parseInternalInvoiceXml(xml){
  if(typeof xml!=='string'||xml.length>5*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML interno inválido o de tamaño excesivo');
  const node=xmlNode(new XMLParser({removeNSPrefix:false,ignoreAttributes:false,parseTagValue:false,processEntities:false}).parse(xml));
  if(!node||node['@_origin']!=='photo-derived'||node['@_authenticatedDTE']!=='false'||String(node['@_version'])!=='2')
    throw new Error('El archivo no es un XML interno Nuvasto v2 generado desde documento');
  const totals={},numericFields=['subtotal','discount','net','freight','vat','additionalTax','other','exempt','total'];
  for(const name of numericFields)totals[name]=xmlNumber(node.Totals?.[name]);
  const itemsNode=node.Lines?.Line,items=itemsNode===undefined?[]:(Array.isArray(itemsNode)?itemsNode:[itemsNode]);
  if(items.length>1000)throw new Error('XML interno tiene demasiadas líneas');
  const fields=['invoiceQuantity','packSize','totalUnits','netLineTotal','grossLineTotal','finalLineTotal','finalUnitPrice','sourcePrintedFinalUnitPrice','printedFinalUnitPrice','readConfidence','allocatedFreight','allocatedOtherCharges','allocatedVat','allocatedAdditionalTax'];
  const lines=items.map((row,index)=>{
    if(Number(row['@_number'])!==index+1)throw new Error('XML interno contiene numeración de líneas inválida');
    const line={code:s(row.code),sourceDescription:s(row.sourceDescription),description:s(row.description),priceSource:s(row.priceSource),taxAllocationMethod:s(row.taxAllocationMethod)};
    for(const k of fields)line[k]=xmlNumber(row[k]);
    return line;
  });
  const logisticsKeys=['freightBasis','otherBasis','freightIncludedInNet','evidenceHeader','evidenceText','confidence','reviewStatus','recommendation'];
  const logisticsEvidence={};
  for(const k of logisticsKeys)logisticsEvidence[k]=k==='confidence'?xmlNumber(node.LogisticsEvidence?.[k]):s(node.LogisticsEvidence?.[k]);
  return {origin:'photo-derived',authenticatedDTE:false,version:2,
    invoice:{supplierName:s(node.supplierName),supplierRut:s(node.supplierRut),invoiceNumber:s(node.invoiceNumber),
      invoiceDate:s(node.invoiceDate),currency:s(node.currency),documentType:s(node.documentType),
      documentTypeCode:s(node.documentTypeCode),totals,lines,logisticsEvidence},
    pricingAudit:{verified:s(node.PricingAudit?.verified)==='true',balanced:s(node.PricingAudit?.balanced)==='true',
      method:s(node.PricingAudit?.method),checksumDelta:Number(node.PricingAudit?.checksumDelta)||0}};
}
export function validateInternalInvoiceXml(xml,analysis){
  const parsed=parseInternalInvoiceXml(xml),original=analysis?.invoice||{},lines=original.lines||original.items||[];
  const sameNumber=(a,b)=>Math.abs(Number(a||0)-Number(b||0))<0.000001;
  if(parsed.invoice.invoiceNumber!==s(original.invoiceNumber)||parsed.invoice.supplierRut!==s(original.supplierRut)
    ||parsed.invoice.lines.length!==lines.length)throw new Error('XML interno perdió folio, emisor o líneas');
  for(const name of ['total','net','vat','freight','additionalTax','other']){
    if(!sameNumber(parsed.invoice.totals[name],original.totals?.[name]))throw new Error('XML interno difiere del total '+name);
  }
  for(let i=0;i<lines.length;i++){
    const originalLine=lines[i],parsedLine=parsed.invoice.lines[i];
    if(parsedLine.description!==s(originalLine.description)||!sameNumber(parsedLine.invoiceQuantity,originalLine.invoiceQuantity)
      ||!sameNumber(parsedLine.grossLineTotal,originalLine.grossLineTotal)
      ||!sameNumber(parsedLine.sourcePrintedFinalUnitPrice,originalLine.sourcePrintedFinalUnitPrice))
      throw new Error('XML interno difiere de cantidades o costos en línea '+(i+1));
  }
  return {valid:true,origin:parsed.origin,lineCount:parsed.invoice.lines.length,total:parsed.invoice.totals.total,
    documentMathVerified:analysis?.documentMathVerified===true&&parsed.pricingAudit.verified===true};
}

export function processInternalInvoiceXml(analysis,xml){
  // XML is the serialized hand-off to the Nuvasto invoice processor;
  // retain server-side product matches and audit fields, but take amounts
  // and received quantities from the round-trip parsed XML evidence.
  const validation=validateInternalInvoiceXml(xml,analysis);
  const parsed=parseInternalInvoiceXml(xml);
  const source=analysis?.invoice||{},originalLines=source.lines||source.items||[];
  const lines=parsed.invoice.lines.map((row,index)=>{
    const original=originalLines[index]||{};
    return {...original,...row};
  });
  const invoice={...source,...parsed.invoice,lines,items:lines,pricingSummary:source.pricingSummary,
    logisticsEvidence:{...source.logisticsEvidence,...parsed.invoice.logisticsEvidence}};
  return {...analysis,invoice,internalXmlProcessed:true,internalXmlValidation:validation};
}
