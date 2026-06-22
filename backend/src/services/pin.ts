import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Hash a PIN as `salt:hash` (hex) using scrypt. No external dependency. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

/** Constant-time verify of a PIN against a stored `salt:hash`. */
export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(pin, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
