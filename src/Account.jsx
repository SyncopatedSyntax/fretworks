import { useEffect, useState } from "react";
import { TopBar, tokens, account, useSyncState, TOOLS } from "@fretworks/design";

/* /account — sign in to sync progress across devices.
   Username + password, no email. Signing in is optional: without an account
   every trainer works exactly as before, on this device only. The sync itself
   runs on every page (the engine lives in @fretworks/design); this page only
   signs you in and out and manages the account. */

const ACCENT = "#4ecdc4";
const card = { background: "#13121f", borderWidth: 1, borderStyle: "solid", borderColor: "#2a2840", borderRadius: "13px", padding: "14px", marginBottom: "12px" };
const label = { fontSize: "10px", color: "#888", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" };
const input = { width: "100%", boxSizing: "border-box", background: "#0f0e17", border: "1px solid #2a2840", borderRadius: "8px", padding: "11px 10px", color: "#fff", fontSize: "16px", outline: "none" };
const btn = (primary, color = ACCENT) => ({
  padding: "10px 16px", borderRadius: "9px", cursor: "pointer", fontSize: "14px", fontWeight: 700,
  border: `1px solid ${primary ? color : "#2a2840"}`, background: primary ? color + "22" : "#13121f",
  color: primary ? color : "#aaa", minHeight: "44px", touchAction: "manipulation",
});
const note = { fontSize: "12px", color: "#888", lineHeight: 1.6 };

function ago(t) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleString();
}

// The hint sits OUTSIDE the label and is linked as a description, so a
// screen reader announces the field as "Password", not the whole hint.
let fieldSeq = 0;
function Field({ name, value, onChange, type = "text", hint, autoComplete }) {
  const [id] = useState(() => "fw-f" + ++fieldSeq);
  return (
    <div style={{ marginBottom: "10px" }}>
      <label htmlFor={id} style={{ ...label, display: "block" }}>{name}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} style={input}
        autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck="false"
        aria-describedby={hint ? id + "-h" : undefined} />
      {hint && <div id={id + "-h"} style={{ ...note, fontSize: "11px", marginTop: "4px" }}>{hint}</div>}
    </div>
  );
}

function Msg({ msg }) {
  if (!msg) return null;
  const okk = msg.kind === "ok";
  return (
    <div role="status" style={{ ...card, borderColor: okk ? ACCENT + "55" : "#ff636355", background: (okk ? ACCENT : "#ff6363") + "14", color: okk ? ACCENT : "#ffb3b3", fontSize: "13px", fontWeight: 600, lineHeight: 1.5 }}>
      {msg.text}
    </div>
  );
}

// Shown once, right after sign-up or a reset. It is the only way back in if
// the password is forgotten — there is no email.
function RecoveryCode({ code, onDone }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ ...card, borderColor: ACCENT + "66" }}>
      <div style={label}>Your recovery code</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, letterSpacing: "1.5px", color: "#fff", textAlign: "center", padding: "14px 6px", background: "#0f0e17", borderRadius: "9px", margin: "4px 0 10px", userSelect: "all", wordBreak: "break-all" }}>
        {code}
      </div>
      <p style={{ ...note, color: "#ccc", margin: "0 0 12px" }}>
        <b>Take a screenshot or write it down now.</b> If you ever forget your password, this code is the
        only way to set a new one — there’s no email to send a reset link to. It won’t be shown again.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {navigator.clipboard && (
          <button style={btn(false)} onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => {})}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
        <button style={{ ...btn(true), flex: 1 }} onClick={onDone}>I’ve saved it</button>
      </div>
    </div>
  );
}

