import {
  HttpError,
  ROLES,
  assertMinimumRole,
  nowIso,
  number,
  optionalText,
  readJson,
  requireText,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';

function rows(result) {
  return result?.results || [];
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function normalized(value) {
  return String(value ?? '').trim();
}

function normalizedKey(value) {
  return normalized(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

async function verifySupplierLogo(env, actor, logoKey) {
  if (!logoKey) return;
  const file = await env.DB.prepare(`
    SELECT storage_key, content_type FROM files
    WHERE org_id = ? AND storage_key = ? AND purpose = 'supplier-logo'
  `).bind(actor.orgId, logoKey).first();
  if (!file) throw new HttpError(400, 'El logo no pertenece a esta marca', 'invalid_logo');
  if (!String(file.content_type || '').startsWith('image/')) throw new HttpError(400, 'El logo debe ser una imagen', 'invalid_logo_type');
}

export async function listSupplierAssets(env, actor) {
  const result = await env.DB.prepare(`
    SELECT id, settings_json FROM suppliers WHERE org_id = ? ORDER BY name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return rows(result).map(row => {
    const settings = safeJson(row.settings_json, {});
    const identity = settings.identity || {};
    return {
      supplierId: row.id,
      logoKey: String(identity.logoKey || ''),
      logoName: String(identity.logoName || ''),
      logoWidth: Number(identity.logoWidth || 0),
      logoHeight: Number(identity.logoHeight || 0),
      logoSize: Number(identity.logoSize || 44)
    };
  });
}

export async function updateSupplierIdentity(request, env, actor, supplierId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const supplier = await env.DB.prepare(`
    SELECT id, name, settings_json FROM suppliers WHERE id = ? AND org_id = ?
  `).bind(supplierId, actor.orgId).first();
  if (!supplier) throw new HttpError(404, 'Proveedor no encontrado', 'not_found');
  const body = await readJson(request);
  const current = safeJson(supplier.settings_json, {});
  const identity = {
    ...(current.identity || {}),
    logoKey: optionalText(body.logoKey ?? current.identity?.logoKey, {max: 900}),
    logoName: optionalText(body.logoName ?? current.identity?.logoName, {max: 240}),
    logoWidth: Math.max(0, Math.min(10000, Number(body.logoWidth ?? current.identity?.logoWidth ?? 0) || 0)),
    logoHeight: Math.max(0, Math.min(10000, Number(body.logoHeight ?? current.identity?.logoHeight ?? 0) || 0)),
    logoSize: Math.max(24, Math.min(96, Number(body.logoSize ?? current.identity?.logoSize ?? 44) || 44))
  };
  await verifySupplierLogo(env, actor, identity.logoKey);
  await env.DB.prepare('UPDATE suppliers SET settings_json = ?, updated_at = ? WHERE id = ? AND org_id = ?')
    .bind(JSON.stringify({...current, identity}), nowIso(), supplierId, actor.orgId).run();
  await writeAudit(env, actor, request, 'supplier.identity_update', 'supplier', supplierId, {
    logoConfigured: Boolean(identity.logoKey), logoSize: identity.logoSize
  });
  return {supplierId, ...identity};
}

async function resolveCenter(env, actor, row) {
  const centerName = normalized(row.costCenter || row.centroCosto || row.centro || 'Barra');
  const locationValue = normalized(row.location || row.local || row.locationCode || row.codigoLocal);
  const result = await env.DB.prepare(`
    SELECT cc.id, cc.name, cc.code, cc.location_id, l.name AS location_name, l.code AS location_code
    FROM cost_centers cc JOIN locations l ON l.id = cc.location_id
    WHERE cc.org_id = ? AND cc.active = 1 AND l.active = 1
      AND (UPPER(cc.name) = UPPER(?) OR UPPER(cc.code) = UPPER(?))
      AND (? = '' OR UPPER(l.name) = UPPER(?) OR UPPER(l.code) = UPPER(?))
    ORDER BY CASE cc.code WHEN 'BARRA' THEN 0 WHEN 'SALON' THEN 1 WHEN 'COCINA' THEN 2 ELSE 3 END
  `).bind(actor.orgId, centerName, centerName, locationValue, locationValue, locationValue).all();
  const center = rows(result).find(candidate => locationAllowed(actor, candidate.location_id));
  if (!center) throw new HttpError(400, `No existe el centro “${centerName}”${locationValue ? ` en ${locationValue}` : ''}`, 'invalid_import_center');
  return center;
}

async function upsertCategory(env, actor, name, timestamp) {
  const categoryName = requireText(name || 'Otros', 'Categoría', {max: 100});
  let category = await env.DB.prepare('SELECT id FROM categories WHERE org_id = ? AND UPPER(name) = UPPER(?)')
    .bind(actor.orgId, categoryName).first();
  if (category) {
    await env.DB.prepare('UPDATE categories SET active = 1, updated_at = ? WHERE id = ?').bind(timestamp, category.id).run();
    return category.id;
  }
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM categories WHERE org_id = ?').bind(actor.orgId).first();
  const id = uuid();
  await env.DB.prepare(`
    INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(id, actor.orgId, categoryName, Number(max?.value || 0) + 1, timestamp, timestamp).run();
  return id;
}

async function upsertSupplier(env, actor, row, timestamp, mode) {
  const name = requireText(row.supplier || row.proveedor, 'Proveedor', {max: 160});
  let supplier = await env.DB.prepare('SELECT id FROM suppliers WHERE org_id = ? AND UPPER(name) = UPPER(?)')
    .bind(actor.orgId, name).first();
  if (!supplier) {
    const id = uuid();
    await env.DB.prepare(`
      INSERT INTO suppliers
        (id, org_id, name, legal_name, rut, email, phone, contact_name, lead_days, cutoff_time,
         minimum_order, payment_terms, settings_json, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)
    `).bind(
      id, actor.orgId, name,
      optionalText(row.supplierLegalName || row.razonSocialProveedor, {max: 180}),
      optionalText(row.supplierRut || row.rutProveedor, {max: 30}),
      optionalText(row.supplierEmail || row.correoProveedor, {max: 180}),
      optionalText(row.supplierPhone || row.telefonoProveedor, {max: 40}),
      optionalText(row.supplierContact || row.contactoProveedor, {max: 120}),
      Math.max(0, Number(row.leadDays || row.diasEntrega || 0) || 0),
      optionalText(row.cutoffTime || row.horaCorte, {max: 10}),
      Math.max(0, Number(row.minimumOrder || row.pedidoMinimo || 0) || 0),
      optionalText(row.paymentTerms || row.condicionesPago, {max: 240}),
      timestamp, timestamp
    ).run();
    return id;
  }
  if (mode === 'replace') {
    await env.DB.prepare('UPDATE suppliers SET active = 1, updated_at = ? WHERE id = ?').bind(timestamp, supplier.id).run();
  }
  return supplier.id;
}

async function upsertProduct(env, actor, row, categoryId, timestamp, mode) {
  const name = requireText(row.product || row.producto, 'Producto', {max: 200});
  const contentValue = Math.max(0, Number(row.contentValue || row.contenido || 0) || 0);
  const contentUnit = optionalText(row.contentUnit || row.unidadContenido || 'ml', {max: 20});
  let product = await env.DB.prepare(`
    SELECT id FROM products
    WHERE org_id = ? AND UPPER(name) = UPPER(?) AND content_value = ? AND UPPER(content_unit) = UPPER(?)
  `).bind(actor.orgId, name, contentValue, contentUnit).first();
  if (!product) {
    const id = uuid();
    await env.DB.prepare(`
      INSERT INTO products
        (id, org_id, category_id, name, brand, variant, content_value, content_unit, base_unit,
         barcode, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id, actor.orgId, categoryId, name,
      optionalText(row.brand || row.marca, {max: 100}),
      optionalText(row.variant || row.variante, {max: 100}),
      contentValue, contentUnit,
      optionalText(row.baseUnit || row.unidadBase || 'unidad', {max: 30}),
      optionalText(row.barcode || row.codigoBarras, {max: 80}),
      timestamp, timestamp
    ).run();
    return id;
  }
  if (mode === 'replace') {
    await env.DB.prepare(`
      UPDATE products SET category_id = ?, brand = ?, variant = ?, base_unit = ?, barcode = ?,
        active = 1, updated_at = ? WHERE id = ?
    `).bind(
      categoryId,
      optionalText(row.brand || row.marca, {max: 100}),
      optionalText(row.variant || row.variante, {max: 100}),
      optionalText(row.baseUnit || row.unidadBase || 'unidad', {max: 30}),
      optionalText(row.barcode || row.codigoBarras, {max: 80}),
      timestamp, product.id
    ).run();
  } else {
    await env.DB.prepare('UPDATE products SET active = 1, updated_at = ? WHERE id = ?').bind(timestamp, product.id).run();
  }
  return product.id;
}

async function upsertRelation(env, actor, row, supplierId, productId, timestamp, mode) {
  const orderUnit = optionalText(row.orderUnit || row.formato || 'UNIDAD', {max: 60}).toUpperCase();
  const units = number(row.unitsPerOrderUnit || row.unidadesPorFormato || 1, {min: 0.001, max: 100000, fallback: 1});
  const minimum = number(row.minimumQuantity || row.cantidadMinima || 0, {min: 0, max: 100000});
  const multiple = number(row.quantityMultiple || row.multiplo || 1, {min: 0.001, max: 100000, fallback: 1});
  const existing = await env.DB.prepare('SELECT id FROM supplier_products WHERE supplier_id = ? AND product_id = ?')
    .bind(supplierId, productId).first();
  if (!existing) {
    const id = uuid();
    await env.DB.prepare(`
      INSERT INTO supplier_products
        (id, org_id, supplier_id, product_id, supplier_sku, supplier_name, order_unit,
         units_per_order_unit, minimum_quantity, quantity_multiple, last_gross_unit_price,
         active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id, actor.orgId, supplierId, productId,
      optionalText(row.supplierSku || row.codigoProveedor, {max: 100}),
      optionalText(row.supplierProductName || row.nombreProveedor || row.product || row.producto, {max: 220}),
      orderUnit, units, minimum, multiple,
      Math.max(0, Math.round(Number(row.lastGrossUnitPrice || row.precioBrutoUnitario || 0) || 0)),
      timestamp, timestamp
    ).run();
    return id;
  }
  if (mode === 'replace') {
    await env.DB.prepare(`
      UPDATE supplier_products SET supplier_sku = ?, supplier_name = ?, order_unit = ?,
        units_per_order_unit = ?, minimum_quantity = ?, quantity_multiple = ?,
        last_gross_unit_price = CASE WHEN ? > 0 THEN ? ELSE last_gross_unit_price END,
        active = 1, updated_at = ? WHERE id = ?
    `).bind(
      optionalText(row.supplierSku || row.codigoProveedor, {max: 100}),
      optionalText(row.supplierProductName || row.nombreProveedor || row.product || row.producto, {max: 220}),
      orderUnit, units, minimum, multiple,
      Math.max(0, Math.round(Number(row.lastGrossUnitPrice || row.precioBrutoUnitario || 0) || 0)),
      Math.max(0, Math.round(Number(row.lastGrossUnitPrice || row.precioBrutoUnitario || 0) || 0)),
      timestamp, existing.id
    ).run();
  } else {
    await env.DB.prepare('UPDATE supplier_products SET active = 1, updated_at = ? WHERE id = ?').bind(timestamp, existing.id).run();
  }
  return existing.id;
}

export async function importCatalog(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const body = await readJson(request);
  const mode = body.mode === 'replace' ? 'replace' : 'merge';
  const source = Array.isArray(body.rows) ? body.rows : [];
  if (!source.length) throw new HttpError(400, 'La plantilla no contiene filas', 'empty_import');
  if (source.length > 3000) throw new HttpError(400, 'La importación supera 3.000 filas', 'too_many_rows');

  const prepared = [];
  for (const [index, row] of source.entries()) {
    if (!normalized(row.product || row.producto) || !normalized(row.supplier || row.proveedor)) {
      throw new HttpError(400, `Fila ${index + 2}: producto y proveedor son obligatorios`, 'invalid_import_row');
    }
    prepared.push({row, center: await resolveCenter(env, actor, row), sourceRow: index + 2});
  }

  const timestamp = nowIso();
  if (mode === 'replace') {
    await env.DB.batch([
      env.DB.prepare('UPDATE supplier_products SET active = 0, updated_at = ? WHERE org_id = ?').bind(timestamp, actor.orgId),
      env.DB.prepare('UPDATE products SET active = 0, updated_at = ? WHERE org_id = ?').bind(timestamp, actor.orgId),
      env.DB.prepare('UPDATE suppliers SET active = 0, updated_at = ? WHERE org_id = ?').bind(timestamp, actor.orgId),
      env.DB.prepare('DELETE FROM product_cost_centers WHERE org_id = ?').bind(actor.orgId)
    ]);
  }

  const summary = {mode, rows: prepared.length, products: new Set(), suppliers: new Set(), relations: new Set(), centers: new Set()};
  for (const item of prepared) {
    const categoryId = await upsertCategory(env, actor, item.row.category || item.row.categoria || 'Otros', timestamp);
    const supplierId = await upsertSupplier(env, actor, item.row, timestamp, mode);
    const productId = await upsertProduct(env, actor, item.row, categoryId, timestamp, mode);
    const relationId = await upsertRelation(env, actor, item.row, supplierId, productId, timestamp, mode);
    await env.DB.prepare(`
      INSERT OR IGNORE INTO product_cost_centers (org_id, product_id, cost_center_id, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(actor.orgId, productId, item.center.id, timestamp).run();
    summary.products.add(productId);
    summary.suppliers.add(supplierId);
    summary.relations.add(relationId);
    summary.centers.add(item.center.id);
  }

  const result = {
    mode,
    rows: summary.rows,
    productCount: summary.products.size,
    supplierCount: summary.suppliers.size,
    relationCount: summary.relations.size,
    centerCount: summary.centers.size
  };
  await writeAudit(env, actor, request, 'catalog.import', 'catalog', actor.orgId, result);
  return result;
}
