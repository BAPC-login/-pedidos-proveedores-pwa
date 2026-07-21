PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT '33',
  invoice_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  net_total INTEGER NOT NULL DEFAULT 0,
  tax_total INTEGER NOT NULL DEFAULT 0,
  additional_tax_total INTEGER NOT NULL DEFAULT 0,
  freight_total INTEGER NOT NULL DEFAULT 0,
  gross_total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','review','approved','rejected','paid','credited','void')),
  xml_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  pdf_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  ai_model TEXT NOT NULL DEFAULT '',
  ai_confidence REAL NOT NULL DEFAULT 0,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, supplier_id, document_type, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  supplier_product_id TEXT REFERENCES supplier_products(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  source_description TEXT NOT NULL,
  supplier_sku TEXT NOT NULL DEFAULT '',
  package_quantity REAL NOT NULL DEFAULT 0,
  units_per_package REAL NOT NULL DEFAULT 1,
  total_units REAL NOT NULL DEFAULT 0,
  net_line_total INTEGER NOT NULL DEFAULT 0,
  tax_line_total INTEGER NOT NULL DEFAULT 0,
  additional_tax_line_total INTEGER NOT NULL DEFAULT 0,
  gross_line_total INTEGER NOT NULL DEFAULT 0,
  gross_unit_price INTEGER NOT NULL DEFAULT 0,
  match_confidence REAL NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','matched','unmatched','confirmed','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_order_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (invoice_id, order_id)
);

CREATE TABLE IF NOT EXISTS reconciliation_issues (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
  reception_id TEXT REFERENCES receptions(id) ON DELETE RESTRICT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES order_items(id) ON DELETE RESTRICT,
  invoice_line_id TEXT REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'quantity_short','quantity_over','price_difference','wrong_product','not_ordered','not_received','not_invoiced','damaged','expired','duplicate_invoice','tax_difference','total_difference'
  )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  expected_value REAL NOT NULL DEFAULT 0,
  actual_value REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','resolved','rejected')),
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  gross_unit_price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_mutations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  client_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','conflict','failed')),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  UNIQUE (org_id, device_id, id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_date ON invoices(org_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_number ON invoices(org_id, supplier_id, document_type, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_links_order ON invoice_order_links(order_id);
CREATE INDEX IF NOT EXISTS idx_issues_org_status ON reconciliation_issues(org_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(org_id, product_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON price_history(org_id, supplier_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_device_status ON sync_mutations(org_id, device_id, status, created_at);
