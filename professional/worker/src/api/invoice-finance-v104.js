import {HttpError} from '../core.js';
const rows=result=>result?.results||[];
const num=value=>Number(value||0);
function checkDate(value){
  if(!value)return'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new HttpError(400,'Fecha inválida','invalid_date');
  return value;
}
function scope(actor){
  if(actor.locationScope?.includes?.('*'))return{where:'1=1',params:[]};
  const ids=(actor.locationScope||[]).filter(Boolean);
  if(!ids.length)return{where:'1=0',params:[]};
  return{where:'EXISTS (SELECT 1 FROM invoice_location_links sc WHERE sc.invoice_id=i.id AND sc.org_id=i.org_id AND sc.location_id IN ('+ids.map(()=>'?').join(',')+'))',params:ids};
}
export async function listFinanceInvoicesV104(env,actor,url){
  const qp=url.searchParams,supplierId=String(qp.get('supplierId')||''),from=checkDate(qp.get('from')||''),to=checkDate(qp.get('to')||''),invoiceNumber=String(qp.get('invoiceNumber')||'').trim().slice(0,80);
  if(from&&to&&from>to)throw new HttpError(400,'Rango de fechas invertido','invalid_date_range');
  const page=Math.min(10000,Math.max(1,Math.floor(Number(qp.get('page')||1))||1)),limit=50,sc=scope(actor);
  const where="i.org_id=? AND "+sc.where+" AND (?='' OR i.supplier_id=?) AND (?='' OR date(i.invoice_date)>=date(?)) AND (?='' OR date(i.invoice_date)<=date(?)) AND (?='' OR i.invoice_number LIKE '%'||?||'%')";
  const args=[actor.orgId,...sc.params,supplierId,supplierId,from,from,to,to,invoiceNumber,invoiceNumber];
  const count=await env.DB.prepare('SELECT COUNT(*) total,COALESCE(SUM(i.gross_total),0) gross FROM invoices i WHERE '+where).bind(...args).first();
  const query="SELECT i.id,i.supplier_id,i.invoice_number,i.document_type,i.invoice_date,i.gross_total,i.status,i.validation_status,i.payment_status,i.created_at, s.name supplier_name, f.storage_key pdf_key,f.file_name pdf_name, "+
    "(SELECT GROUP_CONCAT(DISTINCT l.name) FROM invoice_location_links il JOIN locations l ON l.id=il.location_id AND l.org_id=il.org_id WHERE il.invoice_id=i.id AND il.org_id=i.org_id) location_names, "+
    "(SELECT GROUP_CONCAT(DISTINCT o.folio) FROM invoice_order_links iol JOIN orders o ON o.id=iol.order_id AND o.org_id=iol.org_id WHERE iol.invoice_id=i.id AND iol.org_id=i.org_id) order_folios, "+
    "(SELECT ps.due_date FROM payment_schedules ps WHERE ps.invoice_id=i.id AND ps.org_id=i.org_id ORDER BY ps.created_at DESC LIMIT 1) due_date, "+
    "(SELECT ps.status FROM payment_schedules ps WHERE ps.invoice_id=i.id AND ps.org_id=i.org_id ORDER BY ps.created_at DESC LIMIT 1) schedule_status, "+
    "(SELECT COUNT(*) FROM invoice_lines il WHERE il.invoice_id=i.id) line_count "+
    "FROM invoices i JOIN suppliers s ON s.id=i.supplier_id AND s.org_id=i.org_id LEFT JOIN files f ON f.id=i.pdf_file_id AND f.org_id=i.org_id "+
    "WHERE "+where+" ORDER BY i.invoice_date DESC,i.created_at DESC,i.id DESC LIMIT ? OFFSET ?";
  const data=rows(await env.DB.prepare(query).bind(...args,limit,(page-1)*limit).all());
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
  const invoices=data.map(i=>{
    const raw=String(i.payment_status||''),scheduled=String(i.schedule_status||'');
    const paymentStatus=raw==='paid'||scheduled==='paid'?'paid':raw==='disputed'||scheduled==='disputed'?'disputed':
      i.due_date&&i.due_date<today?'overdue':scheduled==='scheduled'?'scheduled':'pending';
    return{id:i.id,supplierId:i.supplier_id,supplierName:i.supplier_name,invoiceNumber:i.invoice_number,documentType:i.document_type,
      invoiceDate:i.invoice_date,grossTotal:num(i.gross_total),status:i.status,validationStatus:i.validation_status||'',paymentStatus,
      dueDate:i.due_date||'',pdfKey:i.pdf_key||'',pdfName:i.pdf_name||'',locations:i.location_names||'',orderFolios:i.order_folios||'',
      lineCount:num(i.line_count),createdAt:i.created_at};
  });
  return{invoices,page,limit,total:num(count?.total),grossTotal:num(count?.gross),hasMore:page*limit<num(count?.total)};
}
function variation(current,prior){
  if(!prior)return{previousPrice:0,delta:0,percent:0,hasHistory:false,supplierId:'',supplierName:''};
  const previousPrice=num(prior.gross_unit_price),delta=Number((current-previousPrice).toFixed(2));
  return{previousPrice,delta,percent:previousPrice?Number((delta/previousPrice*100).toFixed(2)):0,
    hasHistory:true,supplierId:prior.supplier_id||'',supplierName:prior.supplier_name||''};
}
export async function getInvoicePriceImpactV104(env,actor,id){
  const i=await env.DB.prepare("SELECT i.id,i.org_id,i.supplier_id,i.invoice_number,i.invoice_date,i.created_at,i.gross_total,s.name supplier_name FROM invoices i JOIN suppliers s ON s.id=i.supplier_id AND s.org_id=i.org_id WHERE i.id=? AND i.org_id=?").bind(id,actor.orgId).first();
  if(!i)throw new HttpError(404,'Factura no encontrada','not_found');
  const sc=scope(actor);
  if(!await env.DB.prepare('SELECT 1 ok FROM invoices i WHERE i.id=? AND i.org_id=? AND '+sc.where).bind(id,actor.orgId,...sc.params).first())throw new HttpError(403,'Sin acceso a esta factura','forbidden');
  const lines=rows(await env.DB.prepare("SELECT il.id,il.product_id,il.source_description,il.gross_unit_price,il.total_units,p.name product_name FROM invoice_lines il LEFT JOIN products p ON p.id=il.product_id AND p.org_id=? WHERE il.invoice_id=? ORDER BY il.created_at,il.id").bind(actor.orgId,id).all());
  const results=[];
  for(const line of lines){
    const currentPrice=num(line.gross_unit_price),pid=String(line.product_id||'');
    let same=null,other=null;
    if(pid){
      const select="SELECT ph.gross_unit_price,ph.supplier_id,s.name supplier_name FROM price_history ph JOIN suppliers s ON s.id=ph.supplier_id AND s.org_id=ph.org_id WHERE ph.org_id=? AND ph.product_id=? AND ";
      const suffix=" AND ph.invoice_id<>? AND ph.created_at<=? ORDER BY ph.created_at DESC,ph.id DESC LIMIT 1";
      same=await env.DB.prepare(select+'ph.supplier_id=?'+suffix).bind(actor.orgId,pid,i.supplier_id,id,i.created_at).first();
      other=await env.DB.prepare(select+'ph.supplier_id<>?'+suffix).bind(actor.orgId,pid,i.supplier_id,id,i.created_at).first();
    }
    results.push({id:line.id,productId:pid,description:line.product_name||line.source_description,sourceDescription:line.source_description,
      currentPrice,unit:'unidad física',sameSupplier:variation(currentPrice,same),otherSupplier:variation(currentPrice,other)});
  }
  return{invoiceId:id,invoiceNumber:i.invoice_number,supplierId:i.supplier_id,supplierName:i.supplier_name,invoiceDate:i.invoice_date,
    grossTotal:num(i.gross_total),lines:results};
}
