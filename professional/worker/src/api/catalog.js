import {
  HttpError,
  ROLES,
  assertMinimumRole,
  assertRole,
  bool,
  canTransition,
  integer,
  monthKey,
  normalizeRut,
  nowIso,
  number,
  optionalText,
  planFor,
  readJson,
  requireText,
  sanitizeFileName,
  sha256,
  slugify,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';
function rows(result) {
  return result?.results || [];
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

async function requireLocation(env, actor, locationId) {
  const location = await env.DB.prepare('SELECT * FROM locations WHERE id = ? AND org_id = ? AND active = 1')
    .bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed(actor, location.id)) throw new HttpError(404, 'Local no encontrado', 'not_found');
  return location;
}

async function incrementUsage(env, orgId, metric, amount = 1) {
  const key = monthKey();
  await env.DB.prepare(`
    INSERT INTO usage_counters (org_id, month_key, metric, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, month_key, metric)
    DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at
  `).bind(orgId, key, metric, amount, nowIso()).run();
}

async function usageValue(env, orgId, metric) {
  const row = await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id = ? AND month_key = ? AND metric = ?')
    .bind(orgId, monthKey(), metric).first();
  return Number(row?.quantity || 0);
}

async function enforceCountLimit(env, actor, table, limitKey, extraWhere = '') {
  const limits = planFor(actor.organization.plan);
  const limit = Number(limits[limitKey]);
  if (!Number.isFinite(limit)) return;
  const allowedTables = new Set(['locations', 'suppliers', 'products']);
  if (!allowedTables.has(table)) throw new HttpError(500, 'Configuración de límite inválida');
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE org_id = ? ${extraWhere}`)
    .bind(actor.orgId).first();
  if (Number(row?.total || 0) >= limit) {
    throw new HttpError(402, `El plan ${actor.organization.plan} permite hasta ${limit} ${limitKey}`, 'plan_limit');
  }
}

export async function dashboard(env, actor) {
  const scope=actor.locationScope?.includes?.('*')?'*':(actor.locationScope||[]).join(',');
  const orderScope=`(? = '*' OR instr(',' || ? || ',', ',' || location_id || ',') > 0)`;
  const invoiceScope=`(? = '*' OR EXISTS (SELECT 1 FROM invoice_location_links il WHERE il.invoice_id = invoices.id AND instr(',' || ? || ',', ',' || il.location_id || ',') > 0))`;
  const [orders,pending,spend,suppliers,products,issues,documents]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND created_at >= datetime('now','-30 day') AND ${orderScope}`).bind(actor.orgId,scope,scope).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND status IN ('requested','approved','sent','confirmed','partially_received') AND ${orderScope}`).bind(actor.orgId,scope,scope).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id = ? AND invoice_date >= date('now','-30 day') AND status != 'void' AND ${invoiceScope}`).bind(actor.orgId,scope,scope).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE org_id = ? AND active = 1').bind(actor.orgId).first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE org_id = ? AND active = 1').bind(actor.orgId).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM reconciliation_issues WHERE org_id = ? AND status = 'open'").bind(actor.orgId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM document_links dl WHERE dl.org_id = ? AND (? = '*' OR EXISTS (SELECT 1 FROM entity_snapshots es WHERE es.org_id=dl.org_id AND es.entity_type=dl.entity_type AND es.entity_id=dl.entity_id AND instr(',' || ? || ',', ',' || es.location_id || ',') > 0))`).bind(actor.orgId,scope,scope).first()
  ]);
  const recent=await env.DB.prepare(`
    SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.gross_total,o.location_id,
      s.name AS supplier_name,l.name AS location_name,u.display_name AS requested_by_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN users u ON u.id=o.requested_by
    WHERE o.org_id=? AND (?='*' OR instr(',' || ? || ',', ',' || o.location_id || ',') > 0)
    ORDER BY o.created_at DESC LIMIT 8
  `).bind(actor.orgId,scope,scope).all();
  const [orderHistory,spendHistory]=await Promise.all([
    env.DB.prepare(`SELECT substr(created_at,1,7) AS month,COUNT(*) AS total FROM orders WHERE org_id=? AND created_at>=datetime('now','-12 month') AND ${orderScope} GROUP BY month ORDER BY month`).bind(actor.orgId,scope,scope).all(),
    env.DB.prepare(`SELECT substr(invoice_date,1,7) AS month,COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id=? AND invoice_date>=date('now','-12 month') AND status!='void' AND ${invoiceScope} GROUP BY month ORDER BY month`).bind(actor.orgId,scope,scope).all()
  ]);
  return {
    metrics:{orders30d:Number(orders?.total||0),pendingOrders:Number(pending?.total||0),spend30d:Number(spend?.total||0),suppliers:Number(suppliers?.total||0),products:Number(products?.total||0),openIssues:Number(issues?.total||0),archivedDocuments:Number(documents?.total||0)},
    history:{orders:rows(orderHistory).map(row=>({month:row.month,total:Number(row.total||0)})),spend:rows(spendHistory).map(row=>({month:row.month,total:Number(row.total||0)}))},
    recentOrders:rows(recent).map(order=>({id:order.id,folio:order.folio,status:order.status,supplierName:order.supplier_name,locationName:order.location_name,requestedBy:order.requested_by_name,deliveryDate:order.delivery_date,grossTotal:Number(order.gross_total||0),createdAt:order.created_at}))
  };
}

