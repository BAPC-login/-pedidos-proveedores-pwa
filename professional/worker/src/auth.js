import {
  HttpError,
  ROLES,
  assertMinimumRole,
  monthKey,
  normalizeEmail,
  nowIso,
  parseBearer,
  planFor,
  randomToken,
  readJson,
  requireText,
  sha256,
  slugify,
  uuid
} from './core.js';
import {hashPassword, verifyPassword} from './password.js';

function publicUser(row) {
  return {
    id: row.user_id || row.id,
    email: row.email,
    displayName: row.display_name,
    active: Boolean(row.user_active ?? row.active),
    role: row.role,
    organizationId: row.org_id,
    organizationName: row.org_name,
    organizationSlug: row.org_slug,
    plan: row.plan,
    membershipId: row.membership_id,
    locationScope: safeJson(row.location_scope, [])
  };
}

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

async function validateLocationScope(env, actor, requested, role) {
  if (role === ROLES.OWNER) return ['*'];
  const values = [...new Set((Array.isArray(requested) ? requested : []).map(String).filter(Boolean))];
  if (values.includes('*')) throw new HttpError(403, 'Solo el owner puede acceder a todos los locales', 'owner_scope_required');
  if (!values.length) throw new HttpError(400, 'Selecciona al menos un local para este usuario', 'location_scope_required');
  for (const locationId of values) {
    const location = await env.DB.prepare('SELECT id FROM locations WHERE id = ? AND org_id = ? AND active = 1').bind(locationId, actor.orgId).first();
    if (!location) throw new HttpError(400, 'Uno de los locales seleccionados no es válido', 'invalid_location_scope');
  }
  return values;
}

