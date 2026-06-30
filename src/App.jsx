import { useEffect, useState } from "react";
import { BRAND, STUDIO, MAKER, KOFI, TOOLS, LEARNING_PATH as PATH } from "@fretworks/design";

/* ──────────────────────────────────────────────────────────────────────────
   Fretworks — landing portal for new visitors. Brand, tool registry, learning
   path and Ko-fi link all come from @fretworks/design — the single source of
   truth shared with the launcher, the in-tool drawer and the trainers.
   Card banners are real app screenshots, served from public/shots/<key>.webp.
   ────────────────────────────────────────────────────────────────────────── */

// Card banner screenshots (cropped WebP), served as static files.
const SHOTS = {
  chord: "/shots/chord.webp",
  diatonic: "/shots/diatonic.webp",
  mm: "/shots/mm.webp",
  alt: "/shots/alt.webp",
  circle: "/shots/circle.webp",
  triads: "/shots/triads.webp",
};

// Hero fretboard — cycles through 4 real, theory-verified patterns (one per app).
// s = string (1=high e .. 6=low E), f = relative fret in window, d = degree label.
const PATTERNS = [{"name":"maj7 chord","sub":"Chord Trainer","start":2,"dots":[{"s":5,"f":1,"d":"R","c":"#ff4757","ring":true,"t":"#0f0e17"},{"s":4,"f":3,"d":"5","c":"#778ca3","ring":false,"t":"#0f0e17"},{"s":3,"f":2,"d":"7","c":"#ff6b6b","ring":false,"t":"#0f0e17"},{"s":2,"f":3,"d":"3","c":"#ffd93d","ring":false,"t":"#0f0e17"}],"mutes":[6,1]},{"name":"melodic minor","sub":"Melodic Minor","start":5,"dots":[{"s":3,"f":0,"d":"R","c":"#ff4757","ring":true,"t":"#0f0e17"},{"s":1,"f":3,"d":"R","c":"#ff4757","ring":true,"t":"#0f0e17"},{"s":6,"f":3,"d":"R","c":"#ff4757","ring":true,"t":"#0f0e17"},{"s":4,"f":0,"d":"5","c":"#778ca3","ring":false,"t":"#0f0e17"},{"s":2,"f":1,"d":"4","c":"#74b9ff","ring":false,"t":"#0f0e17"},{"s":5,"f":1,"d":"b3","c":"#ff9f43","ring":false,"t":"#0f0e17"},{"s":6,"f":0,"d":"6","c":"#1e9e77","ring":false,"t":"#0f0e17"},{"s":3,"f":2,"d":"2","c":"#b2d9ff","ring":false,"t":"#0f0e17"},{"s":1,"f":0,"d":"6","c":"#1e9e77","ring":false,"t":"#0f0e17"},{"s":4,"f":2,"d":"6","c":"#1e9e77","ring":false,"t":"#0f0e17"},{"s":2,"f":3,"d":"5","c":"#778ca3","ring":false,"t":"#0f0e17"},{"s":5,"f":0,"d":"2","c":"#b2d9ff","ring":false,"t":"#0f0e17"},{"s":6,"f":2,"d":"7","c":"#ff6b6b","ring":false,"t":"#0f0e17"},{"s":3,"f":3,"d":"b3","c":"#ff9f43","ring":false,"t":"#0f0e17"},{"s":1,"f":2,"d":"7","c":"#ff6b6b","ring":false,"t":"#0f0e17"},{"s":4,"f":4,"d":"7","c":"#ff6b6b","ring":false,"t":"#0f0e17"},{"s":2,"f":5,"d":"6","c":"#1e9e77","ring":false,"t":"#0f0e17"},{"s":5,"f":3,"d":"4","c":"#74b9ff","ring":false,"t":"#0f0e17"}],"mutes":[]},{"name":"diatonic roots","sub":"Diatonic","start":7,"dots":[{"s":6,"f":0,"d":"7\u00b0","c":"#a78bfa","ring":false,"pulse":false,"t":"#fff"},{"s":6,"f":1,"d":"1","c":"#ff6b6b","ring":true,"pulse":true,"t":"#0f0e17"},{"s":6,"f":3,"d":"2m","c":"#2dd4bf","ring":false,"pulse":false,"t":"#0f0e17"},{"s":6,"f":5,"d":"3m","c":"#2dd4bf","ring":false,"pulse":false,"t":"#0f0e17"},{"s":5,"f":1,"d":"4","c":"#ff6b6b","ring":false,"pulse":false,"t":"#0f0e17"},{"s":5,"f":3,"d":"5","c":"#ff6b6b","ring":false,"pulse":false,"t":"#0f0e17"},{"s":5,"f":5,"d":"6m","c":"#2dd4bf","ring":false,"pulse":false,"t":"#0f0e17"}],"lines":[{"c":"#ff6b6b","p":[[6,1],[5,1],[5,3]]},{"c":"#2dd4bf","p":[[6,3],[6,5],[5,5]]}],"mutes":[]},{"name":"altered \u2192 resolve","sub":"Altered","start":3,"dots":[{"s":4,"f":2,"d":"R","c":"#ff4757","ring":true,"t":"#0f0e17"},{"s":6,"f":1,"d":"b9","c":"#7c5cbf","ring":false,"t":"#fff"},{"s":3,"f":0,"d":"#9","c":"#6c5ce7","ring":false,"t":"#fff"},{"s":6,"f":4,"d":"3","c":"#ffd93d","ring":false,"t":"#0f0e17"},{"s":5,"f":1,"d":"#11","c":"#0fbcf9","ring":false,"t":"#0f0e17"},{"s":2,"f":1,"d":"b13","c":"#9b2335","ring":false,"t":"#fff"},{"s":5,"f":5,"d":"b7","c":"#fdcb6e","ring":false,"t":"#0f0e17"}],"squares":[{"s":5,"f":0,"d":"R","c":"#2dd4bf","t":"#0f0e17"},{"s":2,"f":2,"d":"3","c":"#2dd4bf","t":"#0f0e17"}],"mutes":[]}];

