/* Fridge: what is in the fridge, shared by the family board (index.html) and later the staff page.
 * Every slot starts greyed out. Tap an item to show what is in the fridge.
 *   eggs, Baby's milk, Baby's yoghurt: tap = in / out
 *   paneer: half, full, none     butter, bread, cheese tin: quarter, half, three quarters, full, none
 * Fridge.use({ get(id) -> array|null, put(id, array) }) plugs in where it is kept (the family board and the staff screen
 * keep it in the shared board: one row per shelf, {id, v: [0..steps per slot]}). Without it, this device only (localStorage).
 * Fridge.mount(host, { lang: 'en'|'hi', reset: true|false }) -> { render() }   Fridge.summary() -> rows for a read-only list
 */
(function (global) {
  'use strict';
  var KEY = 'hb-fridge-v1';
  var CSS = `
.fr { max-width: 1100px; margin: 0 auto; }
.fr-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 2px 10px; }
.fr-head h2 { margin: 0; font-size: 20px; }
.fr-head h2 small { display: block; font-size: 14px; font-weight: 600; color: var(--muted); }
.fr-fridge { background: var(--surface); border: 5px solid var(--line); border-radius: 20px; overflow: hidden; }
.fr-cat { padding: 12px 14px 0; }
.fr-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.fr-name b { font-size: 17px; margin-right: 8px; }
.fr-name span { font-size: 14px; color: var(--muted); }
.fr-count { min-width: 64px; padding: 3px 10px; border-radius: 999px; text-align: center; background: var(--soft); border: 2px solid var(--line); font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.fr-count.low { background: var(--warn-bg); border-color: var(--warn); color: var(--warn); }
.fr-count.out { background: var(--bad-bg); border-color: var(--bad); color: var(--bad); }
.fr-items { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; min-height: 60px; padding-bottom: 2px; }
.fr-shelf { height: 14px; background: linear-gradient(var(--line), var(--muted)); opacity: .55; margin: 0 -14px; border-radius: 0 0 6px 6px; }
.fr-unit { border: 0; background: none; padding: 0; cursor: pointer; display: block; transition: transform .12s, opacity .2s, filter .2s; font: inherit; color: inherit; }
.fr-unit:active { transform: scale(.92); }
.fr-unit.gone { opacity: .22; filter: grayscale(1); }
.fr-unit svg { display: block; }
.fr-unit.lvl { display: flex; flex-direction: column; align-items: center; }
.fr-tray { display: grid; grid-template-columns: repeat(3, auto); gap: 3px; padding: 6px; background: #d9c9a8; border-radius: 10px; border: 2px solid #bfa97d; }
.fr-tray .fr-unit svg { width: 26px; height: 32px; }
.fr-stack { position: relative; display: block; }
.fr-stack .fr-base { display: block; opacity: .22; filter: grayscale(1); }
.fr-stack .fr-fill { position: absolute; left: 0; top: 0; display: block; }
.fr-frac { display: block; min-height: 20px; margin-top: 3px; font-size: 15px; font-weight: 800; color: var(--accent); line-height: 20px; }
.fr-hi .fr-name b { font-size: 24px; }
.fr-hi .fr-count { font-size: 20px; }
.fr-hi .fr-hint { font-size: 17px; }
.fr-hint { margin: 10px 6px 0; font-size: 13px; color: var(--muted); text-align: center; }
`;

  const ART = {
    egg: `<svg viewBox="0 0 26 32" width="26" height="32"><ellipse cx="13" cy="18" rx="10" ry="12.5" fill="#f3e3c3" stroke="#c9a96a" stroke-width="1.6"/><ellipse cx="9.5" cy="13" rx="3" ry="4.5" fill="#fff8e8" opacity=".8"/></svg>`,
    butter: `<svg viewBox="0 0 70 30" width="70" height="30"><rect x="1" y="3" width="68" height="24" rx="4" fill="#f6d34a" stroke="#c9a21f" stroke-width="2"/><rect x="1" y="3" width="68" height="9" rx="4" fill="#fbe583"/><rect x="14" y="3" width="16" height="24" fill="#fff" opacity=".85"/><rect x="40" y="3" width="16" height="24" fill="#fff" opacity=".85"/><rect x="14" y="13" width="42" height="4" fill="#e8b92b" opacity=".0"/></svg>`,
    milk: `<svg viewBox="0 0 34 54" width="34" height="54"><path d="M7 14 L17 3 L27 14 Z" fill="#dbe9f2" stroke="#7fa0b4" stroke-width="2" stroke-linejoin="round"/><rect x="5" y="14" width="24" height="38" rx="2" fill="#fff" stroke="#7fa0b4" stroke-width="2"/><rect x="5" y="26" width="24" height="14" fill="#4aa3df"/><circle cx="17" cy="33" r="4.2" fill="#fff"/><circle cx="17" cy="33" r="1.8" fill="#4aa3df"/></svg>`,
    yoghurt: `<svg viewBox="0 0 34 54" width="34" height="54"><rect x="4" y="18" width="26" height="5" rx="2" fill="#cfd8dc" stroke="#7f949f" stroke-width="2"/><path d="M6 23 L28 23 L25 50 Q25 52 23 52 L11 52 Q9 52 9 50 Z" fill="#fff" stroke="#7f949f" stroke-width="2" stroke-linejoin="round"/><path d="M7.2 32 L26.8 32 L25.6 44 L8.4 44 Z" fill="#3f8fe0"/><circle cx="17" cy="38" r="3.4" fill="#fff"/></svg>`,
    bread: `<svg viewBox="0 0 84 46" width="84" height="46"><path d="M8 40 Q2 40 2 32 Q2 14 14 10 Q22 3 42 3 Q62 3 70 10 Q82 14 82 32 Q82 40 76 40 Z" fill="#b9793b" stroke="#7a4a1c" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 38 Q6 36 6 31 Q6 18 16 15 Q24 8 42 8 Q60 8 68 15 Q78 18 78 31 Q78 36 74 38 Z" fill="#d79a5a"/><path d="M26 10 L26 38 M42 8 L42 38 M58 10 L58 38" stroke="#b9793b" stroke-width="1.4" opacity=".6"/></svg>`,
    paneer: `<svg viewBox="0 0 56 36" width="56" height="36"><path d="M4 12 L16 3 L54 3 L42 12 Z" fill="#fffdf6" stroke="#cfc7ad" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="12" width="38" height="22" rx="2" fill="#f7f2e1" stroke="#cfc7ad" stroke-width="2"/><path d="M42 12 L54 3 L54 25 L42 34 Z" fill="#e9e2c9" stroke="#cfc7ad" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="20" r="1.3" fill="#d8cfae"/><circle cx="28" cy="25" r="1.3" fill="#d8cfae"/><circle cx="33" cy="17" r="1.1" fill="#d8cfae"/></svg>`,
    banana: `<svg viewBox="0 0 40 36" width="40" height="36"><path d="M7 7 Q3 27 22 33 Q35 36 38 22 Q28 28 19 22 Q13 16 15 6 Z" fill="#f7d13a" stroke="#b08a12" stroke-width="2" stroke-linejoin="round"/><path d="M7 7 L9.5 2.5 L15 4 L15 6 Z" fill="#6b5a1e" stroke="#4a3e12" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 12 Q10 24 24 29" fill="none" stroke="#fbe98a" stroke-width="2" stroke-linecap="round"/></svg>`,
    cheese: `<svg viewBox="0 0 60 44" width="60" height="44"><path d="M4 16 L20 4 L56 4 L40 16 Z" fill="#ffe27a" stroke="#c99a12" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="16" width="36" height="24" rx="2" fill="#f9c933" stroke="#c99a12" stroke-width="2"/><path d="M40 16 L56 4 L56 28 L40 40 Z" fill="#e5b017" stroke="#c99a12" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="26" r="3" fill="#e0a812"/><circle cx="27" cy="31" r="2.2" fill="#e0a812"/><circle cx="30" cy="22" r="1.6" fill="#e0a812"/></svg>`
  };

  // ---------- what's in the fridge ----------
  // groups: array of group sizes (eggs sit in trays of 6); total units = sum
  const CATS = [
    { id:'eggs',   en:'Eggs',        hi:'अंडे',     art:'egg',    groups:[6,6,6],   note:'3 trays × 6' },
    { id:'butter', en:'Butter',      hi:'मक्खन',    art:'butter', groups:[3],       note:'3 sticks', levels:true, steps:4 },
    { id:'milk',   en:"Baby's milk", hi:'बेबी का दूध',      art:'milk',   groups:[8],       note:'8 small cartons' },
    { id:'yoghurt', en:"Baby's yoghurt", hi:'बेबी का दही', art:'yoghurt', groups:[8], note:'8 cups' },
    { id:'bread',  en:'Brown bread', hi:'ब्रेड',     art:'bread',  groups:[3],       note:'3 loaves', levels:true, steps:4 },
    { id:'paneer', en:'Paneer',      hi:'पनीर',     art:'paneer', groups:[3],       note:'3 blocks', levels:true, steps:2 },
    { id:'banana', en:'Bananas', hi:'केले', art:'banana', groups:[6], note:'6 bananas' },
  { id:'cheese', en:'Amul cheese', hi:'चीज़',      art:'cheese', groups:[3],       note:'3 tins', levels:true, steps:4, slices:true }
  ];

  const FRAC = ['', '¼', '½', '¾'];
  const levelLabel = (c, q, hi) => q === 0 ? '' : (q === c.steps ? (hi ? 'पूरा' : 'full') : (c.steps === 2 ? '½' : FRAC[q]));
  function tinSVG(q){
    let slabs = '';
    for(let i=0;i<4;i++){
      const on = i < q, x = 12 + i*15;
      slabs += `<rect x="${x}" y="17" width="14" height="30" rx="1.5" fill="${on ? '#fff1ad' : '#a67c0c'}" stroke="${on ? '#e3cf78' : '#8a680a'}" stroke-width="1"/>`;
    }
    return `<svg viewBox="0 0 84 62" width="84" height="62"><rect x="2" y="6" width="80" height="50" rx="6" fill="#f5c518" stroke="#b98a0a" stroke-width="2.2"/>` +
      `<rect x="1" y="2" width="82" height="10" rx="5" fill="#e0a90f" stroke="#b98a0a" stroke-width="2"/>` +
      `<rect x="1" y="50" width="82" height="10" rx="5" fill="#e0a90f" stroke="#b98a0a" stroke-width="2"/>` +
      `<rect x="9" y="14" width="66" height="36" rx="3" fill="#8a680a"/>` + slabs + `</svg>`;
  }
  const fmt = x => { const w = Math.floor(x), q = Math.round((x - w)*4); return q ? (w ? w : '') + FRAC[q] : String(w); };
  const total = c => c.groups.reduce((a,b)=>a+b,0);

  function inject() {
    if (document.getElementById('fr-css')) return;
    var st = document.createElement('style'); st.id = 'fr-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* ---------- where it is kept ---------- */
  var local = {};
  try { local = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { local = {}; }
  var store = {
    get: function (id) { return local[id] || null; },
    put: function (id, arr) { local[id] = arr; try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) { } }
  };
  function use(s) { store = s; }
  /* A shelf's slots as numbers: 0 = none in the fridge; 1 = in the fridge (eggs, milk, yoghurt, bananas); 1..steps = amount (the others). */
  function present(c) {
    var a = store.get(c.id), n = total(c), out = [];
    for (var i = 0; i < n; i++) {
      var v = a && a.length === n ? Number(a[i]) : 0;
      out.push(isFinite(v) && v >= 0 ? Math.min(v, c.levels ? c.steps : 1) : 0);
    }
    return out;
  }
  function amount(c, have) { return c.levels ? have.reduce(function (a, b) { return a + b; }, 0) / c.steps : have.filter(Boolean).length; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function mount(host, o) {
    o = o || {}; inject();
    var hi = o.lang === 'hi';
    function render() {
      host.innerHTML = '<div class="fr' + (hi ? ' fr-hi' : '') + '"><div class="fr-head"><h2>' + (hi ? 'फ्रिज में क्या है' : 'What\'s in the fridge<small>फ्रिज में क्या है</small>') + '</h2>' +
        (o.reset === false ? '' : '<button class="btn sm" data-fr="reset">Clear all · सब खाली</button>') + '</div><div class="fr-fridge" data-fr="fridge"></div>' +
        '<p class="fr-hint">' + (hi ? 'फ्रिज में जो है उसे दबाइए।' : 'Tap an item to show what is in the fridge · tap again to change it.<br>फ्रिज में जो है उसे दबाएँ।') + '</p></div>';
      var fridge = host.querySelector('[data-fr="fridge"]');
      CATS.forEach(function (c) {
        var have = present(c), cat = document.createElement('div'); cat.className = 'fr-cat';
        var items = document.createElement('div'); items.className = 'fr-items';
        var idx = 0;
        c.groups.forEach(function (size) {
          var box = c.id === 'eggs' ? document.createElement('div') : items;
          if (c.id === 'eggs') box.className = 'fr-tray';
          for (var i = 0; i < size; i++) {
            (function (n) {
              var b = document.createElement('button'), q = have[n];
              if (c.levels) {
                b.className = 'fr-unit lvl';
                b.setAttribute('aria-label', c.en + ' ' + (n + 1) + ': ' + (q ? levelLabel(c, q) + ' in fridge' : 'none in fridge'));
                var art = c.slices ? tinSVG(q) :
                  '<span class="fr-stack"><span class="fr-base">' + ART[c.art] + '</span><span class="fr-fill" style="clip-path:inset(0 ' + (100 - q * 100 / c.steps) + '% 0 0)">' + ART[c.art] + '</span></span>';
                b.innerHTML = art + '<span class="fr-frac">' + levelLabel(c, q, hi) + '</span>';
                b.onclick = function () { var a = present(c); a[n] = (a[n] + 1) % (c.steps + 1); store.put(c.id, a); render(); };
              } else {
                b.className = 'fr-unit' + (q ? '' : ' gone');
                b.setAttribute('aria-label', c.en + ' ' + (n + 1) + (q ? ' (in fridge)' : ' (taken out)'));
                b.innerHTML = ART[c.art];
                b.onclick = function () { var a = present(c); a[n] = a[n] ? 0 : 1; store.put(c.id, a); render(); };
              }
              box.appendChild(b);
            })(idx++);
          }
          if (c.id === 'eggs') items.appendChild(box);
        });
        var left = amount(c, have), all = have.length;
        var cls = left === 0 ? 'out' : (left <= Math.ceil(all * 0.25) ? 'low' : '');
        var top = document.createElement('div'); top.className = 'fr-top';
        top.innerHTML = '<div class="fr-name">' + (hi ? '<b>' + c.hi + '</b>' : '<b>' + esc(c.en) + '</b><span>' + c.hi + '</span>') + '</div><div class="fr-count ' + cls + '">' + fmt(left) + ' / ' + all + '</div>';
        cat.appendChild(top); cat.appendChild(items);
        var sh = document.createElement('div'); sh.className = 'fr-shelf'; cat.appendChild(sh);
        fridge.appendChild(cat);
      });
      var rs = host.querySelector('[data-fr="reset"]');
      if (rs) rs.onclick = function () { CATS.forEach(function (c) { store.put(c.id, Array(total(c)).fill(0)); }); render(); };
    }
    render();
    return { render: render };
  }

  /* One row per shelf for a read-only list (phone screen, staff screen). */
  function summary() {
    return CATS.map(function (c) {
      var have = present(c), left = amount(c, have);
      return { id: c.id, en: c.en, hi: c.hi, left: left, all: have.length, text: fmt(left) + ' / ' + have.length, icon: c.slices ? tinSVG(4) : ART[c.art] };
    });
  }

  global.Fridge = { CATS: CATS, mount: mount, summary: summary, use: use };
})(window);
