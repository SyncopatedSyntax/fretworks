# Jazz Guitar Toolbox — portal

A free, mobile-first landing page for the jazz guitar trainer suite. Single-file
React component (`src/App.jsx`) inside a minimal Vite project, so the page ships
as real static HTML with proper `<head>` tags (good link previews + SEO) and a
fast first paint.

## Run / build
```bash
npm install
npm run dev      # local preview
npm run build    # production build -> dist/
```

## Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. In Vercel: New Project -> import the repo. It auto-detects Vite. Deploy.

## Two things to edit
1. **Tool links** live in one place at the top of `src/App.jsx` (the `TOOLS`
   array, `url` field). They currently point at your `*.vercel.app` URLs.
2. **Your own URL** appears in `index.html` (the `canonical`, `og:url`, and
   `og:image` tags). After the first deploy, set these to the portal's real
   address so shared links unfurl with the right preview image.

## When you get a custom domain
- Assign the apex (e.g. `jazzguitartoolbox.com`) to this portal project.
- Assign a subdomain to each tool's existing Vercel project
  (`chordtrainer.jazzguitartoolbox.com`, etc.) — no code changes needed.
- Update the `url` fields in `TOOLS` and the URLs in `index.html`.

## Files
- `src/App.jsx` — the whole portal (edit content/links here)
- `index.html` — static head tags, manifest + SW registration
- `public/manifest.webmanifest`, `public/sw.js` — makes the portal installable/offline
- `public/icon-*.png`, `apple-touch-icon.png`, `og-image.png` — generated brand art
