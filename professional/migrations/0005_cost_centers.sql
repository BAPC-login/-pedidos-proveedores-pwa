CREATE TABLE IF NOT EXISTS cost_centers (
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
