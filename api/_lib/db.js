// Database access for the account + sync API.
//
// Production: Neon Postgres over HTTP (@neondatabase/serverless), using the
// DATABASE_URL the Vercel ↔ Neon integration adds to the project.
// Tests: scripts/verify-sync.mjs plugs in PGlite (real Postgres, in-process)
// through setDb(), so the same SQL is exercised without a network.
//
// Two calls only:
//   query(text, params)   -> rows
//   batch([{text,params}]) -> rows[] — one round trip, one transaction

let impl = null;
let migrated = null;

export function setDb(d) { impl = d; migrated = null; }
export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

async function neonDb() {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(dbUrl());
  return {
    query: (text, params = []) => sql.query(text, params),
    batch: qs => qs.length ? sql.transaction(tx => qs.map(q => tx.query(q.text, q.params || []))) : Promise.resolve([]),
  };
}

// Schema. Idempotent; runs once per cold start.
//   fw_users     one row per account. username is stored lowercased (unique),
//                display keeps what was typed. Passwords and recovery codes
//                are stored only as hashes.
//   fw_sessions  signed-in devices. Only a SHA-256 of the cookie token is kept,
//                so a database leak cannot be replayed as a session.
//   fw_kv        each user's synced localStorage, one row per key. `rev` comes
//                from one global sequence, so "everything after rev N" is a
//                cheap, ordered pull. value NULL = the key was deleted.
//   fw_rate      fixed-window counters for login/sign-up throttling.
const SCHEMA = [
  `create table if not exists fw_users (
     id bigserial primary key,
     username text not null unique,
     display text not null,
     pass_hash text not null,
     recovery_hash text not null,
     created_at timestamptz not null default now(),
     fail_count int not null default 0,
     locked_until timestamptz)`,
  `create table if not exists fw_sessions (
     token_hash text primary key,
     user_id bigint not null references fw_users(id) on delete cascade,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null)`,
  `create index if not exists fw_sessions_user on fw_sessions(user_id)`,
  `create sequence if not exists fw_rev_seq`,
  `create table if not exists fw_kv (
     user_id bigint not null references fw_users(id) on delete cascade,
     key text not null,
     value text,
     rev bigint not null,
     t bigint not null default 0,
     device text,
     primary key (user_id, key))`,
  `create index if not exists fw_kv_rev on fw_kv(user_id, rev)`,
  `create table if not exists fw_rate (
     bucket text primary key,
     n int not null,
     reset_at timestamptz not null)`,
];

export async function db() {
  if (!impl) {
    if (!dbUrl()) throw Object.assign(new Error('No database is connected to this project.'), { code: 'NO_DB' });
    impl = await neonDb();
  }
  if (!migrated) migrated = (async () => { for (const s of SCHEMA) await impl.query(s); })().catch(e => { migrated = null; throw e; });
  await migrated;
  return impl;
}
