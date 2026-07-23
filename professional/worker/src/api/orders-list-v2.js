import {publicOrderState} from '../workflow-rules.js';

function rows(result){return result?.results||[]}
function locationAllowed(actor,locationId){return actor.locationScope?.includes?.('*')||actor.locationScope?.includes?.(locationId)}
function safeJson(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

export async function listOrdersV2(env,actor,url){
  const status=String(url.searchParams.get('status')||''),query=String(url.searchParams.get('q')||'').trim(),costCenterId=String(url.searchParams.get('costCenterId')||'');
  const result=await env.DB.prepare(`
    SELECT o.id,o.folio,o.status,o.delivery_date,o.notes,o.currency,o.net_total,o.tax_total,o.gross_total,
      o.created_at,o.updated_at,o.sent_at,o.revision,o.batch_id,o.emitted_at,
      s.id AS supplier_id,s.name AS supplier_name,s.settings_json AS supplier_settings,
      l.id AS location_id,l.name AS location_name,cc.id AS cost_center_id,cc.name AS cost_center_name,
      u.display_name AS requested_by_name,COUNT(oi.id) AS item_count,
      (SELECT COUNT(*) FROM invoice_order_links iol WHERE iol.org_id=o.org_id AND iol.order_id=o.id) AS invoice_count,
      (SELECT COUNT(*) FROM receptions r WHERE r.org_id=o.org_id AND r.order_id=o.id) AS reception_count,
      (SELECT MAX(COALESCE(r.received_at,r.created_at)) FROM receptions r WHERE r.org_id=o.org_id AND r.order_id=o.id) AS last_received_at,
      (SELECT f.storage_key FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=o.org_id AND dl.entity_type='order' AND dl.entity_id=o.id AND dl.document_kind='order_pdf' ORDER BY dl.revision DESC,dl.created_at DESC LIMIT 1) AS pdf_key,
      (SELECT f.file_name FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=o.org_id AND dl.entity_type='order' AND dl.entity_id=o.id AND dl.document_kind='order_pdf' ORDER BY dl.revision DESC,dl.created_at DESC LIMIT 1) AS pdf_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN users u ON u.id=o.requested_by LEFT JOIN order_cost_centers occ ON occ.order_id=o.id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id LEFT JOIN order_items oi ON oi.order_id=o.id
    WHERE o.org_id=? AND (?='' OR o.status=?) AND (?='' OR o.folio LIKE '%'||?||'%' OR s.name LIKE '%'||?||'%') AND (?='' OR occ.cost_center_id=?)
    GROUP BY o.id ORDER BY CASE WHEN o.status='draft' THEN 0 ELSE 1 END,o.updated_at DESC LIMIT 500
  `).bind(actor.orgId,status,status,query,query,query,costCenterId,costCenterId).all();
  return rows(result).filter(order=>locationAllowed(actor,order.location_id)).map(order=>{
    const identity=safeJson(order.supplier_settings,{}).identity||{};
    return {id:order.id,batchId:order.batch_id||order.id,folio:order.folio,status:order.status,publicState:publicOrderState(order.status),supplierId:order.supplier_id,supplierName:order.supplier_name,supplierLogoKey:String(identity.logoKey||''),supplierLogoName:String(identity.logoName||''),supplierLogoSize:Number(identity.logoSize||44),locationId:order.location_id,locationName:order.location_name,costCenterId:order.cost_center_id,costCenterName:order.cost_center_name||'Barra',requestedBy:order.requested_by_name,deliveryDate:order.delivery_date,notes:order.notes,currency:order.currency,netTotal:Number(order.net_total||0),taxTotal:Number(order.tax_total||0),grossTotal:Number(order.gross_total||0),itemCount:Number(order.item_count||0),invoiceCount:Number(order.invoice_count||0),receptionCount:Number(order.reception_count||0),lastReceivedAt:order.last_received_at||null,pdfKey:order.pdf_key||'',pdfName:order.pdf_name||'',revision:Number(order.revision||1),createdAt:order.created_at,updatedAt:order.updated_at,sentAt:order.sent_at,emittedAt:order.emitted_at||order.sent_at||null};
  })
}