async function createSession(env, request, {userId, orgId}) {
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || 'pedidos-pro'}:${ip}`) : '';
  const session = {
    id: uuid(),
    userId,
    orgId,
    tokenHash,
    userAgent: String(request.headers.get('User-Agent') || '').slice(0, 300),
    ipHash,
    createdAt: nowIso()
  };
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, org_id, token_hash, user_agent, ip_hash, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(session.id, userId, orgId, tokenHash, session.userAgent, ipHash, session.createdAt, session.createdAt).run();
  return {token, sessionId: session.id};
}

export async function writeAudit(env, actor, request, action, entityType, entityId = '', metadata = {}) {
  try {
    const ip = request?.headers?.get?.('CF-Connecting-IP') || '';
    const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || 'pedidos-pro'}:${ip}`) : '';
    await env.DB.prepare(`
      INSERT INTO audit_logs
        (id, org_id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(), actor?.orgId || null, actor?.userId || null, actor?.email || '', action,
      entityType, entityId || '', JSON.stringify(metadata || {}), ipHash, nowIso()
    ).run();
  } catch (error) {
    console.error('audit_failed', action, error);
  }
}

export async function authenticate(request, env, {optional = false} = {}) {
  const token = parseBearer(request);
  if (!token) {
    if (optional) return null;
    throw new HttpError(401, 'Debes iniciar sesión', 'unauthorized');
  }
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id, s.user_id, s.org_id, s.created_at AS session_created_at,
      u.email, u.display_name, u.active AS user_active,
      m.id AS membership_id, m.role, m.location_scope, m.active AS membership_active,
      o.name AS org_name, o.slug AS org_slug, o.plan, o.status AS org_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
    JOIN organizations o ON o.id = s.org_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND u.active = 1
      AND m.active = 1
      AND o.status = 'active'
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row) throw new HttpError(401, 'La sesión fue revocada o no es válida', 'session_revoked');
  env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
    .bind(nowIso(), row.session_id).run().catch(() => {});
  const platformOwner = await env.DB.prepare('SELECT user_id FROM platform_owners WHERE user_id = ?').bind(row.user_id).first();
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    orgId: row.org_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    locationScope: safeJson(row.location_scope, []),
    organization: {id: row.org_id, name: row.org_name, slug: row.org_slug, plan: row.plan},
    isPlatformOwner: Boolean(platformOwner)
  };
}

export async function bootstrap(request, env) {
  const configured = String(env.BOOTSTRAP_ADMIN_TOKEN || '');
  const provided = String(request.headers.get('X-Bootstrap-Token') || '');
  if (!configured || provided !== configured) {
    throw new HttpError(403, 'Token de inicialización inválido', 'invalid_bootstrap_token');
  }
  const current = await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
  if (Number(current?.total) > 0) {
    throw new HttpError(409, 'La plataforma ya fue inicializada', 'already_bootstrapped');
  }
  const body = await readJson(request);
  const organizationName = requireText(body.organizationName, 'Nombre de la empresa', {max: 120});
  const locationName = requireText(body.locationName || 'Casa matriz', 'Nombre del local', {max: 120});
  const displayName = requireText(body.displayName, 'Nombre del usuario', {max: 120});
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const passwordData = await hashPassword(password);
  const timestamp = nowIso();
  const orgId = uuid();
  const locationId = uuid();
  const userId = uuid();
  const membershipId = uuid();
  const slug = slugify(body.organizationSlug || organizationName);

  const statements = [
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'free', 'active', ?, ?)`) 
      .bind(orgId, organizationName, slug, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)`) 
      .bind(locationId, orgId, locationName, 'PRINCIPAL', timestamp, timestamp),
    env.DB.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`) 
      .bind(userId, email, displayName, passwordData.salt, passwordData.hash, passwordData.algorithm, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`) 
      .bind(membershipId, orgId, userId, ROLES.OWNER, JSON.stringify(['*']), timestamp, timestamp),
    env.DB.prepare('INSERT INTO platform_owners (user_id, created_at) VALUES (?, ?)').bind(userId, timestamp)
  ];
  ['Bebidas sin alcohol','Cervezas','Vinos','Espumantes','Pisco','Ron','Vodka','Gin','Whisky','Tequila','Licores','Insumos','Abarrotes','Otros'].forEach((name, index) => {
    statements.push(env.DB.prepare(`INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`) 
      .bind(uuid(), orgId, name, index, timestamp, timestamp));
  });
  await env.DB.batch(statements);

  const session = await createSession(env, request, {userId, orgId});
  const actor = {userId, orgId, email, role: ROLES.OWNER};
  await writeAudit(env, actor, request, 'platform.bootstrap', 'organization', orgId, {locationId});
  return {
    token: session.token,
    sessionId: session.sessionId,
    user: {
      id: userId, email, displayName, role: ROLES.OWNER,
      organizationId: orgId, organizationName, organizationSlug: slug,
      plan: 'free', locationScope: ['*']
    }
  };
}

export async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const organizationSlug = String(body.organizationSlug || '').trim().toLowerCase();
  const row = await env.DB.prepare(`
    SELECT
      u.id AS user_id, u.email, u.display_name, u.password_salt, u.password_hash, u.active AS user_active,
      m.id AS membership_id, m.org_id, m.role, m.location_scope, m.active AS membership_active,
      o.name AS org_name, o.slug AS org_slug, o.plan, o.status AS org_status
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN organizations o ON o.id = m.org_id
    WHERE u.email = ?
      AND (? = '' OR o.slug = ?)
      AND u.active = 1 AND m.active = 1 AND o.status = 'active'
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, o.created_at ASC
    LIMIT 1
  `).bind(email, organizationSlug, organizationSlug).first();
  if (!row || !await verifyPassword(String(body.password || ''), row.password_salt, row.password_hash)) {
    await writeAudit(env, null, request, 'auth.login_failed', 'user', '', {email});
    throw new HttpError(401, 'Correo o contraseña incorrectos', 'invalid_credentials');
  }
  const session = await createSession(env, request, {userId: row.user_id, orgId: row.org_id});
  const actor = {userId: row.user_id, orgId: row.org_id, email: row.email, role: row.role};
  await writeAudit(env, actor, request, 'auth.login', 'session', session.sessionId);
  return {token: session.token, sessionId: session.sessionId, user: publicUser(row)};
}

export async function logout(request, env, actor) {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
    .bind(nowIso(), actor.sessionId).run();
  await writeAudit(env, actor, request, 'auth.logout', 'session', actor.sessionId);
  return {revoked: true};
}

export async function me(env, actor) {
  const usageMonth = monthKey();
  const usageRows = await env.DB.prepare(`
    SELECT metric, quantity FROM usage_counters WHERE org_id = ? AND month_key = ?
  `).bind(actor.orgId, usageMonth).all();
  const usage = Object.fromEntries((usageRows.results || []).map(row => [row.metric, Number(row.quantity)]));
  const limits = planFor(actor.organization.plan);
  return {
    user: {
      id: actor.userId,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      locationScope: actor.locationScope,
      isPlatformOwner: Boolean(actor.isPlatformOwner)
    },
    organization: actor.organization,
    plan: {name: actor.organization.plan, limits, usage}
  };
}

export async function listUsers(env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const rows = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.active, m.id AS membership_id, m.role, m.location_scope, m.active AS membership_active,
      COUNT(CASE WHEN s.revoked_at IS NULL THEN 1 END) AS active_sessions,
      MAX(s.last_seen_at) AS last_seen_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN sessions s ON s.user_id = u.id AND s.org_id = m.org_id
    WHERE m.org_id = ?
    GROUP BY u.id, m.id
    ORDER BY m.active DESC, u.display_name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    membershipId: row.membership_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: Boolean(row.active && row.membership_active),
    locationScope: safeJson(row.location_scope, []),
    activeSessions: Number(row.active_sessions || 0),
    lastSeenAt: row.last_seen_at || null
  }));
}

export async function createUser(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const limits = planFor(actor.organization.plan);
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM memberships WHERE org_id = ? AND active = 1')
    .bind(actor.orgId).first();
  if (Number(count?.total) >= limits.users) {
    throw new HttpError(402, `El plan ${actor.organization.plan} permite hasta ${limits.users} usuarios activos`, 'plan_limit');
  }
  const email = normalizeEmail(body.email);
  const displayName = requireText(body.displayName, 'Nombre', {max: 120});
  const role = String(body.role || ROLES.READONLY);
  if (!Object.values(ROLES).includes(role)) throw new HttpError(400, 'Rol inválido', 'invalid_role');
  if (role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, 'Solo el propietario puede crear otro propietario', 'forbidden');
  const locationScope = await validateLocationScope(env, actor, body.locationScope, role);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  const timestamp = nowIso();
  let userId = existing?.id;
  const statements = [];
  if (!userId) {
    const passwordData = await hashPassword(String(body.password || ''));
    userId = uuid();
    statements.push(env.DB.prepare(`
      INSERT INTO users (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(userId, email, displayName, passwordData.salt, passwordData.hash, passwordData.algorithm, timestamp, timestamp));
  }
  const duplicate = await env.DB.prepare('SELECT id FROM memberships WHERE org_id = ? AND user_id = ?').bind(actor.orgId, userId).first();
  if (duplicate) throw new HttpError(409, 'El usuario ya pertenece a esta organización', 'duplicate_membership');
  const membershipId = uuid();
  statements.push(env.DB.prepare(`
    INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(membershipId, actor.orgId, userId, role, JSON.stringify(locationScope), timestamp, timestamp));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, 'user.create', 'user', userId, {role, email});
  return {id: userId, membershipId, email, displayName, role, locationScope, active: true};
}

export async function updateUser(request, env, actor, userId) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const membership = await env.DB.prepare(`
    SELECT m.id, m.role, m.active, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ? AND m.user_id = ?
  `).bind(actor.orgId, userId).first();
  if (!membership) throw new HttpError(404, 'Usuario no encontrado', 'not_found');
  if (membership.role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, 'No puedes modificar al propietario', 'forbidden');
  const role = body.role === undefined ? membership.role : String(body.role);
  if (!Object.values(ROLES).includes(role)) throw new HttpError(400, 'Rol inválido', 'invalid_role');
  if (role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, 'Solo el propietario puede asignar ese rol', 'forbidden');
  const active = body.active === undefined ? Number(membership.active) : (body.active ? 1 : 0);
  const locationScope = await validateLocationScope(env, actor, body.locationScope, role);
  await env.DB.prepare(`UPDATE memberships SET role = ?, location_scope = ?, active = ?, updated_at = ? WHERE org_id = ? AND user_id = ?`)
    .bind(role, JSON.stringify(locationScope), active, nowIso(), actor.orgId, userId).run();
  if (!active) {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE org_id = ? AND user_id = ? AND revoked_at IS NULL')
      .bind(nowIso(), actor.orgId, userId).run();
  }
  await writeAudit(env, actor, request, active ? 'user.update' : 'user.revoke', 'user', userId, {role, active: Boolean(active)});
  return {id: userId, email: membership.email, role, active: Boolean(active), locationScope};
}

export async function resetPassword(request, env, actor, userId) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const membership = await env.DB.prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?')
    .bind(actor.orgId, userId).first();
  if (!membership) throw new HttpError(404, 'Usuario no encontrado', 'not_found');
  if (membership.role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, 'No puedes restablecer al propietario', 'forbidden');
  const result = await hashPassword(String(body.password || ''));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, password_algorithm = ?, updated_at = ? WHERE id = ?')
      .bind(result.salt, result.hash, result.algorithm, nowIso(), userId),
    env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL')
      .bind(nowIso(), userId, actor.orgId)
  ]);
  await writeAudit(env, actor, request, 'user.password_reset', 'user', userId);
  return {reset: true, sessionsRevoked: true};
}

export async function listSessions(env, actor) {
  const rows = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.user_agent, s.created_at, s.last_seen_at, s.revoked_at,
      u.email, u.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.org_id = ? AND (? IN ('owner','admin') OR s.user_id = ?)
    ORDER BY s.created_at DESC LIMIT 200
  `).bind(actor.orgId, actor.role, actor.userId).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    current: row.id === actor.sessionId
  }));
}

export async function revokeSession(request, env, actor, sessionId) {
  const session = await env.DB.prepare('SELECT id, user_id FROM sessions WHERE id = ? AND org_id = ?')
    .bind(sessionId, actor.orgId).first();
  if (!session) throw new HttpError(404, 'Sesión no encontrada', 'not_found');
  if (session.user_id !== actor.userId) assertMinimumRole(actor.role, ROLES.ADMIN);
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(nowIso(), sessionId).run();
  await writeAudit(env, actor, request, 'session.revoke', 'session', sessionId, {userId: session.user_id});
  return {revoked: true};
}
