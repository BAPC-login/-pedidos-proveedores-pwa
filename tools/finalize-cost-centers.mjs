import fs from 'node:fs';

const path = 'professional/worker/src/api/catalog.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}`);
  source = source.replace(needle, replacement);
}

replaceOnce(
  "    env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE org_id = ? AND active = 1').bind(actor.orgId).first(),",
  "    env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS total FROM products p WHERE p.org_id = ? AND p.active = 1 AND (? = '*' OR EXISTS (SELECT 1 FROM product_cost_centers pcc JOIN cost_centers cc ON cc.id = pcc.cost_center_id WHERE pcc.product_id = p.id AND instr(',' || ? || ',', ',' || cc.location_id || ',') > 0))`).bind(actor.orgId,scope,scope).first(),",
  'scoped dashboard product count'
);

replaceOnce(
`    SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.gross_total,o.location_id,
      s.name AS supplier_name,l.name AS location_name,u.display_name AS requested_by_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN users u ON u.id=o.requested_by`,
`    SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.gross_total,o.location_id,
      s.name AS supplier_name,l.name AS location_name,
      cc.id AS cost_center_id,cc.name AS cost_center_name,u.display_name AS requested_by_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id
    LEFT JOIN users u ON u.id=o.requested_by`,
  'recent order cost center join'
);

replaceOnce(
"    recentOrders:rows(recent).map(order=>({id:order.id,folio:order.folio,status:order.status,supplierName:order.supplier_name,locationName:order.location_name,requestedBy:order.requested_by_name,deliveryDate:order.delivery_date,grossTotal:Number(order.gross_total||0),createdAt:order.created_at}))",
"    recentOrders:rows(recent).map(order=>({id:order.id,folio:order.folio,status:order.status,supplierName:order.supplier_name,locationName:order.location_name,costCenterId:order.cost_center_id,costCenterName:order.cost_center_name||'Barra',requestedBy:order.requested_by_name,deliveryDate:order.delivery_date,grossTotal:Number(order.gross_total||0),createdAt:order.created_at}))",
  'recent order cost center response'
);

replaceOnce(
`  const supplierId = String(url.searchParams.get('supplierId') || '');
  const costCenterId = String(url.searchParams.get('costCenterId') || '');`,
`  const supplierId = String(url.searchParams.get('supplierId') || '');
  const costCenterId = String(url.searchParams.get('costCenterId') || '');
  const scope = actor.locationScope?.includes?.('*') ? '*' : (actor.locationScope || []).join(',');`,
  'product scope variable'
);

replaceOnce(
`      AND (? = '' OR sp.supplier_id = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM product_cost_centers pccf WHERE pccf.product_id = p.id AND pccf.cost_center_id = ?))
    ORDER BY`,
`      AND (? = '' OR sp.supplier_id = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM product_cost_centers pccf WHERE pccf.product_id = p.id AND pccf.cost_center_id = ?))
      AND (? = '*' OR EXISTS (
        SELECT 1 FROM product_cost_centers pccscope
        JOIN cost_centers ccscope ON ccscope.id = pccscope.cost_center_id
        WHERE pccscope.product_id = p.id
          AND instr(',' || ? || ',', ',' || ccscope.location_id || ',') > 0
      ))
    ORDER BY`,
  'product location scope filter'
);

replaceOnce(
"  `).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId, costCenterId, costCenterId).all();",
"  `).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId, costCenterId, costCenterId, scope, scope).all();",
  'product scope bindings'
);

fs.writeFileSync(path, source);

const releasePath = 'worker/src/combined.js';
const release = fs.readFileSync(releasePath, 'utf8');
if (!release.includes("const PLATFORM_RELEASE = '2026.07.22.19';")) throw new Error('Release 19 marker missing');
fs.writeFileSync(releasePath, release.replace("const PLATFORM_RELEASE = '2026.07.22.19';", "const PLATFORM_RELEASE = '2026.07.22.20';"));

console.log('Final cost center scope and dashboard patches applied.');
