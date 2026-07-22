import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content);
const replace = (path, needle, replacement) => {
  const source = read(path);
  if (!source.includes(needle)) throw new Error(`Missing marker in ${path}: ${needle.slice(0, 100)}`);
  write(path, source.replace(needle, replacement));
};
const replaceRegex = (path, pattern, replacement) => {
  const source = read(path);
  if (!pattern.test(source)) throw new Error(`Missing regex marker in ${path}: ${pattern}`);
  write(path, source.replace(pattern, replacement));
};

write('professional/migrations/0005_cost_centers.sql', `CREATE TABLE IF NOT EXISTS cost_centers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (location_id, name),
  UNIQUE (location_id, code)
);

CREATE TABLE IF NOT EXISTS product_cost_centers (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost_center_id TEXT NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, cost_center_id)
);

CREATE TABLE IF NOT EXISTS order_cost_centers (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cost_center_id TEXT NOT NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_location ON cost_centers(org_id, location_id, active, name);
CREATE INDEX IF NOT EXISTS idx_product_cost_centers_center ON product_cost_centers(org_id, cost_center_id, product_id);
CREATE INDEX IF NOT EXISTS idx_order_cost_centers_center ON order_cost_centers(org_id, cost_center_id, order_id);

UPDATE locations
SET name = 'Madriguera Clubhaus', code = 'MDR', updated_at = datetime('now')
WHERE org_id = (SELECT id FROM organizations WHERE slug = 'pedidos-pro' LIMIT 1)
  AND id = (
    SELECT id FROM locations
    WHERE org_id = (SELECT id FROM organizations WHERE slug = 'pedidos-pro' LIMIT 1)
    ORDER BY created_at ASC
    LIMIT 1
  )
  AND (name = 'Principal' OR code = 'PRINCIPAL');

INSERT OR IGNORE INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at)
SELECT id || '-cc-barra', org_id, id, 'Barra', 'BARRA', 1, datetime('now'), datetime('now') FROM locations;

INSERT OR IGNORE INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at)
SELECT id || '-cc-salon', org_id, id, 'Salón', 'SALON', 1, datetime('now'), datetime('now') FROM locations;

INSERT OR IGNORE INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at)
SELECT id || '-cc-cocina', org_id, id, 'Cocina', 'COCINA', 1, datetime('now'), datetime('now') FROM locations;

INSERT OR IGNORE INTO product_cost_centers (org_id, product_id, cost_center_id, created_at)
SELECT p.org_id, p.id, cc.id, datetime('now')
FROM products p
JOIN cost_centers cc ON cc.org_id = p.org_id AND cc.code = 'BARRA'
WHERE cc.location_id = (
  SELECT l.id FROM locations l WHERE l.org_id = p.org_id ORDER BY l.created_at ASC LIMIT 1
);

INSERT OR IGNORE INTO order_cost_centers (order_id, org_id, cost_center_id, created_at)
SELECT o.id, o.org_id, cc.id, datetime('now')
FROM orders o
JOIN cost_centers cc ON cc.location_id = o.location_id AND cc.code = 'BARRA';
`);

replace('professional/worker/src/schema.js',
  "import fileChunkSchemaModule from '../../migrations/0004_file_chunks.sql';",
  "import fileChunkSchemaModule from '../../migrations/0004_file_chunks.sql';\nimport costCenterSchemaModule from '../../migrations/0005_cost_centers.sql';");
replace('professional/worker/src/schema.js', "const SCHEMA_VERSION = '7';", "const SCHEMA_VERSION = '8';");
replace('professional/worker/src/schema.js',
  "const fileChunkSchema = normalizeSql(fileChunkSchemaModule, 'file-chunks');",
  "const fileChunkSchema = normalizeSql(fileChunkSchemaModule, 'file-chunks');\nconst costCenterSchema = normalizeSql(costCenterSchemaModule, 'cost-centers');");
replace('professional/worker/src/schema.js',
`    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const seeded = await seedDefaultWorkspace(env.DB);
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);`,
`    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const seeded = await seedDefaultWorkspace(env.DB);
    const costCenterStatements = await executeSchema(env.DB, costCenterSchema, 'cost-centers');
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);`);
replace('professional/worker/src/schema.js',
  'statements: identityStatements + procurementStatements + invoiceStatements + platformStatements + fileChunkStatements',
  'statements: identityStatements + procurementStatements + invoiceStatements + platformStatements + fileChunkStatements + costCenterStatements');

replaceRegex('professional/worker/src/auth.js', /export async function login\(request, env\) \{[\s\S]*?\n\}\n\nexport async function logout/, `export async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const row = await env.DB.prepare(\`
    SELECT
      u.id AS user_id, u.email, u.display_name, u.password_salt, u.password_hash, u.active AS user_active,
      m.id AS membership_id, m.org_id, m.role, m.location_scope, m.active AS membership_active,
      o.name AS org_name, o.slug AS org_slug, o.plan, o.status AS org_status
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN organizations o ON o.id = m.org_id
    WHERE u.email = ?
      AND u.active = 1 AND m.active = 1 AND o.status = 'active'
    ORDER BY o.created_at ASC, CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  \`).bind(email).first();
  if (!row || !await verifyPassword(String(body.password || ''), row.password_salt, row.password_hash)) {
    await writeAudit(env, null, request, 'auth.login_failed', 'user', '', {email});
    throw new HttpError(401, 'Correo o contraseña incorrectos', 'invalid_credentials');
  }
  const session = await createSession(env, request, {userId: row.user_id, orgId: row.org_id});
  const actor = {userId: row.user_id, orgId: row.org_id, email: row.email, role: row.role};
  await writeAudit(env, actor, request, 'auth.login', 'session', session.sessionId);
  return {token: session.token, sessionId: session.sessionId, user: publicUser(row)};
}

export async function logout`);

replaceRegex('professional/worker/src/api/catalog.js', /export async function createLocation\(request, env, actor\) \{[\s\S]*?\n\}\n\nexport async function listSuppliers/, `export async function createLocation(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  if (!actor.isPlatformOwner) await enforceCountLimit(env, actor, 'locations', 'locations', 'AND active = 1');
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, 'Nombre del local', {max: 120});
  const code = requireText(body.code || slugify(name).slice(0, 10).toUpperCase(), 'Código', {max: 12}).toUpperCase();
  const timezone = String(body.timezone || 'America/Santiago').slice(0, 60);
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(\`INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)\`).bind(id, actor.orgId, name, code, timezone, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)\`).bind(\`${id}-cc-barra\`, actor.orgId, id, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Salón', 'SALON', 1, ?, ?)\`).bind(\`${id}-cc-salon\`, actor.orgId, id, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)\`).bind(\`${id}-cc-cocina\`, actor.orgId, id, timestamp, timestamp)
  ]);
  await writeAudit(env, actor, request, 'location.create', 'location', id, {name, code});
  return {id, name, code, timezone, active: true};
}

export async function listSuppliers`);

