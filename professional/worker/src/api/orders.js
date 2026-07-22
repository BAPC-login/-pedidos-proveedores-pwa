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
import {archiveOrderPdf} from '../storage.js';
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

async function requireCostCenter(env, actor, costCenterId, locationId) {
  const center = await env.DB.prepare('SELECT id, name, code, location_id FROM cost_centers WHERE id = ? AND org_id = ? AND location_id = ? AND active = 1')
    .bind(costCenterId, actor.orgId, locationId).first();
  if (!center || !locationAllowed(actor, center.location_id)) throw new HttpError(400, 'Centro de costo inválido para este local', 'invalid_cost_center');
  return center;
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

async function allocateFolio(env, actor, location, date = new Date()) {
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const prefix = String(location.code || 'PED').replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PED';
  const base = `${prefix}-${y}${m}${d}-`;
  const current = await env.DB.prepare(`SELECT folio FROM orders WHERE org_id = ? AND folio LIKE ? ORDER BY folio DESC LIMIT 1`)
    .bind(actor.orgId, `${base}%`).first();
  const next = current?.folio ? Number(current.folio.slice(base.length)) + 1 : 1;
  return `${base}${String(next).padStart(3, '0')}`;
}

function orderItemPayload(item) {
  return {
    supplierProductId: String(item.supplierProductId || ''),
    productId: String(item.productId || ''),
    description: requireText(item.description, 'Descripción del producto', {max: 240}),
    quantity: number(item.quantity, {min: 0.001, max: 100000}),
    orderUnit: optionalText(item.orderUnit || 'unidad', {max: 60}),
    unitsPerOrderUnit: number(item.unitsPerOrderUnit, {min: 0.001, max: 100000, fallback: 1}),
    expectedGrossUnitPrice: integer(item.expectedGrossUnitPrice, {min: 0, max: 999999999})
  };
}

export async function listOrders(env, actor, url) {
  const status = String(url.searchParams.get('status') || '');
  const query = String(url.searchParams.get('q') || '').trim();
  const costCenterId = String(url.searchParams.get('costCenterId') || '');
  const result = await env.DB.prepare(`
    SELECT o.id, o.folio, o.status, o.delivery_date, o.notes, o.currency, o.net_total, o.tax_total, o.gross_total,
      o.created_at, o.updated_at, o.sent_at, o.revision,
      s.id AS supplier_id, s.name AS supplier_name,
      l.id AS location_id, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      u.display_name AS requested_by_name,
      COUNT(oi.id) AS item_count
    FROM orders o
    JOIN suppliers s ON s.id = o.supplier_id
    JOIN locations l ON l.id = o.location_id
    LEFT JOIN users u ON u.id = o.requested_by
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.org_id = ?
      AND (? = '' OR o.status = ?)
      AND (? = '' OR o.folio LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')
      AND (? = '' OR occ.cost_center_id = ?)
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 500
  `).bind(actor.orgId, status, status, query, query, query, costCenterId, costCenterId).all();
  return rows(result).filter(order => locationAllowed(actor, order.location_id)).map(order => ({
    id: order.id,
    folio: order.folio,
    status: order.status,
    supplierId: order.supplier_id,
    supplierName: order.supplier_name,
    locationId: order.location_id,
    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || 'Barra',
    requestedBy: order.requested_by_name,
    deliveryDate: order.delivery_date,
    notes: order.notes,
    currency: order.currency,
    netTotal: Number(order.net_total || 0),
    taxTotal: Number(order.tax_total || 0),
    grossTotal: Number(order.gross_total || 0),
    itemCount: Number(order.item_count || 0),
    revision: Number(order.revision || 1),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    sentAt: order.sent_at
  }));
}

export async function getOrder(env, actor, orderId) {
  const order = await env.DB.prepare(`
    SELECT o.*, s.name AS supplier_name, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      requester.display_name AS requested_by_name, approver.display_name AS approved_by_name
    FROM orders o
    JOIN suppliers s ON s.id = o.supplier_id
    JOIN locations l ON l.id = o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN users requester ON requester.id = o.requested_by
    LEFT JOIN users approver ON approver.id = o.approved_by
    WHERE o.id = ? AND o.org_id = ?
  `).bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed(actor, order.location_id)) throw new HttpError(404, 'Pedido no encontrado', 'not_found');
  const [items, events, receptions] = await Promise.all([
    env.DB.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order, created_at`).bind(orderId).all(),
    env.DB.prepare(`SELECT e.*, u.display_name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.order_id = ? ORDER BY e.created_at DESC`).bind(orderId).all(),
    env.DB.prepare(`SELECT id, status, received_at, created_at, notes FROM receptions WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all()
  ]);
  return {
    id: order.id,
    folio: order.folio,
    status: order.status,
    supplierId: order.supplier_id,
    supplierName: order.supplier_name,
    locationId: order.location_id,
    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || 'Barra',
    requestedBy: order.requested_by_name,
    approvedBy: order.approved_by_name,
    deliveryDate: order.delivery_date,
    notes: order.notes,
    currency: order.currency,
    netTotal: Number(order.net_total || 0),
    taxTotal: Number(order.tax_total || 0),
    grossTotal: Number(order.gross_total || 0),
    revision: Number(order.revision || 1),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: rows(items).map(item => ({
      id: item.id,
      supplierProductId: item.supplier_product_id,
      productId: item.product_id,
      description: item.description_snapshot,
      quantityOrdered: Number(item.quantity_ordered),
      orderUnit: item.order_unit_snapshot,
      unitsPerOrderUnit: Number(item.units_per_order_unit),
      expectedGrossUnitPrice: Number(item.expected_gross_unit_price || 0),
      expectedGrossTotal: Number(item.expected_gross_total || 0),
      quantityReceived: Number(item.quantity_received || 0),
      quantityRejected: Number(item.quantity_rejected || 0)
    })),
    events: rows(events).map(event => ({id: event.id, from: event.from_status, to: event.to_status, reason: event.reason, actor: event.actor_name, createdAt: event.created_at})),
    receptions: rows(receptions).map(reception => ({id: reception.id, status: reception.status, receivedAt: reception.received_at, notes: reception.notes, createdAt: reception.created_at}))
  };
}

