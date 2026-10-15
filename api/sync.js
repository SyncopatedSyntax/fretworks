// /api/sync — one round trip that both pushes and pulls.
//
//   POST { cursor, device, changes: [{ key, value|null, baseRev, t }] }
//   ->   { applied: [{key, rev}], conflicts: [{key, value, rev, t}],
//          updates: [{key, value, rev, t}], cursor, more }
//
// A change is applied only if the server still has the version the device
// last saw (`baseRev`; 0 = "I have never seen this key"). Otherwise it is a
// conflict: the server's current value goes back, the device merges, and
// pushes the merged value against the new rev. Each change is one atomic
// statement, all of them in one transaction, so two devices racing can never
// both win — one gets a conflict and merges.
//
// `updates` is everything for this user with rev > cursor: what other devices
// changed since this one last pulled.
import { db } from './_lib/db.js';
import { json, fail, guard, readJson, session } from './_lib/http.js';
import { serverError } from './auth.js';

const MAX_CHANGES = 500;
const MAX_VALUE = 2_000_000;          // one key
const MAX_TOTAL = 25_000_000;         // one user, everything
const PAGE = 2000;
// Never stored, whatever a client sends. `fwbk_` keys hold the GitHub backup
// token; `fwsync_` is the engine's own bookkeeping.
const FORBIDDEN = /^(fwbk_|fwsync_)/;

export async function POST(req) {
  const g = guard(req); if (g) return g;
  try {
    const s = await session(req);
    if (!s) return fail(401, 'You are signed out. Sign in again.');
    const body = await readJson(req);
    const cursor = Math.max(0, Number(body.cursor) || 0);
    const device = String(body.device || '').slice(0, 40);
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > MAX_CHANGES) return fail(413, 'Too many changes at once.');
    for (const c of changes) {
      if (!c || typeof c.key !== 'string' || !c.key || c.key.length > 200 || FORBIDDEN.test(c.key)) return fail(400, 'Bad key.');
      if (c.value !== null && typeof c.value !== 'string') return fail(400, 'Bad value.');
      if (c.value && c.value.length > MAX_VALUE) return fail(413, `${c.key} is too large to sync.`);
      if (!Number.isInteger(Number(c.baseRev)) || Number(c.baseRev) < 0) return fail(400, 'Bad revision.');
    }
    const d = await db();

    if (changes.length) {
      const incoming = changes.reduce((a, c) => a + (c.value ? c.value.length : 0), 0);
      const [{ total }] = await d.query(`select coalesce(sum(length(value)), 0) as total from fw_kv where user_id = $1`, [s.id]);
      if (Number(total) + incoming > MAX_TOTAL) return fail(413, 'Your synced data has reached its size limit.');
    }

    const stmts = changes.map(c => Number(c.baseRev) === 0
      ? { text: `insert into fw_kv(user_id, key, value, rev, t, device) values ($1, $2, $3, nextval('fw_rev_seq'), $4, $5)
                 on conflict (user_id, key) do nothing returning key, rev`,
          params: [s.id, c.key, c.value, Math.round(Number(c.t) || 0), device] }
      : { text: `update fw_kv set value = $3, rev = nextval('fw_rev_seq'), t = $4, device = $5
                  where user_id = $1 and key = $2 and rev = $6 returning key, rev`,
          params: [s.id, c.key, c.value, Math.round(Number(c.t) || 0), device, Number(c.baseRev)] });
    const results = await d.batch(stmts);
    const applied = [], lost = [];
    results.forEach((rows, i) => (rows.length ? applied.push({ key: rows[0].key, rev: Number(rows[0].rev) }) : lost.push(changes[i].key)));

    const conflicts = lost.length
      ? (await d.query(`select key, value, rev, t from fw_kv where user_id = $1 and key = any($2::text[])`, [s.id, lost])).map(row)
      : [];
    const updates = (await d.query(
      `select key, value, rev, t from fw_kv where user_id = $1 and rev > $2 order by rev limit ${PAGE + 1}`, [s.id, cursor])).map(row);
    const more = updates.length > PAGE;
    if (more) updates.length = PAGE;
    const next = updates.length ? updates[updates.length - 1].rev : cursor;

    return json({ applied, conflicts, updates, cursor: next, more }, 200, s.setCookie ? { 'set-cookie': s.setCookie } : {});
  } catch (e) { return serverError(e); }
}

const row = r => ({ key: r.key, value: r.value, rev: Number(r.rev), t: Number(r.t) });
