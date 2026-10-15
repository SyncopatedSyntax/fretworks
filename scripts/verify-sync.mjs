// End-to-end check of accounts + sync, with no network:
//
//   node scripts/verify-sync.mjs
//
// The REAL API handlers (api/*.js) run against a REAL Postgres (PGlite,
// in-process), and the REAL sync engine from @fretworks/design plays two or
// three devices, each with its own localStorage and its own cookie jar.
// Everything a person does across devices is acted out here: offline practice
// on two devices at once, a fresh device signing in, the open app's keys
// being held, resets, sign-out, other people's data, and the security rules.

process.env.FW_SCRYPT_N = '1024';            // cheap hashing for the test only
process.env.FW_ADMIN_USERS = 'zak';
import { PGlite } from '@electric-sql/pglite';
import { setDb } from '../api/_lib/db.js';
import * as auth from '../api/auth.js';
import * as syncApi from '../api/sync.js';
import * as health from '../api/health.js';
import { createSyncEngine, mergeValue } from '@fretworks/design';

let failures = 0, assertions = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n      ${e.stack?.split('\n').slice(0, 3).join('\n      ') || e}`); }
};
const fail = m => { throw new Error(m); };
// Key order is not meaningful in a merged object, so compare canonically.
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
const eq = (got, want, what) => { assertions++; const g = canon(got), w = canon(want); if (g !== w) fail(`${what}: got ${g}, expected ${w}`); };
const ok = (c, what) => { assertions++; if (!c) fail(what); };

// ── Database ─────────────────────────────────────────────────────────────
const pg = new PGlite();
setDb({
  query: async (text, params = []) => (await pg.query(text, params)).rows,
  batch: async qs => pg.transaction(async tx => { const out = []; for (const q of qs) out.push((await tx.query(q.text, q.params || [])).rows); return out; }),
});

// ── A device: storage + cookie jar + fetch into the handlers ─────────────
class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  dump(pred = () => true) { return Object.fromEntries([...this.m].filter(([k]) => pred(k))); }
}
const HOST = 'fretworks.test';
// ONE clock for every device: "the later change wins" only means something
// if the devices agree on what later is.
let clock = 1_000_000;
function device(name, { appPrefix = null } = {}) {
  const storage = new MemStorage();
  const jar = {};
  let online = true, reloads = 0;
  const fetchFn = async (url, init = {}) => {
    if (!online) throw new TypeError('Failed to fetch');
    const headers = new Headers(init.headers || {});
    headers.set('host', HOST);
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ck) headers.set('cookie', ck);
    const req = new Request('https://' + HOST + url, { method: init.method || 'GET', headers, body: init.body });
    const mod = url.startsWith('/api/auth') ? auth : url.startsWith('/api/sync') ? syncApi : null;
    const res = await mod[req.method](req);
    const sc = res.headers.get('set-cookie');
    if (sc) { const [pair] = sc.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1); if (/Max-Age=0/.test(sc)) delete jar[k]; else jar[k] = v; }
    return res;
  };
  const mk = prefix => createSyncEngine({ storage, fetch: fetchFn, appPrefix: prefix, now: () => (clock += 1000), reload: () => { reloads++; }, deviceId: name });
  const dev = {
    name, storage, jar, fetch: fetchFn,
    engine: mk(appPrefix),
    setOnline(v) { online = v; },
    get reloads() { return reloads; },
    // A page load: a fresh engine (the module re-evaluates), booted before
    // the app reads anything.
    load(prefix = appPrefix) { dev.engine = mk(prefix); dev.engine.boot(); return dev.engine; },
    api: async (op, body = {}) => { const r = await fetchFn('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fretworks': '1' }, body: JSON.stringify({ op, ...body }) }); return { status: r.status, ...(await r.json()) }; },
    me: async () => { const r = await fetchFn('/api/auth', { headers: { 'x-fretworks': '1' } }); return (await r.json()).user; },
    async signUp(u, p) { const r = await dev.api('signup', { username: u, password: p }); if (r.status === 200) await dev.engine.adoptUser(r.user.name); return r; },
    async signIn(u, p) { const r = await dev.api('login', { username: u, password: p }); if (r.status === 200) await dev.engine.adoptUser(r.user.name); return r; },
  };
  dev.engine.boot();
  return dev;
}
const J = v => JSON.stringify(v);
const P = s => (s === null ? null : JSON.parse(s));

console.log('\nServer');
await check('health: database reachable, schema created', async () => {
  const r = await health.GET(new Request('https://' + HOST + '/api/health'));
  const b = await r.json();
  eq(b.database, true, 'database'); eq(b.ok, true, 'ok');
});
await check('requests without the app header, or from another site, are refused', async () => {
  const bare = await auth.POST(new Request('https://' + HOST + '/api/auth', { method: 'POST', headers: { host: HOST, 'content-type': 'application/json' }, body: '{"op":"login"}' }));
  eq(bare.status, 403, 'no x-fretworks header');
  const xs = await auth.POST(new Request('https://' + HOST + '/api/auth', { method: 'POST', headers: { host: HOST, origin: 'https://evil.example', 'x-fretworks': '1' }, body: '{"op":"login"}' }));
  eq(xs.status, 403, 'foreign origin');
});

console.log('\nAccounts');
const A = device('phone'), B = device('laptop');
await check('sign up: username rules, password rules, taken names', async () => {
  eq((await A.api('signup', { username: 'z', password: 'longenough' })).status, 400, 'too short a username');
  eq((await A.api('signup', { username: 'zak', password: 'short' })).status, 400, 'short password');
  const r = await A.signUp('Zak', 'correct horse');
  eq(r.status, 200, 'created'); eq(r.user.name, 'Zak', 'display name kept'); eq(r.user.admin, true, 'admin from FW_ADMIN_USERS');
  ok(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/.test(r.recoveryCode), 'recovery code format: ' + r.recoveryCode);
  eq((await B.api('signup', { username: 'ZAK', password: 'another one' })).status, 409, 'usernames are case-insensitive');
  A.recovery = r.recoveryCode;
});
await check('the session cookie is HttpOnly, Secure and SameSite', async () => {
  const D = device('probe');
  const r = await D.fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fretworks': '1' }, body: J({ op: 'signup', username: 'probe', password: 'probe-pass-1' }) });
  const sc = r.headers.get('set-cookie');
  ok(/HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Path=\//.test(sc), sc);
});
await check('sign in: wrong password and unknown user get the same answer', async () => {
  const w = await B.api('login', { username: 'zak', password: 'nope-nope' });
  const u = await B.api('login', { username: 'nobody-here', password: 'nope-nope' });
  eq(w.status, 401, 'wrong password'); eq(u.status, 401, 'unknown user'); eq(w.error, u.error, 'identical message');
});
await check('passwords are stored only as scrypt hashes', async () => {
  const rows = (await pg.query(`select pass_hash, recovery_hash from fw_users where username = 'zak'`)).rows;
  ok(rows[0].pass_hash.startsWith('scrypt$') && !rows[0].pass_hash.includes('correct horse'), 'hashed');
  ok(!rows[0].recovery_hash.includes(A.recovery.replace(/-/g, '')), 'recovery code hashed');
});

console.log('\nSync');
await check('progress made before signing in joins the account', async () => {
  const C = device('tablet');
  C.storage.setItem('bs_srs', J({ 'min|P1|root': { reps: 1, seen: 1, wrong: 0 } }));
  C.storage.setItem('bs_root', '9');
  C.storage.setItem('bs_ios_hint', '1');       // device-only
  C.storage.setItem('fwbk_config', J({ token: 'github_pat_SECRET' }));
  const r = await C.signUp('mia', 'mia-password');
  eq(r.status, 200, 'signed up');
  const rows = (await pg.query(`select key from fw_kv k join fw_users u on u.id = k.user_id where u.username = 'mia' order by key`)).rows.map(x => x.key);
  eq(rows, ['bs_root', 'bs_srs'], 'uploaded progress, not device-only keys');
});
await check('the GitHub token can never be uploaded, even by a client that tries', async () => {
  const r = await A.fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fretworks': '1' }, body: J({ cursor: 0, changes: [{ key: 'fwbk_config', value: 'x', baseRev: 0, t: 1 }] }) });
  eq(r.status, 400, 'refused');
  const n = (await pg.query(`select count(*)::int as n from fw_kv where key like 'fwbk_%'`)).rows[0].n;
  eq(n, 0, 'nothing stored');
});
await check('phone practises, laptop signs in and gets it', async () => {
  A.storage.setItem('at_srs', J({ '1|root': { reps: 2, seen: 3, wrong: 1 } }));
  A.storage.setItem('at_label', J('notes'));
  A.storage.setItem('ct_mastered', J(['cmaj7', 'g7']));
  await A.engine.sync();
  const r = await B.signIn('zak', 'correct horse');
  eq(r.status, 200, 'signed in');
  eq(P(B.storage.getItem('at_srs')), { '1|root': { reps: 2, seen: 3, wrong: 1 } }, 'srs arrived');
  eq(B.storage.getItem('at_label'), J('notes'), 'setting arrived');
  eq(B.engine.getState().status, 'idle', 'idle after sync');
});
await check('both practise OFFLINE on different cards — both survive', async () => {
  A.setOnline(false); B.setOnline(false);
  A.storage.setItem('at_srs', J({ ...P(A.storage.getItem('at_srs')), '2|fill': { reps: 1, seen: 1, wrong: 0 } }));
  B.storage.setItem('at_srs', J({ ...P(B.storage.getItem('at_srs')), '3|build': { reps: 1, seen: 2, wrong: 1 } }));
  await A.engine.sync(); eq(A.engine.getState().status, 'offline', 'offline is a state, not an error');
  A.setOnline(true); B.setOnline(true);
  await A.engine.sync(); await B.engine.sync(); await A.engine.sync();
  const want = { '1|root': { reps: 2, seen: 3, wrong: 1 }, '2|fill': { reps: 1, seen: 1, wrong: 0 }, '3|build': { reps: 1, seen: 2, wrong: 1 } };
  eq(P(A.storage.getItem('at_srs')), want, 'phone has all three');
  eq(P(B.storage.getItem('at_srs')), want, 'laptop has all three');
});
await check('both answer the SAME card offline — the one practised more wins', async () => {
  A.setOnline(false); B.setOnline(false);
  const a = P(A.storage.getItem('at_srs')), b = P(B.storage.getItem('at_srs'));
  a['1|root'] = { reps: 3, seen: 4, wrong: 1 };                 // one more answer
  b['1|root'] = { reps: 0, seen: 6, wrong: 3 };                 // three more, last one wrong
  A.storage.setItem('at_srs', J(a)); B.storage.setItem('at_srs', J(b));
  A.setOnline(true); B.setOnline(true);
  await A.engine.sync(); await B.engine.sync(); await A.engine.sync();
  eq(P(A.storage.getItem('at_srs'))['1|root'], { reps: 0, seen: 6, wrong: 3 }, 'phone');
  eq(P(B.storage.getItem('at_srs'))['1|root'], { reps: 0, seen: 6, wrong: 3 }, 'laptop');
});
await check('a setting changed on both: the later change wins', async () => {
  A.setOnline(false);
  B.storage.setItem('at_root', J(7));           // laptop first
  await B.engine.sync();
  A.storage.setItem('at_root', J(2));           // phone later, offline
  A.setOnline(true);
  await A.engine.sync(); await B.engine.sync();
  eq(A.storage.getItem('at_root'), J(2), 'phone'); eq(B.storage.getItem('at_root'), J(2), 'laptop');
});
await check('lists merge as sets: mastered chords added on each side', async () => {
  A.setOnline(false);
  A.storage.setItem('ct_mastered', J(['cmaj7', 'g7', 'dm7']));
  B.storage.setItem('ct_mastered', J(['g7', 'a7']));             // removed cmaj7, added a7
  await B.engine.sync(); A.setOnline(true); await A.engine.sync(); await B.engine.sync();
  eq(P(A.storage.getItem('ct_mastered')).sort(), ['a7', 'dm7', 'g7'], 'phone');
  eq(P(B.storage.getItem('ct_mastered')).sort(), ['a7', 'dm7', 'g7'], 'laptop');
});
await check('Reset progress on one device travels; a card practised elsewhere meanwhile survives', async () => {
  A.setOnline(false);
  A.storage.setItem('at_srs', J({}));                                   // reset on the phone
  const b = P(B.storage.getItem('at_srs')); b['4|octave'] = { reps: 1, seen: 1, wrong: 0 };
  B.storage.setItem('at_srs', J(b)); await B.engine.sync();
  A.setOnline(true); await A.engine.sync(); await B.engine.sync();
  eq(P(A.storage.getItem('at_srs')), { '4|octave': { reps: 1, seen: 1, wrong: 0 } }, 'phone');
  eq(P(B.storage.getItem('at_srs')), { '4|octave': { reps: 1, seen: 1, wrong: 0 } }, 'laptop');
});
await check('deleting a key travels', async () => {
  A.storage.setItem('at_focus', J({ shape: 3 })); await A.engine.sync(); await B.engine.sync();
  eq(B.storage.getItem('at_focus'), J({ shape: 3 }), 'arrived');
  A.storage.removeItem('at_focus'); await A.engine.sync(); await B.engine.sync();
  eq(B.storage.getItem('at_focus'), null, 'deleted on the laptop too');
});

console.log('\nThe open app is never changed underneath');
await check('changes for the OPEN app are held, not written, once the page has been touched', async () => {
  const L = B.load('at_');                    // the laptop is now showing Altered Trainer
  L.markInteracted();
  const before = B.storage.getItem('at_srs');
  const a = P(A.storage.getItem('at_srs')); a['5|root'] = { reps: 1, seen: 1, wrong: 0 };
  A.storage.setItem('at_srs', J(a));
  A.storage.setItem('ct_srs', J({ c1: { reps: 1 } }));   // another app's key
  await A.engine.sync(); await L.sync();
  eq(B.storage.getItem('at_srs'), before, 'Altered’s progress untouched while it runs');
  eq(P(B.storage.getItem('ct_srs')), { c1: { reps: 1 } }, 'other apps’ keys applied straight away');
  eq(L.getState().held, true, 'the "ready to refresh" note shows');
  eq(B.reloads, 0, 'no reload under your fingers');
});
await check('the app keeps writing meanwhile; on the next load both sides are merged', async () => {
  // Altered (still running on the laptop) saves a card from its OWN state.
  const mine = P(B.storage.getItem('at_srs')); mine['5|fill'] = { reps: 1, seen: 1, wrong: 0 };
  B.storage.setItem('at_srs', J(mine));
  await B.engine.sync();                       // held keys are not pushed stale
  const L2 = B.load('at_');                    // next page load: boot() applies the held change first
  const got = P(B.storage.getItem('at_srs'));
  ok(got['5|root'] && got['5|fill'], 'both the phone’s card and the laptop’s card: ' + J(Object.keys(got)));
  await L2.sync(); await A.engine.sync();
  eq(P(A.storage.getItem('at_srs')), got, 'and the phone gets the laptop’s card');
});
await check('at launch (page not touched yet) it reloads quietly instead', async () => {
  const L = B.load('at_');                     // fresh launch, nothing tapped
  const a = P(A.storage.getItem('at_srs')); a['5|build'] = { reps: 1, seen: 1, wrong: 0 };
  A.storage.setItem('at_srs', J(a)); await A.engine.sync();
  const r0 = B.reloads;
  await L.sync();
  eq(B.reloads, r0 + 1, 'reloaded once');
  ok(P(B.storage.getItem('at_srs'))['5|build'], 'and the data was in place before the reload');
});

console.log('\nOther people');
await check('one user can never see another’s progress', async () => {
  const M = device('mia-phone');
  await M.signIn('mia', 'mia-password');
  ok(M.storage.getItem('bs_srs') && !M.storage.getItem('at_srs') && !M.storage.getItem('ct_mastered'), 'mia gets only mia’s');
  ok(!A.storage.getItem('bs_srs'), 'zak never gets mia’s');
});
await check('a fresh device signing in keeps the ACCOUNT’s settings over its own defaults', async () => {
  const F = device('new-ipad');
  F.storage.setItem('at_root', J(7));          // the app wrote its default before sign-in
  F.storage.setItem('at_srs', J({ '9|root': { reps: 1, seen: 1, wrong: 0 } }));
  await F.signIn('zak', 'correct horse');
  eq(F.storage.getItem('at_root'), J(2), 'account setting kept');
  ok(P(F.storage.getItem('at_srs'))['9|root'] && P(F.storage.getItem('at_srs'))['5|root'], 'practice combined');
});
await check('a different person signing in on a used device never inherits the last one’s data', async () => {
  const S = device('shared');
  await S.signIn('zak', 'correct horse');
  ok(S.storage.getItem('at_srs'), 'zak’s data present');
  S.storage.setItem('dc_qcfg', J({ x: 1 }));
  await S.engine.sync();
  // zak's session lapses without signing out; mia signs in on the same device
  delete S.jar.fw_sid;
  await S.signIn('mia', 'mia-password');
  ok(!S.storage.getItem('at_srs') && !S.storage.getItem('dc_qcfg'), 'zak’s data cleared from the device');
  ok(S.storage.getItem('bs_srs'), 'mia’s present');
  const zakKeys = (await pg.query(`select key from fw_kv k join fw_users u on u.id = k.user_id where u.username = 'mia'`)).rows.map(r => r.key);
  ok(!zakKeys.includes('at_srs') && !zakKeys.includes('dc_qcfg'), 'and none of it went into mia’s account');
});
await check('signing out clears the device but keeps device-only settings', async () => {
  const O = device('borrowed');
  O.storage.setItem('fw_wakelock', '1');
  await O.signIn('zak', 'correct horse');
  ok(O.storage.getItem('at_srs'), 'had zak’s data');
  await O.api('logout'); O.engine.signOutLocal();
  ok(!O.storage.getItem('at_srs') && !O.storage.getItem('fwsync_base'), 'synced keys and bookkeeping gone');
  eq(O.storage.getItem('fw_wakelock'), '1', 'device setting kept');
  eq(await O.me(), null, 'session ended on the server');
});

console.log('\nPasswords');
await check('five wrong passwords lock the account for a while', async () => {
  const X = device('attacker');
  for (let i = 0; i < 5; i++) await X.api('login', { username: 'mia', password: 'wrong-' + i });
  const r = await X.api('login', { username: 'mia', password: 'mia-password' });
  eq(r.status, 429, 'locked even with the right password'); ok(/Try again in/.test(r.error), r.error);
  await pg.query(`update fw_users set locked_until = now() - interval '1 second' where username = 'mia'`);
  eq((await X.api('login', { username: 'mia', password: 'mia-password' })).status, 200, 'unlocked later');
});
await check('changing the password signs out the other devices, not this one', async () => {
  const r = await A.api('password', { current: 'correct horse', next: 'battery staple' });
  eq(r.status, 200, 'changed');
  ok(await A.me(), 'this device still signed in');
  eq(await B.me(), null, 'the laptop is signed out');
  await B.engine.sync(); eq(B.engine.getState().status, 'auth', 'its sync says "sign in again"');
  ok(B.storage.getItem('at_srs'), 'and keeps its data');
  await B.signIn('zak', 'battery staple');
  eq(B.engine.getState().status, 'idle', 'signs back in and carries on');
});
await check('a recovery code resets a forgotten password, once', async () => {
  const R = device('recover');
  const bad = await R.api('recover', { username: 'zak', code: 'AAAA-BBBB-CCCC-DDDD', next: 'new password 1' });
  eq(bad.status, 401, 'wrong code');
  const r = await R.api('recover', { username: 'zak', code: A.recovery.toLowerCase().replace(/-/g, ' '), next: 'new password 1' });
  eq(r.status, 200, 'right code (any case or spacing)'); ok(r.recoveryCode && r.recoveryCode !== A.recovery, 'a new code replaces it');
  eq((await R.api('recover', { username: 'zak', code: A.recovery, next: 'again again' })).status, 401, 'the old code is spent');
  eq(await A.me(), null, 'every other device signed out');
  eq((await R.api('login', { username: 'zak', password: 'new password 1' })).status, 200, 'new password works');
});
await check('the admin can reset someone’s password; nobody else can', async () => {
  const Z = device('admin'); await Z.api('login', { username: 'zak', password: 'new password 1' });
  const M = device('m'); await M.api('login', { username: 'mia', password: 'mia-password' });
  eq((await M.api('admin-reset', { username: 'zak', next: 'hijacked!!' })).status, 403, 'mia cannot');
  eq((await Z.api('admin-reset', { username: 'mia', next: 'fresh-start-1' })).status, 200, 'zak can');
  eq((await M.api('login', { username: 'mia', password: 'fresh-start-1' })).status, 200, 'mia uses the new one');
});
await check('deleting an account removes the user, sessions and every synced value', async () => {
  const D = device('deleter');
  await D.signUp('temp-user', 'temporary-1');
  D.storage.setItem('nt_srs', J({ a: 1 })); await D.engine.sync();
  eq((await D.api('delete', { password: 'wrong-pass' })).status, 401, 'needs the password');
  eq((await D.api('delete', { password: 'temporary-1' })).status, 200, 'deleted');
  const n = (await pg.query(`select (select count(*) from fw_users where username='temp-user') + (select count(*) from fw_kv k left join fw_users u on u.id=k.user_id where u.id is null) as n`)).rows[0].n;
  eq(Number(n), 0, 'nothing left behind');
});

console.log('\nMerge (spot checks; the full set is in fretworks-design)');
await check('a bare-string value comes back without gaining quotes', () => {
  eq(mergeValue('degrees', 'notes', 'degrees'), 'notes', 'exact string');
});

console.log(failures === 0 ? `\nAll checks passed. ${assertions} assertions.\n` : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
