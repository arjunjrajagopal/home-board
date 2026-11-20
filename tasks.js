/* Tasks: a list of jobs (like getting ready for Jeet's session), each with steps that can have a photo.
 * Shared by index.html (family) and staff.html (staff screen).
 *
 * A task:  { id, title, titleHi, icon, personId (who does it), note, noteHi, off (paused), sort,
 *            rule: { kind: 'with' | 'days' | 'date', personId, days: [0-6, 0 = Sunday], date, skipHolidays },
 *            steps: [ { id, en, hi, ico, photo } ] }
 *   kind 'with': on the days another person comes (e.g. whenever Jeet comes)
 *   kind 'days': on these weekdays;  kind 'date': on one date
 * A task only shows on a day its person is working.
 * A tick:  { id: date|taskId|stepId, date, taskId, stepId }
 * A step photo is a file name in this site (jeet-toys.jpg) or a server photo id (ph-...). */
(function (g) {
  var DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DAYS_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return (p || 't') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }
  function dow(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }
  function out(st) { return !st || st.state === 'absent' || st.state === 'off'; }
  /* An icon is an emoji or a small drawing (svg). Only our own drawings are allowed through as markup. */
  function icon(x) { x = String(x || ''); return /^<svg[\s>]/.test(x) && !/<script|on\w+\s*=|javascript:/i.test(x) ? x : esc(x); }

  var JEET_STEPS = [
  { id: 'treat', ico: '<svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><circle cx="20" cy="23" r="14" fill="#f58a1f"/><circle cx="15" cy="18" r="4" fill="#fbb35a" opacity=".7"/><path d="M20 9c0-3 2-5 4-5 0 3-1 5-4 5z" fill="#3c8a3e"/><rect x="19" y="7" width="2" height="4" rx="1" fill="#5a3d1e"/></svg><svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><rect x="5" y="26" width="30" height="8" rx="2.5" fill="#e3b565" stroke="#b98036" stroke-width="1.5"/><path d="M6 24h28v3H6z" fill="#c4142f"/><path d="M6 24c3 3 5-1 8 1s5-2 8 1 5-2 8 0 3 0 4-1v3H6z" fill="#c4142f"/><path d="M6 12c0-3 3-5 14-5s14 2 14 5v10H6z" fill="#e3b565" stroke="#b98036" stroke-width="1.5" stroke-linejoin="round"/><rect x="5" y="22" width="30" height="3" fill="#c4142f"/></svg>', en: 'Prepare baby treat food', hi: 'बेबी ट्रीट (खाना) तैयार करो' },
  { id: 'water', ico: '🥛', en: 'Bring a glass of warm water for Jeet', hi: 'जीत के लिए गरम पानी का गिलास लाओ' },
  { id: 'furn', ico: '🛋️', en: 'Arrange furniture', hi: 'फ़र्नीचर ठीक से लगाओ' },
  { id: 'small', ico: '<svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><path d="M4 17h32c0 11-7 17-16 17S4 28 4 17z" fill="#3f8fd2"/><ellipse cx="20" cy="17" rx="16" ry="3.5" fill="#8cc4f0"/><ellipse cx="20" cy="17.5" rx="12.5" ry="2" fill="#2d6ea8"/></svg><svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><polygon points="20,5 35,13 20,21 5,13" fill="#ecc98f"/><polygon points="5,13 20,21 20,36 5,28" fill="#c99a5b"/><polygon points="20,21 35,13 35,28 20,36" fill="#a8763a"/><path d="M5 13l15 8 15-8M20 21v15" fill="none" stroke="#7a5326" stroke-width="1" stroke-linejoin="round"/></svg>', en: 'Bring bowl of small toys', hi: 'छोटे खिलौनों का कटोरा लाओ' },
  { id: 'large', ico: '🥁', en: 'Arrange large toys', hi: 'बड़े खिलौने लगाओ', photo: 'jeet-toys.jpg' }
];
  /* The first task, made from the old Jeet checklist. People are found by name, so it fits whatever ids the board uses. */
  function seedTasks(people) {
    var find = function (re, id) { return (people || []).filter(function (p) { return p.id === id; })[0] || (people || []).filter(function (p) { return re.test(p.name || ''); })[0]; };
    var nanny = find(/^sangee?ta/i, 'sangeetha'), jeet = find(/^jeet\b/i, 'jeet');
    if (!nanny || !jeet) return [];
    return [{ id: 'jeet-prep', title: 'Get ready for Jeet', titleHi: 'जीत की तैयारी', icon: '✅', personId: nanny.id, sort: 1,
      note: 'Before Jeet\'s session.', noteHi: 'जीत के आने से पहले।',
      rule: { kind: 'with', personId: jeet.id },
      steps: JEET_STEPS.map(function (s) { var r = { id: s.id, en: s.en, hi: s.hi, ico: s.ico }; if (s.photo) r.photo = s.photo; return r; }) }];
  }

  function person(S, id) { return (S.people || []).filter(function (p) { return p.id === id; })[0] || null; }
  /* Is this task due on this date? dayStatus is the page's own (S, person, date) -> { state }. */
  function dueOn(S, t, date, dayStatus) {
    if (!t || t.off || !t.rule) return false;
    var who = person(S, t.personId);
    if (!who || out(dayStatus(S, who, date))) return false;
    var r = t.rule;
    if (r.skipHolidays && (S.holidays || []).some(function (h) { return h.date === date; })) return false;
    if (r.kind === 'date') return r.date === date;
    if (r.kind === 'days') return (r.days || []).indexOf(dow(date)) >= 0;
    if (r.kind === 'with') { var o = person(S, r.personId); return !!o && !out(dayStatus(S, o, date)); }
    return false;
  }
  function sorted(list) { return (list || []).slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || String(a.title).localeCompare(String(b.title)); }); }
  function dueFor(S, tasks, personId, date, dayStatus) { return sorted(tasks).filter(function (t) { return t.personId === personId && dueOn(S, t, date, dayStatus); }); }
  function ruleText(S, t, lang) {
    var r = t.rule || {}, hi = lang === 'hi', o = person(S, r.personId), x;
    if (r.kind === 'with') x = hi ? 'जब ' + ((o && (o.nameHi || o.name)) || '?') + ' आएँ' : 'Whenever ' + ((o && o.name) || '(nobody)') + ' comes';
    else if (r.kind === 'days') x = (r.days || []).length === 7 ? (hi ? 'रोज़' : 'Every day') : [1, 2, 3, 4, 5, 6, 0].filter(function (d) { return (r.days || []).indexOf(d) >= 0; }).map(function (d) { return (hi ? DAYS_HI : DAYS_EN)[d]; }).join(', ') || (hi ? 'कभी नहीं' : 'No days chosen');
    else if (r.kind === 'date') x = r.date ? (hi ? r.date : 'On ' + (+r.date.slice(8)) + ' ' + MON_EN[+r.date.slice(5, 7) - 1] + ' ' + r.date.slice(0, 4)) : (hi ? '' : 'No date chosen');
    else x = '';
    if (r.skipHolidays && !hi) x += ', not on public holidays';
    return x;
  }
  function tickId(date, taskId, stepId) { return date + '|' + taskId + '|' + stepId; }
  function doneSet(ticks, date, taskId) { var o = {}; (ticks || []).forEach(function (k) { if (k.date === date && k.taskId === taskId) o[k.stepId] = true; }); return o; }
  function progress(t, done) { var n = 0; (t.steps || []).forEach(function (s) { if (done[s.id]) n++; }); return { n: n, total: (t.steps || []).length }; }

  /* ---------- Photos: site files load directly; server photos need the key, so they are fetched and kept as blob URLs. ---------- */
  var PH = { api: '', key: '', urls: {}, busy: {}, bad: {} };
  function photoCfg(api, key) { PH.api = (api || '').replace(/\/+$/, ''); PH.key = key || ''; }
  function isServerPhoto(ref) { return /^ph-[a-f0-9]{20}$/.test(ref || ''); }
  function photoImg(ref, alt, cls) {
    if (!ref) return '';
    if (!isServerPhoto(ref)) return '<img class="' + (cls || '') + '" src="' + esc(ref) + '" alt="' + esc(alt) + '">';
    var u = PH.urls[ref];
    return '<img class="' + (cls || '') + (u ? '' : ' tk-wait') + '" data-tk-photo="' + ref + '"' + (u ? ' src="' + u + '"' : '') + ' alt="' + esc(PH.bad[ref] ? 'Photo could not load' : alt) + '">';
  }
  /* After drawing, fetch any server photos not yet here and put them into their <img>. */
  function fillPhotos(root) {
    if (!root) return;
    var imgs = root.querySelectorAll('img[data-tk-photo]');
    for (var i = 0; i < imgs.length; i++) (function (img) {
      var ref = img.getAttribute('data-tk-photo');
      if (PH.urls[ref]) { img.src = PH.urls[ref]; img.classList.remove('tk-wait'); return; }
      if (!PH.api || !PH.key || PH.bad[ref]) return;
      if (!PH.busy[ref]) PH.busy[ref] = fetch(PH.api + '/api/photo/' + ref, { headers: { Authorization: 'Bearer ' + PH.key } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (b) { PH.urls[ref] = URL.createObjectURL(b); return PH.urls[ref]; }, function () { PH.bad[ref] = true; delete PH.busy[ref]; return null; });
      PH.busy[ref].then(function (u) { if (u && img.isConnected) { img.src = u; img.classList.remove('tk-wait'); } });
    })(imgs[i]);
  }
  /* Shrink a chosen photo (longest side 1280 px, JPEG) and send it. Resolves to the new photo id. */
  function uploadPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!PH.api || !PH.key) return reject(new Error('Connect to the shared board first (Admin tab) to add photos.'));
      var url = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo.')); };
      im.onload = function () {
        var max = 1280, w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var q = 0.8, data = c.toDataURL('image/jpeg', q).split(',')[1];
        while (data.length > 1300 * 1024 && q > 0.35) { q -= 0.15; data = c.toDataURL('image/jpeg', q).split(',')[1]; }
        fetch(PH.api + '/api/v2/photo', { method: 'POST', headers: { Authorization: 'Bearer ' + PH.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: 'image/jpeg', data: data }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
          .then(function (r) {
            if (r.s === 200 && r.j.id) { PH.urls[r.j.id] = 'data:image/jpeg;base64,' + data; resolve(r.j.id); }
            else reject(new Error(r.s === 404 || r.s === 405 ? 'The Home Board server needs updating before photos can be added.' : (r.j.error || 'Upload failed (' + r.s + ').')));
          }, function () { reject(new Error('Could not reach the server. Try again.')); });
      };
      im.src = url;
    });
  }

  /* ---------- The checklist for one task on one day ----------
   * lang 'hi': Hindi only (staff). Otherwise English with the Hindi line under it.
   * Buttons: data-tk-step="stepId" (tick), data-tk-zoom="stepId" (photo bigger/smaller). */
  function view(t, done, opts) {
    opts = opts || {};
    var hi = opts.lang === 'hi', zoom = opts.zoom || {}, p = progress(t, done), all = p.total && p.n === p.total;
    var note = hi ? (t.noteHi || '') : (t.note || ''), h = '';
    if (note || (!hi && t.noteHi)) h += '<div class="tk-note">' + (hi ? esc(note) : esc(t.note || '') + (t.noteHi ? '<span class="jc-hi">' + esc(t.noteHi) + '</span>' : '')) + '</div>';
    if (!p.total) return h + '<p class="tk-empty">' + (hi ? 'कोई काम नहीं लिखा' : 'This task has no steps yet.') + '</p>';
    h += '<div class="jc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-valuenow="' + p.n + '"><span style="width:' + Math.round(100 * p.n / p.total) + '%"></span></div>' +
      '<div class="jc-count">' + (all ? (hi ? '🎉 सब हो गया!' : '🎉 All done!') : (hi ? p.total + ' में से ' + p.n + ' हो गया' : p.n + ' of ' + p.total + ' done')) + '</div><div class="jc-list">';
    (t.steps || []).forEach(function (s) {
      var on = !!done[s.id], txt = hi ? (s.hi || s.en) : s.en;
      h += '<div class="jc-item' + (on ? ' done' : '') + '"><button class="jc-main" data-tk-step="' + esc(s.id) + '" aria-pressed="' + on + '">' +
        '<span class="jc-box" aria-hidden="true">' + (on ? '✓' : '') + '</span>' + (s.ico ? '<span class="jc-ico" aria-hidden="true">' + icon(s.ico) + '</span>' : '') +
        '<span class="jc-txt">' + (hi ? '<b class="jc-hib">' + esc(txt) + '</b>' : '<b>' + esc(s.en || s.hi) + '</b>' + (s.hi && s.en ? '<span class="jc-hi">' + esc(s.hi) + '</span>' : '')) + '</span></button>' +
        (s.photo ? '<button class="jc-pic' + (zoom[s.id] ? ' zoom' : '') + '" data-tk-zoom="' + esc(s.id) + '" aria-label="' + (hi ? 'फ़ोटो बड़ी करो' : 'Show the photo bigger or smaller') + '">' + photoImg(s.photo, txt) + '</button>' : '') +
        '</div>';
    });
    return h + '</div>';
  }
  /* A row for a person's day: icon, title and progress, as a button that opens the task. */
  function chip(t, done, lang, cls) {
    var p = progress(t, done), hi = lang === 'hi', all = p.total && p.n === p.total;
    return '<button class="tk-chip' + (all ? ' all' : '') + (cls ? ' ' + cls : '') + '" data-tk-open="' + esc(t.id) + '"><span class="tk-ci" aria-hidden="true">' + icon(t.icon || '📋') + '</span>' +
      '<span class="tk-ct">' + esc(hi ? (t.titleHi || t.title) : t.title) + '</span><span class="tk-cn">' + (all ? (hi ? '✓ हो गया' : '✓ Done') : p.n + '/' + p.total) + '</span></button>';
  }

  var CSS = '/* Jeet checklist */\n.jc-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }\n.jc-title { margin: 4px 0 2px; }\n.jc-bar { height: 14px; border-radius: 999px; background: var(--line,#dde2ea); overflow: hidden; margin: 10px 0 6px; }\n.jc-bar > span { display: block; height: 100%; background: var(--good,var(--go,#25693a)); border-radius: 999px; transition: width .2s; }\n.jc-count { font-weight: 700; font-size: 17px; margin-bottom: 10px; }\n.jc-list { display: flex; flex-direction: column; gap: 10px; }\n.jc-item { border: 3px solid var(--line,#dde2ea); border-radius: 18px; background: var(--surface,#fff); overflow: hidden; }\n.jc-item.done { border-color: var(--good,var(--go,#25693a)); background: var(--good-bg,var(--go-bg,#e3f4e9)); }\n.jc-main { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 76px; padding: 10px 12px; border: 0; background: transparent; color: var(--ink,#1b2430); font: inherit; text-align: left; cursor: pointer; }\n.jc-box { flex: none; width: 38px; height: 38px; border-radius: 10px; border: 3px solid var(--ink,#1b2430); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: var(--good,var(--go,#25693a)); background: var(--surface,#fff); }\n.jc-item.done .jc-box { border-color: var(--good,var(--go,#25693a)); }\n.jc-ico { flex: none; display: flex; align-items: center; gap: 2px; font-size: 34px; line-height: 1; width: 80px; justify-content: center; }\n.jc-ico svg { display: block; flex: none; width: 37px; height: 37px; }\n.jc-txt { display: flex; flex-direction: column; gap: 2px; font-size: 17px; min-width: 0; }\n.jc-item.done .jc-txt b { text-decoration: line-through; }\n.jc-num { display: none; }\n.jc-hi { font-size: 15px; color: var(--muted,#5b6676); }\n.jc-pic { display: block; width: 100%; padding: 0 12px 12px; border: 0; background: transparent; cursor: zoom-in; }\n.jc-pic img { display: block; width: 100%; max-height: 150px; object-fit: cover; border-radius: 12px; border: 2px solid var(--line,#dde2ea); }\n.jc-pic.zoom img { max-height: none; object-fit: contain; }' + '\n.jc-hib { font-size: 22px; line-height: 1.25; }' +
    '\n.jc-hib { font-size: 22px; line-height: 1.25; }' +
    '\n.jc-pic img.tk-wait { min-height: 90px; background: var(--line,#dde2ea); }' +
    '\n.tk-note { font-size: 17px; font-weight: 600; margin: 4px 0 8px; display: flex; flex-direction: column; gap: 2px; }' +
    '\n.tk-empty { color: var(--muted,#5b6676); }' +
    '\n.tk-chip { display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 8px; padding: 10px 12px; border: 2px solid var(--line,#dde2ea); border-radius: 14px; background: var(--surface,#fff); color: var(--ink,#1b2430); font: inherit; font-weight: 700; text-align: left; cursor: pointer; }' +
    '\n.tk-chip.all { border-color: var(--good,var(--go,#25693a)); background: var(--good-bg,var(--go-bg,#e3f4e9)); }' +
    '\n.tk-ci { flex: none; font-size: 24px; line-height: 1; display: flex; } .tk-ci svg { width: 28px; height: 28px; }' +
    '\n.tk-ct { flex: 1; min-width: 0; } .tk-cn { flex: none; font-variant-numeric: tabular-nums; }';
  try { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); } catch (e) { }

  g.Tasks = { seed: seedTasks, dueOn: dueOn, dueFor: dueFor, sorted: sorted, ruleText: ruleText, person: person, tickId: tickId, doneSet: doneSet, progress: progress,
    view: view, chip: chip, icon: icon, esc: esc, uid: uid, photoCfg: photoCfg, photoImg: photoImg, fillPhotos: fillPhotos, uploadPhoto: uploadPhoto, isServerPhoto: isServerPhoto };
})(window);
