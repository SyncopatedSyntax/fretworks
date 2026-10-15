// /api/health — is the account service wired up? Reports booleans only,
// never a connection string or any user data. Also runs the schema setup,
// so the first visit after deploying creates the tables.
import { db, dbUrl } from './_lib/db.js';
import { json, admins } from './_lib/http.js';

export async function GET() {
  const out = { ok: false, database: false, configured: !!dbUrl(), admin: admins().length > 0 };
  try {
    const d = await db();
    await d.query('select 1 as ok');
    out.database = true;
    out.ok = true;
  } catch (e) {
    out.error = e && e.code === 'NO_DB' ? 'No database connected.' : 'Database not reachable.';
  }
  return json(out, out.ok ? 200 : 503);
}
