// A whole-toolbox snapshot of localStorage.
//
// The trainers are *proxied* under this origin by vercel.json's rewrites — the
// browser only ever sees fretworks.vercel.app — and localStorage is per-origin.
// So every trainer's progress already sits in one store, and the shell can back
// all of it up without any per-trainer code.
//
// The sweep takes EVERY key rather than a list of known prefixes. A prefix list
// would need updating for each new trainer and would silently miss one that was
// forgotten; taking everything means a new tool is covered the day it ships.
// Prefixes are used only to *label* what was found, so the UI can still say
// "Melodic Minor: 8 keys" instead of a bare total.

import { TOOLS } from "@fretworks/design";

// Keys owned by the backup feature itself. These must never enter a snapshot:
// the config holds the GitHub token, and writing that into the backup file
// would publish it into the repo. Restoring skips them for the same reason —
// a snapshot should never be able to overwrite your credentials.
export const RESERVED_PREFIX = "fwbk_";

// Storage prefix per tool key. Lives here rather than in the design package's
// tools.js because putting it there would mean repinning the shell's lockfile
// to pick it up; move it there next time that package is touched anyway. This
// is a labelling aid only — nothing is backed up or skipped because of it, so
// a missing entry costs a nice name, never data.
const PREFIXES = {
  chord: "ct_",
  focus: "fct_",
  diatonic: "dc_",
  mm: "mm_",
  alt: "at_",
  circle: "cof_",
  triads: "tri_",
};

export const SNAPSHOT_VERSION = 1;

/** Every backed-up key, raw. Values are kept as the exact strings localStorage
 * holds rather than being JSON.parse'd: parsing and re-stringifying round-trips
 * badly for any value that was stored as a bare string, and a backup has to be
 * lossless before it is pretty. */
export function readAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || key.startsWith(RESERVED_PREFIX)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

export function buildSnapshot() {
  return {
    app: "fretworks",
    version: SNAPSHOT_VERSION,
    exported: new Date().toISOString(),
    origin: typeof location === "undefined" ? "" : location.origin,
    data: readAll(),
  };
}

export function isValidSnapshot(x) {
  return !!x && x.app === "fretworks" && typeof x.data === "object" && x.data !== null && !Array.isArray(x.data);
}

/** Group a snapshot's keys by the tool that owns them, for display. Anything
 * not matching a known prefix lands in "Other" rather than being hidden — that
 * bucket is how a newly added trainer shows up before PREFIXES knows about it. */
export function summarize(data) {
  const rows = TOOLS.map((t) => {
    const prefix = PREFIXES[t.key];
    const keys = prefix ? Object.keys(data).filter((k) => k.startsWith(prefix)) : [];
    return { key: t.key, name: t.name, accent: t.accent, emoji: t.emoji, n: keys.length };
  }).filter((r) => r.n > 0);

  const claimed = new Set(
    Object.values(PREFIXES).flatMap((p) => Object.keys(data).filter((k) => k.startsWith(p))),
  );
  const other = Object.keys(data).filter((k) => !claimed.has(k)).length;
  if (other > 0) rows.push({ key: "__other", name: "Other", accent: "#8a88a0", emoji: "•", n: other });
  return rows;
}

/** Write a snapshot back. Additive by default: `replace` also clears the keys
 * currently on the device first, which is what you want when moving to a new
 * phone and what you do NOT want when merging one trainer's progress back.
 * Reserved keys are untouched either way. */
export function applySnapshot(snapshot, { replace = false } = {}) {
  if (!isValidSnapshot(snapshot)) throw new Error("Not a Fretworks backup");
  if (replace) {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !key.startsWith(RESERVED_PREFIX)) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  }
  let n = 0;
  for (const [key, value] of Object.entries(snapshot.data)) {
    if (key.startsWith(RESERVED_PREFIX)) continue;
    if (typeof value !== "string") continue;
    localStorage.setItem(key, value);
    n++;
  }
  return n;
}