const costCenterApi = `
async function validateCostCenterIds(env, actor, requested, {locationId = ''} = {}) {
  const all = rows(await env.DB.prepare(\`
    SELECT id, location_id, name, code FROM cost_centers
    WHERE org_id = ? AND active = 1
    ORDER BY CASE code WHEN 'BARRA' THEN 0 WHEN 'SALON' THEN 1 WHEN 'COCINA' THEN 2 ELSE 3 END, name COLLATE NOCASE
  \`).bind(actor.orgId).all()).filter(center => locationAllowed(actor, center.location_id));
  const values = [...new Set((Array.isArray(requested) ? requested : []).map(String).filter(Boolean))];
  if (!values.length) {
    const preferred = all.find(center => (!locationId || center.location_id === locationId) && center.code === 'BARRA') || all.find(center => !locationId || center.location_id === locationId);
    if (!preferred) throw new HttpError(400, 'No hay centros de costo disponibles', 'missing_cost_center');
    return [preferred.id];
  }
  const valid = new Set(all.filter(center => !locationId || center.location_id === locationId).map(center => center.id));
  if (values.some(id => !valid.has(id))) throw new HttpError(400, 'Centro de costo inválido', 'invalid_cost_center');
  return values;
}

export async function listCostCenters(env, actor, url) {
  const locationId = String(url.searchParams.get('locationId') || '');
  const result = await env.DB.prepare(\`
    SELECT cc.id, cc.location_id, cc.name, cc.code, cc.active, l.name AS location_name,
      COUNT(DISTINCT pcc.product_id) AS product_count,
      COUNT(DISTINCT occ.order_id) AS order_count
    FROM cost_centers cc
    JOIN locations l ON l.id = cc.location_id
    LEFT JOIN product_cost_centers pcc ON pcc.cost_center_id = cc.id
    LEFT JOIN order_cost_centers occ ON occ.cost_center_id = cc.id
    WHERE cc.org_id = ? AND (? = '' OR cc.location_id = ?)
    GROUP BY cc.id
    ORDER BY l.name COLLATE NOCASE, CASE cc.code WHEN 'BARRA' THEN 0 WHEN 'SALON' THEN 1 WHEN 'COCINA' THEN 2 ELSE 3 END, cc.name COLLATE NOCASE
  \`).bind(actor.orgId, locationId, locationId).all();
  return rows(result).filter(center => locationAllowed(actor, center.location_id)).map(center => ({
    id: center.id, locationId: center.location_id, locationName: center.location_name, name: center.name, code: center.code,
    active: Boolean(center.active), productCount: Number(center.product_count || 0), orderCount: Number(center.order_count || 0)
  }));
}

export async function createCostCenter(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const location = await requireLocation(env, actor, String(body.locationId || ''));
  const name = requireText(body.name, 'Nombre del centro de costo', {max: 100});
  const code = requireText(body.code || slugify(name).replace(/-/g, '').slice(0, 12).toUpperCase(), 'Código', {max: 12}).toUpperCase();
  const id = uuid();
  const timestamp = nowIso();
  try {
    await env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)\`)
      .bind(id, actor.orgId, location.id, name, code, timestamp, timestamp).run();
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message || error))) throw new HttpError(409, 'Ya existe un centro con ese nombre o código', 'duplicate_cost_center');
    throw error;
  }
  await writeAudit(env, actor, request, 'cost_center.create', 'cost_center', id, {locationId: location.id, name, code});
  return {id, locationId: location.id, locationName: location.name, name, code, active: true, productCount: 0, orderCount: 0};
}

export async function setProductCostCenters(request, env, actor, productId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND org_id = ?').bind(productId, actor.orgId).first();
  if (!product) throw new HttpError(404, 'Producto no encontrado', 'not_found');
  const body = await readJson(request);
  const ids = await validateCostCenterIds(env, actor, body.costCenterIds);
  const timestamp = nowIso();
  const statements = [env.DB.prepare('DELETE FROM product_cost_centers WHERE org_id = ? AND product_id = ?').bind(actor.orgId, productId)];
  ids.forEach(id => statements.push(env.DB.prepare('INSERT INTO product_cost_centers (org_id, product_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)').bind(actor.orgId, productId, id, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'product.cost_centers', 'product', productId, {costCenterIds: ids});
  return {productId, costCenterIds: ids};
}
`;
replace('professional/worker/src/api/catalog.js', '\nexport async function listProducts(env, actor, url) {', `${costCenterApi}\nexport async function listProducts(env, actor, url) {`);

replaceRegex('professional/worker/src/api/catalog.js', /export async function listProducts\(env, actor, url\) \{[\s\S]*?\n\}\n\nexport async function createProduct/, `export async function listProducts(env, actor, url) {
  const query = String(url.searchParams.get('q') || '').trim();
  const supplierId = String(url.searchParams.get('supplierId') || '');
  const costCenterId = String(url.searchParams.get('costCenterId') || '');
  const result = await env.DB.prepare(\`
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
    ORDER BY p.active DESC, c.sort_order, p.name COLLATE NOCASE
    LIMIT 1000
  \`).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId, costCenterId, costCenterId).all();
  const map = new Map();
  for (const row of rows(result)) {
    if (!map.has(row.id)) map.set(row.id, {
      id: row.id, name: row.name, brand: row.brand, variant: row.variant, categoryId: row.category_id, categoryName: row.category_name,
      contentValue: Number(row.content_value || 0), contentUnit: row.content_unit, baseUnit: row.base_unit, barcode: row.barcode,
      active: Boolean(row.active), suppliers: [], costCenters: []
    });
    if (row.supplier_product_id) map.get(row.id).suppliers.push({
      id: row.supplier_product_id, supplierId: row.supplier_id, supplierName: row.supplier_name_display,
      supplierSku: row.supplier_sku, supplierProductName: row.supplier_name, orderUnit: row.order_unit,
      unitsPerOrderUnit: Number(row.units_per_order_unit || 1), minimumQuantity: Number(row.minimum_quantity || 0),
      quantityMultiple: Number(row.quantity_multiple || 1), lastGrossUnitPrice: Number(row.last_gross_unit_price || 0)
    });
  }
  const centerRows = await env.DB.prepare(\`
    SELECT pcc.product_id, cc.id, cc.location_id, cc.name, cc.code, l.name AS location_name
    FROM product_cost_centers pcc
    JOIN cost_centers cc ON cc.id = pcc.cost_center_id AND cc.active = 1
    JOIN locations l ON l.id = cc.location_id
    WHERE pcc.org_id = ?
    ORDER BY l.name COLLATE NOCASE, cc.name COLLATE NOCASE
  \`).bind(actor.orgId).all();
  for (const center of rows(centerRows)) {
    const product = map.get(center.product_id);
    if (product && locationAllowed(actor, center.location_id)) product.costCenters.push({id: center.id, locationId: center.location_id, locationName: center.location_name, name: center.name, code: center.code});
  }
  return [...map.values()];
}

export async function createProduct`);

replaceRegex('professional/worker/src/api/catalog.js', /export async function createProduct\(request, env, actor\) \{[\s\S]*?\n\}\n\nexport async function linkSupplierProduct/, `export async function createProduct(request, env, actor) {
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
  const costCenterIds = await validateCostCenterIds(env, actor, body.costCenterIds);
  const timestamp = nowIso();
  const statements = [env.DB.prepare(\`
    INSERT INTO products
      (id, org_id, category_id, name, brand, variant, content_value, content_unit, base_unit, barcode, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  \`).bind(
    id, actor.orgId, categoryId, name, optionalText(body.brand, {max: 100}), optionalText(body.variant, {max: 100}),
    number(body.contentValue, {min: 0, max: 999999}), optionalText(body.contentUnit || 'ml', {max: 20}),
    optionalText(body.baseUnit || 'unidad', {max: 30}), optionalText(body.barcode, {max: 80}), timestamp, timestamp
  )];
  costCenterIds.forEach(centerId => statements.push(env.DB.prepare('INSERT INTO product_cost_centers (org_id, product_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)').bind(actor.orgId, id, centerId, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'product.create', 'product', id, {name, costCenterIds});
  return {id, name, categoryId, costCenterIds, active: true};
}

export async function linkSupplierProduct`);

replace('professional/worker/src/api/orders.js',
`async function requireLocation(env, actor, locationId) {
  const location = await env.DB.prepare('SELECT * FROM locations WHERE id = ? AND org_id = ? AND active = 1')
    .bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed(actor, location.id)) throw new HttpError(404, 'Local no encontrado', 'not_found');
  return location;
}`,
`async function requireLocation(env, actor, locationId) {
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
}`);

replace('professional/worker/src/api/orders.js',
`  const status = String(url.searchParams.get('status') || '');
  const query = String(url.searchParams.get('q') || '').trim();`,
`  const status = String(url.searchParams.get('status') || '');
  const query = String(url.searchParams.get('q') || '').trim();
  const costCenterId = String(url.searchParams.get('costCenterId') || '');`);
