import {pbkdf2Sync, randomBytes, timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const ITERATIONS = 100000;
const KEY_BYTES = 32;
const DIGEST = 'sha256';

function passwordError(message, code = 'weak_password') {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function normalizePassword(password) {
  const normalized = String(password || '');
  if (normalized.length < 10) throw passwordError('La contraseña debe tener al menos 10 caracteres');
  if (normalized.length > 128) throw passwordError('La contraseña es demasiado larga');
  return normalized;
}

export async function hashPassword(password, salt = randomBytes(18).toString('base64url')) {
  const normalized = normalizePassword(password);
  const hash = pbkdf2Sync(normalized, String(salt), ITERATIONS, KEY_BYTES, DIGEST).toString('hex');
  return {salt: String(salt), hash, algorithm: `pbkdf2-sha256-${ITERATIONS}`};
}

export async function verifyPassword(password, salt, expectedHash) {
  const normalized = normalizePassword(password);
  const expected = String(expectedHash || '');
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = pbkdf2Sync(normalized, String(salt || ''), ITERATIONS, KEY_BYTES, DIGEST);
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
