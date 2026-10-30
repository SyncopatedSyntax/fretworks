import { useEffect } from "react";
import { TopBar, InstallPrompt, TOOLS, TOOL_GROUPS, tokens, SyncStatus } from "@fretworks/design";

// Family heading above each group of cards — the same families as the brochure.
const GROUP_HEAD = {
  fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, letterSpacing: ".08em",
  textTransform: "uppercase", color: tokens.faint, margin: "22px 2px 10px",
};
import { maybeAutoBackup } from "./lib/githubBackup.js";

/* /app — the fast launcher for returning users and the installed PWA. No sales
   copy: just the global chrome (top bar + tool drawer) and a tap-to-open grid.
   The installed app's start_url points here. */
export default function Launcher() {
  // The launcher is the installed app's start_url, so opening the toolbox is
  // the one moment a backup can reliably be triggered — a PWA gets no real
  // background scheduling. No-ops unless connected and actually due.
  useEffect(() => { void maybeAutoBackup(); }, []);

  return (
    <div style={{ background: tokens.bg, color: tokens.text, minHeight: "100vh", fontFamily: "var(--font-body)", WebkitFontSmoothing: "antialiased" }}>
      <TopBar homeHref="/" />
      <main className="fw-launcher">
        <h1 className="fw-launcher-title">Your toolbox</h1>
        <p className="fw-launcher-sub">Pick a trainer to jump straight in.</p>
        {/* Same line as the drawer: sign in to sync, or who is signed in and when
            it last synced. The launcher is where people land, so it is shown here too. */}
        <div style={{ margin: "0 -10px 14px" }}><SyncStatus /></div>

        {TOOL_GROUPS.map((g, i) => (
          <section key={g.key}>
            <h2 style={i === 0 ? { ...GROUP_HEAD, marginTop: "6px" } : GROUP_HEAD}>{g.name}</h2>
            <div className="fw-launcher-grid">
              {TOOLS.filter((t) => t.group === g.key).map((t) => (
                <a
                  key={t.key}
                  className="fw-launch-card"
                  href={t.path}
                  style={{ "--accent": t.accent }}
                  aria-label={"Open " + t.name}
                >
                  <span className="fw-launch-emoji" aria-hidden="true">{t.emoji}</span>
                  <span className="fw-launch-body">
                    <span className="fw-launch-name">{t.name}</span>
                    <span className="fw-launch-blurb">{t.blurb}</span>
                    <span className="fw-launch-skill">{t.skill}</span>
                  </span>
                  <span className="fw-launch-go" aria-hidden="true">→</span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <div style={{ textAlign: "center", marginTop: "22px" }}>
          <a href="/backup" style={{ color: "#8a88a0", fontSize: "12px", textDecoration: "none" }}>
            ☁ Back up your progress
          </a>
        </div>
      </main>
      <InstallPrompt />
    </div>
  );
}
