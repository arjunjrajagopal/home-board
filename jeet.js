/* Jeet checklist: the steps for getting ready for Jeet's session, shared by index.html (family) and staff.html (Sangeetha).
   Ticks are kept on the phone, one set per day. */
(function (g) {
  var KEY = 'homeboard.jeetChecklist';
  var ITEMS = [
  { id: 'treat', ico: '<svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><circle cx="20" cy="23" r="14" fill="#f58a1f"/><circle cx="15" cy="18" r="4" fill="#fbb35a" opacity=".7"/><path d="M20 9c0-3 2-5 4-5 0 3-1 5-4 5z" fill="#3c8a3e"/><rect x="19" y="7" width="2" height="4" rx="1" fill="#5a3d1e"/></svg><svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><rect x="5" y="26" width="30" height="8" rx="2.5" fill="#e3b565" stroke="#b98036" stroke-width="1.5"/><path d="M6 24h28v3H6z" fill="#c4142f"/><path d="M6 24c3 3 5-1 8 1s5-2 8 1 5-2 8 0 3 0 4-1v3H6z" fill="#c4142f"/><path d="M6 12c0-3 3-5 14-5s14 2 14 5v10H6z" fill="#e3b565" stroke="#b98036" stroke-width="1.5" stroke-linejoin="round"/><rect x="5" y="22" width="30" height="3" fill="#c4142f"/></svg>', en: 'Prepare baby treat food', hi: 'बेबी ट्रीट (खाना) तैयार करो' },
  { id: 'water', ico: '🥛', en: 'Bring a glass of warm water for Jeet', hi: 'जीत के लिए गरम पानी का गिलास लाओ' },
  { id: 'furn', ico: '🛋️', en: 'Arrange furniture', hi: 'फ़र्नीचर ठीक से लगाओ' },
  { id: 'small', ico: '<svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><path d="M4 17h32c0 11-7 17-16 17S4 28 4 17z" fill="#3f8fd2"/><ellipse cx="20" cy="17" rx="16" ry="3.5" fill="#8cc4f0"/><ellipse cx="20" cy="17.5" rx="12.5" ry="2" fill="#2d6ea8"/></svg><svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true"><polygon points="20,5 35,13 20,21 5,13" fill="#ecc98f"/><polygon points="5,13 20,21 20,36 5,28" fill="#c99a5b"/><polygon points="20,21 35,13 35,28 20,36" fill="#a8763a"/><path d="M5 13l15 8 15-8M20 21v15" fill="none" stroke="#7a5326" stroke-width="1" stroke-linejoin="round"/></svg>', en: 'Bring bowl of small toys', hi: 'छोटे खिलौनों का कटोरा लाओ' },
  { id: 'large', ico: '🥁', en: 'Arrange large toys', hi: 'बड़े खिलौने लगाओ', pic: 'jeet-toys.jpg' }
];
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load(date) {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
    if (!o || o.date !== date || !Array.isArray(o.done)) o = { date: date, done: [] };
    return o;
  }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
  function doneCount(date) { var st = load(date); return ITEMS.filter(function (it) { return st.done.indexOf(it.id) >= 0; }).length; }
  function toggle(date, id) {
    var s = load(date), k = s.done.indexOf(id);
    if (k >= 0) s.done.splice(k, 1); else s.done.push(id);
    save(s);
  }
  function reset(date) { save({ date: date, done: [] }); }
  /* The progress bar, the count and the five steps. lang 'hi': Hindi only (staff). Otherwise English with a Hindi line under it. */
  function html(date, lang, zoom) {
    var st = load(date), n = doneCount(date), all = n === ITEMS.length, hi = lang === 'hi';
    var h = '<div class="jc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + ITEMS.length + '" aria-valuenow="' + n + '"><span style="width:' + Math.round(100 * n / ITEMS.length) + '%"></span></div>' +
      '<div class="jc-count">' + (all ? (hi ? '🎉 सब तैयार है!' : '🎉 All ready for Jeet!') : (hi ? ITEMS.length + ' में से ' + n + ' हो गया' : n + ' of ' + ITEMS.length + ' done')) + '</div><div class="jc-list">';
    ITEMS.forEach(function (it, i) {
      var on = st.done.indexOf(it.id) >= 0;
      h += '<div class="jc-item' + (on ? ' done' : '') + '"><button class="jc-main" data-jeet-item="' + it.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="jc-box" aria-hidden="true">' + (on ? '✓' : '') + '</span><span class="jc-ico" aria-hidden="true">' + it.ico + '</span>' +
        '<span class="jc-txt">' + (hi ? '<b class="jc-hib">' + esc(it.hi) + '</b>' : '<b>' + esc(it.en) + '</b><span class="jc-hi">' + esc(it.hi) + '</span>') + '</span></button>' +
        (it.pic ? '<button class="jc-pic' + (zoom ? ' zoom' : '') + '" data-jeet-zoom="1" aria-label="' + (hi ? 'बड़े खिलौनों की फ़ोटो' : 'Show the large toys picture ' + (zoom ? 'smaller' : 'bigger')) + '"><img src="' + it.pic + '" alt="' + (hi ? 'बड़े खिलौने ऐसे लगाओ' : 'How the large toys should be arranged') + '"></button>' : '') +
        '</div>';
    });
    return h + '</div>';
  }
  var CSS = '/* Jeet checklist */\n.jc-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }\n.jc-title { margin: 4px 0 2px; }\n.jc-bar { height: 14px; border-radius: 999px; background: var(--line,#dde2ea); overflow: hidden; margin: 10px 0 6px; }\n.jc-bar > span { display: block; height: 100%; background: var(--good,var(--go,#25693a)); border-radius: 999px; transition: width .2s; }\n.jc-count { font-weight: 700; font-size: 17px; margin-bottom: 10px; }\n.jc-list { display: flex; flex-direction: column; gap: 10px; }\n.jc-item { border: 3px solid var(--line,#dde2ea); border-radius: 18px; background: var(--surface,#fff); overflow: hidden; }\n.jc-item.done { border-color: var(--good,var(--go,#25693a)); background: var(--good-bg,var(--go-bg,#e3f4e9)); }\n.jc-main { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 76px; padding: 10px 12px; border: 0; background: transparent; color: var(--ink,#1b2430); font: inherit; text-align: left; cursor: pointer; }\n.jc-box { flex: none; width: 38px; height: 38px; border-radius: 10px; border: 3px solid var(--ink,#1b2430); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: var(--good,var(--go,#25693a)); background: var(--surface,#fff); }\n.jc-item.done .jc-box { border-color: var(--good,var(--go,#25693a)); }\n.jc-ico { flex: none; display: flex; align-items: center; gap: 2px; font-size: 34px; line-height: 1; width: 80px; justify-content: center; }\n.jc-ico svg { display: block; flex: none; width: 37px; height: 37px; }\n.jc-txt { display: flex; flex-direction: column; gap: 2px; font-size: 17px; min-width: 0; }\n.jc-item.done .jc-txt b { text-decoration: line-through; }\n.jc-num { display: none; }\n.jc-hi { font-size: 15px; color: var(--muted,#5b6676); }\n.jc-pic { display: block; width: 100%; padding: 0 12px 12px; border: 0; background: transparent; cursor: zoom-in; }\n.jc-pic img { display: block; width: 100%; max-height: 150px; object-fit: cover; border-radius: 12px; border: 2px solid var(--line,#dde2ea); }\n.jc-pic.zoom img { max-height: none; object-fit: contain; }' + '\n.jc-hib { font-size: 22px; line-height: 1.25; }';
  try { var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); } catch (e) { }
  g.JeetList = { items: ITEMS, html: html, toggle: toggle, reset: reset, count: doneCount };
})(window);
