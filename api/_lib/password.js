// Password and recovery-code hashing.
//
// Passwords use scrypt, built into Node — a standard memory-hard password
// hash, not something invented here. Parameters follow OWASP's scrypt
// recommendation (N=2^17, r=8, p=1) and are stored WITH the hash, so they can
// be raised later without breaking existing accounts. FW_SCRYPT_N lowers the
// cost for the test suite only.
//
// Recovery codes are 80 random bits, so a fast hash (SHA-256) is enough: there
// is nothing to brute-force.
import { scrypt as _scrypt, randomBytes, timingSafeEqual, randomInt } from 'node:crypto';
import { sha256 } from './http.js';

const scrypt = (pw, salt, n, r, p) => new Promise((ok, no) =>
  _scrypt(pw.normalize('NFKC'), salt, 32, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }, (e, k) => (e ? no(e) : ok(k))));
const COST = () => Number(process.env.FW_SCRYPT_N) || 2 ** 17;

export async function hashPassword(pw) {
  const salt = randomBytes(16), n = COST(), r = 8, p = 1;
  const dk = await scrypt(pw, salt, n, r, p);
  return `scrypt$${n}$${r}$${p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}
export async function checkPassword(pw, stored) {
  const [alg, n, r, p, salt, dk] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(dk, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return got.length === want.length && timingSafeEqual(got, want);
}
// For an unknown username: spend the same time as a real check, so response
// timing does not reveal which usernames exist.
let dummy = null;
export async function wasteAPasswordCheck(pw) {
  if (!dummy) dummy = await hashPassword('not-a-real-password');
  await checkPassword(pw, dummy);
  return false;
}

// 16 characters from 32 that cannot be misread (no 0/O, 1/I), in four groups:
// e.g. K7QM-3XPD-9TRH-W2NB.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHA[randomInt(ALPHA.length)];
  return s.match(/.{4}/g).join('-');
}
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = c => sha256('fw-recovery:' + normCode(c));
