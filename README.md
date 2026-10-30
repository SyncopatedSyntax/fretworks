# Fretworks — shell

The toolbox's front door at fretworks.vercel.app: the brochure (`/`), the
launcher (`/app`, the installed app's start page), the backup screen
(`/backup`), accounts (`/account`, with the API in `api/`), and the Vercel
rewrites that serve each trainer under its own path (`vercel.json`).

## Run / build
```bash
npm install
npm run dev      # local preview
npm run build    # checks every tool has a brochure screenshot, then builds to dist/
npm run verify   # accounts + sync end to end (real handlers, PGlite, several devices)
```

## Where things live
- `src/App.jsx` — the brochure. The tool list, its families and the "Where do
  you want to start?" goals come from `@fretworks/design` (`src/tools.js`
  there); never copy them here.
- `src/Launcher.jsx` — `/app`, the same tools under the same family headings.
- `public/shots/<key>.webp` — one screenshot per tool, 360×782 WebP.
  `scripts/check-shots.mjs` stops the build if one is missing.
- `index.html` — head tags (description, link previews), the manifest and the
  service-worker registration. `public/sw.js` is the one service worker for
  the whole toolbox.

Working notes for the whole toolbox: `fretworks-docs/CLAUDE.md`.
