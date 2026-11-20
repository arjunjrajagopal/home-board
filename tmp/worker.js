/* Home Board API, version 2: the board kept as proper tables in a D1 database.
 *
 *   GET  /api/health                 no login, says the server is up
 *   GET  /api/v2/state               every current row, by collection, and the change number  (family key)
 *   GET  /api/v2/changes?since=N     only rows changed after change number N, deletions included (family key)
 *   POST /api/v2/ops                 save changes: { ops: [ {c, op:'put', row} | {c, op:'del', id} ] }  (family key)
 *   GET  /api/staff                  read-only, staff-safe part of the board                   (staff key)
 *   GET  /api/state                  old page: the board in the old single-blob shape, read-only (family key)
 *   PUT  /api/state                  old page: refused (410), so an out-of-date page cannot overwrite anything
 *   POST /api/v2/photo               save one photo for a task step: { mime, data (base64) } -> { id } (family key)
 *   GET  /api/photo/<id>             one task photo (family or staff key)
 *   POST /api/staff/ticks            staff tick or untick task steps: { ops: [ {op:'put', row} | {op:'del', id} ] } (staff key)
 *
 * Keys: Authorization: Bearer <key>. APP_TOKEN (family) and STAFF_TOKEN (staff) are Worker secrets.
 * Every saved row gets the next change number (seq); deletions are kept as "deleted" rows so other
 * phones learn about them. Each change is saved on its own, so two people editing different things
 * at the same moment no longer clash; if two edit the same row, the later save wins.
 * On first start the Worker builds the tables and copies the old `board` row into them.
 * The `board` table itself is left untouched as a backup.
 */
const MAX_BYTES = 900 * 1024, MAX_OPS = 500, MAX_ROW = 32 * 1024, MESSAGE_LIMIT = 300;

/* Each collection: the table, and which row field goes in which column. Fields not listed are kept in `extra`. */
const SPEC = {
  people:         { table: 'people', cols: { id: 'id', name: 'name', nameHi: 'name_hi', role: 'role', simple: 'is_simple', holidays: 'holidays_off', color: 'color', sort: 'sort_order', end: 'end_date' }, bool: ['simple', 'holidays'], int: ['color', 'sort'] },
  schedules:      { table: 'schedules', cols: { id: 'id', personId: 'person_id', from: 'from_date', days: 'days', time: 'time', times: 'times' }, json: ['days', 'times'] },
  exceptions:     { table: 'exceptions', cols: { id: 'id', personId: 'person_id', date: 'date', kind: 'kind', time: 'time', subFor: 'sub_for' } },
  holidays:       { table: 'public_holidays', cols: { id: 'id', date: 'date', name: 'name' } },
  schoolHolidays: { table: 'school_holidays', cols: { id: 'id', date: 'date', name: 'name' } },
  holidayPlans:   { table: 'holiday_plans', cols: { id: 'id', date: 'date', personId: 'person_id', mode: 'mode', subDate: 'sub_date', note: 'note' } },
  carBookings:    { table: 'car_bookings', cols: { id: 'id', date: 'date', slot: 'slot', who: 'who' } },
  attendance:     { table: 'attendance', cols: { id: 'id', personId: 'person_id', date: 'date', value: 'value' } },
  groceries:      { table: 'groceries', cols: { id: 'id', item: 'item', vendor: 'vendor', by: 'by_name', date: 'added_on', forDate: 'for_date', done: 'done', doneOn: 'done_on' }, bool: ['done'] },
  otps:           { table: 'otps', cols: { id: 'id', code: 'code', source: 'source', by: 'by_name', date: 'date', at: 'at', used: 'used' }, bool: ['used'] },
  messages:       { table: 'messages', cols: { id: 'id', at: 'at', text: 'text', kind: 'kind', detail: 'detail', undo: 'undo' }, json: ['detail', 'undo'] },
  sabzi: { table: 'sabzi', cols: { id: 'id', date: 'date', veg: 'veg', q: 'qty', by: 'by_name' }, int: ['q'] },
  fridge: { table: 'fridge', cols: { id: 'id', v: 'v', by: 'by_name' }, json: ['v'] },
  /* Tasks: title, who does it (personId), and when (rule) with its steps; steps and rule are kept in `extra`. */
  tasks: { table: 'tasks', cols: { id: 'id', title: 'title', personId: 'person_id', sort: 'sort_order', off: 'is_off' }, bool: ['off'], int: ['sort'] },
  /* One row per ticked step per day: id is date|taskId|stepId. Unticking deletes the row. */
  taskTicks: { table: 'task_ticks', cols: { id: 'id', date: 'date', taskId: 'task_id', stepId: 'step_id', by: 'by_name' } },
  settings:       { table: 'settings', cols: { id: 'id', value: 'value' }, json: ['value'] },
};
const INDEXES = {
  schedules: ['person_id, from_date'], exceptions: ['date', 'person_id, date'], holiday_plans: ['date'],
  car_bookings: ['date'], attendance: ['person_id, date'], groceries: ['for_date'], otps: ['date'], sabzi: ['date'], task_ticks: ['date'],
};

