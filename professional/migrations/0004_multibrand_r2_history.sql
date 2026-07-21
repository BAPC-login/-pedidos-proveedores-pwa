CREATE TABLE IF NOT EXISTS platform_owners (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('order','invoice','reception','supplier','product','organization','location')),
  entity_id TEXT NOT NULL,
  document_kind TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (file_id, entity_type, entity_id, document_kind)
);

CREATE TABLE IF NOT EXISTS entity_snapshots (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_location_links (
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (invoice_id, location_id)
);

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_links_entity ON document_links(org_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_links_kind ON document_links(org_id, document_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_entity ON entity_snapshots(org_id, entity_type, entity_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_location_time ON entity_snapshots(org_id, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_locations_org_local ON invoice_location_links(org_id, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_chunks_file ON file_chunks(file_id, chunk_index);

INSERT OR IGNORE INTO platform_owners (user_id, created_at)
SELECT user_id, created_at
FROM memberships
WHERE role = 'owner'
ORDER BY created_at ASC
LIMIT 1;
