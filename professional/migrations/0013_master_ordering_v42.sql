CREATE TABLE IF NOT EXISTS master_list_preferences(
  org_id TEXT NOT NULL,
  cost_center_id TEXT NOT NULL,
  product_order_mode TEXT NOT NULL DEFAULT 'alphabetical',
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(org_id,cost_center_id)
);

CREATE TABLE IF NOT EXISTS master_list_product_order(
  org_id TEXT NOT NULL,
  cost_center_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(org_id,cost_center_id,category_id,product_id)
);

CREATE INDEX IF NOT EXISTS idx_master_list_order_lookup
ON master_list_product_order(org_id,cost_center_id,category_id,sort_order,product_id);
