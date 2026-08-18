import {publicOrderState} from '../workflow-rules.js';

function rows(result){return result?.results||[]}
function locationAllowed(actor,locationId){return actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId)}
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

export async function listOrdersV2(env,actor,url){
  const status=String(url.searchParams.get('status')||''),query=String(url.searchParams.get('q')||'').trim(),costCenterId=String(url.searchParams.get('costCenterId')||'');
  const result=await env.DB.prepare(`
    WITH invoice_payment AS (
      SELECT i.id AS invoice_id,i.org_id,i.gross_total,
        MAX(CASE WHEN i.payment_status='paid' OR i.status='paid' OR ps.status='paid' THEN 1 ELSE 0 END) AS legacy_paid,
        MAX(COALESCE(ps.amount,i.gross_total,0)) AS due_amount,
        COALESCE(SUM(CASE WHEN pd.status='paid' THEN pa.allocated_amount ELSE 0 END),0) AS paid_allocated,
        MAX(CASE WHEN ps.status NOT IN ('paid','disputed') AND ps.due_date<date('now') THEN 1 ELSE 0 END) AS schedule_overdue
      FROM invoices i
      LEFT JOIN payment_schedules ps ON ps.invoice_id=i.id AND ps.org_id=i.org_id
      LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id AND pa.org_id=i.org_id
      LEFT JOIN payment_documents pd ON pd.id=pa.payment_document_id AND pd.org_id=pa.org_id AND pd.status NOT IN ('disputed','cancelled')
      WHERE i.org_id=? GROUP BY i.id
    ),
    order_invoice_stats AS (
      SELECT iol.order_id,COUNT(DISTINCT iol.invoice_id) AS invoice_count,COALESCE(SUM(i.gross_total),0) AS invoiced_total,
        SUM(CASE WHEN COALESCE(ip.legacy_paid,0)=1 OR (COALESCE(ip.due_amount,0)>0 AND COALESCE(ip.paid_allocated,0)>=COALESCE(ip.due_amount,0)) THEN 1 ELSE 0 END) AS paid_invoice_count,
        SUM(CASE WHEN COALESCE(ip.legacy_paid,0)=0 AND NOT(COALESCE(ip.due_amount,0)>0 AND COALESCE(ip.paid_allocated,0)>=COALESCE(ip.due_amount,0)) AND COALESCE(ip.schedule_overdue,0)=1 THEN 1 ELSE 0 END) AS overdue_invoice_count
      FROM invoice_order_links iol JOIN invoices i ON i.id=iol.invoice_id AND i.org_id=iol.org_id
      LEFT JOIN invoice_payment ip ON ip.invoice_id=i.id AND ip.org_id=i.org_id
      WHERE iol.org_id=? GROUP BY iol.order_id
    )
    SELECT o.id,o.folio,o.status,o.delivery_date,o.notes,o.currency,o.net_total,o.tax_total,o.gross_total,
      o.created_at,o.updated_at,o.sent_at,o.revision,o.batch_id,o.emitted_at,
      s.id AS supplier_id,s.name AS supplier_name,s.settings_json AS supplier_settings,
      l.id AS location_id,l.name AS location_name,cc.id AS cost_center_id,cc.name AS cost_center_name,
      u.display_name AS requested_by_name,COUNT(oi.id) AS item_count,
      COALESCE(oist.invoice_count,0) AS invoice_count,COALESCE(oist.invoiced_total,0) AS invoiced_gross_total,
      COALESCE(oist.paid_invoice_count,0) AS paid_invoice_count,COALESCE(oist.overdue_invoice_count,0) AS overdue_invoice_count,
      (SELECT COUNT(*) FROM receptions r WHERE r.org_id=o.org_id AND r.order_id=o.id) AS reception_count,
      (SELECT MAX(COALESCE(r.received_at,r.created_at)) FROM receptions r WHERE r.org_id=o.org_id AND r.order_id=o.id) AS last_received_at,
      (SELECT e.reason FROM order_events e WHERE e.order_id=o.id AND e.to_status='cancelled' ORDER BY e.created_at DESC LIMIT 1) AS terminal_reason,
      (SELECT f.storage_key FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=o.org_id AND dl.entity_type='order' AND dl.entity_id=o.id AND dl.document_kind='order_pdf' ORDER BY dl.revision DESC,dl.created_at DESC LIMIT 1) AS pdf_key,
      (SELECT f.file_name FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=o.org_id AND dl.entity_type='order' AND dl.entity_id=o.id AND dl.document_kind='order_pdf' ORDER BY dl.revision DESC,dl.created_at DESC LIMIT 1) AS pdf_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN users u ON u.id=o.requested_by LEFT JOIN order_cost_centers occ ON occ.order_id=o.id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN order_invoice_stats oist ON oist.order_id=o.id
    WHERE o.org_id=? AND (?='' OR o.status=?) AND (?='' OR o.folio LIKE '%'||?||'%' OR s.name LIKE '%'||?||'%') AND (?='' OR occ.cost_center_id=?)
    GROUP BY o.id ORDER BY CASE WHEN o.status='draft' THEN 0 ELSE 1 END,o.updated_at DESC LIMIT 500
  `).bind(actor.orgId,actor.orgId,actor.orgId,status,status,query,query,query,costCenterId,costCenterId).all();
  return rows(result).filter(order=>locationAllowed(actor,order.location_id)).map(order=>{
    const identity=safeJson(order.supplier_settings,{}).identity||{},terminalReason=String(order.terminal_reason||''),deliveryOutcome=order.status==='cancelled'&&terminalReason.startsWith('Proveedor no presentado')?'not_presented':'';
    const invoiceCount=Number(order.invoice_count||0),paidInvoiceCount=Number(order.paid_invoice_count||0),overdueInvoiceCount=Number(order.overdue_invoice_count||0);
    return {id:order.id,batchId:order.batch_id||order.id,folio:order.folio,status:order.status,publicState:publicOrderState(order.status),deliveryOutcome,terminalReason,supplierId:order.supplier_id,supplierName:order.supplier_name,supplierLogoKey:String(identity.logoKey||''),supplierLogoName:String(identity.logoName||''),supplierLogoSize:Number(identity.logoSize||44),locationId:order.location_id,locationName:order.location_name,costCenterId:order.cost_center_id,costCenterName:order.cost_center_name||'Barra',requestedBy:order.requested_by_name,deliveryDate:order.delivery_date,notes:order.notes,currency:order.currency,netTotal:Number(order.net_total||0),taxTotal:Number(order.tax_total||0),grossTotal:Number(order.gross_total||0),invoicedGrossTotal:Number(order.invoiced_gross_total||0),itemCount:Number(order.item_count||0),invoiceCount,paidInvoiceCount,overdueInvoiceCount,paymentState:invoiceCount&&paidInvoiceCount>=invoiceCount?'paid':overdueInvoiceCount?'overdue':invoiceCount?'pending':'none',receptionCount:Number(order.reception_count||0),lastReceivedAt:order.last_received_at||null,pdfKey:order.pdf_key||'',pdfName:order.pdf_name||'',revision:Number(order.revision||1),createdAt:order.created_at,updatedAt:order.updated_at,sentAt:order.sent_at,emittedAt:order.emitted_at||order.sent_at||null};
  })
}
