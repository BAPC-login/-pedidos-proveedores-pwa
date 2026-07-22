function rows(result) {
  return result?.results || [];
}

export async function dashboard(env, actor) {
  const scope = actor.locationScope?.includes?.('*') ? '*' : (actor.locationScope || []).join(',');
  const orderScope = `(? = '*' OR instr(',' || ? || ',', ',' || location_id || ',') > 0)`;
  const invoiceScope = `(? = '*' OR EXISTS (SELECT 1 FROM invoice_location_links il WHERE il.invoice_id = invoices.id AND instr(',' || ? || ',', ',' || il.location_id || ',') > 0))`;
  const productScope = `(? = '*' OR EXISTS (
    SELECT 1 FROM product_cost_centers pcc
    JOIN cost_centers cc ON cc.id = pcc.cost_center_id
    WHERE pcc.product_id = p.id
      AND instr(',' || ? || ',', ',' || cc.location_id || ',') > 0
  ))`;

  const [orders, pending, spend, suppliers, products, issues, documents] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND created_at >= datetime('now','-30 day') AND ${orderScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND status IN ('requested','approved','sent','confirmed','partially_received') AND ${orderScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id = ? AND invoice_date >= date('now','-30 day') AND status != 'void' AND ${invoiceScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE org_id = ? AND active = 1').bind(actor.orgId).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS total FROM products p WHERE p.org_id = ? AND p.active = 1 AND ${productScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM reconciliation_issues WHERE org_id = ? AND status = 'open'").bind(actor.orgId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM document_links dl WHERE dl.org_id = ? AND (? = '*' OR EXISTS (SELECT 1 FROM entity_snapshots es WHERE es.org_id=dl.org_id AND es.entity_type=dl.entity_type AND es.entity_id=dl.entity_id AND instr(',' || ? || ',', ',' || es.location_id || ',') > 0))`).bind(actor.orgId, scope, scope).first()
  ]);

  const recent = await env.DB.prepare(`
    SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.gross_total,o.location_id,
      s.name AS supplier_name,l.name AS location_name,
      cc.id AS cost_center_id,cc.name AS cost_center_name,u.display_name AS requested_by_name
    FROM orders o
    JOIN suppliers s ON s.id=o.supplier_id
    JOIN locations l ON l.id=o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id=o.id
    LEFT JOIN cost_centers cc ON cc.id=occ.cost_center_id
    LEFT JOIN users u ON u.id=o.requested_by
    WHERE o.org_id=? AND (?='*' OR instr(',' || ? || ',', ',' || o.location_id || ',') > 0)
    ORDER BY o.created_at DESC LIMIT 8
  `).bind(actor.orgId, scope, scope).all();

  const [orderHistory, spendHistory] = await Promise.all([
    env.DB.prepare(`SELECT substr(created_at,1,7) AS month,COUNT(*) AS total FROM orders WHERE org_id=? AND created_at>=datetime('now','-12 month') AND ${orderScope} GROUP BY month ORDER BY month`).bind(actor.orgId, scope, scope).all(),
    env.DB.prepare(`SELECT substr(invoice_date,1,7) AS month,COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id=? AND invoice_date>=date('now','-12 month') AND status!='void' AND ${invoiceScope} GROUP BY month ORDER BY month`).bind(actor.orgId, scope, scope).all()
  ]);

  return {
    metrics: {
      orders30d: Number(orders?.total || 0),
      pendingOrders: Number(pending?.total || 0),
      spend30d: Number(spend?.total || 0),
      suppliers: Number(suppliers?.total || 0),
      products: Number(products?.total || 0),
      openIssues: Number(issues?.total || 0),
      archivedDocuments: Number(documents?.total || 0)
    },
    history: {
      orders: rows(orderHistory).map(row => ({month: row.month, total: Number(row.total || 0)})),
      spend: rows(spendHistory).map(row => ({month: row.month, total: Number(row.total || 0)}))
    },
    recentOrders: rows(recent).map(order => ({
      id: order.id,
      folio: order.folio,
      status: order.status,
      supplierName: order.supplier_name,
      locationName: order.location_name,
      costCenterId: order.cost_center_id,
      costCenterName: order.cost_center_name || 'Barra',
      requestedBy: order.requested_by_name,
      deliveryDate: order.delivery_date,
      grossTotal: Number(order.gross_total || 0),
      createdAt: order.created_at
    }))
  };
}

export async function listProducts(env, actor, url) {
  const query = String(url.searchParams.get('q') || '').trim();
  const supplierId = String(url.searchParams.get('supplierId') || '');
  const costCenterId = String(url.searchParams.get('costCenterId') || '');
  const scope = actor.locationScope?.includes?.('*') ? '*' : (actor.locationScope || []).join(',');

  const result = await env.DB.prepare(`
    SELECT p.id, p.name, p.brand, p.variant, p.content_value, p.content_unit, p.base_unit, p.barcode, p.active,
      c.id AS category_id, c.name AS category_name,
      sp.id AS supplier_product_id, sp.supplier_id, sp.supplier_sku, sp.supplier_name, sp.order_unit,
      sp.units_per_order_unit, sp.minimum_quantity, sp.quantity_multiple, sp.last_gross_unit_price,
      s.name AS supplier_name_display
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN supplier_products sp ON sp.product_id = p.id AND sp.active = 1 AND (? = '' OR sp.supplier_id = ?)
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    WHERE p.org_id = ?
      AND (? = '' OR p.name LIKE '%' || ? || '%' OR p.brand LIKE '%' || ? || '%' OR p.barcode LIKE '%' || ? || '%')
      AND (? = '' OR sp.supplier_id = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM product_cost_centers pccf WHERE pccf.product_id = p.id AND pccf.cost_center_id = ?))
      AND (? = '*' OR EXISTS (
        SELECT 1 FROM product_cost_centers pccscope
        JOIN cost_centers ccscope ON ccscope.id = pccscope.cost_center_id
        WHERE pccscope.product_id = p.id
          AND instr(',' || ? || ',', ',' || ccscope.location_id || ',') > 0
      ))
    ORDER BY p.active DESC, c.sort_order, p.name COLLATE NOCASE
    LIMIT 1000
  `).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId, costCenterId, costCenterId, scope, scope).all();

  const map = new Map();
  for (const row of rows(result)) {
    if (!map.has(row.id)) map.set(row.id, {
      id: row.id,
      name: row.name,
      brand: row.brand,
      variant: row.variant,
      categoryId: row.category_id,
      categoryName: row.category_name,
      contentValue: Number(row.content_value || 0),
      contentUnit: row.content_unit,
      baseUnit: row.base_unit,
      barcode: row.barcode,
      active: Boolean(row.active),
      suppliers: [],
      costCenters: []
    });
    if (row.supplier_product_id) map.get(row.id).suppliers.push({
      id: row.supplier_product_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name_display,
      supplierSku: row.supplier_sku,
      supplierProductName: row.supplier_name,
      orderUnit: row.order_unit,
      unitsPerOrderUnit: Number(row.units_per_order_unit || 1),
      minimumQuantity: Number(row.minimum_quantity || 0),
      quantityMultiple: Number(row.quantity_multiple || 1),
      lastGrossUnitPrice: Number(row.last_gross_unit_price || 0)
    });
  }

  const centerRows = await env.DB.prepare(`
    SELECT pcc.product_id, cc.id, cc.location_id, cc.name, cc.code, l.name AS location_name
    FROM product_cost_centers pcc
    JOIN cost_centers cc ON cc.id = pcc.cost_center_id AND cc.active = 1
    JOIN locations l ON l.id = cc.location_id
    WHERE pcc.org_id = ?
      AND (? = '*' OR instr(',' || ? || ',', ',' || cc.location_id || ',') > 0)
    ORDER BY l.name COLLATE NOCASE, cc.name COLLATE NOCASE
  `).bind(actor.orgId, scope, scope).all();

  for (const center of rows(centerRows)) {
    const product = map.get(center.product_id);
    if (product) product.costCenters.push({
      id: center.id,
      locationId: center.location_id,
      locationName: center.location_name,
      name: center.name,
      code: center.code
    });
  }
  return [...map.values()];
}