function SignedOut({ onSignedIn, deviceUser }) {
  const [mode, setMode] = useState("in"); // in | up | recover
  const [f, setF] = useState({ username: deviceUser || "", password: "", code: "", next: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const hasGuestProgress = !deviceUser && (() => {
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (TOOLS.some((t) => t.storage && k.startsWith(t.storage))) return true; } } catch { /* private mode */ }
    return false;
  })();

  async function go() {
    setBusy(true); setMsg(null);
    const r = mode === "up" ? await account.signUp(f.username, f.password)
      : mode === "in" ? await account.signIn(f.username, f.password)
      : await account.recover(f.username, f.code, f.next);
    setBusy(false);
    if (!r.ok) { setMsg({ kind: "err", text: r.error || "That didn’t work. Try again." }); return; }
    onSignedIn(r.user, r.recoveryCode || null);
  }
  const tab = (id, text) => (
    <button onClick={() => { setMode(id); setMsg(null); }} style={{ ...btn(mode === id), flex: 1, fontSize: "13px" }}>{text}</button>
  );

  return (
    <>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {tab("in", "Sign in")}
        {tab("up", "Create account")}
      </div>
      <Msg msg={msg} />
      <form style={card} onSubmit={(e) => { e.preventDefault(); if (!busy) go(); }}>
        {mode === "recover" && (
          <p style={{ ...note, marginTop: 0 }}>Use the recovery code you saved when you made your account. You’ll get a new code afterwards.</p>
        )}
        <Field name="Username" value={f.username} onChange={set("username")} autoComplete="username"
          hint={mode === "up" ? "3–24 letters or numbers (. _ - allowed). Other people never see it." : null} />
        {mode === "recover"
          ? <>
              <Field name="Recovery code" value={f.code} onChange={set("code")} autoComplete="off" hint="Like K7QM-3XPD-9TRH-W2NB. Dashes and capitals don’t matter." />
              <Field name="New password" type={show ? "text" : "password"} value={f.next} onChange={set("next")} autoComplete="new-password" hint="At least 8 characters." />
            </>
          : <Field name="Password" type={show ? "text" : "password"} value={f.password} onChange={set("password")}
              autoComplete={mode === "up" ? "new-password" : "current-password"} hint={mode === "up" ? "At least 8 characters." : null} />}
        <label style={{ display: "flex", alignItems: "center", gap: "8px", ...note, marginBottom: "12px", minHeight: "32px" }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: "18px", height: "18px" }} /> Show password
        </label>
        {mode === "up" && hasGuestProgress && (
          <p style={{ ...note, marginTop: 0 }}>The progress already on this device will be added to your new account.</p>
        )}
        {mode === "in" && deviceUser && (
          <p style={{ ...note, marginTop: 0 }}>This device was last signed in as <b style={{ color: "#ccc" }}>{deviceUser}</b>. Signing in as someone else clears {deviceUser}’s progress from this device (it stays safe in their account).</p>
        )}
        <button type="submit" disabled={busy} style={{ ...btn(true), width: "100%", opacity: busy ? 0.6 : 1 }}>
          {busy ? "One moment…" : mode === "up" ? "Create account" : mode === "in" ? "Sign in" : "Set new password"}
        </button>
        {mode === "in" && (
          <button type="button" onClick={() => { setMode("recover"); setMsg(null); }} style={{ background: "none", border: "none", color: ACCENT, fontSize: "13px", fontWeight: 600, padding: "12px 0 2px", cursor: "pointer", minHeight: "40px" }}>
            Forgot your password?
          </button>
        )}
      </form>
      <div style={{ ...note, padding: "0 4px" }}>
        You don’t need an account to use Fretworks — without one, your progress just stays on this device.
      </div>
    </>
  );
}