function schemaSQL() {
  const out = ["CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)", "INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', '0')"];
  for (const s of Object.values(SPEC)) {
    const intCols = new Set([...(s.bool || []), ...(s.int || [])].map(f => s.cols[f]));
    const cols = Object.values(s.cols).map(c => c === 'id' ? 'id TEXT PRIMARY KEY' : c + (intCols.has(c) ? ' INTEGER' : ' TEXT'));
    out.push(`CREATE TABLE IF NOT EXISTS ${s.table} (${cols.join(', ')}, extra TEXT, seq INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`);
    out.push(`CREATE INDEX IF NOT EXISTS ${s.table}_seq ON ${s.table} (seq)`);
    (INDEXES[s.table] || []).forEach((ix, i) => out.push(`CREATE INDEX IF NOT EXISTS ${s.table}_ix${i} ON ${s.table} (${ix})`));
  }
  /* Photos for task steps. Not a synced collection: fetched one by one by id. */
  out.push('CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL)');
  return out;
}

/* ---------- Rows: client objects <-> table columns ---------- */
function toDb(spec, row) {
  const vals = {}, extra = {};
  for (const [k, v] of Object.entries(row)) {
    const col = spec.cols[k];
    if (!col) { extra[k] = v; continue; }
    if ((spec.json || []).includes(k)) vals[col] = v == null ? null : JSON.stringify(v);
    else if ((spec.bool || []).includes(k)) vals[col] = v ? 1 : 0;
    else if (v != null && typeof v === 'object') vals[col] = JSON.stringify(v);
    else vals[col] = v == null ? null : v;
  }
  return { vals, extra: Object.keys(extra).length ? JSON.stringify(extra) : null };
}
function fromDb(spec, r) {
  const row = {};
  for (const [k, col] of Object.entries(spec.cols)) {
    let v = r[col];
    if (v == null) continue;
    if ((spec.json || []).includes(k)) { try { v = JSON.parse(v); } catch (e) { } }
    else if ((spec.bool || []).includes(k)) v = !!v;
    row[k] = v;
  }
  if (r.extra) { try { Object.assign(row, JSON.parse(r.extra)); } catch (e) { } }
  return row;
}
const SEQ = "(SELECT CAST(v AS INTEGER) FROM meta WHERE k = 'seq')";
function putStmt(env, spec, row, now) {
  const { vals, extra } = toDb(spec, row);
  const cols = Object.values(spec.cols), names = [...cols, 'extra'];
  const params = [...cols.map(c => vals[c] === undefined ? null : vals[c]), extra, now];
  const sql = `INSERT INTO ${spec.table} (${names.join(', ')}, seq, deleted, updated_at) VALUES (${names.map((_, i) => '?' + (i + 1)).join(', ')}, ${SEQ}, 0, ?${names.length + 1}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${names.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}, seq = excluded.seq, deleted = 0, updated_at = excluded.updated_at`;
  return env.DB.prepare(sql).bind(...params);
}
function delStmt(env, spec, id, now) {
  return env.DB.prepare(`UPDATE ${spec.table} SET deleted = 1, seq = ${SEQ}, updated_at = ?2 WHERE id = ?1`).bind(id, now);
}
const bumpSeq = env => env.DB.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k = 'seq'");
async function currentSeq(env) {
  const r = await env.DB.prepare("SELECT CAST(v AS INTEGER) AS v FROM meta WHERE k = 'seq'").first();
  return r ? r.v : 0;
}