export async function createOrder(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const idempotencyKey = String(request.headers.get('Idempotency-Key') || '').trim().slice(0, 120);
  if (idempotencyKey) {
    const previous = await env.DB.prepare('SELECT response_json FROM idempotency_keys WHERE org_id = ? AND idempotency_key = ?')
      .bind(actor.orgId, idempotencyKey).first();
    if (previous?.response_json) return JSON.parse(previous.response_json);
  }
  const limits = planFor(actor.organization.plan);
  const used = await usageValue(env, actor.orgId, 'orders_created');
  if (used >= limits.ordersPerMonth) throw new HttpError(402, 'Límite mensual de pedidos alcanzado', 'plan_limit');
  const body = await readJson(request);
  const location = await requireLocation(env, actor, String(body.locationId || ''));
  const costCenter = await requireCostCenter(env, actor, String(body.costCenterId || ''), location.id);
  const supplier = await env.DB.prepare('SELECT id, name FROM suppliers WHERE id = ? AND org_id = ? AND active = 1')
    .bind(String(body.supplierId || ''), actor.orgId).first();
  if (!supplier) throw new HttpError(400, 'Proveedor inválido', 'invalid_supplier');
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw new HttpError(400, 'Agrega al menos un producto', 'empty_order');
  if (rawItems.length > 500) throw new HttpError(400, 'El pedido supera 500 líneas', 'too_many_items');
  const items = rawItems.map(orderItemPayload);
  const id = uuid();
  const timestamp = nowIso();
  const folio = await allocateFolio(env, actor, location);
  const grossTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), 0);
  const statements = [
    env.DB.prepare(`
      INSERT INTO orders
        (id, org_id, location_id, supplier_id, folio, status, requested_by, delivery_date, notes, currency, gross_total, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'CLP', ?, 1, ?, ?)
    `).bind(id, actor.orgId, location.id, supplier.id, folio, actor.userId, body.deliveryDate || null, optionalText(body.notes, {max: 2000}), grossTotal, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, '', 'draft', 'Pedido creado', ?)`) 
      .bind(uuid(), actor.orgId, id, actor.userId, timestamp),
    env.DB.prepare('INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)').bind(id, actor.orgId, costCenter.id, timestamp)
  ];
  items.forEach((item, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, supplier_product_id, product_id, description_snapshot, quantity_ordered, order_unit_snapshot,
         units_per_order_unit, expected_gross_unit_price, expected_gross_total, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(), id, item.supplierProductId || null, item.productId || null, item.description, item.quantity,
      item.orderUnit, item.unitsPerOrderUnit, item.expectedGrossUnitPrice,
      Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), index, timestamp, timestamp
    ));
  });
  await env.DB.batch(statements);
  await incrementUsage(env, actor.orgId, 'orders_created', 1);
  await writeAudit(env, actor, request, 'order.create', 'order', id, {folio, supplierId: supplier.id, costCenterId: costCenter.id, items: items.length});
  const created = await getOrder(env, actor, id);
  created.pdfDocument = await archiveOrderPdf(env, actor, created);
  if (idempotencyKey) {
    await env.DB.prepare(`INSERT OR IGNORE INTO idempotency_keys (org_id, idempotency_key, request_hash, status_code, response_json, created_at) VALUES (?, ?, '', 200, ?, ?)`) 
      .bind(actor.orgId, idempotencyKey, JSON.stringify(created), nowIso()).run();
  }
  return created;
}

export async function updateOrder(request, env, actor, orderId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const current = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND org_id = ?').bind(orderId, actor.orgId).first();
  if (!current || !locationAllowed(actor, current.location_id)) throw new HttpError(404, 'Pedido no encontrado', 'not_found');
  if (!['draft', 'rejected'].includes(current.status)) throw new HttpError(409, 'Solo se pueden editar pedidos en borrador o rechazados', 'invalid_state');
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items.map(orderItemPayload) : null;
  if (items && !items.length) throw new HttpError(400, 'El pedido no puede quedar sin productos', 'empty_order');
  const costCenter = body.costCenterId === undefined ? null : await requireCostCenter(env, actor, String(body.costCenterId || ''), current.location_id);
  const statements = [];
  if (costCenter) statements.push(env.DB.prepare(`INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET cost_center_id = excluded.cost_center_id`).bind(orderId, actor.orgId, costCenter.id, nowIso()));
  let grossTotal = Number(current.gross_total || 0);
  if (items) {
    grossTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), 0);
    statements.push(env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId));
    items.forEach((item, index) => statements.push(env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, supplier_product_id, product_id, description_snapshot, quantity_ordered, order_unit_snapshot,
         units_per_order_unit, expected_gross_unit_price, expected_gross_total, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(uuid(), orderId, item.supplierProductId || null, item.productId || null, item.description, item.quantity, item.orderUnit,
      item.unitsPerOrderUnit, item.expectedGrossUnitPrice, Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), index, nowIso(), nowIso())));
  }
  statements.push(env.DB.prepare(`UPDATE orders SET delivery_date = ?, notes = ?, gross_total = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND org_id = ?`)
    .bind(body.deliveryDate === undefined ? current.delivery_date : (body.deliveryDate || null), body.notes === undefined ? current.notes : optionalText(body.notes, {max: 2000}), grossTotal, nowIso(), orderId, actor.orgId));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'order.update', 'order', orderId, {revision: Number(current.revision || 1) + 1});
  const updated = await getOrder(env, actor, orderId);
  updated.pdfDocument = await archiveOrderPdf(env, actor, updated);
  return updated;
}

function transitionPermission(to) {
  if (['requested', 'sent', 'confirmed', 'cancelled'].includes(to)) return ROLES.PURCHASER;
  if (['approved', 'rejected'].includes(to)) return ROLES.APPROVER;
  if (['partially_received', 'received'].includes(to)) return ROLES.RECEIVER;
  if (['reconciled', 'closed'].includes(to)) return ROLES.FINANCE;
  return ROLES.ADMIN;
}

export async function transitionOrder(request, env, actor, orderId) {
  const body = await readJson(request);
  const to = String(body.status || '');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND org_id = ?').bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed(actor, order.location_id)) throw new HttpError(404, 'Pedido no encontrado', 'not_found');
  assertMinimumRole(actor.role, transitionPermission(to));
  if (!canTransition(order.status, to)) throw new HttpError(409, `No se puede pasar de ${order.status} a ${to}`, 'invalid_transition');
  const reason = optionalText(body.reason, {max: 500});
  const timestamp = nowIso();
  const approvedBy = to === 'approved' ? actor.userId : order.approved_by;
  const sentAt = to === 'sent' ? timestamp : order.sent_at;
  const cancelledAt = to === 'cancelled' ? timestamp : order.cancelled_at;
  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = ?, approved_by = ?, sent_at = ?, cancelled_at = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND org_id = ?`)
      .bind(to, approvedBy, sentAt, cancelledAt, timestamp, orderId, actor.orgId),
    env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(uuid(), actor.orgId, orderId, actor.userId, order.status, to, reason, timestamp)
  ]);
  await writeAudit(env, actor, request, 'order.transition', 'order', orderId, {from: order.status, to, reason});
  const transitioned = await getOrder(env, actor, orderId);
  transitioned.pdfDocument = await archiveOrderPdf(env, actor, transitioned);
  return transitioned;
}

