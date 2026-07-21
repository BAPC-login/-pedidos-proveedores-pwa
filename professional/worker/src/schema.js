import identitySchemaModule from '../../migrations/0001_identity.sql';
import procurementSchemaModule from '../../migrations/0002_procurement.sql';
import invoiceSchemaModule from '../../migrations/0003_invoices.sql';

const SCHEMA_VERSION = '3';
let initializationPromise = null;

function normalizeSql(moduleValue, label) {
  const raw = typeof moduleValue === 'string' ? moduleValue : moduleValue?.default;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`SQL module ${label} did not resolve to text`);
  }
  // D1 enforces foreign keys at the service level and rejects toggling this PRAGMA via exec().
  return raw.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/gim, '').trim();
}

const identitySchema = normalizeSql(identitySchemaModule, 'identity');
const procurementSchema = normalizeSql(procurementSchemaModule, 'procurement');
const invoiceSchema = normalizeSql(invoiceSchemaModule, 'invoices');

async function hasCurrentSchema(db) {
  try {
    const row = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'organizations'").first();
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

export async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not available');
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    if (await hasCurrentSchema(env.DB)) return {initialized: false, version: SCHEMA_VERSION};

    await env.DB.exec(identitySchema);
    await env.DB.exec(procurementSchema);
    await env.DB.exec(invoiceSchema);

    return {initialized: true, version: SCHEMA_VERSION};
  })().catch(error => {
    initializationPromise = null;
    throw error;
  });

  return initializationPromise;
}
