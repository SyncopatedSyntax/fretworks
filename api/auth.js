// /api/auth — accounts. Username + password, no email.
//
//   GET                         -> { user: {name, admin} } or { user: null }
//   POST {op:'signup',   username, password}        -> { user, recoveryCode }
//   POST {op:'login',    username, password}        -> { user }
//   POST {op:'logout'}
//   POST {op:'password', current, next}             -> signs out other devices
//   POST {op:'newcode',  password}                  -> { recoveryCode }
//   POST {op:'recover',  username, code, next}      -> { user, recoveryCode }
//   POST {op:'delete',   password}                  -> account and data gone
//   POST {op:'admin-reset', username, next}         -> FW_ADMIN_USERS only
//
// Error messages never say whether a username exists on sign-in or recovery.
import { db } from './_lib/db.js';
import { json, fail, guard, readJson, session, newSession, clearCookie, clientIp, allow, admins } from './_lib/http.js';
import { hashPassword, checkPassword, wasteAPasswordCheck, newRecoveryCode, hashCode } from './_lib/password.js';

const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,23}$/;
export const normUser = u => String(u || '').trim().toLowerCase();
const userOut = u => ({ name: u.display || u.username, admin: admins().includes(u.username) });
const badPassword = p => typeof p !== 'string' || p.length < 8 || p.length > 200;
const PW_RULE = 'Passwords need at least 8 characters.';
const WRONG = 'Wrong username or password.';

export async function GET(req) {
  const g = guard(req); if (g) return g;
  try {
    const s = await session(req);
    return json({ user: s ? userOut(s) : null }, 200, s?.setCookie ? { 'set-cookie': s.setCookie } : {});
  } catch (e) { return serverError(e); }
}

