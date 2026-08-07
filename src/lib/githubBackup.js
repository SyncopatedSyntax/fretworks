// Backing the toolbox up to a GitHub repo.
//
// Ported from FrugalTracker's src/lib/githubBackup.ts, which has been running
// against a private backup repo for a while — same mechanism, adapted from its
// IndexedDB/TypeScript setting to this one. Worth keeping the shapes close so a
// fix in either can be carried across.
//
// The mechanism is deliberately small: a fine-grained personal access token
// with Contents read/write on one private repo, and the GitHub Contents API.
// No OAuth app, no backend, no git client in the browser. The file has a fixed
// name and is overwritten every time — git's own commit history on that path
// IS the backup history, so there are no timestamped snapshots to manage or
// prune.
//
// The token is stored on this device, in localStorage. Any script running on
// this origin can read it, so the token should be fine-grained and scoped to
// the single backup repo and nothing else. That keeps the worst case to "one
// private repo of practice data", which is a very different thing from a
// classic token with repo-wide scope.

import { RESERVED_PREFIX, buildSnapshot, isValidSnapshot } from "./snapshot.js";

const CONFIG_KEY = RESERVED_PREFIX + "config";
const LOG_KEY = RESERVED_PREFIX + "log";
const LOG_MAX = 40;

/** Fixed filename, overwritten each time — see the note above about history. */
export const BACKUP_FILENAME = "fretworks-backup.json";

// ── Config ────────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  token: "", owner: "", repo: "", branch: "main", path: "",
  autoEnabled: true, intervalHours: 24,
  lastAt: "", lastStatus: "", lastError: "",
};

export function getConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : null;
  } catch { return null; }
}

export function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...cfg }));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

const patchConfig = (patch) => { const c = getConfig(); if (c) saveConfig({ ...c, ...patch }); };

// ── Diagnostics ───────────────────────────────────────────────────────────
// A rolling on-device trail. Auto-backup runs unattended, and a request that
// dies before any response ("Load failed") leaves nothing else to go on — so
// every network step gets an entry. The token is never written here.
export function getLog() {
  try { const raw = localStorage.getItem(LOG_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
export function clearLog() { localStorage.removeItem(LOG_KEY); }

function logStep(step, status, detail) {
  const log = getLog();
  log.push({ time: new Date().toISOString(), step, status, detail });
  while (log.length > LOG_MAX) log.shift();
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* never break a backup over its own log */ }
}

// ── HTTP ──────────────────────────────────────────────────────────────────
const errText = (err) => (err instanceof Error ? `${err.name}: ${err.message}` : "Unknown error");
const apiBase = (c) => `https://api.github.com/repos/${c.owner}/${c.repo}`;
const authHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" });
const toBase64 = (s) => btoa(unescape(encodeURIComponent(s)));
const fromBase64 = (s) => decodeURIComponent(escape(atob(String(s).replace(/\n/g, ""))));

function filePath(cfg) {
  const trimmed = (cfg.path || "").replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/${BACKUP_FILENAME}` : BACKUP_FILENAME;
}

async function loggedFetch(step, url, init) {
  try {
    const res = await fetch(url, init);
    logStep(step, res.ok || res.status === 404 ? "ok" : "error", `HTTP ${res.status} — ${url}`);
    return res;
  } catch (err) {
    logStep(step, "error", `${errText(err)} — online: ${navigator.onLine} — ${url}`);
    throw err;
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS = [400, 1200];

/** Retry only a network-layer TypeError — the "Load failed"/"Failed to fetch" a
 * browser throws when a request is cut off before any response arrives, most
 * often on iOS when the web view is suspended mid-request. Those succeed on an
 * immediate retry. A real HTTP status (thrown as a plain Error: 401, 403, 409)
 * is NOT retried — that is a genuine problem the user has to see. `op` re-runs
 * whole, so a retried PUT re-reads the file's sha instead of reusing a stale
 * one, which would 409 if a lost-response PUT had actually landed. */
async function withRetry(label, op) {
  for (let attempt = 0; ; attempt++) {
    try { return await op(); }
    catch (err) {
      if (!(err instanceof TypeError) || attempt >= RETRY_DELAYS.length) throw err;
      logStep(label, "ok", `transient network error — retrying (${attempt + 2}/${RETRY_DELAYS.length + 1})`);
      await delay(RETRY_DELAYS[attempt]);
    }
  }
}

// ── GitHub Contents API ───────────────────────────────────────────────────
export async function testConnection(cfg) {
  try {
    const res = await loggedFetch("testConnection", apiBase(cfg), { headers: authHeaders(cfg.token) });
    if (res.status === 404) return { ok: false, error: "Repo not found — check the owner/repo, and that the token can see it" };
    if (res.status === 401) return { ok: false, error: "GitHub rejected the token (401)" };
    if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not reach GitHub — ${errText(err)}` };
  }
}

