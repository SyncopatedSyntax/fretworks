import { useEffect } from "react";
import { TopBar, InstallPrompt, TOOLS, tokens } from "@fretworks/design";
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

        <div className="fw-launcher-grid">
          {TOOLS.map((t) => (
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
