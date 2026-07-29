CREATE TABLE IF NOT EXISTS readiness_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK(run_type IN ('qa','isolation','benchmark','recovery')),
  status TEXT NOT NULL CHECK(status IN ('passed','warning','failed')),
  score REAL NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  device_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  completed_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_import_snapshots (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_mode TEXT NOT NULL CHECK(import_mode IN ('merge','replace')),
  source_name TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  restored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  restored_at TEXT
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'normal' CHECK(severity IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS legal_documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK(document_type IN ('terms','privacy','data_processing')),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  published_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,document_type,version)
);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  UNIQUE(org_id,user_id,document_type,version)
);

CREATE INDEX IF NOT EXISTS idx_readiness_runs_org_created ON readiness_runs(org_id,run_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_snapshots_org_created ON catalog_import_snapshots(org_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_status ON support_tickets(org_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_documents_org_type ON legal_documents(org_id,document_type,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances(org_id,user_id,accepted_at DESC);
