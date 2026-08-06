CREATE TABLE IF NOT EXISTS folio_operation_locks (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lock_key TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, lock_key)
);

CREATE INDEX IF NOT EXISTS idx_folio_locks_expiry
  ON folio_operation_locks(expires_at);

CREATE INDEX IF NOT EXISTS idx_orders_org_folio_lookup
  ON orders(org_id, folio);
