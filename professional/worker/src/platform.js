import {HttpError, ROLES, normalizeEmail, nowIso, randomToken, readJson, requireText, sha256, slugify, uuid} from './core.js';
import {writeAudit} from './auth.js';

function assertPlatformOwner(actor) {
  if (!actor?.isPlatformOwner) throw new HttpError(403, 'Solo el owner principal puede administrar marcas', 'platform_owner_required');
}

async function createSession(env, request, userId, orgId) {
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || 'pedidos-pro'}:${ip}`) : '';
  const id = uuid();
  const timestamp = nowIso();
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, org_id, token_hash, user_agent, ip_hash, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, orgId, tokenHash, String(request.headers.get('User-Agent') || '').slice(0, 300), ipHash, timestamp, timestamp).run();
  return {token, sessionId: id};
}

export async function listBrands(env, actor) {
  const organizations = actor.isPlatformOwner
    ? await env.DB.prepare(`
        SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at,
          COALESCE(m.role, 'owner') AS role
        FROM organizations o
        LEFT JOIN memberships m ON m.org_id = o.id AND m.user_id = ? AND m.active = 1
        ORDER BY o.status = 'active' DESC, o.name COLLATE NOCASE
      `).bind(actor.userId).all()
    : await env.DB.prepare(`
        SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at, m.role
        FROM memberships m
        JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = ? AND m.active = 1
        ORDER BY o.status = 'active' DESC, o.name COLLATE NOCASE
      `).bind(actor.userId).all();

  const locationRows = await env.DB.prepare(`
    SELECT id, org_id, name, code, timezone, active FROM locations ORDER BY org_id, active DESC, name COLLATE NOCASE
  `).all();
  const locationsByOrg = new Map();
  for (const location of locationRows.results || []) {
    const list = locationsByOrg.get(location.org_id) || [];
    list.push({id: location.id, name: location.name, code: location.code, timezone: location.timezone, active: Boolean(location.active)});
    locationsByOrg.set(location.org_id, list);
  }

  return (organizations.results || []).map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    role: row.role,
    current: row.id === actor.orgId,
    locations: locationsByOrg.get(row.id) || [],
    createdAt: row.created_at
  }));
}

export async function createBrand(request, env, actor) {
  assertPlatformOwner(actor);
  const body = await readJson(request);
  const name = requireText(body.name, 'Nombre de la marca', {max: 120});
  const locationName = requireText(body.locationName || 'Principal', 'Local principal', {max: 120});
  const slug = slugify(body.slug || name);
  if (!slug) throw new HttpError(400, 'Slug inválido', 'invalid_slug');
  const duplicate = await env.DB.prepare('SELECT id FROM organizations WHERE slug = ?').bind(slug).first();
  if (duplicate) throw new HttpError(409, 'Ya existe una marca con ese identificador', 'duplicate_brand');

  const orgId = uuid();
  const locationId = uuid();
  const membershipId = uuid();
  const timestamp = nowIso();
  const locationCode = String(body.locationCode || slug).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) || 'PRINCIPAL';
  const categories = ['Bebidas sin alcohol','Cervezas','Vinos','Espumantes','Destilados','Licores','Insumos','Abarrotes','Otros'];
  const statements = [
    env.DB.prepare(`
      INSERT INTO organizations (id, name, slug, plan, status, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'free', 'active', ?, ?, ?)
    `).bind(orgId, name, slug, JSON.stringify({brand: true}), timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)
    `).bind(locationId, orgId, locationName, locationCode, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)`).bind(`${locationId}-cc-barra`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Salón', 'SALON', 1, ?, ?)`).bind(`${locationId}-cc-salon`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)`).bind(`${locationId}-cc-cocina`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(membershipId, orgId, actor.userId, timestamp, timestamp)
  ];
  categories.forEach((category, index) => statements.push(env.DB.prepare(`
    INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(uuid(), orgId, category, index + 1, timestamp, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'brand.create', 'organization', orgId, {name, slug, locationId});
  return {id: orgId, name, slug, plan: 'free', status: 'active', location: {id: locationId, name: locationName, code: locationCode}};
}

export async function switchBrand(request, env, actor, orgId) {
  const organization = await env.DB.prepare('SELECT id, name, slug, plan, status FROM organizations WHERE id = ? AND status = \'active\'').bind(orgId).first();
  if (!organization) throw new HttpError(404, 'Marca no encontrada', 'not_found');
  let membership = await env.DB.prepare('SELECT id, role, location_scope, active FROM memberships WHERE org_id = ? AND user_id = ?').bind(orgId, actor.userId).first();
  if (!membership && actor.isPlatformOwner) {
    const timestamp = nowIso();
    await env.DB.prepare(`
      INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(uuid(), orgId, actor.userId, timestamp, timestamp).run();
    membership = {role: ROLES.OWNER, location_scope: '["*"]', active: 1};
  }
  if (!membership || !membership.active) throw new HttpError(403, 'No tienes acceso a esta marca', 'forbidden');
  const session = await createSession(env, request, actor.userId, orgId);
  await writeAudit(env, {...actor, orgId}, request, 'brand.switch', 'organization', orgId, {fromOrgId: actor.orgId});
  return {
    token: session.token,
    sessionId: session.sessionId,
    organization: {id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan},
    role: membership.role
  };
}