function tool(key) { return TOOLS.find((t) => t.key === key); }

function HeroFretboard() {
  const [reduced, setReduced] = useState(false);
  const [st, setSt] = useState({ ci: 0, ck: 0, pi: -1, pk: -1 });

  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const h = (e) => setReduced(e.matches);
    mq.addEventListener ? mq.addEventListener("change", h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", h) : mq.removeListener(h); };
  }, []);

  const POP_IN = 360, STAG_IN = 55, IN_LEAD = 150, HOLD = 350, POP_OUT = 230, STAG_OUT = 45;
  const nMarks = (i) => PATTERNS[i].dots.length + (PATTERNS[i].squares ? PATTERNS[i].squares.length : 0);

  useEffect(() => {
    if (reduced) return;
    const inTotal = IN_LEAD + (nMarks(st.ci) - 1) * STAG_IN + POP_IN;
    const id = setTimeout(() => {
      setSt((sv) => ({ ci: (sv.ci + 1) % PATTERNS.length, ck: sv.ck + 1, pi: sv.ci, pk: sv.ck }));
    }, inTotal + HOLD);
    return () => clearTimeout(id);
  }, [st.ck, reduced]);

  useEffect(() => {
    if (reduced || st.pi < 0) return;
    const outTotal = (nMarks(st.pi) - 1) * STAG_OUT + POP_OUT;
    const id = setTimeout(() => setSt((sv) => (sv.pk === st.pk ? { ...sv, pi: -1, pk: -1 } : sv)), outTotal + 80);
    return () => clearTimeout(id);
  }, [st.pk, st.pi, reduced]);

  const NX0 = 46, NX1 = 626, NY0 = 44, NY1 = 212;
  const FW = (NX1 - NX0) / 6, RG = (NY1 - NY0) / 5;
  const X = (f) => NX0 + (f + 0.5) * FW;
  const Y = (sNum) => NY0 + (sNum - 1) * RG;
  const strLabels = ["e", "B", "G", "D", "A", "E"];

  function layer(idx, mode, key) {
    const Pp = PATTERNS[idx];
    const isStatic = mode === "static", isOut = mode === "out";
    const markers = [
      ...Pp.dots.map((d) => ({ ...d, sq: false })),
      ...((Pp.squares || []).map((d) => ({ ...d, sq: true }))),
    ];
    const dotCls = isStatic ? "hdot" : "hdot " + mode;
    const lineCls = isStatic ? "hlines" : "hlines " + mode;
    const mwCls = isStatic ? "hmw" : "hmw " + mode;
    const dotStyle = (i) => isStatic ? undefined : { animationDelay: (isOut ? i * STAG_OUT : IN_LEAD + i * STAG_IN) + "ms" };
    return (
      <g key={key}>
        {Pp.lines && (
          <g className={lineCls} style={isStatic ? undefined : { animationDelay: (isOut ? 0 : IN_LEAD + 80) + "ms" }}>
            {Pp.lines.map((ln, i) => (
              <polyline key={"ln" + i} points={ln.p.map(([sn, f]) => X(f) + "," + Y(sn)).join(" ")}
                fill="none" stroke={ln.c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                opacity={isStatic ? 0.55 : undefined} />
            ))}
          </g>
        )}
        {Pp.mutes && Pp.mutes.length > 0 && (
          <g className={mwCls} style={isStatic ? undefined : { animationDelay: (isOut ? 0 : IN_LEAD) + "ms" }}>
            {Pp.mutes.map((sn) => (
              <text key={"m" + sn} x={NX0 - 14} y={Y(sn) + 5} textAnchor="middle" className="hmute">×</text>
            ))}
          </g>
        )}
        {markers.map((m, i) => {
          const cx = X(m.f), cy = Y(m.s);
          return (
            <g key={"mk" + i} className={dotCls} style={dotStyle(i)}>
              {m.pulse && (
                <>
                  <circle className="hpulse" cx={cx} cy={cy} r="15" fill="none" stroke={m.c} strokeWidth="2.5" />
                  <circle className="hpulse" cx={cx} cy={cy} r="15" fill="none" stroke={m.c} strokeWidth="2.5" style={{ animationDelay: "0.8s" }} />
                </>
              )}
              {m.ring && <circle cx={cx} cy={cy} r="17" fill="none" stroke="#ffffff" strokeWidth="2.5" />}
              {m.sq
                ? <rect x={cx - 15} y={cy - 15} width="30" height="30" rx="6" fill={m.c} />
                : <circle cx={cx} cy={cy} r="15" fill={m.c} />}
              <text x={cx} y={cy + 4.5} textAnchor="middle" className="hdot-label" fill={m.t}>{m.d}</text>
            </g>
          );
        })}
      </g>
    );
  }

  const capIdx = reduced ? 1 : st.ci;
  return (
    <div className="fretboard-wrap" role="img"
      aria-label={"Animated fretboard showing a " + PATTERNS[capIdx].name + " pattern in the " + PATTERNS[capIdx].sub + " style"}>
      <svg className="hero-fret" viewBox="0 0 672 258" preserveAspectRatio="xMidYMid meet">
        <text x={NX0} y={NY0 - 16} className="hcap" fill="#7a7796">{PATTERNS[capIdx].sub}</text>
        <rect x={NX0} y={NY0} width={NX1 - NX0} height={NY1 - NY0} rx="6" fill="#15131f" stroke="#2a2840" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={"w" + i} x1={NX0 + i * FW} y1={NY0} x2={NX0 + i * FW} y2={NY1} stroke="#34324a" strokeWidth="1.5" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={"s" + i} x1={NX0} y1={Y(i + 1)} x2={NX1} y2={Y(i + 1)} stroke="#3a3852" strokeWidth={0.7 + i * 0.4} />
        ))}
        {strLabels.map((lab, i) => (
          <text key={"l" + i} x={14} y={Y(i + 1) + 4} className="hstr">{lab}</text>
        ))}
        <circle cx={X(2)} cy={(Y(3) + Y(4)) / 2} r="3.5" fill="#26243a" />
        <circle cx={X(4)} cy={(Y(3) + Y(4)) / 2} r="3.5" fill="#26243a" />
        {reduced
          ? layer(1, "static", "static")
          : (
            <>
              {st.pi >= 0 && layer(st.pi, "out", "p" + st.pk)}
              {layer(st.ci, "in", "c" + st.ck)}
            </>
          )}
        {PATTERNS.map((_, i) => (
          <circle key={"ind" + i} className={"hind" + (i === capIdx ? " on" : "")} cx={NX0 + i * 16} cy={NY1 + 22} r="4" />
        ))}
      </svg>
    </div>
  );
}