/* ---------- First start: build tables, copy the old single-row board in ---------- */
let READY = false;
async function ensureReady(env) {
  if (READY) return;
  let migrated = null;
  try { migrated = await env.DB.prepare("SELECT v FROM meta WHERE k = 'migrated'").first(); } catch (e) { }
  if (migrated) { await env.DB.batch(schemaSQL().map(s => env.DB.prepare(s))); READY = true; return; } /* every statement is IF NOT EXISTS: adds the sabzi table to an existing database */
  await env.DB.batch(schemaSQL().map(s => env.DB.prepare(s)));
  let old = null;
  try { old = await env.DB.prepare('SELECT version, json FROM board WHERE id = 1').first(); } catch (e) { }
  const now = new Date().toISOString();
  /* The batch is one transaction and starts by claiming the 'migrated' key. If two requests race,
     the second one's claim fails, its whole batch is rolled back, and nothing is copied twice. */
  const stmts = [env.DB.prepare("INSERT INTO meta (k, v) VALUES ('migrated', ?1)").bind(old ? 'board v' + old.version + ' at ' + now : 'empty at ' + now), bumpSeq(env)];
  if (old) {
    const rows = boardToRows(JSON.parse(old.json));
    for (const [c, list] of Object.entries(rows)) list.forEach(r => stmts.push(putStmt(env, SPEC[c], r, now)));
  }
  try { await env.DB.batch(stmts); } catch (e) {
    if (!(await env.DB.prepare("SELECT v FROM meta WHERE k = 'migrated'").first())) throw e;
  }
  READY = true;
}

/* The old blob -> rows. Each person's weekly rule becomes their first dated schedule. */
function boardToRows(b) {
  const out = {}; Object.keys(SPEC).forEach(c => out[c] = []);
  (b.people || []).forEach((p, i) => {
    out.people.push(clean({ id: p.id, name: p.name, role: p.role, simple: !!p.simple, holidays: !!p.holidays, color: p.color, sort: i, end: p.end || null }));
    out.schedules.push(clean({ id: p.id + '-' + (p.start || '2026-01-01'), personId: p.id, from: p.start || '2026-01-01', days: p.days || [], time: p.time || null, times: p.times && Object.keys(p.times).length ? p.times : null }));
  });
  (b.exceptions || []).forEach(e => out.exceptions.push(clean({ id: e.id || ('e-' + e.personId + '-' + e.date), personId: e.personId, date: e.date, kind: e.kind, time: e.time || null, subFor: e.subFor || null })));
  (b.holidays || []).forEach(h => out.holidays.push({ id: h.date, date: h.date, name: h.name }));
  (b.schoolHolidays || []).forEach(h => out.schoolHolidays.push({ id: h.date, date: h.date, name: h.name }));
  Object.entries(b.holidayPlans || {}).forEach(([k, v]) => { const [date, personId] = k.split('|'); out.holidayPlans.push(clean(Object.assign({ id: k, date, personId }, v))); });
  (b.carBookings || []).forEach(x => out.carBookings.push({ id: x.date + '|' + x.slot + '|' + x.who, date: x.date, slot: x.slot, who: x.who }));
  Object.entries(b.attendance || {}).forEach(([k, v]) => { const [personId, date] = k.split('|'); out.attendance.push({ id: k, personId, date, value: v }); });
  (b.groceries || []).forEach(g => out.groceries.push(clean(g)));
  (b.otps || []).forEach(o => out.otps.push(clean(o)));
  (b.messages || []).forEach(m => out.messages.push(clean(m)));
  if (b.holidayFrom) out.settings.push({ id: 'holidayFrom', value: b.holidayFrom });
  return out;
}
function clean(o) { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v; return r; }

