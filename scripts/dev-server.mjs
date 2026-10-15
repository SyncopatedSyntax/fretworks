// Local stand-in for production, for browser testing: the shell's built site,
// the real /api handlers on an in-process Postgres (PGlite), and any trainer
// zones you point it at.
//
//   node scripts/dev-server.mjs 4300 blues=../bluesscaletrainer/dist
//
// Not used in production — Vercel serves /api from api/*.js directly.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
process.env.FW_SCRYPT_N ||= '16384';
process.env.FW_ADMIN_USERS ||= 'zak';
const { setDb } = await import('../api/_lib/db.js');
const api = { auth: await import('../api/auth.js'), sync: await import('../api/sync.js'), health: await import('../api/health.js') };
const pg = new PGlite();
setDb({
  query: async (t, p = []) => (await pg.query(t, p)).rows,
  batch: async qs => pg.transaction(async tx => { const o = []; for (const q of qs) o.push((await tx.query(q.text, q.params || [])).rows); return o; }),
});
const [port = '4300', ...zoneArgs] = process.argv.slice(2);
const SHELL = resolve('dist');
const zones = Object.fromEntries(zoneArgs.map(a => a.split('=')).map(([k, v]) => [k, resolve(v)]));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
async function file(res, p) {
  try { const s = await stat(p); if (!s.isFile()) return false; res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); return true; } catch { return false; }
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const m = url.pathname.match(/^\/api\/(auth|sync|health)$/);
  if (m) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body });
    const h = api[m[1]][req.method];
    const out = h ? await h(r) : new Response('{}', { status: 405 });
    const headers = {}; out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers); res.end(Buffer.from(await out.arrayBuffer())); return;
  }
  const z = url.pathname.match(/^\/([a-z-]+)(\/.*)?$/);
  if (z && zones[z[1]]) {
    const rest = z[2] && z[2] !== '/' ? z[2].replace(new RegExp('^/' + z[1] + '/'), '/') : '/index.html';
    if (await file(res, join(zones[z[1]], rest.replace(/^\//, '')))) return;
    if (await file(res, join(zones[z[1]], 'index.html'))) return;
  }
  if (await file(res, join(SHELL, url.pathname))) return;
  await file(res, join(SHELL, 'index.html'));
}).listen(Number(port), () => console.log('dev server on', port));