export default function Brochure() {
  return (
    <div className="jgt-root">
      <style>{CSS}</style>

      <div className="wrap">
        {/* Top bar */}
        <header className="topbar">
          <div className="brand">
            <svg className="brand-mark" aria-hidden="true" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* nut */}
              <rect x="2" y="2" width="32" height="24" rx="4" fill="#13121f" stroke="#2a2840" strokeWidth="1.2"/>
              {/* frets */}
              {[11,20,29].map(x=><line key={x} x1={x} y1="2" x2={x} y2="26" stroke="#34324a" strokeWidth="1.2"/>)}
              {/* strings */}
              {[8,14,20].map(y=><line key={y} x1="2" y1={y} x2="34" y2={y} stroke="#3a3852" strokeWidth="0.9"/>)}
              {/* degree dots: R on str3/fret1, 3rd on str2/fret2, 7th on str1/fret3 */}
              <circle cx="6.5" cy="20" r="4.5" fill="#ff4757"/>
              <circle cx="15.5" cy="14" r="4.5" fill="#ffd93d"/>
              <circle cx="24.5" cy="8"  r="4.5" fill="#ff6b6b"/>
            </svg>
            <span className="brand-name">{BRAND}</span>
          </div>
          <div className="topbar-links">
            <a className="kofi-link" href="/app">Open app →</a>
            <a className="kofi-link kofi-support" href={KOFI} target="_blank" rel="noopener noreferrer" aria-label="Support on Ko-fi">
              <span className="kofi-support-full">☕ Support</span>
              <span className="kofi-support-icon" aria-hidden="true">☕</span>
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="hero">
          <p className="eyebrow">Free · Mobile-first · No sign-up · Works offline</p>
          <h1 className="h1">
            Make the whole fretboard <span className="accent">make sense</span>.
          </h1>
          <p className="lede">
            A growing set of focused trainers for chords, scales, and harmony — colour-coded by what
            each note actually does, so the whole neck finally makes sense. Built for any guitarist who
            wants to truly understand what they&rsquo;re playing, in any style.
          </p>

          <HeroFretboard />

          <div className="cta-row">
            <a className="btn btn-primary" href={tool("chord").path}>
              Start with Chord Trainer →
            </a>
            <a className="btn btn-ghost" href="#tools">Browse all tools</a>
          </div>
        </section>

        <Divider />

        {/* Tools */}
        <section id="tools" className="block">
          <h2 className="h2">The toolbox</h2>
          <div className="tools">
            {TOOLS.map((t) => (
              <a key={t.key} className="card" href={t.path}
                style={{ "--accent": t.accent }} aria-label={"Launch " + t.name}>
                <span className="card-bar" />
                <span className="phone">
                  <img src={SHOTS[t.key]} alt={t.name + " app screenshot"} loading="lazy" />
                </span>
                <div className="card-content">
                  <div className="card-head">
                    <span className="card-emoji" aria-hidden="true">{t.emoji}</span>
                    <span className="card-name">{t.name}</span>
                    {t.note && <span className="card-note">{t.note}</span>}
                  </div>
                  <span className="skill">{t.skill}</span>
                  <p className="desc">{t.blurb}</p>
                  <div className="chips">
                    {t.chips.map((c) => <span key={c} className="chip">{c}</span>)}
                  </div>
                  <span className="launch">Launch <span className="launch-arrow">↗</span></span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <Divider />

        {/* Learning path */}
        <section className="block">
          <h2 className="h2">Where to start</h2>
          <p className="sub">A natural order — but every tool stands on its own.</p>
          <ol className="path">
            {PATH.map((p, i) => {
              const t = tool(p.key);
              return (
                <li key={p.key} className="step" style={{ "--accent": t.accent }}>
                  <a className="step-link" href={t.path}>
                    <span className="stepnum">{String(i + 1).padStart(2, "0")}</span>
                    <span className="step-body">
                      <span className="step-name">{t.name} <span className="step-go">↗</span></span>
                      <span className="step-why">{p.why}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>

        <Divider />

        {/* Install + About */}
        <section className="block two-col">
          <div className="panel">
            <h3 className="h3">Keep it on your home screen</h3>
            <p className="panel-text">Every tool installs like an app and runs offline — no App Store needed.</p>
            <div className="install-steps">
              <div className="istep">
                <div className="istep-icon">
                  <svg viewBox="0 0 38 38" fill="none">
                    <rect width="38" height="38" rx="10" fill="#1a1830"/>
                    <rect x="10" y="5" width="18" height="28" rx="3" stroke="#5a5775" strokeWidth="1.5"/>
                    <line x1="19" y1="27" x2="19" y2="27" stroke="#5a5775" strokeWidth="2.5" strokeLinecap="round"/>
                    <circle cx="19" cy="27" r="1.5" fill="#5a5775"/>
                    <path d="M14 16 L19 11 L24 16" stroke="#ffd93d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="19" y1="11" x2="19" y2="22" stroke="#ffd93d" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="istep-body">
                  <span className="istep-label">iPhone</span>
                  <span className="istep-desc">Tap <b>Share ↑</b> then <b>Add to Home Screen</b></span>
                </div>
              </div>
              <div className="istep">
                <div className="istep-icon">
                  <svg viewBox="0 0 38 38" fill="none">
                    <rect width="38" height="38" rx="10" fill="#1a1830"/>
                    <rect x="10" y="4" width="18" height="30" rx="3" stroke="#5a5775" strokeWidth="1.5"/>
                    <circle cx="19" cy="29" r="1.5" fill="#5a5775"/>
                    <circle cx="15" cy="14" r="1.4" fill="#2ed573"/>
                    <circle cx="19" cy="14" r="1.4" fill="#2ed573"/>
                    <circle cx="23" cy="14" r="1.4" fill="#2ed573"/>
                    <rect x="13" y="18" width="12" height="1.5" rx="0.75" fill="#5a5775"/>
                    <rect x="13" y="21" width="8"  height="1.5" rx="0.75" fill="#5a5775"/>
                  </svg>
                </div>
                <div className="istep-body">
                  <span className="istep-label">Android</span>
                  <span className="istep-desc">Tap <b>⋮ menu</b> then <b>Install app</b></span>
                </div>
              </div>
            </div>
          </div>
          <div className="panel">
            <h3 className="h3">This is my practice, made shareable</h3>
            <p className="panel-text">
              I&rsquo;m {MAKER}. Right now I&rsquo;m deep in learning jazz, and most of these tools
              began as things I built to get the concepts under my own fingers — made under the
              name {STUDIO}. As my playing grows, the toolbox grows with it.
            </p>
            <p className="panel-text">
              I play other styles too, so this won&rsquo;t stay jazz-only — expect trainers for more
              genres over time. It&rsquo;s free and always expanding, and I&rsquo;d love for you to learn
              alongside me. If something clicks, breaks, or sparks an idea, tell me.
            </p>
            <div className="panel-actions">
              <a className="btn btn-kofi" href={KOFI} target="_blank" rel="noopener noreferrer">
                ☕ Buy me a coffee
              </a>
              {/* Feedback link points to Ko-fi for now — swap to email/socials later */}
              <a className="btn btn-ghost" href={KOFI} target="_blank" rel="noopener noreferrer">
                Share feedback
              </a>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span>More tools on the way.</span>
          <span className="footer-dot">·</span>
          <span>Built by {STUDIO}</span>
          <span className="footer-dot">·</span>
          <a href={KOFI} target="_blank" rel="noopener noreferrer">Ko-fi</a>
          <span className="footer-dot">·</span>
          <span className="muted">© {new Date().getFullYear()} {BRAND}</span>
        </footer>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div className="divider" aria-hidden="true">
      <svg viewBox="0 0 1000 8" preserveAspectRatio="none" className="divider-svg">
        <line x1="0" y1="4" x2="1000" y2="4" stroke="#2a2840" strokeWidth="1" />
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={i} x1={i * 100} y1="0" x2={i * 100} y2="8" stroke="#2a2840" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

const CSS = `
.jgt-root{
  --bg:#0f0e17; --surface:#13121f; --surface2:#0a0918; --border:#2a2840;
  --accent-y:#ffd93d; --text:#ece9f5; --muted:#9a96b0; --faint:#6b6880;
  background:var(--bg); color:var(--text); min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.55;
}
.jgt-root *{box-sizing:border-box;}
.wrap{max-width:1000px;margin:0 auto;padding:0 20px 64px;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 0 16px;}
.topbar-links{display:flex;align-items:center;gap:8px;}
.brand{display:flex;align-items:center;gap:10px;}
.brand-mark{width:36px;height:28px;flex-shrink:0;}
.brand-name{font-family:"Fraunces","Space Grotesk",serif;font-weight:600;font-size:34px;letter-spacing:-0.01em;font-optical-sizing:auto;}
.kofi-link{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--muted);white-space:nowrap;
  text-decoration:none;border:1px solid var(--border);border-radius:9px;padding:7px 12px;transition:.18s;}
.kofi-support-icon{display:none;}
.kofi-link:hover{color:var(--accent-y);border-color:var(--accent-y);}

.hero{padding:30px 0 8px;}
.eyebrow{font-family:"JetBrains Mono",monospace;font-size:11.5px;letter-spacing:0.06em;
  text-transform:uppercase;color:var(--faint);margin:0 0 18px;}
.h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:clamp(32px,6.4vw,56px);
  line-height:1.04;letter-spacing:-0.025em;margin:0 0 18px;max-width:14ch;}
.h1 .accent{color:var(--accent-y);}
.lede{font-size:clamp(15px,2.4vw,18px);color:var(--muted);max-width:54ch;margin:0 0 28px;}

.fretboard-wrap{margin:10px 0 30px;}
.hero-fret{width:100%;height:auto;display:block;}
.hstr{font-family:"JetBrains Mono",monospace;font-size:12px;fill:#56536f;}
.hcap{font-family:"JetBrains Mono",monospace;font-size:12px;letter-spacing:.04em;}
.hdot-label{font-family:"JetBrains Mono",monospace;font-size:13px;font-weight:600;}
.hmute{font-family:"JetBrains Mono",monospace;font-size:17px;font-weight:600;fill:#ff6b6b;}
.hdot{transform-box:fill-box;transform-origin:center;}
.hdot.in{animation:hin 360ms cubic-bezier(.34,1.45,.5,1) both;}
.hdot.out{animation:hout 230ms ease-in both;}
.hlines.in{animation:hlinein 320ms ease both;}
.hlines.out{animation:hlineout 200ms ease both;}
.hmw.in{animation:hmwin 280ms ease both;}
.hmw.out{animation:hmwout 200ms ease both;}
.hpulse{transform-box:fill-box;transform-origin:center;animation:hpulse 1.6s ease-out infinite;}
.hind{fill:#2a2840;transition:fill .3s;}
.hind.on{fill:#ffd93d;}
@keyframes hin{0%{opacity:0;transform:scale(0);}70%{opacity:1;transform:scale(1.16);}100%{opacity:1;transform:scale(1);}}
@keyframes hout{0%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(0);}}
@keyframes hlinein{0%{opacity:0;}100%{opacity:.55;}}
@keyframes hlineout{0%{opacity:.55;}100%{opacity:0;}}
@keyframes hmwin{0%{opacity:0;}100%{opacity:1;}}
@keyframes hmwout{0%{opacity:1;}100%{opacity:0;}}
@keyframes hpulse{0%{opacity:.6;transform:scale(.6);}100%{opacity:0;transform:scale(2.3);}}

.cta-row{display:flex;flex-wrap:wrap;gap:12px;}
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:15px;
  text-decoration:none;border-radius:12px;padding:13px 20px;transition:.18s;border:1px solid transparent;
  font-family:"Space Grotesk",sans-serif;}
.btn-primary{background:var(--accent-y);color:#19160a;box-shadow:0 6px 22px -8px #ffd93d88;}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 28px -8px #ffd93daa;}
.btn-ghost{color:var(--text);border-color:var(--border);}
.btn-ghost:hover{border-color:var(--muted);}
.btn-kofi{background:#FF5E5B;color:#fff;box-shadow:0 6px 20px -8px #FF5E5B99;}
.btn-kofi:hover{transform:translateY(-2px);}

.divider{margin:42px 0;}
.divider-svg{width:100%;height:8px;display:block;opacity:.8;}

.block{padding:2px 0;}
.h2{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:clamp(22px,3.6vw,30px);
  letter-spacing:-0.02em;margin:0 0 4px;}
.sub,.panel-text{color:var(--muted);}
.sub{margin:0 0 20px;font-size:14.5px;}

.tools{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px;}
.card{position:relative;display:flex;flex-direction:row;gap:16px;align-items:stretch;background:var(--surface);
  border:1px solid var(--border);border-radius:18px;padding:18px 18px 18px 22px;overflow:hidden;
  text-decoration:none;color:inherit;transition:transform .18s,border-color .18s,box-shadow .18s;}
.card-bar{position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--accent);z-index:2;}
.phone{flex:0 0 auto;width:118px;padding:3px;background:#000;border:1px solid #34324a;
  border-radius:22px;box-shadow:0 12px 28px -14px #000;overflow:hidden;align-self:flex-start;}
.phone img{display:block;width:100%;height:auto;border-radius:18px;}
.card-content{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:9px;}
.card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.card-emoji{font-size:20px;}
.card-name{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.01em;}
.card-note{font-family:"JetBrains Mono",monospace;font-size:10px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);border-radius:20px;
  padding:2px 8px;opacity:.9;}
.skill{font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--faint);letter-spacing:.02em;}
.desc{font-size:14px;color:var(--muted);margin:0;line-height:1.5;}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;}
.chip{font-family:"JetBrains Mono",monospace;font-size:10.5px;color:#c9c5da;
  background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:4px 8px;}
.launch{margin-top:auto;padding-top:2px;font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:14px;color:var(--accent);}
.launch-arrow{display:inline-block;transition:transform .18s;}
.card:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:0 16px 40px -18px var(--accent);}
.card:hover .launch-arrow{transform:translate(2px,-2px);}

.path{list-style:none;margin:18px 0 0;padding:0;position:relative;}
.path:before{content:"";position:absolute;left:25px;top:14px;bottom:14px;width:2px;background:#2a2840;}
.step{position:relative;}
.step-link{display:flex;gap:16px;align-items:flex-start;text-decoration:none;color:inherit;
  padding:12px 12px 12px 0;border-radius:12px;transition:.18s;}
.step-link:hover{background:var(--surface);}
.stepnum{flex:0 0 auto;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;
  background:var(--surface);border:1px solid var(--accent);color:var(--accent);
  font-family:"JetBrains Mono",monospace;font-weight:600;font-size:13px;position:relative;z-index:1;}
.step-body{display:flex;flex-direction:column;gap:2px;padding-top:5px;}
.step-name{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:16px;}
.step-go{color:var(--accent);font-size:13px;}
.step-why{font-size:13.5px;color:var(--muted);}

.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px;}
.panel-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;}
.install-steps{display:flex;flex-direction:column;gap:10px;margin:10px 0 0;}
.istep{display:flex;align-items:center;gap:12px;background:#0f0e17;border:1px solid var(--border);border-radius:12px;padding:10px 12px;}
.istep-icon{flex:0 0 auto;width:38px;height:38px;}
.istep-icon svg{width:100%;height:100%;display:block;}
.istep-body{display:flex;flex-direction:column;gap:2px;}
.istep-label{font-family:"JetBrains Mono",monospace;font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);}
.istep-desc{font-size:13px;color:var(--muted);line-height:1.45;}
.istep-desc b{color:var(--text);}
.h3{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:17px;margin:0 0 8px;letter-spacing:-0.01em;}
.panel-text{font-size:14px;margin:0 0 10px;line-height:1.6;}
.muted{color:var(--muted);}

.footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:46px;padding-top:22px;
  border-top:1px solid var(--border);font-size:13px;color:var(--faint);}
.footer a{color:var(--muted);text-decoration:none;}
.footer a:hover{color:var(--accent-y);}
.footer-dot{color:var(--border);}

a:focus-visible,.card:focus-visible{outline:2px solid var(--accent-y);outline-offset:3px;}

@media (max-width:640px){
  .tools{grid-template-columns:1fr;}
  .two-col{grid-template-columns:1fr;}
  .btn{flex:1 1 auto;justify-content:center;}
  .kofi-support .kofi-support-full{display:none;}
  .kofi-support .kofi-support-icon{display:inline;}
}
@media (prefers-reduced-motion:reduce){
  .hdot,.hdot.in,.hdot.out,.hlines,.hlines.in,.hlines.out,.hmw,.hmw.in,.hmw.out{animation:none;opacity:1;transform:none;}
  .hpulse{animation:none;opacity:.25;}
  .btn,.card,.launch-arrow,.step-link,.kofi-link{transition:none;}
  .btn-primary:hover,.btn-kofi:hover,.card:hover{transform:none;}
}
`;
