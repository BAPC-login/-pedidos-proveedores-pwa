import {
  HttpError,
  ROLES,
  assertMinimumRole,
  nowIso,
  optionalText,
  readJson,
  requireText
} from '../core.js';
import {writeAudit} from '../auth.js';

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function allowedLocation(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

function text(value, max = 240) {
  return optionalText(value, {max}) || '';
}

function normalizeHex(value, fallback) {
  const input = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(input) ? input.toUpperCase() : fallback;
}

function normalizedBranding(raw = {}, previous = {}) {
  return {
    primaryColor: normalizeHex(raw.primaryColor ?? previous.primaryColor, '#6246EA'),
    secondaryColor: normalizeHex(raw.secondaryColor ?? previous.secondaryColor, '#8067FF'),
    tableHeaderColor: normalizeHex(raw.tableHeaderColor ?? previous.tableHeaderColor, '#48484C'),
    logoKey: text(raw.logoKey ?? previous.logoKey, 900),
    logoName: text(raw.logoName ?? previous.logoName, 240),
    logoWidth: Math.max(0, Math.min(10000, Number(raw.logoWidth ?? previous.logoWidth ?? 0) || 0)),
    logoHeight: Math.max(0, Math.min(10000, Number(raw.logoHeight ?? previous.logoHeight ?? 0) || 0)),
    logoSize: Math.max(18, Math.min(78, Number(raw.logoSize ?? previous.logoSize ?? 42) || 42)),
    logoPosition: ['left', 'right', 'top', 'bottom'].includes(String(raw.logoPosition ?? previous.logoPosition))
      ? String(raw.logoPosition ?? previous.logoPosition)
      : 'left',
    logoAlignX: ['left', 'center', 'right'].includes(String(raw.logoAlignX ?? previous.logoAlignX))
      ? String(raw.logoAlignX ?? previous.logoAlignX)
      : 'center',
    logoAlignY: ['top', 'center', 'bottom'].includes(String(raw.logoAlignY ?? previous.logoAlignY))
      ? String(raw.logoAlignY ?? previous.logoAlignY)
      : 'center',
    footerText: text(raw.footerText ?? previous.footerText, 300)
  };
}

function normalizedBusiness(raw = {}, previous = {}) {
  return {
    legalName: text(raw.legalName ?? previous.legalName, 180),
    rut: text(raw.rut ?? previous.rut, 40),
    address: text(raw.address ?? previous.address, 240),
    commune: text(raw.commune ?? previous.commune, 120),
    city: text(raw.city ?? previous.city, 120),
    phone: text(raw.phone ?? previous.phone, 80),
    email: text(raw.email ?? previous.email, 180)
  };
}

function normalizedLocationDetails(raw = {}, previous = {}) {
  return {
    legalName: text(raw.legalName ?? previous.legalName, 180),
    rut: text(raw.rut ?? previous.rut, 40),
    address: text(raw.address ?? previous.address, 240),
    commune: text(raw.commune ?? previous.commune, 120),
    city: text(raw.city ?? previous.city, 120),
    phone: text(raw.phone ?? previous.phone, 80),
    email: text(raw.email ?? previous.email, 180),
    contactName: text(raw.contactName ?? previous.contactName, 160)
  };
}

async function verifyLogo(env, actor, logoKey) {
  if (!logoKey) return;
  const record = await env.DB.prepare(`
    SELECT storage_key, content_type FROM files
    WHERE org_id = ? AND storage_key = ? AND purpose = 'brand-logo'
  `).bind(actor.orgId, logoKey).first();
  if (!record) throw new HttpError(400, 'El logo seleccionado no pertenece a esta marca', 'invalid_logo');
  if (!String(record.content_type || '').startsWith('image/')) {
    throw new HttpError(400, 'El archivo seleccionado no es una imagen', 'invalid_logo_type');
  }
}

export async function getSettings(env, actor) {
  const [organization, locationRows, user] = await Promise.all([
    env.DB.prepare('SELECT id, name, slug, plan, settings_json FROM organizations WHERE id = ?').bind(actor.orgId).first(),
    env.DB.prepare(`
      SELECT id, name, code, timezone, details_json
      FROM locations WHERE org_id = ? AND active = 1 ORDER BY name COLLATE NOCASE
    `).bind(actor.orgId).all(),
    env.DB.prepare('SELECT id, email, display_name, profile_json FROM users WHERE id = ?').bind(actor.userId).first()
  ]);
  if (!organization) throw new HttpError(404, 'Marca no encontrada', 'not_found');
  const settings = safeJson(organization.settings_json, {});
  const locations = (locationRows.results || [])
    .filter(location => allowedLocation(actor, location.id))
    .map(location => ({
      id: location.id,
      name: location.name,
      code: location.code,
      timezone: location.timezone,
      details: safeJson(location.details_json, {})
    }));
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      business: normalizedBusiness(settings.business || {}),
      branding: normalizedBranding(settings.branding || {})
    },
    locations,
    user: {
      id: user?.id || actor.userId,
      email: user?.email || actor.email,
      displayName: user?.display_name || actor.displayName,
      profile: safeJson(user?.profile_json, {})
    }
  };
}

export async function updateSettings(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const organization = await env.DB.prepare('SELECT name, settings_json FROM organizations WHERE id = ?')
    .bind(actor.orgId).first();
  if (!organization) throw new HttpError(404, 'Marca no encontrada', 'not_found');
  const current = safeJson(organization.settings_json, {});
  const business = normalizedBusiness(body.business || {}, current.business || {});
  const branding = normalizedBranding(body.branding || {}, current.branding || {});
  await verifyLogo(env, actor, branding.logoKey);
  const organizationName = body.organizationName === undefined
    ? organization.name
    : requireText(body.organizationName, 'Nombre de la marca', {max: 120});
  const settings = {...current, business, branding};
  const timestamp = nowIso();
  const statements = [
    env.DB.prepare('UPDATE organizations SET name = ?, settings_json = ?, updated_at = ? WHERE id = ?')
      .bind(organizationName, JSON.stringify(settings), timestamp, actor.orgId)
  ];

  if (body.location && body.location.id) {
    const locationId = String(body.location.id);
    if (!allowedLocation(actor, locationId)) throw new HttpError(403, 'No tienes acceso a ese local', 'forbidden');
    const location = await env.DB.prepare('SELECT id, details_json FROM locations WHERE id = ? AND org_id = ? AND active = 1')
      .bind(locationId, actor.orgId).first();
    if (!location) throw new HttpError(404, 'Local no encontrado', 'not_found');
    const details = normalizedLocationDetails(body.location.details || {}, safeJson(location.details_json, {}));
    statements.push(env.DB.prepare('UPDATE locations SET details_json = ?, updated_at = ? WHERE id = ? AND org_id = ?')
      .bind(JSON.stringify(details), timestamp, locationId, actor.orgId));
  }

  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'settings.update', 'organization', actor.orgId, {
    locationId: body.location?.id || null,
    logoConfigured: Boolean(branding.logoKey),
    primaryColor: branding.primaryColor
  });
  return getSettings(env, actor);
}