/* ---------- Reading ---------- */
async function readAll(env, opts) {
  const out = {}, since = opts && opts.since;
  const names = Object.keys(SPEC).filter(c => !(opts && opts.only) || opts.only.includes(c));
  const stmts = names.map(c => {
    const t = SPEC[c].table;
    if (since != null) return env.DB.prepare(`SELECT * FROM ${t} WHERE seq > ?1 ORDER BY seq`).bind(since);
    if (c === 'messages') return env.DB.prepare(`SELECT * FROM (SELECT * FROM ${t} WHERE deleted = 0 ORDER BY seq DESC LIMIT ${MESSAGE_LIMIT}) ORDER BY id`);
    return env.DB.prepare(`SELECT * FROM ${t} WHERE deleted = 0 ORDER BY id`);
  });
  const res = await env.DB.batch(stmts);
  names.forEach((c, i) => {
    out[c] = res[i].results.map(r => {
      const row = fromDb(SPEC[c], r);
      if (since != null && r.deleted) return { id: r.id, _deleted: true };
      return row;
    });
  });
  return out;
}

/* Rows -> the old single-blob shape, for pages that have not been updated yet. */
function rowsToBoard(rows, today) {
  const sched = {};
  rows.schedules.slice().sort((a, b) => a.from < b.from ? -1 : 1).forEach(s => (sched[s.personId] = sched[s.personId] || []).push(s));
  const people = rows.people.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(p => {
    const list = sched[p.id] || [], cur = list.filter(s => s.from <= today).pop() || list[0] || {};
    return clean({ id: p.id, name: p.name, role: p.role, days: cur.days || [], time: cur.time || null, times: cur.times || undefined, start: list[0] ? list[0].from : today, holidays: !!p.holidays, color: p.color, simple: p.simple || undefined });
  });
  const map = (list, f) => { const o = {}; list.forEach(r => { o[r.id] = f(r); }); return o; };
  const set = rows.settings.filter(s => s.id === 'holidayFrom')[0];
  return {
    people, exceptions: rows.exceptions,
    holidays: rows.holidays.map(h => ({ date: h.date, name: h.name })), schoolHolidays: rows.schoolHolidays.map(h => ({ date: h.date, name: h.name })),
    holidayPlans: map(rows.holidayPlans, r => clean({ mode: r.mode, subDate: r.subDate, note: r.note })),
    carBookings: rows.carBookings.map(r => ({ date: r.date, slot: r.slot, who: r.who })),
    attendance: map(rows.attendance, r => r.value),
    groceries: rows.groceries, otps: rows.otps, messages: rows.messages,
    holidayFrom: set ? set.value : '2026-01-01', nextId: 100000,
  };
}

/* Only what the house staff need to see. Anything not listed here never leaves the server. */
async function staffView(env) {
  const rows = await readAll(env, { only: ['people', 'schedules', 'exceptions', 'holidays', 'holidayPlans', 'schoolHolidays', 'carBookings', 'groceries', 'sabzi', 'fridge', 'tasks', 'taskTicks'] });
  const pick = (o, keys) => { const r = {}; keys.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
  return {
    people: rows.people.map(p => pick(p, ['id', 'name', 'nameHi', 'role', 'simple', 'holidays', 'color', 'sort', 'end'])),
    schedules: rows.schedules.map(s => pick(s, ['personId', 'from', 'days', 'time', 'times'])),
    exceptions: rows.exceptions.map(e => pick(e, ['personId', 'date', 'kind', 'time', 'subFor'])),
    holidays: rows.holidays.map(h => pick(h, ['date', 'name'])),
    schoolHolidays: rows.schoolHolidays.map(h => pick(h, ['date', 'name'])),
    holidayPlans: rows.holidayPlans.map(h => pick(h, ['date', 'personId', 'mode'])),
    carBookings: rows.carBookings.map(b => pick(b, ['date', 'slot', 'who'])),
    groceries: rows.groceries.filter(g => !g.done).map(g => pick(g, ['id', 'item', 'vendor', 'forDate', 'date'])),
    sabzi: rows.sabzi.filter(r => r.date >= addDaysIso(istToday(), -1)).map(r => pick(r, ['id', 'date', 'veg', 'q', 'x', 'y'])),
    fridge: rows.fridge.map(r => pick(r, ['id', 'v'])),
    tasks: rows.tasks.filter(t => !t.off).map(t => pick(t, ['id', 'title', 'titleHi', 'icon', 'personId', 'rule', 'steps', 'note', 'noteHi', 'sort'])),
    taskTicks: rows.taskTicks.filter(r => r.date >= addDaysIso(istToday(), -1)).map(r => pick(r, ['id', 'date', 'taskId', 'stepId'])),
  };
}

/* ---------- HTTP ---------- */
function cors(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  }, extra || {});
}
function send(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: cors({ 'Content-Type': 'application/json' }) });
}
async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
async function keyMatches(request, secret) {
  const given = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || !secret) return false;
  const a = await digest(given), b = await digest(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function istToday() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }

