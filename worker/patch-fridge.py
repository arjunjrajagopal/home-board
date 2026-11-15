#!/usr/bin/env python3
"""Adds the Fridge to the Home Board Worker (worker.js, version 2, already patched for Sabzi).

    python3 patch-fridge.py path/to/worker.js

It keeps a copy as worker.js.before-fridge, changes the file in place, and stops without
touching anything if any of the places it needs to change cannot be found exactly once.

What it adds
  * a `fridge` table (one row per shelf: id like "eggs", v = the list of slots), created on the next request
  * staff read the Fridge rows in GET /api/staff
  * POST /api/staff/fridge: the staff key may save Fridge rows (a shelf id plus up to 30 slot values from 0 to 4), and nothing else
The family passphrase already reaches every collection, so the family board needs nothing more.
"""
import re, sys, shutil

path = sys.argv[1] if len(sys.argv) > 1 else 'worker.js'
src = open(path, encoding='utf-8').read()
if "applyStaffFridge" in src:
    sys.exit('Already patched.')

def once(pattern, repl, text, what, flags=0):
    found = re.findall(pattern, text, flags)
    if len(found) != 1:
        sys.exit('Could not patch (%s): found %d places, expected 1. Nothing was changed.' % (what, len(found)))
    return re.sub(pattern, repl, text, count=1, flags=flags)

out = src

# 1. the table (the Worker makes it on the next request: every schema statement is IF NOT EXISTS)
out = once(r"(\n[ \t]*settings:[ \t]*\{ table: 'settings'[^\n]*\n)",
           r"\n  fridge: { table: 'fridge', cols: { id: 'id', v: 'v', by: 'by_name' }, json: ['v'] },\1",
           out, 'SPEC')

# 2. staff can read it
out = once(r"('groceries', 'sabzi')\] \}\)", r"\1, 'fridge'] })", out, 'staffView read')
out = once(r"(\n([ \t]*)sabzi: rows\.sabzi\.filter\([^\n]*\n)",
           r"\1\2fridge: rows.fridge.map(r => pick(r, ['id', 'v'])),\n",
           out, 'staffView result')

# 3. staff can write only this
helper = r'''
/* ---------- Staff write access: Fridge ---------- */
async function applyStaffFridge(env, body) {
  const ops = body && body.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > 20) return send({ error: 'No changes, or too many.' }, 400);
  const out = [];
  for (const o of ops) {
    const r = o && o.op === 'put' && o.row;
    if (!r || typeof r.id !== 'string' || !/^[a-z]{2,20}$/.test(r.id)) return send({ error: 'Bad row.' }, 400);
    if (!Array.isArray(r.v) || r.v.length < 1 || r.v.length > 30 || !r.v.every(n => Number.isInteger(n) && n >= 0 && n <= 4)) return send({ error: 'Bad amounts.' }, 400);
    out.push({ c: 'fridge', op: 'put', row: { id: r.id, v: r.v } });
  }
  return applyOps(env, { ops: out });
}

'''
out = once(r"\nexport default \{", lambda m: helper + "export default {", out, 'helpers')

route = r'''    if (path === '/api/staff/fridge') {
      if (request.method !== 'POST') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      const text = await request.text();
      if (text.length > 5000) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyStaffFridge(env, body);
    }

'''
out = once(r"\n[ \t]*if \(path !== '/api/state' && !path\.startsWith\('/api/v2/'\)\)", lambda m: "\n" + route.rstrip('\n') + "\n" + m.group(0), out, 'route')

shutil.copyfile(path, path + '.before-fridge')
open(path, 'w', encoding='utf-8').write(out)
print('Patched %s (copy of the old one: %s.before-fridge). Now deploy it.' % (path, path))
