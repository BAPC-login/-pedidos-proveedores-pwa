PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  rut TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  lead_days INTEGER NOT NULL DEFAULT 0,
  cutoff_time TEXT NOT NULL DEFAULT '',
  minimum_order INTEGER NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  content_value REAL NOT NULL DEFAULT 0,
  content_unit TEXT NOT NULL DEFAULT 'ml',
  base_unit TEXT NOT NULL DEFAULT 'unidad',
  barcode TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, name, content_value, content_unit)
);

CREATE TABLE IF NOT EXISTS supplier_products (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_sku TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  order_unit TEXT NOT NULL DEFAULT 'unidad',
  units_per_order_unit REAL NOT NULL DEFAULT 1,
  minimum_quantity REAL NOT NULL DEFAULT 0,
  quantity_multiple REAL NOT NULL DEFAULT 1,
  last_gross_unit_price INTEGER NOT NULL DEFAULT 0,
  last_purchased_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (supplier_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  folio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','requested','approved','rejected','sent','confirmed','partially_received','received','reconciled','closed','cancelled'
  )),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  delivery_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'CLP',
  net_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  gross_total INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  cancelled_at TEXT,
  UNIQUE (org_id, folio)
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_product_id TEXT REFERENCES supplier_products(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  description_snapshot TEXT NOT NULL,
  quantity_ordered REAL NOT NULL,
  order_unit_snapshot TEXT NOT NULL,
  units_per_order_unit REAL NOT NULL DEFAULT 1,
  expected_gross_unit_price INTEGER NOT NULL DEFAULT 0,
  expected_gross_total INTEGER NOT NULL DEFAULT 0,
  quantity_received REAL NOT NULL DEFAULT 0,
  quantity_rejected REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed','void')),
  received_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  received_at TEXT,
  delivery_note_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reception_items (
  id TEXT PRIMARY KEY,
  reception_id TEXT NOT NULL REFERENCES receptions(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity_delivered REAL NOT NULL DEFAULT 0,
  quantity_accepted REAL NOT NULL DEFAULT 0,
  quantity_rejected REAL NOT NULL DEFAULT 0,
  rejection_reason TEXT NOT NULL DEFAULT '',
  lot_number TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_org_sort ON categories(org_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_active ON suppliers(org_id, active, name);
CREATE INDEX IF NOT EXISTS idx_products_org_active ON products(org_id, active, name);
CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(org_id, supplier_id, active);
CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(org_id, product_id, active);
CREATE INDEX IF NOT EXISTS idx_orders_org_created ON orders(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_org_status ON orders(org_id, status, delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_location_status ON orders(location_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receptions_order ON receptions(order_id, created_at DESC);