replace('professional/worker/src/api/orders.js',
`      l.id AS location_id, l.name AS location_name,
      u.display_name AS requested_by_name,`,
`      l.id AS location_id, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      u.display_name AS requested_by_name,`);
replace('professional/worker/src/api/orders.js',
`    LEFT JOIN users u ON u.id = o.requested_by
    LEFT JOIN order_items oi ON oi.order_id = o.id`,
`    LEFT JOIN users u ON u.id = o.requested_by
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN order_items oi ON oi.order_id = o.id`);
replace('professional/worker/src/api/orders.js',
`      AND (? = '' OR o.folio LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')
    GROUP BY o.id`,
`      AND (? = '' OR o.folio LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')
      AND (? = '' OR occ.cost_center_id = ?)
    GROUP BY o.id`);
replace('professional/worker/src/api/orders.js',
`  \`).bind(actor.orgId, status, status, query, query, query).all();`,
`  \`).bind(actor.orgId, status, status, query, query, query, costCenterId, costCenterId).all();`);
replace('professional/worker/src/api/orders.js',
`    locationName: order.location_name,
    requestedBy: order.requested_by_name,`,
`    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || 'Barra',
    requestedBy: order.requested_by_name,`);
replace('professional/worker/src/api/orders.js',
`    SELECT o.*, s.name AS supplier_name, l.name AS location_name,
      requester.display_name AS requested_by_name, approver.display_name AS approved_by_name`,
`    SELECT o.*, s.name AS supplier_name, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      requester.display_name AS requested_by_name, approver.display_name AS approved_by_name`);
replace('professional/worker/src/api/orders.js',
`    JOIN locations l ON l.id = o.location_id
    LEFT JOIN users requester ON requester.id = o.requested_by`,
`    JOIN locations l ON l.id = o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN users requester ON requester.id = o.requested_by`);
replace('professional/worker/src/api/orders.js',
`    locationName: order.location_name,
    requestedBy: order.requested_by_name,`,
`    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || 'Barra',
    requestedBy: order.requested_by_name,`);
replace('professional/worker/src/api/orders.js',
`  const location = await requireLocation(env, actor, String(body.locationId || ''));
  const supplier = await env.DB.prepare`,
`  const location = await requireLocation(env, actor, String(body.locationId || ''));
  const costCenter = await requireCostCenter(env, actor, String(body.costCenterId || ''), location.id);
  const supplier = await env.DB.prepare`);
replace('professional/worker/src/api/orders.js',
`    env.DB.prepare(\`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, '', 'draft', 'Pedido creado', ?)\`) 
      .bind(uuid(), actor.orgId, id, actor.userId, timestamp)
  ];`,
`    env.DB.prepare(\`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, '', 'draft', 'Pedido creado', ?)\`) 
      .bind(uuid(), actor.orgId, id, actor.userId, timestamp),
    env.DB.prepare('INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)').bind(id, actor.orgId, costCenter.id, timestamp)
  ];`);
replace('professional/worker/src/api/orders.js',
`  await writeAudit(env, actor, request, 'order.create', 'order', id, {folio, supplierId: supplier.id, items: items.length});`,
`  await writeAudit(env, actor, request, 'order.create', 'order', id, {folio, supplierId: supplier.id, costCenterId: costCenter.id, items: items.length});`);
replace('professional/worker/src/api/orders.js',
`  const items = Array.isArray(body.items) ? body.items.map(orderItemPayload) : null;
  if (items && !items.length) throw new HttpError(400, 'El pedido no puede quedar sin productos', 'empty_order');
  const statements = [];`,
`  const items = Array.isArray(body.items) ? body.items.map(orderItemPayload) : null;
  if (items && !items.length) throw new HttpError(400, 'El pedido no puede quedar sin productos', 'empty_order');
  const costCenter = body.costCenterId === undefined ? null : await requireCostCenter(env, actor, String(body.costCenterId || ''), current.location_id);
  const statements = [];
  if (costCenter) statements.push(env.DB.prepare(\`INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET cost_center_id = excluded.cost_center_id\`).bind(orderId, actor.orgId, costCenter.id, nowIso()));`);

replace('professional/worker/src/storage.js',
`    \`Local: \${order.locationName || ''}\`,
    \`Proveedor: \${order.supplierName || ''}\`,`,
`    \`Local: \${order.locationName || ''}\`,
    \`Centro de costo: \${order.costCenterName || 'Barra'}\`,
    \`Proveedor: \${order.supplierName || ''}\`,`);

replace('professional/worker/src/api/catalog.js',
`export async function createLocation`,
`export async function createLocation`);

replace('professional/worker/src/index.js',
`  createLocation,
  createProduct,
  createSupplier,`,
`  createCostCenter,
  createLocation,
  createProduct,
  createSupplier,`);
replace('professional/worker/src/index.js',
`  listCategories,
  listLocations,
  listProducts,`,
`  listCategories,
  listCostCenters,
  listLocations,
  listProducts,`);
replace('professional/worker/src/index.js',
`  listSuppliers
} from './api/catalog.js';`,
`  listSuppliers,
  setProductCostCenters
} from './api/catalog.js';`);
replace('professional/worker/src/index.js',
`  if (method === 'GET' && path === '/api/locations') return ok({locations: await listLocations(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/locations') return ok({location: await createLocation(request, env, actor)}, request, env);`,
`  if (method === 'GET' && path === '/api/locations') return ok({locations: await listLocations(env, actor)}, request, env);
  if (method === 'POST' && path === '/api/locations') return ok({location: await createLocation(request, env, actor)}, request, env);
  if (method === 'GET' && path === '/api/cost-centers') return ok({costCenters: await listCostCenters(env, actor, url)}, request, env);
  if (method === 'POST' && path === '/api/cost-centers') return ok({costCenter: await createCostCenter(request, env, actor)}, request, env);`);
replace('professional/worker/src/index.js',
`  const productSupplierParams = routeMatch(path, '/api/products/:id/suppliers');`,
`  const productCostCenterParams = routeMatch(path, '/api/products/:id/cost-centers');
  if (productCostCenterParams && method === 'PUT') return ok(await setProductCostCenters(request, env, actor, productCostCenterParams.id), request, env);
  const productSupplierParams = routeMatch(path, '/api/products/:id/suppliers');`);

replace('professional/worker/src/platform.js',
`    env.DB.prepare(\`
      INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)
    \`).bind(locationId, orgId, locationName, locationCode, timestamp, timestamp),`,
`    env.DB.prepare(\`
      INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)
    \`).bind(locationId, orgId, locationName, locationCode, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)\`).bind(\`${locationId}-cc-barra\`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Salón', 'SALON', 1, ?, ?)\`).bind(\`${locationId}-cc-salon\`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(\`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)\`).bind(\`${locationId}-cc-cocina\`, orgId, locationId, timestamp, timestamp),`);

replace('professional/web/index.html',
`        <label class="field"><span>Empresa <small>opcional</small></span><input id="loginOrg" name="organizationSlug" autocomplete="organization" placeholder="mi-empresa"></label>
`, '');
replace('professional/web/index.html',
`      <div class="workspace-card">
        <span class="workspace-avatar" id="workspaceAvatar">PP</span>
        <div><strong id="workspaceName">Empresa</strong><small id="workspacePlan">Plan gratuito</small></div>
        <span class="chevron">⌄</span>
      </div>`,
`      <button class="workspace-card" id="workspaceCard" type="button">
        <span class="workspace-avatar" id="workspaceAvatar">PP</span>
        <span class="workspace-copy"><strong id="workspaceName">Empresa</strong><small id="workspacePlan">Plan gratuito</small></span>
        <span class="chevron" id="workspaceChevron">⌄</span>
      </button>`);
replaceRegex('professional/web/index.html', /\n      <div class="free-plan-card">[\s\S]*?<\/div>\n      <nav class="side-nav lower">/, '\n      <nav class="side-nav lower">');
replaceRegex('professional/web/index.html', /\n    <div class="auth-copy">[\s\S]*?<\/div>\n    <div class="auth-card glass">/, `
    <div class="auth-card glass">
      <div class="auth-intro"><span class="eyebrow">ACCESO A PEDIDOS PRO</span><h1>Gestiona compras, facturas y centros de costo.</h1><p>Ingresa con tu correo. La app abrirá automáticamente la marca y los locales que tienes asignados.</p></div>`);

