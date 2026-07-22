import {
  HttpError,
  ROLES,
  assertMinimumRole,
  monthKey,
  nowIso,
  number,
  optionalText,
  planFor,
  readJson,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';
import {archiveOrderPdf} from '../storage.js';
import {getOrder} from './orders.js';

function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

async function requireLocation(env, actor, locationId) {
  const location = await env.DB.prepare('SELECT id, name, code FROM locations WHERE id = ? AND org_id = ? AND active = 1')
    .bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed(actor, location.id)) throw new HttpError(404, 'Local no encontrado', 'not_found');
  return location;
}

async function requireCostCenter(env, actor, costCenterId, locationId) {
  const center = await env.DB.prepare(`
    SELECT id, name, code, location_id FROM cost_centers
    WHERE id = ? AND org_id = ? AND location_id = ? AND active = 1
  `).bind(costCenterId, actor.orgId, locationId).first();
  if (!center || !locationAllowed(actor, center.location_id)) {
    throw new HttpError(400, 'Centro de costo inválido para este local', 'invalid_cost_center');
  }
  return center;
}

async function allocateFolio(env, actor, location, date = new Date()) {
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const prefix = String(location.code || 'PED').replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PED';
  const base = `${prefix}-${y}${m}${d}-`;
  const current = await env.DB.prepare(`
    SELECT folio FROM orders WHERE org_id = ? AND folio LIKE ? ORDER BY folio DESC LIMIT 1
  `).bind(actor.orgId, `${base}%`).first();
  const next = current?.folio ? Number(current.folio.slice(base.length)) + 1 : 1;
  return `${base}${String(next).padStart(3, '0')}`;
}

async function usageValue(env, orgId, metric) {
  const row = await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id = ? AND month_key = ? AND metric = ?')
    .bind(orgId, monthKey(), metric).first();
  return Number(row?.quantity || 0);
}

async function incrementUsage(env, orgId, metric, amount) {
  const key = monthKey();
  await env.DB.prepare(`
    INSERT INTO usage_counters (org_id, month_key, metric, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, month_key, metric)
    DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at
  `).bind(orgId, key, metric, amount, nowIso()).run();
}

function normalizeOrderUnit(value) {
  const text = optionalText(value || 'UNIDAD', {max: 60}).toUpperCase();
  return text || 'UNIDAD';
}

async function validateLine(env, actor, costCenterId, raw, index) {
  const relationId = String(raw.supplierProductId || '');
  if (!relationId) throw new HttpError(400, `Falta proveedor/formato en la línea ${index + 1}`, 'missing_supplier_relation');
  const relation = await env.DB.prepare(`
    SELECT sp.id, sp.supplier_id, sp.product_id, sp.order_unit, sp.units_per_order_unit,
      sp.last_gross_unit_price, p.name AS product_name, p.active AS product_active,
      s.name AS supplier_name, s.active AS supplier_active,
      EXISTS(
        SELECT 1 FROM product_cost_centers pcc
        WHERE pcc.org_id = sp.org_id AND pcc.product_id = sp.product_id AND pcc.cost_center_id = ?
      ) AS assigned_to_center
    FROM supplier_products sp
    JOIN products p ON p.id = sp.product_id AND p.org_id = sp.org_id
    JOIN suppliers s ON s.id = sp.supplier_id AND s.org_id = sp.org_id
    WHERE sp.id = ? AND sp.org_id = ? AND sp.active = 1
  `).bind(costCenterId, relationId, actor.orgId).first();
  if (!relation || !relation.product_active || !relation.supplier_active) {
    throw new HttpError(400, `Producto o proveedor inválido en la línea ${index + 1}`, 'invalid_supplier_relation');
  }
  if (!relation.assigned_to_center) {
    throw new HttpError(400, `${relation.product_name} no pertenece al centro seleccionado`, 'product_outside_cost_center');
  }
  const quantity = number(raw.quantity, {min: 0.001, max: 100000});
  const unitsPerOrderUnit = number(raw.unitsPerOrderUnit, {
    min: 0.001,
    max: 100000,
    fallback: Number(relation.units_per_order_unit || 1)
  });
  const orderUnit = normalizeOrderUnit(raw.orderUnit || relation.order_unit);
  return {
    supplierProductId: relation.id,
    supplierId: relation.supplier_id,
    supplierName: relation.supplier_name,
    productId: relation.product_id,
    description: relation.product_name,
    quantity,
    orderUnit,
    unitsPerOrderUnit,
    expectedGrossUnitPrice: Number(relation.last_gross_unit_price || 0),
    persistFormat: Boolean(raw.persistFormat)
  };
}