export async function createReception(request, env, actor, orderId) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND org_id = ?').bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed(actor, order.location_id)) throw new HttpError(404, 'Pedido no encontrado', 'not_found');
  if (!['sent', 'confirmed', 'partially_received'].includes(order.status)) throw new HttpError(409, 'El pedido aún no está listo para recepción', 'invalid_state');
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(400, 'Agrega cantidades recibidas', 'empty_reception');
  const orderItems = rows(await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(orderId).all());
  const orderMap = new Map(orderItems.map(item => [item.id, item]));
  const receptionId = uuid();
  const timestamp = nowIso();
  let complete = true;
  const statements = [env.DB.prepare(`
    INSERT INTO receptions (id, org_id, order_id, location_id, supplier_id, status, received_by, received_at, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
  `).bind(receptionId, actor.orgId, orderId, order.location_id, order.supplier_id, actor.userId, body.receivedAt || timestamp, optionalText(body.notes, {max: 1500}), timestamp, timestamp)];
  for (const raw of items) {
    const orderItem = orderMap.get(String(raw.orderItemId || ''));
    if (!orderItem) throw new HttpError(400, 'Línea de pedido inválida', 'invalid_order_item');
    const accepted = number(raw.quantityAccepted, {min: 0, max: 100000});
    const rejected = number(raw.quantityRejected, {min: 0, max: 100000});
    if (accepted + Number(orderItem.quantity_received || 0) < Number(orderItem.quantity_ordered || 0)) complete = false;
    statements.push(env.DB.prepare(`
      INSERT INTO reception_items
        (id, reception_id, order_item_id, quantity_delivered, quantity_accepted, quantity_rejected, rejection_reason, lot_number, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(uuid(), receptionId, orderItem.id, accepted + rejected, accepted, rejected, optionalText(raw.rejectionReason, {max: 500}), optionalText(raw.lotNumber, {max: 100}), raw.expiresAt || null, timestamp));
    statements.push(env.DB.prepare(`
      UPDATE order_items SET quantity_received = quantity_received + ?, quantity_rejected = quantity_rejected + ?, updated_at = ? WHERE id = ?
    `).bind(accepted, rejected, timestamp, orderItem.id));
  }
  const nextStatus = complete ? 'received' : 'partially_received';
  statements.push(env.DB.prepare('UPDATE orders SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ?').bind(nextStatus, timestamp, orderId));
  statements.push(env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`) 
    .bind(uuid(), actor.orgId, orderId, actor.userId, order.status, nextStatus, 'Recepción registrada', timestamp));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'reception.create', 'reception', receptionId, {orderId, status: nextStatus});
  const receivedOrder = await getOrder(env, actor, orderId);
  const pdfDocument = await archiveOrderPdf(env, actor, receivedOrder);
  return {id: receptionId, orderId, status: 'completed', orderStatus: nextStatus, pdfDocument};
}