function SignedIn({ user, onSignedOut }) {
  const s = useSyncState();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [codePw, setCodePw] = useState("");
  const [code, setCode] = useState(null);
  const [del, setDel] = useState({ open: false, password: "" });
  const [adm, setAdm] = useState({ username: "", next: "" });
  const [confirmOut, setConfirmOut] = useState(false);

  const run = async (name, fn) => { setBusy(name); setMsg(null); try { await fn(); } finally { setBusy(""); } };
  const status = s.status === "syncing" ? "Syncing…"
    : s.status === "offline" ? "Offline — it will sync when you’re back online."
    : s.status === "auth" ? "This device was signed out on the server. Sign out and back in."
    : s.status === "error" ? "Couldn’t reach the server. It will try again."
    : s.last ? `Synced ${ago(s.last)}` : "Not synced yet";

  return (
    <>
      <Msg msg={msg} />
      {code && <RecoveryCode code={code} onDone={() => setCode(null)} />}

      <div style={card}>
        <div style={label}>Signed in</div>
        <div style={{ fontSize: "20px", fontWeight: 900, color: "#fff", fontFamily: "var(--font-heading)" }}>{user.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "160px", fontSize: "13px", color: s.status === "auth" || s.status === "error" ? "#ffb3b3" : "#ccc" }}>☁ {status}</div>
          <button style={btn(false)} disabled={busy === "sync"} onClick={() => run("sync", () => account.syncNow())}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
        </div>
        <p style={{ ...note, margin: "12px 0 0" }}>
          Your progress and settings in every Fretworks tool follow you to any device you sign in on. Practise
          offline as much as you like — it catches up next time you’re online. A few things stay on each
          device: install hints, “keep screen on”, and GitHub backup settings.
        </p>
      </div>

      <form style={card} onSubmit={(e) => { e.preventDefault(); run("pw", async () => {
        const r = await account.changePassword(pw.current, pw.next);
        if (r.ok) { setPw({ current: "", next: "" }); setMsg({ kind: "ok", text: "Password changed. Your other devices will need to sign in again with the new one." }); }
        else setMsg({ kind: "err", text: r.error });
      }); }}>
        <div style={label}>Change password</div>
        <Field name="Current password" type="password" value={pw.current} onChange={(v) => setPw((x) => ({ ...x, current: v }))} autoComplete="current-password" />
        <Field name="New password" type="password" value={pw.next} onChange={(v) => setPw((x) => ({ ...x, next: v }))} autoComplete="new-password" hint="At least 8 characters. Your other devices will be signed out." />
        <button type="submit" disabled={busy === "pw"} style={btn(true)}>{busy === "pw" ? "Changing…" : "Change password"}</button>
      </form>

      <form style={card} onSubmit={(e) => { e.preventDefault(); run("code", async () => {
        const r = await account.newRecoveryCode(codePw);
        if (r.ok) { setCodePw(""); setCode(r.recoveryCode); } else setMsg({ kind: "err", text: r.error });
      }); }}>
        <div style={label}>Recovery code</div>
        <p style={{ ...note, marginTop: 0 }}>Lost the code you saved? Make a new one — the old one stops working.</p>
        <Field name="Password" type="password" value={codePw} onChange={setCodePw} autoComplete="current-password" />
        <button type="submit" disabled={busy === "code"} style={btn(false)}>{busy === "code" ? "One moment…" : "Make a new recovery code"}</button>
      </form>

      <div style={card}>
        <div style={label}>Sign out</div>
        <p style={{ ...note, marginTop: 0 }}>
          Signing out removes your progress from <b>this</b> device, so the next person starts fresh. It stays
          safe in your account — sign in again and it all comes back.
        </p>
        {confirmOut && (
          <p style={{ ...note, color: "#ffb3b3", fontWeight: 600 }}>
            Some progress from this device hasn’t reached the server yet — probably because you’re offline.
            Signing out now loses it. Connect and tap Sync now first, or sign out anyway.
          </p>
        )}
        <button style={btn(confirmOut, "#ff6363")} disabled={busy === "out"} onClick={() => run("out", async () => {
          const r = await account.signOut({ force: confirmOut });
          if (r.unsynced) { setConfirmOut(true); return; }
          onSignedOut();
        })}>{busy === "out" ? "Signing out…" : confirmOut ? "Sign out anyway" : "Sign out"}</button>
      </div>

      {user.admin && (
        <form style={{ ...card, borderColor: "#ffd93d44" }} onSubmit={(e) => { e.preventDefault(); run("adm", async () => {
          const r = await account.adminReset(adm.username, adm.next);
          if (r.ok) { setMsg({ kind: "ok", text: `${adm.username}’s password is reset. Tell them the new one; they can change it under Account.` }); setAdm({ username: "", next: "" }); }
          else setMsg({ kind: "err", text: r.error });
        }); }}>
          <div style={label}>Admin — reset someone’s password</div>
          <p style={{ ...note, marginTop: 0 }}>For someone who lost both their password and their recovery code. Signs them out everywhere.</p>
          <Field name="Their username" value={adm.username} onChange={(v) => setAdm((x) => ({ ...x, username: v }))} autoComplete="off" />
          <Field name="New password for them" value={adm.next} onChange={(v) => setAdm((x) => ({ ...x, next: v }))} autoComplete="off" hint="At least 8 characters." />
          <button type="submit" disabled={busy === "adm"} style={btn(true, "#ffd93d")}>Reset password</button>
        </form>
      )}

      <div style={{ ...card, borderColor: "#ff636333" }}>
        <div style={label}>Delete account</div>
        {!del.open ? (
          <>
            <p style={{ ...note, marginTop: 0 }}>Deletes your account and everything synced to it. Progress on this device is removed too.</p>
            <button style={btn(false)} onClick={() => setDel({ open: true, password: "" })}>Delete my account…</button>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); run("del", async () => {
            const r = await account.deleteAccount(del.password);
            if (r.ok) onSignedOut("Your account and its data have been deleted.");
            else setMsg({ kind: "err", text: r.error });
          }); }}>
            <p style={{ ...note, color: "#ffb3b3", marginTop: 0 }}>This can’t be undone. Type your password to confirm.</p>
            <Field name="Password" type="password" value={del.password} onChange={(v) => setDel((x) => ({ ...x, password: v }))} autoComplete="current-password" />
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" style={btn(true, "#ff6363")} disabled={busy === "del"}>Delete forever</button>
              <button type="button" style={btn(false)} onClick={() => setDel({ open: false, password: "" })}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

