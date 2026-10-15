// Request/response helpers, sessions and throttling for the API.
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

export const COOKIE = 'fw_sid';
const SESSION_DAYS = 365;          // browsers cap cookies at 400 days
const REFRESH_BELOW_DAYS = 300;    // extend a session once it is 65 days old

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
export const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

// Cross-site request forgery: the session cookie is SameSite=Lax, which
// already keeps it off cross-site POSTs. On top of that every call must carry
// a custom header — a cross-origin page cannot add one without a preflight
// this API never answers — and any Origin header must be this site.
export function guard(req) {
  if (req.headers.get('x-fretworks') !== '1') return fail(403, 'Forbidden.');
  const origin = req.headers.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* malformed */ }
    const self = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    if (host !== self) return fail(403, 'Forbidden.');
  }
  return null;
}

export async function readJson(req, max = 4_000_000) {
  const text = await req.text();
  if (text.length > max) throw Object.assign(new Error('Too large.'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Bad request.'), { status: 400 }); }
}

export const sha256 = s => createHash('sha256').update(s).digest('hex');

function cookieValue(req, name) {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const cookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearCookie = () => cookie('', 0);

export async function newSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const d = await db();
  await d.query(`insert into fw_sessions(token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  // Tidy up while we are here: expired sessions are dead weight.
  await d.query(`delete from fw_sessions where expires_at < now()`);
  return cookie(token, SESSION_DAYS * 86400);
}

// The signed-in user for this request, or null. A session in active use is
// quietly extended, so a device you practise on never gets signed out.
export async function session(req) {
  const token = cookieValue(req, COOKIE);
  if (!token) return null;
  const d = await db();
  const rows = await d.query(
    `select u.id, u.username, u.display, s.expires_at < now() + interval '${REFRESH_BELOW_DAYS} days' as stale
       from fw_sessions s join fw_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`, [sha256(token)]);
  if (!rows.length) return null;
  const u = rows[0];
  let setCookie = null;
  if (u.stale) {
    await d.query(`update fw_sessions set expires_at = now() + interval '${SESSION_DAYS} days' where token_hash = $1`, [sha256(token)]);
    setCookie = cookie(token, SESSION_DAYS * 86400);
  }
  return { id: Number(u.id), username: u.username, display: u.display, tokenHash: sha256(token), setCookie };
}

export const clientIp = req =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';

// Fixed-window counter: true while `bucket` has been hit at most `limit`
// times in the current window.
export async function allow(bucket, limit, windowSec) {
  const d = await db();
  const rows = await d.query(
    `insert into fw_rate(bucket, n, reset_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (bucket) do update set
       n = case when fw_rate.reset_at < now() then 1 else fw_rate.n + 1 end,
       reset_at = case when fw_rate.reset_at < now() then now() + make_interval(secs => $2) else fw_rate.reset_at end
     returning n`, [bucket, windowSec]);
  return Number(rows[0].n) <= limit;
}

// Who may reset other people's passwords. Written into the code because the
// project's environment variables cannot be set from here; a username is not a
// secret (admin still means signing in with that account's password).
// FW_ADMIN_USERS (comma-separated) adds more without a code change.
const ADMINS = ['zakarue'];
export const admins = () => [...new Set([...ADMINS,
  ...(process.env.FW_ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)])];
