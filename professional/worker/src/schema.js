import identitySchema from '../../migrations/0001_identity.sql';
import procurementSchema from '../../migrations/0002_procurement.sql';
import invoiceSchema from '../../migrations/0003_invoices.sql';

const SCHEMA_VERSION = '3';
let initializationPromise = null;

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
