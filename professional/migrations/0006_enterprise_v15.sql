CREATE TABLE IF NOT EXISTS trash_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TEXT NOT NULL,
  restored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  restored_at TEXT,
  purged_at TEXT
);

CREATE TABLE IF NOT EXISTS draft_autosaves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,user_id,draft_key)
);

CREATE TABLE IF NOT EXISTS cost_center_budgets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cost_center_id TEXT NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  warning_pct REAL NOT NULL DEFAULT 80,
  hard_limit INTEGER NOT NULL DEFAULT 0 CHECK(hard_limit IN (0,1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,cost_center_id,month_key)
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,supplier_id,normalized_alias)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  previous_price INTEGER NOT NULL DEFAULT 0,
  current_price INTEGER NOT NULL DEFAULT 0,
  change_pct REAL NOT NULL DEFAULT 0,
  threshold_pct REAL NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','dismissed')),
  created_at TEXT NOT NULL,
  acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK(channel_type IN ('email','whatsapp','push')),
  provider TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,channel_type)
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  recipient TEXT NOT NULL DEFAULT '',
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT NOT NULL DEFAULT '',
  provider_subscription_id TEXT NOT NULL DEFAULT '',
  plan_code TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('trialing','active','past_due','cancelled','paused')),
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CLP',
  current_period_start TEXT,
  current_period_end TEXT,
  trial_ends_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(provider,provider_event_id)
);

CREATE TABLE IF NOT EXISTS workspace_backups (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('creating','ready','restoring','restored','failed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  restored_at TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,user_id)
);

CREATE TABLE IF NOT EXISTS monitoring_events (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_review_actions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_line_id TEXT REFERENCES invoice_lines(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('confirm','reject','rematch','edit')),
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reception_quality_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reception_id TEXT NOT NULL REFERENCES receptions(id) ON DELETE CASCADE,
  reception_item_id TEXT REFERENCES reception_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('damaged','expired','temperature','missing','overage','lot','note')),
  quantity REAL NOT NULL DEFAULT 0,
  lot_number TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  temperature REAL,
  note TEXT NOT NULL DEFAULT '',
  photo_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('creating','ready','failed')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_org_deleted ON trash_items(org_id,restored_at,purged_at,deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_autosaves_user ON draft_autosaves(org_id,user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_center_month ON cost_center_budgets(org_id,cost_center_id,month_key);
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON product_aliases(org_id,supplier_id,normalized_alias);
CREATE INDEX IF NOT EXISTS idx_price_alerts_open ON price_alerts(org_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(org_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_org_created ON monitoring_events(org_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reception_quality_reception ON reception_quality_events(reception_id,created_at DESC);
