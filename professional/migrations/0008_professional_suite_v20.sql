CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  amount_threshold INTEGER NOT NULL DEFAULT 0,
  require_unknown_price INTEGER NOT NULL DEFAULT 1,
  require_supplier_change INTEGER NOT NULL DEFAULT 0,
  approver_role TEXT NOT NULL DEFAULT 'approver',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  trigger_json TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE(org_id,batch_id,status)
);

CREATE TABLE IF NOT EXISTS supplier_connectors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL DEFAULT 'generic',
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'assisted' CHECK(mode IN ('assisted','email','api','rpa')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','blocked','disabled')),
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_ref TEXT NOT NULL DEFAULT '',
  last_test_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,supplier_id,provider_code)
);

CREATE TABLE IF NOT EXISTS external_order_attempts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL REFERENCES supplier_connectors(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','awaiting_confirmation','submitted','confirmed','failed','cancelled')),
  external_order_id TEXT NOT NULL DEFAULT '',
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS security_settings (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  access_enabled INTEGER NOT NULL DEFAULT 0,
  access_team_domain TEXT NOT NULL DEFAULT '',
  access_aud TEXT NOT NULL DEFAULT '',
  allowed_domains_json TEXT NOT NULL DEFAULT '[]',
  auto_provision INTEGER NOT NULL DEFAULT 0,
  require_mfa INTEGER NOT NULL DEFAULT 0,
  session_hours INTEGER NOT NULL DEFAULT 12,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_validation_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  backend TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('passed','warning','failed')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operational_alert_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK(channel IN ('in_app','email','whatsapp','push')),
  threshold_json TEXT NOT NULL DEFAULT '{}',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,rule_key)
);

CREATE TABLE IF NOT EXISTS reconciliation_reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','resolved')),
  exception_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,order_id)
);

CREATE TABLE IF NOT EXISTS brand_workspaces (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT 'Pedidos Pro',
  tagline TEXT NOT NULL DEFAULT 'Compras y abastecimiento inteligente',
  status TEXT NOT NULL DEFAULT 'exploring' CHECK(status IN ('exploring','selected','registered')),
  candidates_json TEXT NOT NULL DEFAULT '[]',
  palette_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON approval_requests(org_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connectors_org_supplier ON supplier_connectors(org_id,supplier_id,status);
CREATE INDEX IF NOT EXISTS idx_external_attempts_order ON external_order_attempts(org_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_runs_org_created ON storage_validation_runs(org_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_org_enabled ON operational_alert_rules(org_id,enabled,rule_key);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reviews_org_status ON reconciliation_reviews(org_id,status,updated_at DESC);
