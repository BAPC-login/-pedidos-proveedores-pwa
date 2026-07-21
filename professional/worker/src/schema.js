import identitySchemaModule from '../../migrations/0001_identity.sql';
import procurementSchemaModule from '../../migrations/0002_procurement.sql';
import invoiceSchemaModule from '../../migrations/0003_invoices.sql';

const SCHEMA_VERSION = '4';
const DEFAULT_ORG_ID = 'e73d2d6e-dae8-46c6-87df-43ae05ca81fa';
const DEFAULT_LOCATION_ID = 'e263b119-d0bb-484e-b65c-abe2c57f9e86';
const DEFAULT_USER_ID = '80a9afe9-4751-4181-b816-eb78c94619ef';
const DEFAULT_MEMBERSHIP_ID = '128cf0b2-c298-412a-8aad-10bf921bfd37';
let initializationPromise = null;

function normalizeSql(moduleValue, label) {
  const raw = typeof moduleValue === 'string' ? moduleValue : moduleValue?.default;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`SQL module ${label} did not resolve to text`);
  }
  return raw.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/gim, '').trim();
}

const identitySchema = normalizeSql(identitySchemaModule, 'identity');
const procurementSchema = normalizeSql(procurementSchemaModule, 'procurement');
const invoiceSchema = normalizeSql(invoiceSchemaModule, 'invoices');

async function seedDefaultWorkspace(db) {
  const existing = await db.prepare('SELECT COUNT(*) AS total FROM users').first();
  if (Number(existing?.total || 0) > 0) return false;

  const timestamp = new Date().toISOString();
  const categories = [
    'Bebidas sin alcohol', 'Cervezas', 'Vinos', 'Espumantes', 'Destilados',
    'Licores', 'Insumos', 'Abarrotes', 'Otros'
  ];

  const statements = [
    db.prepare(`
      INSERT OR IGNORE INTO organizations
        (id, name, slug, plan, status, settings_json, created_at, updated_at)
      VALUES (?, 'Pedidos Pro', 'pedidos-pro', 'free', 'active', '{}', ?, ?)
    `).bind(DEFAULT_ORG_ID, timestamp, timestamp),
    db.prepare(`
      INSERT OR IGNORE INTO locations
        (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, 'Principal', 'PRINCIPAL', 'America/Santiago', 1, ?, ?)
    `).bind(DEFAULT_LOCATION_ID, DEFAULT_ORG_ID, timestamp, timestamp),
    db.prepare(`
      INSERT OR IGNORE INTO users
        (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at)
      VALUES (?, 'admin@pedidospro.local', 'Benjamín Palma', ?, ?, 'pbkdf2-sha256-210000', 1, ?, ?)
    `).bind(
      DEFAULT_USER_ID,
      'g5L6Isfimtho-mkugDnCKHTg',
      '83dbb59cdd6371ebb84b7d2271ebc8ade3eaeaa05d85fe50439030e606e4c1f1',
      timestamp,
      timestamp
    ),
    db.prepare(`
      INSERT OR IGNORE INTO memberships
        (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(DEFAULT_MEMBERSHIP_ID, DEFAULT_ORG_ID, DEFAULT_USER_ID, timestamp, timestamp)
  ];

  categories.forEach((name, index) => {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO categories
        (id, org_id, name, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(`seed-category-${String(index + 1).padStart(2, '0')}`, DEFAULT_ORG_ID, name, index + 1, timestamp, timestamp));
  });

  await db.batch(statements);
  return true;
}

export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not available');
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    // CREATE IF NOT EXISTS makes this safe for empty and partially initialized databases.
    await env.DB.exec(identitySchema);
    await env.DB.exec(procurementSchema);
    await env.DB.exec(invoiceSchema);
    const seeded = await seedDefaultWorkspace(env.DB);

    return {initialized: true, seeded, version: SCHEMA_VERSION};
  })().catch(error => {
    initializationPromise = null;
    throw error;
  });

  return initializationPromise;
}