async function applyOps(env, body) {
  const ops = body && body.ops;
  if (!Array.isArray(ops) || !ops.length) return send({ error: 'No changes sent.' }, 400);
  if (ops.length > MAX_OPS) return send({ error: 'Too many changes at once.' }, 413);
  const now = new Date().toISOString(), stmts = [bumpSeq(env)];
  for (const o of ops) {
    const spec = o && SPEC[o.c];
    if (!spec) return send({ error: 'Unknown collection: ' + (o && o.c) }, 400);
    if (o.op === 'put') {
      if (!o.row || typeof o.row.id !== 'string' || !o.row.id || o.row.id.length > 120) return send({ error: 'Each row needs an id.' }, 400);
      if (JSON.stringify(o.row).length > MAX_ROW) return send({ error: 'A row is too large.' }, 413);
      stmts.push(putStmt(env, spec, o.row, now));
    } else if (o.op === 'del') {
      if (typeof o.id !== 'string' || !o.id) return send({ error: 'Each deletion needs an id.' }, 400);
      stmts.push(delStmt(env, spec, o.id, now));
    } else return send({ error: 'Unknown change type.' }, 400);
  }
  await env.DB.batch(stmts);
  return send({ seq: await currentSeq(env), at: now });
}

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

/* ---------- Staff write access: ticking task steps, for yesterday, today and tomorrow ---------- */
async function applyStaffTicks(env, body) {
  const ops = body && body.ops;
  if (!Array.isArray(ops) || !ops.length || ops.length > 60) return send({ error: 'No changes, or too many.' }, 400);
  const today = istToday(), lo = addDaysIso(today, -1), hi = addDaysIso(today, 1), out = [];
  const ID = /^(\d{4}-\d{2}-\d{2})\|([A-Za-z0-9_-]{1,40})\|([A-Za-z0-9_-]{1,40})$/;
  for (const o of ops) {
    const id = o && (o.op === 'put' ? o.row && o.row.id : o.id), m = typeof id === 'string' && ID.exec(id);
    if (!m || m[1] < lo || m[1] > hi) return send({ error: 'Bad tick.' }, 400);
    if (o.op === 'put') out.push({ c: 'taskTicks', op: 'put', row: { id, date: m[1], taskId: m[2], stepId: m[3], by: 'staff' } });
    else if (o.op === 'del') out.push({ c: 'taskTicks', op: 'del', id });
    else return send({ error: 'Unknown change type.' }, 400);
  }
  return applyOps(env, { ops: out });
}