async function createSupplierOrder(env, actor, request, {location, costCenter, supplierId, supplierName, items, deliveryDate, notes, status}) {
  const id = uuid();
  const timestamp = nowIso();
  const folio = await allocateFolio(env, actor, location);
  const grossTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), 0);
  const statements = [
    env.DB.prepare(`
      INSERT INTO orders
        (id, org_id, location_id, supplier_id, folio, status, requested_by, delivery_date, notes,
         currency, gross_total, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLP', ?, 1, ?, ?)
    `).bind(
      id, actor.orgId, location.id, supplierId, folio, status, actor.userId,
      deliveryDate || null, optionalText(notes, {max: 2000}), grossTotal, timestamp, timestamp
    ),
    env.DB.prepare(`
      INSERT INTO order_events
        (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at)
      VALUES (?, ?, ?, ?, '', ?, ?, ?)
    `).bind(
      uuid(), actor.orgId, id, actor.userId, status,
      status === 'requested' ? 'Pedido emitido desde lista maestra' : 'Borrador creado desde lista maestra', timestamp
    ),
    env.DB.prepare(`
      INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, actor.orgId, costCenter.id, timestamp)
  ];

  items.forEach((item, sortOrder) => {
    statements.push(env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, supplier_product_id, product_id, description_snapshot, quantity_ordered,
         order_unit_snapshot, units_per_order_unit, expected_gross_unit_price, expected_gross_total,
         sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(), id, item.supplierProductId, item.productId, item.description, item.quantity,
      item.orderUnit, item.unitsPerOrderUnit, item.expectedGrossUnitPrice,
      Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice),
      sortOrder, timestamp, timestamp
    ));
    if (item.persistFormat) {
      statements.push(env.DB.prepare(`
        UPDATE supplier_products SET order_unit = ?, units_per_order_unit = ?, updated_at = ?
        WHERE id = ? AND org_id = ?
      `).bind(item.orderUnit, item.unitsPerOrderUnit, timestamp, item.supplierProductId, actor.orgId));
    }
  });

  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'order.batch_supplier_create', 'order', id, {
    folio, supplierId, supplierName, costCenterId: costCenter.id, items: items.length, status
  });
  const order = await getOrder(env, actor, id);
  order.pdfDocument = await archiveOrderPdf(env, actor, order);
  return order;
}

export async function createOrderBatch(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const idempotencyKey = String(request.headers.get('Idempotency-Key') || '').trim().slice(0, 120);
  if (idempotencyKey) {
    const previous = await env.DB.prepare(`
      SELECT response_json FROM idempotency_keys WHERE org_id = ? AND idempotency_key = ?
    `).bind(actor.orgId, idempotencyKey).first();
    if (previous?.response_json) return JSON.parse(previous.response_json);
  }

  const body = await readJson(request);
  const location = await requireLocation(env, actor, String(body.locationId || ''));
  const costCenter = await requireCostCenter(env, actor, String(body.costCenterId || ''), location.id);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw new HttpError(400, 'Ingresa cantidad en al menos un producto', 'empty_order_batch');
  if (rawItems.length > 1000) throw new HttpError(400, 'La lista supera 1.000 productos', 'too_many_items');

  const validated = [];
  for (const [index, raw] of rawItems.entries()) validated.push(await validateLine(env, actor, costCenter.id, raw, index));
  const grouped = new Map();
  for (const item of validated) {
    if (!grouped.has(item.supplierId)) grouped.set(item.supplierId, {supplierId: item.supplierId, supplierName: item.supplierName, items: []});
    grouped.get(item.supplierId).items.push(item);
  }

  const limits = planFor(actor.organization.plan);
  const used = await usageValue(env, actor.orgId, 'orders_created');
  if (used + grouped.size > limits.ordersPerMonth) {
    throw new HttpError(402, `La operación crearía ${grouped.size} pedidos y supera el límite mensual`, 'plan_limit');
  }

  const status = body.saveAsDraft ? 'draft' : 'requested';
  const batchId = uuid();
  const orders = [];
  for (const group of grouped.values()) {
    orders.push(await createSupplierOrder(env, actor, request, {
      location,
      costCenter,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      items: group.items,
      deliveryDate: body.deliveryDate,
      notes: body.notes,
      status
    }));
  }
  await incrementUsage(env, actor.orgId, 'orders_created', orders.length);
  const response = {
    batchId,
    status,
    supplierCount: orders.length,
    itemCount: validated.length,
    orders
  };
  await writeAudit(env, actor, request, 'order.batch_create', 'order_batch', batchId, {
    locationId: location.id,
    costCenterId: costCenter.id,
    suppliers: orders.map(order => order.supplierId),
    orders: orders.map(order => order.id),
    status
  });
  if (idempotencyKey) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO idempotency_keys
        (org_id, idempotency_key, request_hash, status_code, response_json, created_at)
      VALUES (?, ?, '', 200, ?, ?)
    `).bind(actor.orgId, idempotencyKey, JSON.stringify(response), nowIso()).run();
  }
  return response;
}

export async function deleteDraftOrder(request, env, actor, orderId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const order = await env.DB.prepare(`
    SELECT id, folio, status, location_id FROM orders WHERE id = ? AND org_id = ?
  `).bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed(actor, order.location_id)) throw new HttpError(404, 'Pedido no encontrado', 'not_found');
  if (order.status !== 'draft') throw new HttpError(409, 'Solo se puede eliminar un borrador. Los pedidos emitidos deben anularse.', 'invalid_state');
  const linked = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM invoice_order_links WHERE order_id = ?
  `).bind(orderId).first();
  if (Number(linked?.total || 0) > 0) throw new HttpError(409, 'El pedido ya está relacionado con una factura', 'order_linked');
  await env.DB.prepare('DELETE FROM orders WHERE id = ? AND org_id = ?').bind(orderId, actor.orgId).run();
  await writeAudit(env, actor, request, 'order.delete_draft', 'order', orderId, {folio: order.folio});
  return {deleted: true, folio: order.folio};
}
