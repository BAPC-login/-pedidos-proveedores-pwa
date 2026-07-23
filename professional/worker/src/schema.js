import identitySchemaModule from '../../migrations/0001_identity.sql';
import procurementSchemaModule from '../../migrations/0002_procurement.sql';
import invoiceSchemaModule from '../../migrations/0003_invoices.sql';
import platformSchemaModule from '../../migrations/0004_multibrand_r2_history.sql';
import fileChunkSchemaModule from '../../migrations/0004_file_chunks.sql';
import costCenterSchemaModule from '../../migrations/0005_cost_centers.sql';
import {seedLegacyCatalog} from './legacyCatalog.js';

const SCHEMA_VERSION = '11';
const DEFAULT_ORG_ID = 'e73d2d6e-dae8-46c6-87df-43ae05ca81fa';
const DEFAULT_LOCATION_ID = 'e263b119-d0bb-484e-b65c-abe2c57f9e86';
const DEFAULT_USER_ID = '80a9afe9-4751-4181-b816-eb78c94619ef';
const DEFAULT_MEMBERSHIP_ID = '128cf0b2-c298-412a-8aad-10bf921bfd37';
const DEFAULT_PASSWORD_SALT = 'g5L6Isfimtho-mkugDnCKHTg';
const DEFAULT_PASSWORD_HASH = '92e9ea256a2b2d89e54b2e7b6a7098917110fbb7a771d6cdd3000d0117295dc0';
const DEFAULT_PASSWORD_ALGORITHM = 'pbkdf2-sha256-100000';
const LEGACY_PASSWORD_HASH = '83dbb59cdd6371ebb84b7d2271ebc8ade3eaeaa05d85fe50439030e606e4c1f1';
let initializationPromise = null;

function normalizeSql(moduleValue, label) {
  const raw = typeof moduleValue === 'string' ? moduleValue : moduleValue?.default;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`SQL module ${label} did not resolve to text`);
  return raw.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/gim, '').trim();
}

function prepareSchemaStatements(db, sql, label) {
  const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean).map((statement, index) => {
    try { return db.prepare(statement); }
    catch (error) { throw new Error(`Could not prepare ${label} statement ${index + 1}: ${error?.message || error}`); }
  });
  if (!statements.length) throw new Error(`Schema ${label} has no executable statements`);
  return statements;
}

async function executeSchema(db, sql, label) {
  const statements = prepareSchemaStatements(db, sql, label);
  await db.batch(statements);
  return statements.length;
}

async function ensureColumn(db, table, column, definition) {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all();
  if ((result.results || []).some(entry => entry.name === column)) return false;
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  return true;
}

const identitySchema = normalizeSql(identitySchemaModule, 'identity');
const procurementSchema = normalizeSql(procurementSchemaModule, 'procurement');
const invoiceSchema = normalizeSql(invoiceSchemaModule, 'invoices');
const platformSchema = normalizeSql(platformSchemaModule, 'platform-r2-history');
const fileChunkSchema = normalizeSql(fileChunkSchemaModule, 'file-chunks');
const costCenterSchema = normalizeSql(costCenterSchemaModule, 'cost-centers');

async function seedDefaultWorkspace(db) {
  const existing = await db.prepare('SELECT COUNT(*) AS total FROM users').first();
  if (Number(existing?.total || 0) > 0) return false;
  const timestamp = new Date().toISOString();
  const categories = ['Bebidas sin alcohol','Cervezas','Vinos','Espumantes','Pisco','Ron','Vodka','Gin','Whisky','Tequila','Licores','Insumos','Abarrotes','Otros'];
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug, plan, status, settings_json, created_at, updated_at) VALUES (?, 'Madriguera', 'pedidos-pro', 'free', 'active', '{"brand":true,"source":"legacy-catalog"}', ?, ?)`).bind(DEFAULT_ORG_ID,timestamp,timestamp),
    db.prepare(`INSERT OR IGNORE INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, 'Madriguera Clubhaus', 'MDR', 'America/Santiago', 1, ?, ?)`).bind(DEFAULT_LOCATION_ID,DEFAULT_ORG_ID,timestamp,timestamp),
    db.prepare(`INSERT OR IGNORE INTO users (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at) VALUES (?, 'admin@pedidospro.local', 'Benjamín Palma', ?, ?, ?, 1, ?, ?)`).bind(DEFAULT_USER_ID,DEFAULT_PASSWORD_SALT,DEFAULT_PASSWORD_HASH,DEFAULT_PASSWORD_ALGORITHM,timestamp,timestamp),
    db.prepare(`INSERT OR IGNORE INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at) VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)`).bind(DEFAULT_MEMBERSHIP_ID,DEFAULT_ORG_ID,DEFAULT_USER_ID,timestamp,timestamp),
    db.prepare(`INSERT OR IGNORE INTO platform_owners (user_id, created_at) VALUES (?, ?)`).bind(DEFAULT_USER_ID,timestamp)
  ];
  categories.forEach((name,index)=>statements.push(db.prepare(`INSERT OR IGNORE INTO categories (id, org_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(`seed-category-${String(index+1).padStart(2,'0')}`,DEFAULT_ORG_ID,name,index+1,timestamp,timestamp)));
  await db.batch(statements);
  return true;
}

async function migrateSeededOwnerPassword(db) {
  const result = await db.prepare(`UPDATE users SET password_salt = ?, password_hash = ?, password_algorithm = ?, updated_at = ? WHERE id = ? AND email = 'admin@pedidospro.local' AND password_algorithm = 'pbkdf2-sha256-210000' AND password_hash = ?`).bind(DEFAULT_PASSWORD_SALT,DEFAULT_PASSWORD_HASH,DEFAULT_PASSWORD_ALGORITHM,new Date().toISOString(),DEFAULT_USER_ID,LEGACY_PASSWORD_HASH).run();
  return Number(result?.meta?.changes || 0) > 0;
}

export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not available');
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const identityStatements = await executeSchema(env.DB, identitySchema, 'identity');
    const procurementStatements = await executeSchema(env.DB, procurementSchema, 'procurement');
    const invoiceStatements = await executeSchema(env.DB, invoiceSchema, 'invoices');
    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const seeded = await seedDefaultWorkspace(env.DB);
    const costCenterStatements = await executeSchema(env.DB, costCenterSchema, 'cost-centers');
    const profileColumnAdded = await ensureColumn(env.DB, 'users', 'profile_json', "TEXT NOT NULL DEFAULT '{}'");
    const locationDetailsColumnAdded = await ensureColumn(env.DB, 'locations', 'details_json', "TEXT NOT NULL DEFAULT '{}'");
    const invoiceLineFreeColumnAdded = await ensureColumn(env.DB, 'invoice_lines', 'is_free', 'INTEGER NOT NULL DEFAULT 0');
    const invoiceLineFreeReasonColumnAdded = await ensureColumn(env.DB, 'invoice_lines', 'free_reason', "TEXT NOT NULL DEFAULT ''");
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);
    const legacyCatalog = await seedLegacyCatalog(env.DB);
    return {
      initialized:true,seeded,ownerPasswordMigrated,profileColumnAdded,locationDetailsColumnAdded,
      invoiceLineFreeColumnAdded,invoiceLineFreeReasonColumnAdded,legacyCatalog,version:SCHEMA_VERSION,
      statements:identityStatements+procurementStatements+invoiceStatements+platformStatements+fileChunkStatements+costCenterStatements
    };
  })().catch(error => { initializationPromise = null; throw error; });
  return initializationPromise;
}