/* ---------- Photos ---------- */
const PHOTO_MAX = 1400 * 1024; /* base64 characters, about 1 MB of picture */
async function savePhoto(env, body) {
  const mime = body && body.mime, data = body && body.data;
  if (!/^image\/(jpeg|png|webp)$/.test(mime || '')) return send({ error: 'Only JPEG, PNG or WebP photos.' }, 400);
  if (typeof data !== 'string' || !data || data.length > PHOTO_MAX || !/^[A-Za-z0-9+/]+=*$/.test(data)) return send({ error: 'The photo is missing or too large.' }, 413);
  const id = 'ph-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.DB.prepare('INSERT INTO photos (id, mime, data, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(id, mime, data, Math.floor(data.length * 3 / 4), new Date().toISOString()).run();
  return send({ id });
}
async function getPhoto(env, id) {
  if (!/^ph-[a-f0-9]{20}$/.test(id)) return send({ error: 'Not found' }, 404);
  const r = await env.DB.prepare('SELECT mime, data FROM photos WHERE id = ?1').bind(id).first();
  if (!r) return send({ error: 'Not found' }, 404);
  const bin = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
  /* A photo never changes once saved (a new photo gets a new id), so phones may keep it. */
  return new Response(bin, { status: 200, headers: cors({ 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=31536000, immutable' }) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (path === '/api/health') return send({ ok: true, version: 3, features: ['tasks', 'photos'] });

    if (path.startsWith('/api/photo/')) {
      if (request.method !== 'GET') return send({ error: 'Method not allowed' }, 405);
      const fam = env.APP_TOKEN && await keyMatches(request, env.APP_TOKEN), staff = env.STAFF_TOKEN && await keyMatches(request, env.STAFF_TOKEN);
      if (!fam && !staff) return send({ error: 'Wrong or missing key.' }, 401);
      await ensureReady(env);
      return getPhoto(env, path.slice('/api/photo/'.length));
    }

    if (path === '/api/staff/ticks') {
      if (request.method !== 'POST') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      const text = await request.text();
      if (text.length > 20000) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyStaffTicks(env, body);
    }

    if (path === '/api/staff') {
      if (request.method !== 'GET') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      return send({ seq: await currentSeq(env), state: await staffView(env) });
    }

    if (path === '/api/staff/sabzi') {
      if (request.method !== 'POST') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      const text = await request.text();
      if (text.length > 20000) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyStaffSabzi(env, body);
    }

    if (path === '/api/staff/fridge') {
      if (request.method !== 'POST') return send({ error: 'Method not allowed' }, 405);
      if (!env.STAFF_TOKEN) return send({ error: 'Server is not set up: STAFF_TOKEN secret is missing.' }, 503);
      if (!(await keyMatches(request, env.STAFF_TOKEN))) return send({ error: 'Wrong or missing staff key.' }, 401);
      await ensureReady(env);
      const text = await request.text();
      if (text.length > 5000) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyStaffFridge(env, body);
    }

    if (path !== '/api/state' && !path.startsWith('/api/v2/')) return send({ error: 'Not found' }, 404);
    if (!env.APP_TOKEN) return send({ error: 'Server is not set up: APP_TOKEN secret is missing.' }, 503);
    if (!(await keyMatches(request, env.APP_TOKEN))) return send({ error: 'Wrong or missing passphrase.' }, 401);
    await ensureReady(env);

    if (path === '/api/state') {
      if (request.method === 'GET') { const seq = await currentSeq(env); return send({ version: seq, state: rowsToBoard(await readAll(env), istToday()) }); }
      return send({ error: 'Home Board has been updated. Please reload the page.' }, 410);
    }
    if (path === '/api/v2/state' && request.method === 'GET') {
      const seq = await currentSeq(env);
      return send({ seq, rows: await readAll(env) });
    }
    if (path === '/api/v2/changes' && request.method === 'GET') {
      const since = parseInt(url.searchParams.get('since'), 10);
      if (!Number.isInteger(since) || since < 0) return send({ error: 'since must be a whole number.' }, 400);
      const seq = await currentSeq(env);
      if (seq === since) return send({ seq, changes: {} });
      return send({ seq, changes: await readAll(env, { since }) });
    }
    if (path === '/api/v2/photo' && request.method === 'POST') {
      const text = await request.text();
      if (text.length > PHOTO_MAX + 200) return send({ error: 'The photo is too large.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return savePhoto(env, body);
    }
    if (path === '/api/v2/ops' && request.method === 'POST') {
      const text = await request.text();
      if (text.length > MAX_BYTES) return send({ error: 'Too much at once.' }, 413);
      let body; try { body = JSON.parse(text); } catch (e) { return send({ error: 'Not valid JSON.' }, 400); }
      return applyOps(env, body);
    }
    return send({ error: 'Method not allowed' }, 405);
  },
};