export async function listLocations(env, actor) {
  const result = await env.DB.prepare(`
    SELECT id, name, code, timezone, active, created_at, updated_at
    FROM locations WHERE org_id = ? ORDER BY active DESC, name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return rows(result).filter(location => locationAllowed(actor, location.id)).map(location => ({...location, active: Boolean(location.active)}));
}

export async function createLocation(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  if (!actor.isPlatformOwner) await enforceCountLimit(env, actor, 'locations', 'locations', 'AND active = 1');
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, 'Nombre del local', {max: 120});
  const code = requireText(body.code || slugify(name).slice(0, 10).toUpperCase(), 'Código', {max: 12}).toUpperCase();
  const timezone = String(body.timezone || 'America/Santiago').slice(0, 60);
  await env.DB.prepare(`INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`) 
    .bind(id, actor.orgId, name, code, timezone, nowIso(), nowIso()).run();
  await writeAudit(env, actor, request, 'location.create', 'location', id, {name, code});
  return {id, name, code, timezone, active: true};
}

export async function listSuppliers(env, actor, url) {
  const query = String(url.searchParams.get('q') || '').trim();
  const activeOnly = url.searchParams.get('active') !== 'all';
  const result = await env.DB.prepare(`
    SELECT s.*,
      COUNT(DISTINCT sp.product_id) AS product_count,
      MAX(i.invoice_date) AS last_invoice_date
    FROM suppliers s
    LEFT JOIN supplier_products sp ON sp.supplier_id = s.id AND sp.active = 1
    LEFT JOIN invoices i ON i.supplier_id = s.id AND i.status != 'void'
    WHERE s.org_id = ?
      AND (? = '' OR s.name LIKE '%' || ? || '%' OR s.rut LIKE '%' || ? || '%')
      AND (? = 0 OR s.active = 1)
    GROUP BY s.id
    ORDER BY s.active DESC, s.name COLLATE NOCASE
    LIMIT 500
  `).bind(actor.orgId, query, query, query, activeOnly ? 1 : 0).all();
  return rows(result).map(supplier => ({
    id: supplier.id,
    name: supplier.name,
    legalName: supplier.legal_name,
    rut: supplier.rut,
    email: supplier.email,
    phone: supplier.phone,
    contactName: supplier.contact_name,
    leadDays: Number(supplier.lead_days || 0),
    cutoffTime: supplier.cutoff_time,
    minimumOrder: Number(supplier.minimum_order || 0),
    paymentTerms: supplier.payment_terms,
    active: Boolean(supplier.active),
    productCount: Number(supplier.product_count || 0),
    lastInvoiceDate: supplier.last_invoice_date
  }));
}

export async function createSupplier(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  await enforceCountLimit(env, actor, 'suppliers', 'suppliers', 'AND active = 1');
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, 'Nombre del proveedor', {max: 160});
  const data = {
    legalName: optionalText(body.legalName, {max: 180}),
    rut: body.rut ? normalizeRut(body.rut) : '',
    email: optionalText(body.email, {max: 180}).toLowerCase(),
    phone: optionalText(body.phone, {max: 40}),
    contactName: optionalText(body.contactName, {max: 120}),
    leadDays: integer(body.leadDays, {min: 0, max: 365}),
    cutoffTime: optionalText(body.cutoffTime, {max: 10}),
    minimumOrder: integer(body.minimumOrder, {min: 0, max: 999999999}),
    paymentTerms: optionalText(body.paymentTerms, {max: 240})
  };
  await env.DB.prepare(`
    INSERT INTO suppliers
      (id, org_id, name, legal_name, rut, email, phone, contact_name, lead_days, cutoff_time, minimum_order, payment_terms, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, actor.orgId, name, data.legalName, data.rut, data.email, data.phone, data.contactName, data.leadDays, data.cutoffTime, data.minimumOrder, data.paymentTerms, nowIso(), nowIso()).run();
  await writeAudit(env, actor, request, 'supplier.create', 'supplier', id, {name, rut: data.rut});
  return {id, name, ...data, active: true};
}

export async function updateSupplier(request, env, actor, supplierId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const current = await env.DB.prepare('SELECT * FROM suppliers WHERE id = ? AND org_id = ?').bind(supplierId, actor.orgId).first();
  if (!current) throw new HttpError(404, 'Proveedor no encontrado', 'not_found');
  const body = await readJson(request);
  const next = {
    name: body.name === undefined ? current.name : requireText(body.name, 'Nombre', {max: 160}),
    legalName: body.legalName === undefined ? current.legal_name : optionalText(body.legalName, {max: 180}),
    rut: body.rut === undefined ? current.rut : (body.rut ? normalizeRut(body.rut) : ''),
    email: body.email === undefined ? current.email : optionalText(body.email, {max: 180}).toLowerCase(),
    phone: body.phone === undefined ? current.phone : optionalText(body.phone, {max: 40}),
    contactName: body.contactName === undefined ? current.contact_name : optionalText(body.contactName, {max: 120}),
    leadDays: body.leadDays === undefined ? current.lead_days : integer(body.leadDays, {min: 0, max: 365}),
    cutoffTime: body.cutoffTime === undefined ? current.cutoff_time : optionalText(body.cutoffTime, {max: 10}),
    minimumOrder: body.minimumOrder === undefined ? current.minimum_order : integer(body.minimumOrder, {min: 0, max: 999999999}),
    paymentTerms: body.paymentTerms === undefined ? current.payment_terms : optionalText(body.paymentTerms, {max: 240}),
    active: body.active === undefined ? current.active : (bool(body.active) ? 1 : 0)
  };
  await env.DB.prepare(`
    UPDATE suppliers SET name = ?, legal_name = ?, rut = ?, email = ?, phone = ?, contact_name = ?,
      lead_days = ?, cutoff_time = ?, minimum_order = ?, payment_terms = ?, active = ?, updated_at = ?
    WHERE id = ? AND org_id = ?
  `).bind(next.name, next.legalName, next.rut, next.email, next.phone, next.contactName, next.leadDays, next.cutoffTime, next.minimumOrder, next.paymentTerms, next.active, nowIso(), supplierId, actor.orgId).run();
  await writeAudit(env, actor, request, 'supplier.update', 'supplier', supplierId, {active: Boolean(next.active)});
  return {id: supplierId, ...next, active: Boolean(next.active)};
}

export async function listCategories(env, actor) {
  const result = await env.DB.prepare('SELECT id, name, sort_order, active FROM categories WHERE org_id = ? ORDER BY sort_order, name COLLATE NOCASE')
    .bind(actor.orgId).all();
  return rows(result).map(category => ({id: category.id, name: category.name, sortOrder: Number(category.sort_order), active: Boolean(category.active)}));
}

export async function createCategory(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, 'Nombre de categoría', {max: 100});
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM categories WHERE org_id = ?').bind(actor.orgId).first();
  await env.DB.prepare('INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(id, actor.orgId, name, Number(max?.value || 0) + 1, nowIso(), nowIso()).run();
  await writeAudit(env, actor, request, 'category.create', 'category', id, {name});
  return {id, name, active: true};
}

export async function listProducts(env, actor, url) {
  const query = String(url.searchParams.get('q') || '').trim();
  const supplierId = String(url.searchParams.get('supplierId') || '');
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
    ORDER BY p.active DESC, c.sort_order, p.name COLLATE NOCASE
    LIMIT 1000
  `).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId).all();
  const map = new Map();
  for (const row of rows(result)) {
    if (!map.has(row.id)) {
      map.set(row.id, {
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
        suppliers: []
      });
    }
    if (row.supplier_product_id) {
      map.get(row.id).suppliers.push({
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
  }
  return [...map.values()];
}

export async function createProduct(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  await enforceCountLimit(env, actor, 'products', 'products', 'AND active = 1');
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, 'Nombre del producto', {max: 200});
  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const category = await env.DB.prepare('SELECT id FROM categories WHERE id = ? AND org_id = ?').bind(categoryId, actor.orgId).first();
    if (!category) throw new HttpError(400, 'Categoría inválida', 'invalid_category');
  }
  await env.DB.prepare(`
    INSERT INTO products
      (id, org_id, category_id, name, brand, variant, content_value, content_unit, base_unit, barcode, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    id, actor.orgId, categoryId, name, optionalText(body.brand, {max: 100}), optionalText(body.variant, {max: 100}),
    number(body.contentValue, {min: 0, max: 999999}), optionalText(body.contentUnit || 'ml', {max: 20}),
    optionalText(body.baseUnit || 'unidad', {max: 30}), optionalText(body.barcode, {max: 80}), nowIso(), nowIso()
  ).run();
  await writeAudit(env, actor, request, 'product.create', 'product', id, {name});
  return {id, name, categoryId, active: true};
}

export async function linkSupplierProduct(request, env, actor, productId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const body = await readJson(request);
  const [product, supplier] = await Promise.all([
    env.DB.prepare('SELECT id, name FROM products WHERE id = ? AND org_id = ?').bind(productId, actor.orgId).first(),
    env.DB.prepare('SELECT id, name FROM suppliers WHERE id = ? AND org_id = ?').bind(String(body.supplierId || ''), actor.orgId).first()
  ]);
  if (!product || !supplier) throw new HttpError(400, 'Producto o proveedor inválido', 'invalid_relation');
  const id = uuid();
  const units = number(body.unitsPerOrderUnit, {min: 0.001, max: 100000, fallback: 1});
  const multiple = number(body.quantityMultiple, {min: 0.001, max: 100000, fallback: 1});
  await env.DB.prepare(`
    INSERT INTO supplier_products
      (id, org_id, supplier_id, product_id, supplier_sku, supplier_name, order_unit, units_per_order_unit, minimum_quantity, quantity_multiple, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(supplier_id, product_id)
    DO UPDATE SET supplier_sku = excluded.supplier_sku, supplier_name = excluded.supplier_name,
      order_unit = excluded.order_unit, units_per_order_unit = excluded.units_per_order_unit,
      minimum_quantity = excluded.minimum_quantity, quantity_multiple = excluded.quantity_multiple,
      active = 1, updated_at = excluded.updated_at
  `).bind(
    id, actor.orgId, supplier.id, product.id,
    optionalText(body.supplierSku, {max: 100}), optionalText(body.supplierProductName || product.name, {max: 220}),
    optionalText(body.orderUnit || 'unidad', {max: 60}), units,
    number(body.minimumQuantity, {min: 0, max: 100000}), multiple, nowIso(), nowIso()
  ).run();
  await writeAudit(env, actor, request, 'supplier_product.link', 'product', productId, {supplierId: supplier.id, unitsPerOrderUnit: units});
  return {productId, supplierId: supplier.id, unitsPerOrderUnit: units};
}