replace('professional/web/app-core.js',
`cache: {dashboard:null,orders:[],invoices:[],products:[],suppliers:[],categories:[],locations:[],users:[],audit:[],brands:[]},`,
`cache: {dashboard:null,orders:[],invoices:[],products:[],suppliers:[],categories:[],locations:[],costCenters:[],users:[],audit:[],brands:[]},`);
replace('professional/web/app-core.js',
`  $('#workspaceAvatar').textContent=initials(organization.name);
  $('#userName').textContent=user.displayName;`,
`  $('#workspaceAvatar').textContent=initials(organization.name);
  const platformOwner=Boolean(user.isPlatformOwner);
  $('#workspaceCard').disabled=!platformOwner;
  $('#workspaceCard').classList.toggle('selectable',platformOwner);
  $('#workspaceChevron').classList.toggle('hidden',!platformOwner);
  $('#userName').textContent=user.displayName;`);

replace('professional/web/app.js',
`$('#loginForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;setBusy(button,true,'Ingresando…');try{const response=await api('/api/auth/login',{method:'POST',json:{email:$('#loginEmail').value,password:$('#loginPassword').value,organizationSlug:$('#loginOrg').value}});state.token=response.token;localStorage.setItem('pp:token',state.token);state.me=await api('/api/me');showApp();await navigate('dashboard');toast('Sesión iniciada')}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}});`,
`$('#loginForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;setBusy(button,true,'Ingresando…');try{const response=await api('/api/auth/login',{method:'POST',json:{email:$('#loginEmail').value,password:$('#loginPassword').value}});state.token=response.token;localStorage.setItem('pp:token',state.token);state.me=await api('/api/me');showApp();await navigate('dashboard');toast('Sesión iniciada')}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}});`);
replace('professional/web/app.js',
`$('#globalSearch').addEventListener('focus',()=>openCommand());`,
`$('#workspaceCard').addEventListener('click',()=>{if(state.me?.user?.isPlatformOwner)navigate('settings')});
$('#globalSearch').addEventListener('focus',()=>openCommand());`);
replace('professional/web/app.js',
`    $('#loginEmail').value='admin@pedidospro.local';
    $('#loginOrg').value='pedidos-pro';`,
`    $('#loginEmail').value='admin@pedidospro.local';`);

