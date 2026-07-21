export const APP_VERSION = '2.0.0-alpha.1';

export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  PURCHASER: 'purchaser',
  APPROVER: 'approver',
  RECEIVER: 'receiver',
  FINANCE: 'finance',
  READONLY: 'readonly'
});

export const ROLE_WEIGHT = Object.freeze({
  readonly: 10,
  finance: 40,
  receiver: 50,
  purchaser: 60,
  approver: 70,
  admin: 80,
  owner: 100
});

export const ORDER_TRANSITIONS = Object.freeze({
  draft: ['requested', 'cancelled'],
  requested: ['approved', 'rejected', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['confirmed', 'partially_received', 'received', 'cancelled'],
  confirmed: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'closed', 'cancelled'],
  received: ['reconciled', 'closed'],
  reconciled: ['closed'],
  closed: [],
  cancelled: []
});

export const PLAN_LIMITS = Object.freeze({
  free: {
    locations: 1,
    users: 5,
    suppliers: 100,
    products: 750,
    ordersPerMonth: 500,
    aiDocumentsPerMonth: 30,
    fileBytes: 250 * 1024 * 1024,
    features: ['orders', 'reception', 'catalog', 'audit', 'offline', 'ai-basic']
  },
  pro: {
    locations: 5,
    users: 25,
    suppliers: 500,
    products: 5000,
    ordersPerMonth: 10000,
    aiDocumentsPerMonth: 1000,
    fileBytes: 20 * 1024 * 1024 * 1024,
    features: ['orders', 'reception', 'catalog', 'audit', 'offline', 'ai', 'approvals', 'dte', 'reports']
  },
  business: {
    locations: 50,
    users: 250,
    suppliers: 5000,
    products: 50000,
    ordersPerMonth: 100000,
    aiDocumentsPerMonth: 10000,
    fileBytes: 200 * 1024 * 1024 * 1024,
    features: ['orders', 'reception', 'catalog', 'audit', 'offline', 'ai', 'approvals', 'dte', 'reports', 'integrations', 'sso']
  }
});

export class HttpError extends Error {
  constructor(status, message, code = 'request_failed', details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function corsHeaders(origin, env = {}) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowedOrigin = configured.length
    ? (configured.includes(origin) ? origin : configured[0])
    : (origin || '*');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key,X-Bootstrap-Token,X-Pedidos-Client',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://pedidos-pro-ai.botreservasmultilocal.workers.dev; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  };
}

export function json(data, status = 200, request = null, env = {}) {
  const origin = request?.headers?.get?.('Origin') || '';
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin, env),
      ...securityHeaders()
    }
  });
}

export function ok(data = {}, request = null, env = {}) {
  return json({ok: true, ...data}, 200, request, env);
}

export function errorResponse(error, request = null, env = {}) {
  const status = Number(error?.status) || 500;
  const expose = status < 500 || env.ENVIRONMENT !== 'production';
  const payload = {
    ok: false,
    error: expose ? String(error?.message || 'Error inesperado') : 'No se pudo completar la operación',
    code: error?.code || 'internal_error'
  };
  if (expose && error?.details) payload.details = error.details;
  return json(payload, status, request, env);
}

export async function readJson(request, {required = true} = {}) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    if (!required) return {};
    throw new HttpError(415, 'Se requiere Content-Type application/json', 'unsupported_media_type');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'El cuerpo JSON no es válido', 'invalid_json');
  }
}

export function requireText(value, field, {min = 1, max = 250} = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min) throw new HttpError(400, `${field} es obligatorio`, 'validation_error', {field});
  if (text.length > max) throw new HttpError(400, `${field} supera ${max} caracteres`, 'validation_error', {field});
  return text;
}

export function optionalText(value, {max = 1000} = {}) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new HttpError(400, `El texto supera ${max} caracteres`, 'validation_error');
  return text;
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Correo inválido', 'invalid_email');
  }
  return email;
}

export function normalizeRut(value) {
  const rut = String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (!rut) return '';
  if (rut.length < 8 || rut.length > 9) throw new HttpError(400, 'RUT inválido', 'invalid_rut');
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index--) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  if (verifier !== expected) throw new HttpError(400, 'RUT inválido', 'invalid_rut');
  return `${Number(body).toLocaleString('es-CL')}-${verifier}`;
}

export function slugify(value) {
  const slug = String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60);
  return slug || `empresa-${Date.now().toString(36)}`;
}

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function number(value, {min = -Infinity, max = Infinity, fallback = 0} = {}) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function integer(value, options = {}) {
  return Math.round(number(value, options));
}

export function bool(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function parseBearer(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function sha256(value) {
  const input = value instanceof ArrayBuffer ? value : ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt = randomToken(18)) {
  const normalized = String(password || '');
  if (normalized.length < 10) {
    throw new HttpError(400, 'La contraseña debe tener al menos 10 caracteres', 'weak_password');
  }
  if (normalized.length > 128) {
    throw new HttpError(400, 'La contraseña es demasiado larga', 'weak_password');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalized),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: new TextEncoder().encode(salt),
    iterations: 210000
  }, key, 256);
  const hash = [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return {salt, hash, algorithm: 'pbkdf2-sha256-210000'};
}

export async function verifyPassword(password, salt, expectedHash) {
  const result = await hashPassword(password, salt);
  if (result.hash.length !== String(expectedHash || '').length) return false;
  let diff = 0;
  for (let index = 0; index < result.hash.length; index++) {
    diff |= result.hash.charCodeAt(index) ^ String(expectedHash)[index].charCodeAt(0);
  }
  return diff === 0;
}

export function assertRole(role, allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!allowed.includes(role)) {
    throw new HttpError(403, 'No tienes permisos para esta acción', 'forbidden');
  }
}

export function assertMinimumRole(role, minimumRole) {
  if ((ROLE_WEIGHT[role] || 0) < (ROLE_WEIGHT[minimumRole] || 0)) {
    throw new HttpError(403, 'No tienes permisos para esta acción', 'forbidden');
  }
}

export function canTransition(from, to) {
  return Boolean(ORDER_TRANSITIONS[from]?.includes(to));
}

export function planFor(name) {
  return PLAN_LIMITS[name] || PLAN_LIMITS.free;
}

export function sanitizeFileName(value) {
  const safe = String(value || 'archivo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return safe || 'archivo';
}

export function routeMatch(pathname, pattern) {
  const pathParts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const patternParts = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index++) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}
