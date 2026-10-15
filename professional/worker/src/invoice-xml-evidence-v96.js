import {XMLParser} from 'fast-xml-parser';

// An OCR-generated XML is internal evidence, NEVER a signed SII DTE.
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const field=(name,value)=>`<${name}>${escape(value)}</${name}>`;
export function buildInternalInvoiceXml(analysis){
  const invoice=analysis?.invoice||{},totals=invoice.totals||{},items=invoice.lines||invoice.items||[];
  const header=['supplierName','supplierRut','invoiceNumber','invoiceDate','currency','documentType','documentTypeCode'].map(k=>field(k,invoice[k])).join('');
  const amount=['subtotal','discount','net','freight','vat','additionalTax','other','exempt','total'].map(k=>field(k,totals[k]??0)).join('');
  const lines=items.map((item,index)=>`<Line number="${index+1}">${['code','sourceDescription','description','invoiceQuantity','packSize','netLineTotal','grossLineTotal','finalUnitPrice','sourcePrintedFinalUnitPrice','priceSource','readConfidence'].map(k=>field(k,item[k])).join('')}</Line>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><NuvastoInvoiceEvidence origin="photo-derived" authenticatedDTE="false" version="1">${header}<Totals>${amount}</Totals><Lines>${lines}</Lines></NuvastoInvoiceEvidence>`;
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
  if(!document||!s(id.Folio)||!s(issuer.RUTEmisor)||!Number.isFinite(n(totals.MntTotal)))throw new Error('El archivo no corresponde a un DTE chileno con folio, emisor y total');
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
  return{verified:issues.length===0&&Boolean(inv.invoiceNumber)&&total>0,discrepancies:issues,originalDte:dte};
}