write('professional/web/app-actions.js', `import {$,$$,esc,state,api,toast,setBusy,queueMutation,showApp,logoutLocal} from './app-core.js';
import {navigate} from './app-views.js';
import {openOrderDetail as openProfessionalOrderDetail} from './app-order-detail.js';
import {openInvoiceAnalysis} from './app-invoices.js';

const BOOTSTRAP_TOKEN='pedidos-pro-inicializacion';
function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit}){
  $('#modalEyebrow').textContent=eyebrow;$('#modalTitle').textContent=title;$('#modalSubtitle').textContent=subtitle;$('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML='<button class="btn" value="cancel">Cancelar</button><button class="btn primary" type="button" id="modalSubmit">'+esc(submitLabel)+'</button>';
  const dialog=$('#modal');if(dialog.open)dialog.close();dialog.showModal();
  $('#modalSubmit').onclick=async()=>{const button=$('#modalSubmit');setBusy(button,true);try{await onSubmit(new FormData($('#modalFrame')));if(dialog.open)dialog.close()}catch(error){toast(error.message,'error')}finally{setBusy(button,false)}};
}
function resetWorkspaceCache(){state.cache={dashboard:null,orders:[],products:[],suppliers:[],categories:[],locations:[],costCenters:[],users:[],audit:[],brands:[],invoices:[]}}
function centerChecks(selected=[]){return (state.cache.costCenters||[]).map(center=>`<label class="check-card"><input type="checkbox" name="costCenterIds" value="${esc(center.id)}" ${selected.includes(center.id)||(!selected.length&&center.code==='BARRA')?'checked':''}><span><strong>${esc(center.name)}</strong><small>${esc(center.locationName)}</small></span></label>`).join('')}
function openBootstrap(){openModal({eyebrow:'PRIMERA INSTALACIÓN',title:'Crear tu espacio',subtitle:'Define la cuenta propietaria y el primer local.',body:`<div class="form-grid"><label class="field"><span>Empresa</span><input name="organizationName" value="Pedidos Pro" required></label><label class="field"><span>Local principal</span><input name="locationName" value="Madriguera Clubhaus" required></label><label class="field"><span>Tu nombre</span><input name="displayName" value="Benjamín Palma" required></label><label class="field"><span>Correo</span><input name="email" type="email" required></label><label class="field full"><span>Contraseña</span><input name="password" type="password" minlength="10" required></label></div>`,submitLabel:'Crear y entrar',onSubmit:async form=>{const response=await api('/api/bootstrap',{method:'POST',headers:{'X-Bootstrap-Token':BOOTSTRAP_TOKEN},json:Object.fromEntries(form)});state.token=response.token;localStorage.setItem('pp:token',state.token);state.me=await api('/api/me');showApp();await navigate('dashboard')}})}
function openSupplier(){openModal({eyebrow:'ABASTECIMIENTO',title:'Nuevo proveedor',body:`<div class="form-grid"><label class="field"><span>Nombre comercial</span><input name="name" required></label><label class="field"><span>RUT</span><input name="rut"></label><label class="field"><span>Contacto</span><input name="contactName"></label><label class="field"><span>Correo</span><input name="email" type="email"></label><label class="field"><span>Teléfono</span><input name="phone"></label><label class="field"><span>Días de entrega</span><input name="leadDays" type="number" min="0" value="0"></label><label class="field"><span>Pedido mínimo</span><input name="minimumOrder" type="number" min="0" value="0"></label><label class="field"><span>Condiciones de pago</span><input name="paymentTerms"></label></div>`,onSubmit:async form=>{await api('/api/suppliers',{method:'POST',json:Object.fromEntries(form)});toast('Proveedor creado');await navigate('suppliers')}})}
async function openProduct(){if(!state.cache.categories.length)state.cache.categories=(await api('/api/categories')).categories;if(!state.cache.costCenters.length)state.cache.costCenters=(await api('/api/cost-centers')).costCenters;openModal({eyebrow:'CATÁLOGO',title:'Nuevo producto',subtitle:'Selecciona uno o más centros de costo.',body:`<div class="form-grid"><label class="field full"><span>Nombre</span><input name="name" required></label><label class="field"><span>Marca</span><input name="brand"></label><label class="field"><span>Variante</span><input name="variant"></label><label class="field"><span>Categoría</span><select name="categoryId"><option value="">Sin categoría</option>${state.cache.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label class="field"><span>Contenido</span><input name="contentValue" type="number" min="0"></label><label class="field"><span>Unidad contenido</span><select name="contentUnit"><option>ml</option><option>l</option><option>g</option><option>kg</option><option>unidad</option></select></label><label class="field"><span>Unidad inventario</span><input name="baseUnit" value="unidad"></label><label class="field full"><span>Código de barras</span><input name="barcode"></label><div class="full"><span class="field-label">Centros de costo</span><div class="check-grid">${centerChecks()}</div></div></div>`,onSubmit:async form=>{const json=Object.fromEntries(form);json.costCenterIds=form.getAll('costCenterIds').map(String);if(!json.costCenterIds.length)throw new Error('Selecciona al menos un centro de costo');await api('/api/products',{method:'POST',json});toast('Producto creado');await navigate('catalog')}})}
async function openCostCenter(){if(!state.cache.locations.length)state.cache.locations=(await api('/api/locations')).locations;openModal({eyebrow:'CENTROS DE COSTO',title:'Nuevo centro de costo',subtitle:'Quedará disponible para cargar productos y crear pedidos.',body:`<div class="form-grid"><label class="field"><span>Local</span><select name="locationId">${state.cache.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><label class="field"><span>Nombre</span><input name="name" required placeholder="Ej: Eventos"></label><label class="field full"><span>Código</span><input name="code" placeholder="EVENTOS"></label></div>`,submitLabel:'Crear centro',onSubmit:async form=>{await api('/api/cost-centers',{method:'POST',json:Object.fromEntries(form)});state.cache.costCenters=[];toast('Centro de costo creado');await navigate('catalog')}})}
async function assignCostCenters(productId){if(!state.cache.costCenters.length)state.cache.costCenters=(await api('/api/cost-centers')).costCenters;const product=state.cache.products.find(item=>item.id===productId);const selected=(product?.costCenters||[]).map(center=>center.id);openModal({eyebrow:'CATÁLOGO',title:product?.name||'Centros de costo',subtitle:'Define en qué áreas estará disponible este producto.',body:`<div class="check-grid">${centerChecks(selected)}</div>`,submitLabel:'Guardar asignación',onSubmit:async form=>{const costCenterIds=form.getAll('costCenterIds').map(String);if(!costCenterIds.length)throw new Error('Selecciona al menos un centro de costo');await api(`/api/products/${productId}/cost-centers`,{method:'PUT',json:{costCenterIds}});toast('Centros actualizados');await navigate('catalog')}})}
async function openUser(){if(!state.cache.locations.length)state.cache.locations=(await api('/api/locations')).locations;if(!state.cache.locations.length)return toast('Primero debes crear un local','error');const options=state.cache.locations.map(location=>`<label class="check-card"><input type="checkbox" name="locationScope" value="${esc(location.id)}"><span><strong>${esc(location.name)}</strong><small>Acceso operativo</small></span></label>`).join('');openModal({eyebrow:'SEGURIDAD',title:'Nuevo usuario',subtitle:'Al iniciar sesión entrará directamente a los locales asignados.',body:`<div class="form-grid"><label class="field"><span>Nombre</span><input name="displayName" required></label><label class="field"><span>Correo</span><input name="email" type="email" required></label><label class="field"><span>Contraseña inicial</span><input name="password" type="password" minlength="10" required></label><label class="field"><span>Rol</span><select name="role"><option value="readonly">Solo lectura</option><option value="purchaser">Compras</option><option value="receiver">Recepción</option><option value="approver">Aprobador</option><option value="finance">Finanzas</option><option value="admin">Administrador</option></select></label><div class="full"><span class="field-label">Locales permitidos</span><div class="check-grid">${options}</div></div></div>`,onSubmit:async form=>{const locationScope=form.getAll('locationScope').map(String);if(!locationScope.length)throw new Error('Selecciona al menos un local');await api('/api/users',{method:'POST',json:{displayName:form.get('displayName'),email:form.get('email'),password:form.get('password'),role:form.get('role'),locationScope}});toast('Usuario creado');await navigate('team')}})}
function openLocation(){openModal({eyebrow:'LOCALES',title:'Nuevo local',subtitle:'Se crearán Barra, Salón y Cocina automáticamente.',body:`<div class="form-grid"><label class="field"><span>Nombre</span><input name="name" required></label><label class="field"><span>Código</span><input name="code" placeholder="MDR"></label><label class="field full"><span>Zona horaria</span><input name="timezone" value="America/Santiago"></label></div>`,submitLabel:'Crear local',onSubmit:async form=>{await api('/api/locations',{method:'POST',json:Object.fromEntries(form)});state.cache.locations=[];state.cache.costCenters=[];toast('Local y centros de costo creados');await navigate('settings')}})}
function openBrand(){openModal({eyebrow:'OWNER',title:'Nueva marca',subtitle:'La marca tendrá sus propios locales, usuarios, catálogo y documentos.',body:`<div class="form-grid"><label class="field"><span>Nombre de la marca</span><input name="name" required></label><label class="field"><span>Identificador</span><input name="slug"></label><label class="field"><span>Primer local</span><input name="locationName" required></label><label class="field"><span>Código del local</span><input name="locationCode"></label></div>`,submitLabel:'Crear marca',onSubmit:async form=>{await api('/api/brands',{method:'POST',json:Object.fromEntries(form)});state.cache.brands=[];toast('Marca creada');await navigate('settings')}})}
async function switchBrand(id){const response=await api(`/api/brands/${id}/switch`,{method:'POST',json:{}});state.token=response.token;localStorage.setItem('pp:token',state.token);resetWorkspaceCache();state.me=await api('/api/me');showApp();await navigate('dashboard');toast('Marca activa actualizada')}
function openChangePassword(){openModal({eyebrow:'SEGURIDAD',title:'Cambiar contraseña',subtitle:'Al guardar se cerrarán todas tus sesiones.',body:`<div class="form-grid"><label class="field full"><span>Nueva contraseña</span><input name="password" type="password" minlength="10" required></label><label class="field full"><span>Repite la contraseña</span><input name="confirmation" type="password" minlength="10" required></label></div>`,submitLabel:'Cambiar contraseña',onSubmit:async form=>{const password=String(form.get('password')||'');if(password!==String(form.get('confirmation')||''))throw new Error('Las contraseñas no coinciden');await api(`/api/users/${state.me.user.id}/password`,{method:'POST',json:{password}});toast('Contraseña actualizada');setTimeout(()=>logoutLocal(),500)}})}
async function ensureOrderSources(){if(!state.cache.locations.length)state.cache.locations=(await api('/api/locations')).locations;if(!state.cache.suppliers.length)state.cache.suppliers=(await api('/api/suppliers')).suppliers;if(!state.cache.products.length)state.cache.products=(await api('/api/products')).products;if(!state.cache.costCenters.length)state.cache.costCenters=(await api('/api/cost-centers')).costCenters}
async function openOrder(){await ensureOrderSources();if(!state.cache.locations.length||!state.cache.suppliers.length)return toast('Primero debes crear un local y un proveedor','error');openModal({eyebrow:'NUEVO PEDIDO',title:'Crear pedido',subtitle:'El catálogo se filtra por local y centro de costo.',body:`<div class="form-grid"><label class="field"><span>Local</span><select name="locationId" id="orderLocation">${state.cache.locations.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><label class="field"><span>Centro de costo</span><select name="costCenterId" id="orderCostCenter"></select></label><label class="field"><span>Proveedor</span><select name="supplierId">${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>Entrega</span><input name="deliveryDate" type="date"></label><label class="field full"><span>Notas</span><textarea name="notes"></textarea></label><div class="full"><div class="panel-head"><h3>Productos</h3><button class="btn small" type="button" id="addOrderLine">＋ Línea</button></div><div class="order-lines" id="orderLines"></div></div></div>`,submitLabel:'Crear borrador',onSubmit:async form=>{const items=$$('#orderLines .order-line').map(row=>({productId:row.querySelector('[name=productId]').value,description:row.querySelector('[name=productId]').selectedOptions[0]?.textContent||'Producto',quantity:Number(row.querySelector('[name=quantity]').value),orderUnit:row.querySelector('[name=orderUnit]').value,unitsPerOrderUnit:Number(row.querySelector('[name=units]').value),expectedGrossUnitPrice:Number(row.querySelector('[name=price]').value)})).filter(item=>item.productId&&item.quantity>0);const json={locationId:form.get('locationId'),costCenterId:form.get('costCenterId'),supplierId:form.get('supplierId'),deliveryDate:form.get('deliveryDate'),notes:form.get('notes'),items};if(!navigator.onLine){await queueMutation('/api/orders','POST',json);toast('Pedido guardado para sincronizar');return navigate('orders')}await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},json});toast('Pedido y PDF creados');await navigate('orders')}});const centers=()=>state.cache.costCenters.filter(center=>center.locationId===$('#orderLocation').value);const products=()=>state.cache.products.filter(product=>(product.costCenters||[]).some(center=>center.id===$('#orderCostCenter').value));const refreshCenters=()=>{$('#orderCostCenter').innerHTML=centers().map(center=>`<option value="${esc(center.id)}">${esc(center.name)}</option>`).join('');refreshProducts()};const refreshProducts=()=>{$$('#orderLines [name=productId]').forEach(select=>{const current=select.value;select.innerHTML='<option value="">Seleccionar</option>'+products().map(product=>`<option value="${esc(product.id)}">${esc(product.name)}</option>`).join('');if([...select.options].some(option=>option.value===current))select.value=current})};const add=()=>{const row=document.createElement('div');row.className='order-line';row.innerHTML=`<label class="field line-product"><span>Producto</span><select name="productId"></select></label><label class="field"><span>Cantidad</span><input name="quantity" type="number" step="0.001" min="0" value="1"></label><label class="field line-unit"><span>Unidad</span><input name="orderUnit" value="unidad"></label><label class="field"><span>Unid./pack</span><input name="units" type="number" step="0.001" value="1"></label><label class="field line-price"><span>Precio unit.</span><input name="price" type="number" min="0" value="0"></label><button class="remove-line" type="button">×</button>`;row.querySelector('.remove-line').onclick=()=>row.remove();$('#orderLines').append(row);refreshProducts()};$('#orderLocation').onchange=refreshCenters;$('#orderCostCenter').onchange=refreshProducts;$('#addOrderLine').onclick=add;refreshCenters();add()}
async function linkSupplier(productId){if(!state.cache.suppliers.length)state.cache.suppliers=(await api('/api/suppliers')).suppliers;openModal({eyebrow:'PRESENTACIÓN DE COMPRA',title:'Vincular proveedor',body:`<div class="form-grid"><label class="field"><span>Proveedor</span><select name="supplierId">${state.cache.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label class="field"><span>SKU proveedor</span><input name="supplierSku"></label><label class="field full"><span>Nombre usado por proveedor</span><input name="supplierProductName"></label><label class="field"><span>Unidad de compra</span><input name="orderUnit" value="caja"></label><label class="field"><span>Unidades por compra</span><input name="unitsPerOrderUnit" type="number" step="0.001" value="1"></label><label class="field"><span>Mínimo</span><input name="minimumQuantity" type="number" step="0.001" value="0"></label><label class="field"><span>Múltiplo</span><input name="quantityMultiple" type="number" step="0.001" value="1"></label></div>`,onSubmit:async form=>{await api(`/api/products/${productId}/suppliers`,{method:'POST',json:Object.fromEntries(form)});toast('Proveedor vinculado');await navigate('catalog')}})}
function bindDynamic(){$$('[data-view-link]').forEach(node=>node.onclick=()=>navigate(node.dataset.viewLink));$$('[data-action]').forEach(node=>node.onclick=()=>handleAction(node.dataset.action));$$('[data-order]').forEach(node=>node.onclick=()=>openProfessionalOrderDetail(node.dataset.order));$$('[data-link-supplier]').forEach(node=>node.onclick=()=>linkSupplier(node.dataset.linkSupplier));$$('[data-assign-cost-centers]').forEach(node=>node.onclick=()=>assignCostCenters(node.dataset.assignCostCenters));$$('[data-switch-brand]').forEach(node=>node.onclick=()=>switchBrand(node.dataset.switchBrand));$$('[data-toggle-user]').forEach(node=>node.onclick=async()=>{const active=node.dataset.active==='1';const user=state.cache.users.find(item=>item.id===node.dataset.toggleUser);await api(`/api/users/${node.dataset.toggleUser}`,{method:'PATCH',json:{active:!active,role:user?.role,locationScope:user?.locationScope||[]}});toast(active?'Usuario revocado':'Usuario reactivado');await navigate('team')});$$('[data-revoke-session]').forEach(node=>node.onclick=async()=>{await api(`/api/sessions/${node.dataset.revokeSession}/revoke`,{method:'POST',json:{}});toast('Sesión revocada');await navigate('settings')});if(state.view==='settings'&&!$('#changePasswordButton')){const target=$('.panel-grid .panel');if(target){const button=document.createElement('button');button.id='changePasswordButton';button.type='button';button.className='btn';button.style.marginTop='12px';button.textContent='Cambiar contraseña';button.onclick=openChangePassword;target.append(button)}}}
function handleAction(action){if(action==='new-order')return openOrder();if(action==='new-supplier')return openSupplier();if(action==='new-product')return openProduct();if(action==='new-cost-center')return openCostCenter();if(action==='new-user')return openUser();if(action==='new-brand')return openBrand();if(action==='new-location')return openLocation();if(action==='analyze-invoice')return openInvoiceAnalysis();if(action==='change-password')return openChangePassword()}
export {openBootstrap,openOrder,handleAction,bindDynamic};
`);

write('professional/web/app-views.js', `import {$,$$,esc,money,date,state,api,isAdmin,initials,roleNames,setTheme} from './app-core.js';
import {bindDynamic} from './app-actions.js';
const viewMeta={dashboard:['OPERACIÓN','Resumen'],orders:['COMPRAS','Pedidos'],invoices:['DOCUMENTOS','Facturas'],catalog:['DATOS','Catálogo'],suppliers:['ABASTECIMIENTO','Proveedores'],team:['SEGURIDAD','Equipo'],audit:['CONTROL','Auditoría'],settings:['CUENTA','Configuración']};
async function navigate(view){if(['team','audit'].includes(view)&&!isAdmin())return;state.view=view;$$('.nav-item[data-view],.bottom-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));const [eyebrow,title]=viewMeta[view]||viewMeta.dashboard;$('#pageEyebrow').textContent=eyebrow;$('#pageTitle').textContent=title;const action=$('#primaryAction');action.classList.toggle('hidden',!['dashboard','orders','invoices','catalog','suppliers','team'].includes(view));action.innerHTML=view==='invoices'?'<span>⌁</span><span>Analizar factura</span>':view==='catalog'?'<span>＋</span><span>Nuevo producto</span>':view==='suppliers'?'<span>＋</span><span>Nuevo proveedor</span>':view==='team'?'<span>＋</span><span>Nuevo usuario</span>':'<span>＋</span><span>Nuevo pedido</span>';$('#mainContent').innerHTML='<div class="panel"><div class="empty-state">Cargando información…</div></div>';try{if(view==='dashboard')await renderDashboard();if(view==='orders')await renderOrders();if(view==='invoices')await renderInvoices();if(view==='catalog')await renderCatalog();if(view==='suppliers')await renderSuppliers();if(view==='team')await renderTeam();if(view==='audit')await renderAudit();if(view==='settings')await renderSettings()}catch(error){renderError(error)}$('#mainContent').focus({preventScroll:true})}
function renderError(error){$('#mainContent').innerHTML=`<div class="panel"><div class="empty-state"><h3>No se pudo cargar esta sección</h3><p>${esc(error.message)}</p><button class="btn" id="retryView">Reintentar</button></div></div>`;$('#retryView')?.addEventListener('click',()=>navigate(state.view))}
function metric(label,value,note){return `<article class="metric-card"><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note)}</span></article>`}
const statusLabel=value=>({draft:'Borrador',requested:'Solicitado',approved:'Aprobado',rejected:'Rechazado',sent:'Enviado',confirmed:'Confirmado',partially_received:'Recepción parcial',received:'Recibido',reconciled:'Conciliado',closed:'Cerrado',cancelled:'Anulado'}[value]||value);
function ordersTable(orders){if(!orders?.length)return '<div class="empty-state"><h3>Aún no hay pedidos</h3><p>Crea el primero para comenzar.</p></div>';return `<table class="data-table"><thead><tr><th>Folio</th><th>Proveedor</th><th>Local</th><th>Centro</th><th>Estado</th><th>Entrega</th><th>Total</th></tr></thead><tbody>${orders.map(o=>`<tr data-order="${esc(o.id)}"><td><strong>${esc(o.folio)}</strong></td><td>${esc(o.supplierName)}</td><td>${esc(o.locationName)}</td><td><span class="cost-chip">${esc(o.costCenterName||'Barra')}</span></td><td><span class="status ${esc(o.status)}">${esc(statusLabel(o.status))}</span></td><td>${date(o.deliveryDate)}</td><td>${money(o.grossTotal)}</td></tr>`).join('')}</tbody></table>`}
async function renderDashboard(){const payload=await api('/api/dashboard');state.cache.dashboard=payload;const m=payload.metrics;$('#pendingCount').textContent=m.pendingOrders;$('#mainContent').innerHTML=`<div class="view-header compact-header"><div><h2>Resumen operativo</h2><p>Información útil sin paneles de relleno.</p></div><div class="view-actions"><button class="btn primary" data-action="new-order">＋ Pedido</button><button class="btn" data-action="analyze-invoice">⌁ Factura</button></div></div><section class="metrics-grid compact-metrics">${metric('Pedidos 30 días',m.orders30d,'Creados')}${metric('Pendientes',m.pendingOrders,'Por gestionar')}${metric('Compras 30 días',money(m.spend30d),'Facturado')}${metric('Proveedores',m.suppliers,'Activos')}${metric('Productos',m.products,'Catálogo')}${metric('Documentos',m.archivedDocuments||0,'Archivados')}</section><section class="table-card"><div class="panel-head table-head"><h3>Actividad reciente</h3><button class="btn small" data-view-link="orders">Ver todos</button></div>${ordersTable(payload.recentOrders)}</section>`;bindDynamic()}
async function renderOrders(){const [payload,centers]=await Promise.all([api('/api/orders'),api('/api/cost-centers')]);state.cache.orders=payload.orders;state.cache.costCenters=centers.costCenters;$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Pedidos</h2><p>Folios, centros de costo y trazabilidad documental.</p></div><button class="btn primary" data-action="new-order">＋ Nuevo pedido</button></div><div class="toolbar"><label class="field toolbar-search"><input id="orderSearch" placeholder="Buscar folio o proveedor"></label><label class="field"><select id="orderCenter"><option value="">Todos los centros</option>${state.cache.costCenters.map(c=>`<option value="${esc(c.id)}">${esc(c.locationName)} · ${esc(c.name)}</option>`).join('')}</select></label><label class="field"><select id="orderStatus"><option value="">Todos los estados</option>${['draft','requested','approved','sent','confirmed','partially_received','received','reconciled','closed','cancelled'].map(v=>`<option value="${v}">${statusLabel(v)}</option>`).join('')}</select></label></div><section class="table-card" id="ordersContainer">${ordersTable(payload.orders)}</section>`;$('#orderSearch').oninput=filterOrders;$('#orderStatus').onchange=filterOrders;$('#orderCenter').onchange=filterOrders;bindDynamic()}
function filterOrders(){const q=$('#orderSearch').value.toLowerCase(),status=$('#orderStatus').value,center=$('#orderCenter').value;const filtered=state.cache.orders.filter(o=>(!status||o.status===status)&&(!center||o.costCenterId===center)&&(!q||`${o.folio} ${o.supplierName} ${o.costCenterName}`.toLowerCase().includes(q)));$('#ordersContainer').innerHTML=ordersTable(filtered);bindDynamic()}
async function openStoredDocument(key){const response=await fetch(`/api/files/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${state.token}`}});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'No se pudo abrir el documento')}const url=URL.createObjectURL(await response.blob());window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}
function bindStoredDocuments(){$$('[data-file-key]').forEach(button=>button.onclick=()=>openStoredDocument(button.dataset.fileKey).catch(error=>renderError(error)))}
async function renderInvoices(){const [invoicePayload,supplierPayload,orderPayload]=await Promise.all([api('/api/invoices'),api('/api/suppliers'),api('/api/orders')]);state.cache.invoices=invoicePayload.invoices;state.cache.suppliers=supplierPayload.suppliers;state.cache.orders=orderPayload.orders;$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Facturas</h2><p>Cotejo, precios finales y archivo original.</p></div><button class="btn primary" data-action="analyze-invoice">⌁ Analizar factura</button></div><div class="toolbar"><label class="field toolbar-search"><input id="invoiceSearch" placeholder="Buscar número o proveedor"></label></div><section class="table-card" id="invoiceContainer">${invoiceTable(invoicePayload.invoices)}</section>`;$('#invoiceSearch').oninput=()=>{const q=$('#invoiceSearch').value.toLowerCase();$('#invoiceContainer').innerHTML=invoiceTable(state.cache.invoices.filter(i=>`${i.invoiceNumber} ${i.supplierName} ${(i.locationNames||[]).join(' ')}`.toLowerCase().includes(q)));bindStoredDocuments()};bindDynamic();bindStoredDocuments()}
function invoiceTable(invoices){if(!invoices?.length)return '<div class="empty-state"><h3>Aún no hay facturas</h3><p>Sube una imagen o PDF para comenzar.</p></div>';return `<table class="data-table"><thead><tr><th>Documento</th><th>Proveedor</th><th>Local</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Archivo</th></tr></thead><tbody>${invoices.map(i=>`<tr><td><strong>${esc(i.invoiceNumber)}</strong></td><td>${esc(i.supplierName)}</td><td>${esc((i.locationNames||[]).join(', ')||'—')}</td><td>${date(i.invoiceDate)}</td><td><span class="status ${esc(i.status)}">${esc(i.status)}</span></td><td><strong>${money(i.grossTotal)}</strong></td><td>${i.pdfKey?`<button class="btn small" data-file-key="${esc(i.pdfKey)}">Abrir</button>`:'—'}</td></tr>`).join('')}</tbody></table>`}
function productTable(products){if(!products.length)return '<div class="empty-state"><h3>Sin productos en este centro</h3><p>Carga un producto o cambia el filtro.</p></div>';return `<table class="data-table"><thead><tr><th>Producto</th><th>Categoría</th><th>Centros</th><th>Proveedores</th><th></th></tr></thead><tbody>${products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc([p.brand,p.variant,p.contentValue?`${p.contentValue} ${p.contentUnit}`:''].filter(Boolean).join(' · '))}</small></td><td>${esc(p.categoryName||'Sin categoría')}</td><td><div class="chip-row">${(p.costCenters||[]).map(c=>`<span class="cost-chip">${esc(c.name)}</span>`).join('')||'—'}</div></td><td>${p.suppliers.length}</td><td><div class="row-actions"><button class="btn small" data-assign-cost-centers="${esc(p.id)}">Centros</button><button class="btn small" data-link-supplier="${esc(p.id)}">Proveedor</button></div></td></tr>`).join('')}</tbody></table>`}
async function renderCatalog(){const [products,categories,suppliers,centers,locations]=await Promise.all([api('/api/products'),api('/api/categories'),api('/api/suppliers'),api('/api/cost-centers'),api('/api/locations')]);state.cache.products=products.products;state.cache.categories=categories.categories;state.cache.suppliers=suppliers.suppliers;state.cache.costCenters=centers.costCenters;state.cache.locations=locations.locations;$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Catálogo por centro de costo</h2><p>La base existente quedó asignada a Barra. Salón y Cocina están listos para cargar.</p></div><div class="view-actions"><button class="btn" data-action="new-cost-center">＋ Centro</button><button class="btn primary" data-action="new-product">＋ Producto</button></div></div><div class="toolbar"><label class="field toolbar-search"><input id="productSearch" placeholder="Buscar producto, marca o código"></label><label class="field"><select id="productCenter"><option value="">Todos los centros</option>${state.cache.costCenters.map(c=>`<option value="${esc(c.id)}">${esc(c.locationName)} · ${esc(c.name)} (${c.productCount})</option>`).join('')}</select></label></div><section class="table-card" id="productGrid">${productTable(state.cache.products)}</section>`;const filter=()=>{const q=$('#productSearch').value.toLowerCase(),center=$('#productCenter').value;const list=state.cache.products.filter(p=>(!center||(p.costCenters||[]).some(c=>c.id===center))&&(!q||`${p.name} ${p.brand} ${p.barcode}`.toLowerCase().includes(q)));$('#productGrid').innerHTML=productTable(list);bindDynamic()};$('#productSearch').oninput=filter;$('#productCenter').onchange=filter;bindDynamic()}
async function renderSuppliers(){const payload=await api('/api/suppliers');state.cache.suppliers=payload.suppliers;$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Proveedores</h2><p>Condiciones, productos y últimas compras.</p></div><button class="btn primary" data-action="new-supplier">＋ Nuevo proveedor</button></div><div class="toolbar"><label class="field toolbar-search"><input id="supplierSearch" placeholder="Buscar proveedor o RUT"></label></div><section class="cards-grid" id="supplierGrid">${supplierCards(payload.suppliers)}</section>`;$('#supplierSearch').oninput=()=>{$('#supplierGrid').innerHTML=supplierCards(state.cache.suppliers.filter(s=>`${s.name} ${s.rut}`.toLowerCase().includes($('#supplierSearch').value.toLowerCase())))};bindDynamic()}
function supplierCards(suppliers){if(!suppliers.length)return '<div class="panel empty-state"><h3>Sin proveedores</h3></div>';return suppliers.map(s=>`<article class="entity-card"><div class="entity-head"><span class="entity-logo">${esc(initials(s.name))}</span><span class="status ${s.active?'active':'inactive'}">${s.active?'Activo':'Inactivo'}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.contactName||s.email||s.rut||'Sin contacto')}</p><div class="entity-meta"><div><span>Productos</span><strong>${s.productCount}</strong></div><div><span>Entrega</span><strong>${s.leadDays||0} días</strong></div></div></article>`).join('')}
async function renderTeam(){const [payload,locationPayload]=await Promise.all([api('/api/users'),api('/api/locations')]);state.cache.users=payload.users;state.cache.locations=locationPayload.locations;const locationMap=new Map(state.cache.locations.map(location=>[location.id,location.name]));const scopeLabel=user=>user.role==='owner'||user.locationScope?.includes('*')?'Todos los locales':(user.locationScope||[]).map(id=>locationMap.get(id)||id).join(', ');$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Equipo</h2><p>El correo determina automáticamente la marca y los locales disponibles.</p></div><button class="btn primary" data-action="new-user">＋ Nuevo usuario</button></div><section class="table-card"><table class="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Locales</th><th>Estado</th><th></th></tr></thead><tbody>${payload.users.map(u=>`<tr><td><strong>${esc(u.displayName)}</strong><br><small>${esc(u.email)}</small></td><td>${esc(roleNames[u.role]||u.role)}</td><td>${esc(scopeLabel(u))}</td><td><span class="status ${u.active?'active':'inactive'}">${u.active?'Activo':'Revocado'}</span></td><td><button class="btn small ${u.active?'danger':''}" data-toggle-user="${esc(u.id)}" data-active="${u.active?'1':'0'}">${u.active?'Revocar':'Reactivar'}</button></td></tr>`).join('')}</tbody></table></section>`;bindDynamic()}
async function renderAudit(){const payload=await api('/api/audit?limit=200');state.cache.audit=payload.events;$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Auditoría</h2><p>Registro de acciones y cambios.</p></div></div><section class="panel"><div class="activity-list">${payload.events.length?payload.events.map(e=>`<div class="activity-row"><span class="activity-icon">◷</span><div><strong>${esc(e.action)}</strong><small>${esc(e.actorEmail||'Sistema')} · ${esc(e.entityType)} ${esc(e.entityId||'')}</small></div><span class="activity-time">${date(e.createdAt)}</span></div>`).join(''):'<div class="empty-state"><h3>Sin actividad</h3></div>'}</div></section>`}
async function renderSettings(){const platformOwner=Boolean(state.me.user.isPlatformOwner);const requests=[api('/api/sessions'),api('/api/locations')];if(platformOwner)requests.push(api('/api/brands'));const results=await Promise.all(requests);const sessions=results[0].sessions;state.cache.locations=results[1].locations;state.cache.brands=platformOwner?results[2].brands:[];const theme=document.documentElement.dataset.theme;const brands=state.cache.brands.map(brand=>`<tr><td><strong>${esc(brand.name)}</strong></td><td>${esc(brand.locations.map(location=>location.name).join(', ')||'Sin locales')}</td><td>${brand.current?'<span class="status active">Activa</span>':`<button class="btn small" data-switch-brand="${esc(brand.id)}">Entrar</button>`}</td></tr>`).join('');$('#mainContent').innerHTML=`<div class="view-header"><div><h2>Configuración</h2><p>Seguridad, locales y preferencias.</p></div><div class="view-actions">${platformOwner?'<button class="btn primary" data-action="new-brand">＋ Nueva marca</button>':''}<button class="btn" data-action="new-location">＋ Nuevo local</button></div></div><section class="panel-grid"><article class="panel"><div class="panel-head"><h3>Apariencia</h3></div><label class="field"><span>Tema</span><select id="themeSelect"><option value="system">Usar sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label></article><article class="panel"><div class="panel-head"><h3>Archivo documental</h3></div><p class="panel-copy">Facturas, PDF de folios, revisiones e históricos permanecen guardados.</p></article></section>${platformOwner?`<section class="table-card"><div class="panel-head table-head"><h3>Marcas</h3><small>Solo visible para el owner</small></div><table class="data-table"><thead><tr><th>Marca</th><th>Locales</th><th></th></tr></thead><tbody>${brands}</tbody></table></section>`:''}<section class="table-card"><div class="panel-head table-head"><h3>Sesiones</h3></div><table class="data-table"><thead><tr><th>Usuario</th><th>Dispositivo</th><th>Último uso</th><th></th></tr></thead><tbody>${sessions.map(s=>`<tr><td>${esc(s.displayName)}${s.current?' · actual':''}</td><td>${esc((s.userAgent||'Dispositivo').slice(0,80))}</td><td>${date(s.lastSeenAt)}</td><td><button class="btn small danger" data-revoke-session="${esc(s.id)}">Revocar</button></td></tr>`).join('')}</tbody></table></section>`;$('#themeSelect').value=theme;$('#themeSelect').onchange=event=>setTheme(event.target.value);bindDynamic()}
export {navigate,metric,statusLabel};
`);

replace('professional/web/app-order-detail.js',
`    eyebrow:order.folio,title:order.supplierName,subtitle:\`${'${order.locationName}'} · ${'${statusLabel(order.status)}'}\`,`,
`    eyebrow:order.folio,title:order.supplierName,subtitle:\`${'${order.locationName}'} · ${'${order.costCenterName||\'Barra\'}'} · ${'${statusLabel(order.status)}'}\`,`);

fs.appendFileSync('professional/web/styles.css', `
/* Compact operational layout */
.auth-screen{display:flex;justify-content:center;align-items:center;padding:78px 20px 32px}.auth-card{width:min(100%,430px);padding:26px}.auth-intro{margin-bottom:22px}.auth-intro h1{margin:8px 0;font-size:25px;line-height:1.12;letter-spacing:-.04em}.auth-intro p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.ambient{opacity:.14}.workspace-card{width:100%;text-align:left;color:inherit}.workspace-card:disabled{cursor:default}.workspace-card.selectable:hover{background:rgba(255,255,255,.075)}.workspace-copy{min-width:0;flex:1}.content{gap:14px;padding-top:18px}.compact-header{align-items:center}.compact-metrics{grid-template-columns:repeat(6,minmax(0,1fr))}.table-head{padding:13px 15px;margin:0}.panel-copy{margin:0;color:var(--muted);font-size:11px;line-height:1.6}.field-label{display:block;margin-bottom:8px;color:var(--muted);font-size:11px;font-weight:750}.check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.check-card{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:11px}.check-card input{width:16px;height:16px}.check-card span,.check-card strong,.check-card small{display:block}.check-card small{margin-top:2px;color:var(--muted);font-size:9px}.cost-chip{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:color-mix(in srgb,var(--primary) 10%,var(--card));color:var(--primary);font-size:9px;font-weight:800}.chip-row,.row-actions{display:flex;flex-wrap:wrap;gap:5px}.hero-panel,.hero-card{display:none}.free-plan-card{display:none!important}@media(max-width:900px){.compact-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.check-grid{grid-template-columns:1fr}.auth-brand{top:22px}.content{padding:16px 14px 90px}.data-table{min-width:720px}.table-card{overflow:auto}}
`);
replace('professional/web/sw.js', "const VERSION = 'pedidos-pro-platform-v2-r2-history';", "const VERSION = 'pedidos-pro-platform-v3-cost-centers';");
replace('worker/src/combined.js', "const PLATFORM_RELEASE = '2026.07.21.18';", "const PLATFORM_RELEASE = '2026.07.22.19';");

fs.rmSync('tools/apply-cost-centers-login-ui.mjs');
fs.rmSync('.github/workflows/apply-cost-centers-login-ui.yml');
console.log('Cost centers, Madriguera seed, login and compact UI patch applied.');