export default function Account() {
  const [user, setUser] = useState(undefined);   // undefined = still checking
  const [code, setCode] = useState(null);
  const [flash, setFlash] = useState(null);
  useEffect(() => { account.me().then((u) => setUser(u)); }, []);
  const deviceUser = account.deviceUser();

  return (
    <div style={{ background: tokens.bg, color: tokens.text, minHeight: "100vh", fontFamily: "var(--font-body)", WebkitFontSmoothing: "antialiased" }}>
      <TopBar homeHref="/" />
      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "18px 14px 40px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 900, margin: "0 0 4px", fontFamily: "var(--font-heading)" }}>Account</h1>
        <p style={{ fontSize: "13px", color: "#999", lineHeight: 1.6, margin: "0 0 16px" }}>
          Sign in to keep your progress in sync across your phone, tablet and computer.
        </p>
        <Msg msg={flash} />
        {user === undefined ? (
          <div style={{ ...note, padding: "20px 4px" }}>Checking…</div>
        ) : code ? (
          <RecoveryCode code={code} onDone={() => setCode(null)} />
        ) : user ? (
          <SignedIn user={user} onSignedOut={(text) => { setUser(null); setFlash(text ? { kind: "ok", text } : { kind: "ok", text: "Signed out. Your progress has been removed from this device." }); }} />
        ) : (
          <SignedOut deviceUser={deviceUser} onSignedIn={(u, c) => { setFlash(null); setUser(u); if (c) setCode(c); }} />
        )}
        <div style={{ textAlign: "center", marginTop: "18px" }}>
          <a href="/app" style={{ color: ACCENT, fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>← All tools</a>
        </div>
      </main>
    </div>
  );
}
