import {
  HttpError,
  ROLES,
  assertMinimumRole,
  assertRole,
  bool,
  canTransition,
  integer,
  monthKey,
  normalizeRut,
  nowIso,
  number,
  optionalText,
  planFor,
  readJson,
  requireText,
  sanitizeFileName,
  sha256,
  slugify,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';
function rows(result) {
  return result?.results || [];
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

async function requireLocation(env, actor, locationId) {
  const location = await env.DB.prepare('SELECT * FROM locations WHERE id = ? AND org_id = ? AND active = 1')
    .bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed(actor, location.id)) throw new HttpError(404, 'Local no encontrado', 'not_found');
  return location;
}

async function incrementUsage(env, orgId, metric, amount = 1) {
  const key = monthKey();
  await env.DB.prepare(`
    INSERT INTO usage_counters (org_id, month_key, metric, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, month_key, metric)
    DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at
  `).bind(orgId, key, metric, amount, nowIso()).run();
}

async function usageValue(env, orgId, metric) {
  const row = await env.DB.prepare('SELECT quantity FROM usage_counters WHERE org_id = ? AND month_key = ? AND metric = ?')
    .bind(orgId, monthKey(), metric).first();
  return Number(row?.quantity || 0);
}

async function enforceCountLimit(env, actor, table, limitKey, extraWhere = '') {
  const limits = planFor(actor.organization.plan);
  const limit = Number(limits[limitKey]);
  if (!Number.isFinite(limit)) return;
  const allowedTables = new Set(['locations', 'suppliers', 'products']);
  if (!allowedTables.has(table)) throw new HttpError(500, 'Configuración de límite inválida');
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE org_id = ? ${extraWhere}`)
    .bind(actor.orgId).first();
  if (Number(row?.total || 0) >= limit) {
    throw new HttpError(402, `El plan ${actor.organization.plan} permite hasta ${limit} ${limitKey}`, 'plan_limit');
  }
}

export async function listInvoices(env, actor, url) {
  const supplierId = String(url.searchParams.get('supplierId') || '');
  const result = await env.DB.prepare(`
    SELECT i.*, s.name AS supplier_name
    FROM invoices i JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.org_id = ? AND (? = '' OR i.supplier_id = ?)
    ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT 500
  `).bind(actor.orgId, supplierId, supplierId).all();
  return rows(result).map(invoice => ({
    id: invoice.id,
    supplierId: invoice.supplier_id,
    supplierName: invoice.supplier_name,
    invoiceNumber: invoice.invoice_number,
    documentType: invoice.document_type,
    invoiceDate: invoice.invoice_date,
    netTotal: Number(invoice.net_total || 0),
    taxTotal: Number(invoice.tax_total || 0),
    grossTotal: Number(invoice.gross_total || 0),
    status: invoice.status,
    createdAt: invoice.created_at
  }));
}

export async function analyzeInvoice(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const limits = planFor(actor.organization.plan);
  const used = await usageValue(env, actor.orgId, 'ai_documents');
  if (used >= limits.aiDocumentsPerMonth) throw new HttpError(402, 'Límite mensual de documentos con IA alcanzado', 'plan_limit');
  const endpoint = String(env.AI_ENDPOINT || 'https://pedidos-pro-ai.botreservasmultilocal.workers.dev').replace(/\/$/, '');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Adjunta una factura', 'missing_file');
  if (file.size > 12 * 1024 * 1024) throw new HttpError(413, 'La factura supera 12 MB', 'file_too_large');
  const upstream = new FormData();
  upstream.append('file', file, file.name || 'factura');
  const orderFile = form.get('orderFile');
  if (orderFile instanceof File) upstream.append('orderFile', orderFile, orderFile.name || 'pedido.pdf');
  let context = {};
  try { context = JSON.parse(String(form.get('context') || '{}')); } catch { throw new HttpError(400, 'Contexto inválido', 'invalid_context'); }
  context.organizationId = actor.orgId;
  context.requestedBy = actor.userId;
  upstream.append('context', JSON.stringify(context));
  const response = await fetch(`${endpoint}/v1/invoices/analyze`, {
    method: 'POST',
    headers: {'X-Pedidos-Client': 'professional-v2'},
    body: upstream
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new HttpError(502, payload.error || 'La IA no pudo analizar la factura', 'ai_failed', payload.attempts || null);
  await incrementUsage(env, actor.orgId, 'ai_documents', 1);
  await writeAudit(env, actor, request, 'invoice.analyze', 'invoice', '', {model: payload.model, fileName: file.name});
  return payload;
}

export async function uploadFile(request, env, actor, url) {
  if (!env.FILES) throw new HttpError(501, 'El almacenamiento R2 todavía no está configurado', 'storage_not_configured');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Adjunta un archivo', 'missing_file');
  if (file.size > 20 * 1024 * 1024) throw new HttpError(413, 'El archivo supera 20 MB', 'file_too_large');
  const purpose = String(url.searchParams.get('purpose') || 'general').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'general';
  const key = `${actor.orgId}/${purpose}/${new Date().toISOString().slice(0, 10)}/${uuid()}-${sanitizeFileName(file.name)}`;
  const hash = await sha256(await file.arrayBuffer());
  await env.FILES.put(key, file.stream(), {httpMetadata: {contentType: file.type || 'application/octet-stream'}, customMetadata: {orgId: actor.orgId, uploadedBy: actor.userId, sha256: hash}});
  await env.DB.prepare(`INSERT INTO files (id, org_id, storage_key, file_name, content_type, size_bytes, sha256, purpose, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .bind(uuid(), actor.orgId, key, file.name, file.type, file.size, hash, purpose, actor.userId, nowIso()).run();
  await incrementUsage(env, actor.orgId, 'file_bytes', file.size);
  await writeAudit(env, actor, request, 'file.upload', 'file', key, {purpose, size: file.size});
  return {key, name: file.name, size: file.size, contentType: file.type};
}

export async function getFile(env, actor, key) {
  if (!env.FILES) throw new HttpError(501, 'El almacenamiento R2 todavía no está configurado', 'storage_not_configured');
  if (!key.startsWith(`${actor.orgId}/`)) throw new HttpError(404, 'Archivo no encontrado', 'not_found');
  const object = await env.FILES.get(key);
  if (!object) throw new HttpError(404, 'Archivo no encontrado', 'not_found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=60');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, {headers});
}

export async function auditLog(env, actor, url) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const limit = Math.min(500, Math.max(1, integer(url.searchParams.get('limit'), {min: 1, max: 500, fallback: 100})));
  const result = await env.DB.prepare(`
    SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, created_at
    FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?
  `).bind(actor.orgId, limit).all();
  return rows(result).map(row => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: safeJson(row.metadata_json, {}),
    createdAt: row.created_at
  }));
}