export async function POST(req) {
  const g = guard(req); if (g) return g;
  try {
    const body = await readJson(req, 20_000);
    const op = body.op;
    const d = await db();
    const ip = clientIp(req);

    if (op === 'signup') {
      const display = String(body.username || '').trim();
      const username = normUser(display);
      if (!USERNAME.test(username)) return fail(400, 'Usernames are 3–24 characters: letters, numbers, and . _ - (starting with a letter or number).');
      if (badPassword(body.password)) return fail(400, PW_RULE);
      if (!(await allow('signup:' + ip, 10, 3600))) return fail(429, 'Too many new accounts from here. Try again in an hour.');
      const code = newRecoveryCode();
      const rows = await d.query(
        `insert into fw_users(username, display, pass_hash, recovery_hash) values ($1, $2, $3, $4)
         on conflict (username) do nothing returning id, username, display`,
        [username, display, await hashPassword(body.password), hashCode(code)]);
      if (!rows.length) return fail(409, 'That username is taken. Try another.');
      const u = rows[0];
      return json({ user: userOut(u), recoveryCode: code }, 200, { 'set-cookie': await newSession(Number(u.id)) });
    }

    if (op === 'login') {
      const username = normUser(body.username);
      if (!(await allow('login:' + ip, 30, 600))) return fail(429, 'Too many attempts. Wait ten minutes and try again.');
      const rows = await d.query(`select id, username, display, pass_hash, locked_until > now() as locked,
                                          ceil(extract(epoch from (locked_until - now()))) as wait
                                     from fw_users where username = $1`, [username]);
      const u = rows[0];
      if (!u) { await wasteAPasswordCheck(String(body.password || '')); return fail(401, WRONG); }
      if (u.locked) return fail(429, `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(Number(u.wait) / 60))} min.`);
      if (!(await checkPassword(String(body.password || ''), u.pass_hash))) {
        // Five free tries, then a lock that doubles: 1, 2, 4 … up to 60 min.
        await d.query(`update fw_users set fail_count = fail_count + 1,
                         locked_until = case when fail_count + 1 >= 5
                           then now() + make_interval(mins => least(60, power(2, fail_count + 1 - 5)::int)) else locked_until end
                       where id = $1`, [u.id]);
        return fail(401, WRONG);
      }
      await d.query(`update fw_users set fail_count = 0, locked_until = null where id = $1`, [u.id]);
      return json({ user: userOut(u) }, 200, { 'set-cookie': await newSession(Number(u.id)) });
    }

    if (op === 'recover') {
      const username = normUser(body.username);
      if (badPassword(body.next)) return fail(400, PW_RULE);
      if (!(await allow('recover:' + ip, 10, 3600)) || !(await allow('recover-u:' + username, 10, 3600)))
        return fail(429, 'Too many attempts. Try again in an hour.');
      const rows = await d.query(`select id, username, display, recovery_hash from fw_users where username = $1`, [username]);
      const u = rows[0];
      if (!u || u.recovery_hash !== hashCode(body.code)) return fail(401, 'That username and recovery code don’t match.');
      // A used recovery code is spent: a new one replaces it, and every other
      // device is signed out (whoever had the old password is shut out).
      const code = newRecoveryCode();
      await d.batch([
        { text: `update fw_users set pass_hash = $2, recovery_hash = $3, fail_count = 0, locked_until = null where id = $1`, params: [u.id, await hashPassword(body.next), hashCode(code)] },
        { text: `delete from fw_sessions where user_id = $1`, params: [u.id] },
      ]);
      return json({ user: userOut(u), recoveryCode: code }, 200, { 'set-cookie': await newSession(Number(u.id)) });
    }

    // Everything below needs a signed-in session.
    const s = await session(req);
    if (op === 'logout') {
      if (s) await d.query(`delete from fw_sessions where token_hash = $1`, [s.tokenHash]);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }
    if (!s) return fail(401, 'You are signed out. Sign in again.');

    const confirm = async pw => {
      const r = await d.query(`select pass_hash from fw_users where id = $1`, [s.id]);
      return r.length && checkPassword(String(pw || ''), r[0].pass_hash);
    };

    if (op === 'password') {
      if (badPassword(body.next)) return fail(400, PW_RULE);
      if (!(await allow('pw:' + s.id, 10, 3600))) return fail(429, 'Too many attempts. Try again in an hour.');
      if (!(await confirm(body.current))) return fail(401, 'Your current password is not right.');
      await d.batch([
        { text: `update fw_users set pass_hash = $2 where id = $1`, params: [s.id, await hashPassword(body.next)] },
        { text: `delete from fw_sessions where user_id = $1 and token_hash <> $2`, params: [s.id, s.tokenHash] },
      ]);
      return json({ ok: true });
    }
    if (op === 'newcode') {
      if (!(await allow('pw:' + s.id, 10, 3600))) return fail(429, 'Too many attempts. Try again in an hour.');
      if (!(await confirm(body.password))) return fail(401, 'Your password is not right.');
      const code = newRecoveryCode();
      await d.query(`update fw_users set recovery_hash = $2 where id = $1`, [s.id, hashCode(code)]);
      return json({ recoveryCode: code });
    }
    if (op === 'delete') {
      if (!(await allow('pw:' + s.id, 10, 3600))) return fail(429, 'Too many attempts. Try again in an hour.');
      if (!(await confirm(body.password))) return fail(401, 'Your password is not right.');
      await d.query(`delete from fw_users where id = $1`, [s.id]);   // sessions and data cascade
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }
    if (op === 'admin-reset') {
      if (!admins().includes(s.username)) return fail(403, 'Forbidden.');
      if (badPassword(body.next)) return fail(400, PW_RULE);
      const rows = await d.query(`select id from fw_users where username = $1`, [normUser(body.username)]);
      if (!rows.length) return fail(404, 'No account with that username.');
      await d.batch([
        { text: `update fw_users set pass_hash = $2, fail_count = 0, locked_until = null where id = $1`, params: [rows[0].id, await hashPassword(body.next)] },
        { text: `delete from fw_sessions where user_id = $1`, params: [rows[0].id] },
      ]);
      return json({ ok: true });
    }
    return fail(400, 'Unknown request.');
  } catch (e) { return serverError(e); }
}

export function serverError(e) {
  if (e && e.status) return fail(e.status, e.message);
  if (e && e.code === 'NO_DB') return fail(503, 'Accounts are not set up on this server yet.');
  console.error(e);
  return fail(500, 'Something went wrong on the server. Try again in a moment.');
}
