#!/usr/bin/env python3
"""Adds Sabzi to the Home Board Worker (worker.js, version 2).

    python3 patch-sabzi.py path/to/worker.js

It keeps a copy as worker.js.before-sabzi, changes the file in place, and stops without
touching anything if any of the places it needs to change cannot be found exactly once.

What it adds
  * a `sabzi` table (one row per vegetable per day), created on the next request
  * staff read the Sabzi rows in GET /api/staff
  * POST /api/staff/sabzi: the staff key may save and remove Sabzi rows for yesterday, today
    and the next two days, and nothing else
The family passphrase already reaches every collection, so the family board needs nothing more.
"""
import re, sys, shutil

path = sys.argv[1] if len(sys.argv) > 1 else 'worker.js'
src = open(path, encoding='utf-8').read()
if "sabzi:" in src and "applyStaffSabzi" in src:
    sys.exit('Already patched.')

def once(pattern, repl, text, what, flags=0):
    found = re.findall(pattern, text, flags)
    if len(found) != 1:
        sys.exit('Could not patch (%s): found %d places, expected 1. Nothing was changed.' % (what, len(found)))
    return re.sub(pattern, repl, text, count=1, flags=flags)

out = src

# 1. the table
out = once(r"(\n[ \t]*settings:[ \t]*\{ table: 'settings'[^\n]*\n)",
           r"\n  sabzi: { table: 'sabzi', cols: { id: 'id', date: 'date', veg: 'veg', q: 'qty', by: 'by_name' }, int: ['q'] },\1",
           out, 'SPEC')
out = once(r"(otps: \['date'\],)(\s*\n\};)", r"\1 sabzi: ['date'],\2", out, 'INDEXES')

# 2. make the table on a database that was already set up
out = once(r"if \(migrated\) \{ READY = true; return; \}",
           "if (migrated) { await env.DB.batch(schemaSQL().map(s => env.DB.prepare(s))); READY = true; return; } /* every statement is IF NOT EXISTS: adds the sabzi table to an existing database */",
           out, 'ensureReady')

# 3. staff can read it
out = once(r"('carBookings', 'groceries')\] \}\)", r"\1, 'sabzi'] })", out, 'staffView read')
out = once(r"(\n([ \t]*)groceries: rows\.groceries\.filter\(g => !g\.done\)\.map\([^\n]*\n)",
           r"\1\2sabzi: rows.sabzi.filter(r => r.date >= addDaysIso(istToday(), -1)).map(r => pick(r, ['id', 'date', 'veg', 'q', 'x', 'y'])),\n",
           out, 'staffView result')

# 4. staff can write only this
helper = r'''
/* ---------- Staff write access: Sabzi only ---------- */
function addDaysIso(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
async function applyStaffSabzi(env, body) {
  const ops = body && body.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > 60) return send({ error: 'No changes, or too many.' }, 400);
  const today = istToday(), lo = addDaysIso(today, -1), hi = addDaysIso(today, 2), out = [];
  const num = (v, a, b) => typeof v === 'number' && v >= a && v <= b;
  for (const o of ops) {
    if (o && o.op === 'put') {
      const r = o.row;
      if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^[a-z]{2,20}$/.test(r.veg || '') || r.id !== r.date + '|' + r.veg) return send({ error: 'Bad row.' }, 400);
      if (r.date < lo || r.date > hi) return send({ error: 'Only today and the next two days.' }, 400);
      if (!num(r.q, 0.25, 10) || (r.q * 4) % 1 !== 0) return send({ error: 'Bad amount.' }, 400);
      if (!num(r.x, 0, 1) || !num(r.y, 0, 1)) return send({ error: 'Bad place on the cloth.' }, 400);
      out.push({ c: 'sabzi', op: 'put', row: { id: r.id, date: r.date, veg: r.veg, q: r.q, x: r.x, y: r.y } });
    } else if (o && o.op === 'del') {
      const m = typeof o.id === 'string' && /^(\d{4}-\d{2}-\d{2})\|[a-z]{2,20}$/.exec(o.id);
      if (!m || m[1] < lo || m[1] > hi) return send({ error: 'Bad deletion.' }, 400);
      out.push({ c: 'sabzi', op: 'del', id: o.id });
    } else return send({ error: 'Unknown change type.' }, 400);
  }
  return applyOps(env, { ops: out });
}

'''
out = once(r"\nexport default \{", lambda m: helper + "export default {", out, 'helpers')

route = r'''    if (path === '/api/staff/sabzi') {
      if (request.method !== 'POST') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      const text = await request.text();
      if (text.length > 20000) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyStaffSabzi(env, body);
    }

'''
out = once(r"\n[ \t]*if \(path !== '/api/state' && !path\.startsWith\('/api/v2/'\)\)", lambda m: "\n" + route.rstrip('\n') + "\n" + m.group(0), out, 'route')

shutil.copyfile(path, path + '.before-sabzi')
open(path, 'w', encoding='utf-8').write(out)
print('Patched %s (copy of the old one: %s.before-sabzi). Now deploy it.' % (path, path))
