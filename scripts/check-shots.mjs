// Every tool's brochure card shows public/shots/<key>.webp. A tool without one
// gets an empty phone frame — Standards Trainer went out like that — so the
// build stops instead. Runs before `vite build` (see package.json).
import { existsSync } from 'node:fs';
import { TOOLS } from '@fretworks/design';

const missing = TOOLS.filter((t) => !existsSync(new URL(`../public/shots/${t.key}.webp`, import.meta.url)));
if (missing.length) {
  console.error(`\nMissing brochure screenshot${missing.length > 1 ? 's' : ''}:`);
  for (const t of missing) console.error(`  public/shots/${t.key}.webp  (${t.name})`);
  console.error('\nAdd a 360×782 WebP of the trainer on a phone for each — see fretworks-docs/CLAUDE.md → Brochure screenshots.\n');
  process.exit(1);
}
console.log(`check-shots: all ${TOOLS.length} brochure screenshots present`);
