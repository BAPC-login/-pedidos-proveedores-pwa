ALTER TABLE suppliers ADD COLUMN payment_term_type TEXT NOT NULL DEFAULT 'delivery';
ALTER TABLE suppliers ADD COLUMN payment_term_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN payment_term_anchor TEXT NOT NULL DEFAULT 'reception';
ALTER TABLE suppliers ADD COLUMN payment_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN reliability_score REAL NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN substitution_policy TEXT NOT NULL DEFAULT 'ask';

ALTER TABLE orders ADD COLUMN promised_date TEXT;
ALTER TABLE orders ADD COLUMN supplier_confirmation_status TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE orders ADD COLUMN closed_at TEXT;
ALTER TABLE orders ADD COLUMN internal_revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE receptions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE receptions ADD COLUMN historical_entry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receptions ADD COLUMN historical_confirmed_by TEXT;
ALTER TABLE receptions ADD COLUMN completed_documentally_at TEXT;
ALTER TABLE receptions ADD COLUMN quick_mode INTEGER NOT NULL DEFAULT 0;

ALTER TABLE invoices ADD COLUMN reporting_date TEXT;
ALTER TABLE invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN due_date TEXT;
ALTER TABLE invoices ADD COLUMN original_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN math_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_lines ADD COLUMN split_status TEXT NOT NULL DEFAULT 'single';

ALTER TABLE products ADD COLUMN internal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN storage_location TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN substitution_allowed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN seasonal_from TEXT;
ALTER TABLE products ADD COLUMN seasonal_to TEXT;
ALTER TABLE products ADD COLUMN normalized_key TEXT NOT NULL DEFAULT '';
ALTER TABLE supplier_products ADD COLUMN reliability_score REAL NOT NULL DEFAULT 0;
ALTER TABLE supplier_products ADD COLUMN content_signature TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS approval_policies(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,cost_center_id TEXT,threshold_amount INTEGER NOT NULL DEFAULT 0,required_role TEXT NOT NULL DEFAULT 'approver',active INTEGER NOT NULL DEFAULT 1,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,cost_center_id));
CREATE TABLE IF NOT EXISTS order_approvals(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,order_id TEXT NOT NULL,batch_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',required_role TEXT NOT NULL DEFAULT 'approver',threshold_amount INTEGER NOT NULL DEFAULT 0,requested_by TEXT,resolved_by TEXT,resolution_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,resolved_at TEXT,UNIQUE(org_id,order_id));
CREATE TABLE IF NOT EXISTS order_internal_comments(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,order_id TEXT NOT NULL,product_id TEXT,body TEXT NOT NULL,mentions_json TEXT NOT NULL DEFAULT '[]',created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS supplier_confirmations(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,order_id TEXT NOT NULL,status TEXT NOT NULL,promised_date TEXT,note TEXT NOT NULL DEFAULT '',actor_user_id TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_substitutions(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,order_id TEXT NOT NULL,order_item_id TEXT NOT NULL,replacement_product_id TEXT NOT NULL,quantity REAL NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'proposed',created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_templates(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,name TEXT NOT NULL,trigger_type TEXT NOT NULL DEFAULT 'manual',schedule_json TEXT NOT NULL DEFAULT '{}',location_id TEXT,cost_center_id TEXT,items_json TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,name));
CREATE TABLE IF NOT EXISTS reception_return_events(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,reception_id TEXT NOT NULL,reception_item_id TEXT,order_id TEXT NOT NULL,order_item_id TEXT,event_type TEXT NOT NULL,quantity REAL NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',photo_file_id TEXT,created_by TEXT,created_at TEXT NOT NULL,resolved_at TEXT);
CREATE TABLE IF NOT EXISTS payment_schedules(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,invoice_id TEXT NOT NULL,supplier_id TEXT NOT NULL,base_date TEXT NOT NULL,due_date TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',scheduled_at TEXT,paid_at TEXT,reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',responsible_user_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,invoice_id));
CREATE TABLE IF NOT EXISTS invoice_credit_links(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,credit_invoice_id TEXT NOT NULL,original_invoice_id TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL,UNIQUE(org_id,credit_invoice_id));
CREATE TABLE IF NOT EXISTS invoice_line_splits(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,invoice_line_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL DEFAULT 0,gross_amount INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reconciliation_assignments(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,issue_id TEXT NOT NULL,assigned_to TEXT,resolution_required INTEGER NOT NULL DEFAULT 1,due_date TEXT,resolution TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open',created_by TEXT,created_at TEXT NOT NULL,resolved_at TEXT,UNIQUE(org_id,issue_id));
CREATE TABLE IF NOT EXISTS notification_events(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,user_id TEXT,type TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'operational',severity TEXT NOT NULL DEFAULT 'info',title TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',entity_type TEXT NOT NULL DEFAULT '',entity_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'unread',metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,read_at TEXT,archived_at TEXT,resolved_at TEXT,UNIQUE(org_id,user_id,type,entity_type,entity_id));
CREATE TABLE IF NOT EXISTS saved_report_views(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,scope TEXT NOT NULL DEFAULT 'dashboard',filters_json TEXT NOT NULL DEFAULT '{}',columns_json TEXT NOT NULL DEFAULT '[]',is_default INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(org_id,user_id,scope,name));
CREATE TABLE IF NOT EXISTS record_presence(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,user_id TEXT NOT NULL,device_id TEXT NOT NULL,display_name TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,editing INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,expires_at TEXT NOT NULL,UNIQUE(org_id,entity_type,entity_id,user_id,device_id));
CREATE TABLE IF NOT EXISTS operation_change_journal(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,before_json TEXT NOT NULL DEFAULT '{}',after_json TEXT NOT NULL DEFAULT '{}',actor_user_id TEXT,device_id TEXT NOT NULL DEFAULT '',ip_hash TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feature_flags_v41(org_id TEXT NOT NULL,flag_key TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,settings_json TEXT NOT NULL DEFAULT '{}',updated_by TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(org_id,flag_key));

CREATE INDEX IF NOT EXISTS idx_v41_approvals_status ON order_approvals(org_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_comments_order ON order_internal_comments(org_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_confirmations_order ON supplier_confirmations(org_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_returns_order ON reception_return_events(org_id,order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_payments_due ON payment_schedules(org_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_v41_notifications_user ON notification_events(org_id,user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_presence_entity ON record_presence(org_id,entity_type,entity_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_v41_journal_entity ON operation_change_journal(org_id,entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v41_receptions_reporting ON receptions(org_id,received_at,status);
CREATE INDEX IF NOT EXISTS idx_v41_invoices_reporting ON invoices(org_id,reporting_date,status);
CREATE INDEX IF NOT EXISTS idx_v41_orders_promised ON orders(org_id,promised_date,supplier_confirmation_status);

UPDATE suppliers SET payment_term_type=CASE WHEN lower(payment_terms) LIKE '%contra%entrega%' OR lower(payment_terms) LIKE '%contado%' THEN 'delivery' WHEN lower(payment_terms) LIKE '%prepago%' OR lower(payment_terms) LIKE '%anticipado%' THEN 'prepaid' WHEN payment_terms GLOB '*[0-9]*' THEN 'days' ELSE payment_term_type END WHERE payment_terms<>'';
UPDATE suppliers SET payment_term_days=CASE WHEN lower(payment_terms) LIKE '%30%' THEN 30 WHEN lower(payment_terms) LIKE '%15%' THEN 15 WHEN lower(payment_terms) LIKE '%7%' THEN 7 ELSE payment_term_days END WHERE payment_terms<>'' AND payment_term_days=0;
