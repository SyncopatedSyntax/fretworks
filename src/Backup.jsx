import { useEffect, useState } from "react";
import { TopBar, tokens } from "@fretworks/design";
import {
  DEFAULT_CONFIG, backupNow, clearConfig, clearLog, fetchBackup,
  getConfig, getLog, saveConfig, testConnection,
} from "./lib/githubBackup.js";
import { applySnapshot, buildSnapshot, summarize } from "./lib/snapshot.js";

/* /backup — one place to back the whole toolbox up to a private GitHub repo.
   It lives in the shell rather than in each trainer because all seven are
   proxied onto this origin, so one sweep of localStorage already covers them
   all (see lib/snapshot.js). */

const ACCENT = "#4ecdc4";
const INTERVALS = [
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Daily" },
  { hours: 168, label: "Weekly" },
];

const card = { background: "#13121f", border: "1px solid #2a2840", borderRadius: "13px", padding: "14px", marginBottom: "12px" };
const label = { fontSize: "10px", color: "#888", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" };
const input = { width: "100%", background: "#0f0e17", border: "1px solid #2a2840", borderRadius: "8px", padding: "10px", color: "#fff", fontSize: "16px", outline: "none" };
const btn = (primary, color = ACCENT) => ({
  padding: "10px 16px", borderRadius: "9px", cursor: "pointer", fontSize: "13px", fontWeight: 700,
  border: `1px solid ${primary ? color : "#2a2840"}`, background: primary ? color + "22" : "#13121f",
  color: primary ? color : "#999", minHeight: "44px", touchAction: "manipulation",
});

const relTime = (iso) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function Backup() {
  const [cfg, setCfg] = useState(() => getConfig());
  const [form, setForm] = useState(() => getConfig() || { ...DEFAULT_CONFIG });
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }
  const [pending, setPending] = useState(null); // fetched snapshot awaiting confirmation
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState([]);

  useEffect(() => { if (logOpen) setLog(getLog()); }, [logOpen]);

  const say = (kind, text) => setMsg({ kind, text });
  const local = summarize(buildSnapshot().data);
  const localTotal = local.reduce((s, r) => s + r.n, 0);

  const connect = async () => {
    if (!form.token.trim() || !form.owner.trim() || !form.repo.trim()) return say("err", "Token, owner and repo are all needed");
    setBusy("connect");
    const candidate = { ...DEFAULT_CONFIG, ...form, token: form.token.trim(), owner: form.owner.trim(), repo: form.repo.trim() };
    const res = await testConnection(candidate);
    setBusy("");
    if (!res.ok) return say("err", res.error);
    saveConfig(candidate);
    setCfg(getConfig());
    say("ok", "Connected. Nothing has been backed up yet — tap Back up now.");
  };

  const doBackup = async () => {
    setBusy("backup"); setMsg(null);
    try {
      const n = await backupNow();
      setCfg(getConfig());
      say("ok", `Backed up ${n} keys.`);
    } catch (err) { setCfg(getConfig()); say("err", err.message); }
    setBusy("");
  };

  const doFetch = async () => {
    setBusy("fetch"); setMsg(null);
    try { setPending(await fetchBackup()); }
    catch (err) { say("err", err.message); }
    setBusy("");
  };

  const doRestore = (replace) => {
    try {
      const n = applySnapshot(pending, { replace });
      setPending(null);
      say("ok", `Restored ${n} keys. Reopen a trainer to see it.`);
    } catch (err) { say("err", err.message); }
  };

  const disconnect = () => { clearConfig(); setCfg(null); setForm({ ...DEFAULT_CONFIG }); setConfirmDisconnect(false); say("ok", "Disconnected. The token has been removed from this device."); };

  const setAuto = (patch) => { const next = { ...getConfig(), ...patch }; saveConfig(next); setCfg(next); };

  return (
    <div style={{ background: tokens.bg, color: tokens.text, minHeight: "100vh", fontFamily: "var(--font-body)", WebkitFontSmoothing: "antialiased" }}>
      <TopBar homeHref="/" />
      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "18px 14px 40px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 900, margin: "0 0 4px", fontFamily: "var(--font-heading)" }}>Backup</h1>
        <p style={{ fontSize: "13px", color: "#999", lineHeight: 1.6, margin: "0 0 16px" }}>
          Every trainer stores its progress on this device. This copies all of it into a private GitHub repo you own, so a cleared browser or a new phone doesn't lose it.
        </p>

        {msg && (
          <div style={{ ...card, borderColor: msg.kind === "ok" ? ACCENT + "55" : "#ff636355", background: (msg.kind === "ok" ? ACCENT : "#ff6363") + "14", color: msg.kind === "ok" ? ACCENT : "#ffb3b3", fontSize: "12px", fontWeight: 600 }}>
            {msg.text}
          </div>
        )}

        {/* What's on this device */}
        <div style={card}>
          <div style={label}>On this device</div>
          {localTotal === 0 ? (
            <div style={{ fontSize: "13px", color: "#888" }}>Nothing saved yet. Use a trainer first.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {local.map((r) => (
                <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span aria-hidden="true">{r.emoji}</span>
                  <span style={{ color: "#ddd", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: r.accent, fontFamily: "var(--font-mono)", fontSize: "11px" }}>{r.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!cfg ? (
          /* ── Connect ─────────────────────────────────────────────────── */
          <div style={card}>
            <div style={label}>Connect a repo</div>
            <ol style={{ fontSize: "12px", color: "#999", lineHeight: 1.7, paddingLeft: "18px", margin: "0 0 12px" }}>
              <li>Make a <b>private</b> repo on GitHub (e.g. <code style={{ color: ACCENT }}>FretworksBackup</code>).</li>
              <li>Create a <b>fine-grained</b> token: GitHub → Settings → Developer settings → Personal access tokens.</li>
              <li>Give it access to <b>that one repo only</b>, with <b>Contents: Read and write</b>.</li>
            </ol>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <div style={label}>Token</div>
                <input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="github_pat_…" style={input} autoComplete="off" spellCheck="false" />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <div style={label}>Owner</div>
                  <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="SyncopatedSyntax" style={input} autoCapitalize="none" spellCheck="false" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={label}>Repo</div>
                  <input value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} placeholder="FretworksBackup" style={input} autoCapitalize="none" spellCheck="false" />
                </div>
              </div>
              <button onClick={() => setAdvanced((v) => !v)} style={{ ...btn(false), alignSelf: "flex-start", minHeight: "36px", padding: "6px 10px", fontSize: "11px" }}>
                {advanced ? "Hide" : "Branch and folder"}
              </button>
              {advanced && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>Branch</div>
                    <input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} style={input} autoCapitalize="none" spellCheck="false" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>Folder (optional)</div>
                    <input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="backups" style={input} autoCapitalize="none" spellCheck="false" />
                  </div>
                </div>
              )}
              <button onClick={connect} disabled={busy === "connect"} style={{ ...btn(true), opacity: busy === "connect" ? 0.5 : 1 }}>
                {busy === "connect" ? "Checking…" : "Connect"}
              </button>
              <div style={{ fontSize: "10px", color: "#666", lineHeight: 1.6 }}>
                The token is stored on this device only. Keep it scoped to the one backup repo — anything with wider access would be worth more than the data it protects.
              </div>
            </div>
          </div>
        ) : (
          /* ── Connected ───────────────────────────────────────────────── */
          <>
            <div style={card}>
              <div style={label}>Connected</div>
              <div style={{ fontSize: "13px", color: "#fff", fontWeight: 700, wordBreak: "break-all" }}>{cfg.owner}/{cfg.repo}</div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                branch {cfg.branch}{cfg.path ? ` · ${cfg.path}/` : ""} · last backup {relTime(cfg.lastAt)}
                {cfg.lastStatus === "error" && <span style={{ color: "#ff8f8f" }}> · failed</span>}
              </div>
              {cfg.lastStatus === "error" && cfg.lastError && (
                <div style={{ fontSize: "11px", color: "#ffb3b3", marginTop: "6px" }}>{cfg.lastError}</div>
              )}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                <button onClick={doBackup} disabled={!!busy} style={{ ...btn(true), flex: 1, opacity: busy ? 0.5 : 1 }}>
                  {busy === "backup" ? "Backing up…" : "Back up now"}
                </button>
                <button onClick={doFetch} disabled={!!busy} style={{ ...btn(false), flex: 1, opacity: busy ? 0.5 : 1 }}>
                  {busy === "fetch" ? "Fetching…" : "Restore…"}
                </button>
              </div>
            </div>

            <div style={card}>
              <div style={label}>Automatic</div>
              <label style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13px", color: "#ddd" }}>
                <input type="checkbox" checked={!!cfg.autoEnabled} onChange={(e) => setAuto({ autoEnabled: e.target.checked })} />
                Back up when the app opens
              </label>
              {cfg.autoEnabled && (
                <select value={cfg.intervalHours} onChange={(e) => setAuto({ intervalHours: Number(e.target.value) })} style={{ ...input, marginTop: "10px" }}>
                  {INTERVALS.map((i) => <option key={i.hours} value={i.hours}>{i.label}</option>)}
                </select>
              )}
              <div style={{ fontSize: "10px", color: "#666", marginTop: "8px", lineHeight: 1.6 }}>
                Checked when you open the toolbox, not in the background — a web app can't reliably wake itself up, especially on iPhone.
              </div>
            </div>

            <div style={card}>
              <button onClick={() => setLogOpen((v) => !v)} style={{ ...btn(false), width: "100%" }}>{logOpen ? "Hide" : "Show"} diagnostics</button>
              {logOpen && (
                <>
                  <pre style={{ fontSize: "10px", color: "#999", background: "#0f0e17", border: "1px solid #2a2840", borderRadius: "8px", padding: "9px", marginTop: "10px", maxHeight: "220px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {log.length ? log.map((e) => `[${e.time.slice(11, 19)}] ${e.status.toUpperCase()} ${e.step} — ${e.detail}`).join("\n") : "(nothing logged yet)"}
                  </pre>
                  <button onClick={() => { clearLog(); setLog([]); }} style={{ ...btn(false), marginTop: "8px" }}>Clear log</button>
                </>
              )}
              <div style={{ marginTop: "10px" }}>
                {confirmDisconnect ? (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={disconnect} style={{ ...btn(true, "#ff6363"), flex: 1 }}>Really disconnect</button>
                    <button onClick={() => setConfirmDisconnect(false)} style={btn(false)}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDisconnect(true)} style={{ ...btn(false, "#ff6363"), width: "100%", color: "#ff8f8f", borderColor: "#ff636333" }}>Disconnect</button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Restore confirmation — fetched, never applied without a decision. */}
        {pending && (
          <div style={{ ...card, borderColor: ACCENT + "66" }}>
            <div style={label}>Restore this backup?</div>
            <div style={{ fontSize: "12px", color: "#999", marginBottom: "10px" }}>
              Saved {new Date(pending.exported).toLocaleString()} · {Object.keys(pending.data).length} keys
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "12px" }}>
              {summarize(pending.data).map((r) => (
                <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span aria-hidden="true">{r.emoji}</span>
                  <span style={{ color: "#ddd", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: r.accent, fontFamily: "var(--font-mono)", fontSize: "11px" }}>{r.n}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button onClick={() => doRestore(false)} style={btn(true)}>Merge into what's here</button>
              <button onClick={() => doRestore(true)} style={btn(false, "#ff6363")}>Replace everything on this device</button>
              <button onClick={() => setPending(null)} style={btn(false)}>Cancel</button>
            </div>
            <div style={{ fontSize: "10px", color: "#666", marginTop: "9px", lineHeight: 1.6 }}>
              Merge overwrites only the keys in the backup. Replace clears this device's saved progress first — use it on a new phone, not to fix one trainer.
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "18px" }}>
          <a href="/app" style={{ color: "#888", fontSize: "12px" }}>← Back to your toolbox</a>
        </div>
      </main>
    </div>
  );
}
