CREATE TABLE IF NOT EXISTS procurement_policies (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  extra_items_mode TEXT NOT NULL DEFAULT 'review' CHECK(extra_items_mode IN ('allow','review','reject')),
  require_invoice_preview INTEGER NOT NULL DEFAULT 1 CHECK(require_invoice_preview IN (0,1)),
  learn_from_corrections INTEGER NOT NULL DEFAULT 1 CHECK(learn_from_corrections IN (0,1)),
  price_variance_warning_pct REAL NOT NULL DEFAULT 12,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_learning_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  normalized_description TEXT NOT NULL,
  source_description TEXT NOT NULL DEFAULT '',
  supplier_sku TEXT NOT NULL DEFAULT '',
  learned_pack_size REAL NOT NULL DEFAULT 1,
  last_confirmed_unit_price INTEGER NOT NULL DEFAULT 0,
  min_confirmed_unit_price INTEGER NOT NULL DEFAULT 0,
  max_confirmed_unit_price INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.85,
  last_corrected_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,supplier_id,product_id,normalized_description)
);

CREATE TABLE IF NOT EXISTS saved_filter_views (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('orders','history','catalog','suppliers')),
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,user_id,scope,name)
);

CREATE TABLE IF NOT EXISTS invoice_policy_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  source_description TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK(action IN ('allowed','reviewed','rejected')),
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_supplier_description ON invoice_learning_rules(org_id,supplier_id,normalized_description);
CREATE INDEX IF NOT EXISTS idx_learning_product ON invoice_learning_rules(org_id,product_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_scope ON saved_filter_views(org_id,user_id,scope,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_policy_events_order ON invoice_policy_events(org_id,order_id,created_at DESC);