async function getFileSha(cfg) {
  const url = `${apiBase(cfg)}/contents/${filePath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await loggedFetch("getFileSha", url, { headers: authHeaders(cfg.token) });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  return (await res.json()).sha;
}

async function putFile(cfg, content, message) {
  const encoded = toBase64(content);
  await withRetry("putFile", async () => {
    const sha = await getFileSha(cfg);
    const res = await loggedFetch("putFile", `${apiBase(cfg)}/contents/${filePath(cfg)}`, {
      method: "PUT",
      headers: { ...authHeaders(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: encoded, branch: cfg.branch, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  });
}

// ── The two operations ────────────────────────────────────────────────────
export async function backupNow() {
  const cfg = getConfig();
  if (!cfg?.token) throw new Error("Not connected to GitHub");
  logStep("backupNow", "ok", `started — ${cfg.owner}/${cfg.repo}@${cfg.branch}`);
  try {
    const snapshot = buildSnapshot();
    const n = Object.keys(snapshot.data).length;
    await putFile(cfg, JSON.stringify(snapshot, null, 2), `Fretworks backup — ${n} keys`);
    patchConfig({ lastAt: new Date().toISOString(), lastStatus: "success", lastError: "" });
    logStep("backupNow", "ok", `completed — ${n} keys`);
    return n;
  } catch (err) {
    patchConfig({ lastAt: new Date().toISOString(), lastStatus: "error", lastError: errText(err) });
    logStep("backupNow", "error", errText(err));
    throw err;
  }
}

/** Fetches and validates, but does NOT apply — the caller confirms with the
 * user first, then calls applySnapshot. Restoring is the destructive direction,
 * so it never happens straight off the network. */
export async function fetchBackup() {
  const cfg = getConfig();
  if (!cfg?.token) throw new Error("Not connected to GitHub");
  logStep("fetchBackup", "ok", `started — ${cfg.owner}/${cfg.repo}@${cfg.branch}`);
  try {
    const snapshot = await withRetry("getFileContent", async () => {
      const url = `${apiBase(cfg)}/contents/${filePath(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
      const res = await loggedFetch("getFileContent", url, { headers: authHeaders(cfg.token) });
      if (res.status === 404) throw new Error("No backup in that repo yet");
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      return JSON.parse(fromBase64((await res.json()).content));
    });
    if (!isValidSnapshot(snapshot)) throw new Error("That file is not a Fretworks backup");
    logStep("fetchBackup", "ok", `completed — ${Object.keys(snapshot.data).length} keys`);
    return snapshot;
  } catch (err) {
    logStep("fetchBackup", "error", errText(err));
    throw err;
  }
}

/** Opportunistic auto-backup, checked when the shell opens. A PWA cannot rely
 * on real background scheduling — iOS especially — so "automatic" means "on
 * next open, if due". Silent by design: it runs unattended, and the outcome is
 * recorded on the config for the Backup screen to show. */
export async function maybeAutoBackup() {
  const cfg = getConfig();
  if (!cfg?.token || !cfg.autoEnabled) return;
  const last = cfg.lastAt ? new Date(cfg.lastAt).getTime() : 0;
  if (Date.now() < last + cfg.intervalHours * 3600_000) return;
  logStep("maybeAutoBackup", "ok", "due — triggering backupNow");
  try { await backupNow(); } catch { /* recorded on the config by backupNow */ }
}
