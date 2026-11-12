/* Sabzi: the vegetable cart and drying cloth, shared by the family board (index.html) and the staff page (staff.html).
 * Drag a vegetable from the cart onto the cloth; each drag adds one step (half a kilo, or one piece).
 * Drag a vegetable off the cloth to remove it. One list per day: Today and Tomorrow.
 *
 * Sabzi.mount(host, {
 *   lang:  'en' | 'hi'                  words on the day buttons
 *   today: 'YYYY-MM-DD'
 *   items: function (date) -> [ {id, date, veg, q, x, y} ]   what is on that day's cloth
 *   put:   function (row)               save a row (the host updates its list straight away)
 *   del:   function (id)                remove a row
 * }) -> { render(), show('today'|'tomorrow') }
 *
 * A row's id is "<date>|<vegetable id>", q is the amount (kilos, or pieces), x and y are where it sits on the cloth (0..1).
 */
(function (global) {
  'use strict';

  /* en = shown on the family board, n = Hindi (spoken). s = drawn icon below, e = emoji. */
  var VEG = [
    { id: 'tomato',  e: '🍅', en: 'Tomato',      n: 'टमाटर' },     { id: 'potato',  e: '🥔', en: 'Potato',      n: 'आलू' },      { id: 'onion',   e: '🧅', en: 'Onion',   n: 'प्याज़' },
    { id: 'gobhi',   s: 'ic-gobhi',   en: 'Cauliflower', n: 'फूलगोभी' },                                                           { id: 'okra',    s: 'ic-okra', en: 'Okra',    n: 'भिंडी' },
    { id: 'carrot',  e: '🥕', en: 'Carrot',      n: 'गाजर' },      { id: 'palak',   e: '🥬', en: 'Spinach',     n: 'पालक' },     { id: 'cucumber', e: '🥒', en: 'Cucumber', n: 'खीरा' },
    { id: 'peas',    s: 'ic-peas',    en: 'Peas',        n: 'मटर' },                                                                { id: 'lauki',   s: 'ic-lauki', en: 'Lauki',  n: 'लौकी' },
    { id: 'brinjal', e: '🍆', en: 'Brinjal',     n: 'बैंगन' },     { id: 'chilli',  e: '🌶️', en: 'Green chilli', n: 'मिर्च' },    { id: 'capsicum', e: '🫑', en: 'Capsicum', n: 'शिमला मिर्च' },
    { id: 'karela',  s: 'ic-karela',  en: 'Karela',      n: 'करेला' },                                                              { id: 'cabbage', s: 'ic-cabbage', en: 'Cabbage', n: 'पत्तागोभी' },
    { id: 'garlic',  e: '🧄', en: 'Garlic',      n: 'लहसुन' },     { id: 'lemon',   e: '🍋', en: 'Lemon',       n: 'नींबू' },     { id: 'corn',    e: '🌽', en: 'Corn',    n: 'भुट्टा' },
    { id: 'beet',    s: 'ic-beet',    en: 'Beetroot',    n: 'चुकंदर' },                                                             { id: 'mooli',   s: 'ic-mooli', en: 'Mooli',  n: 'मूली' }
  ];
  /* How each vegetable is bought. Default: kilos in half-kilo steps. */
  var UNIT = {
    chilli: { u: 'kg', step: 0.25 }, garlic: { u: 'kg', step: 0.25 }, palak: { u: 'kg', step: 0.25 },
    lemon: { u: 'pc', step: 1 }, corn: { u: 'pc', step: 1 }, gobhi: { u: 'pc', step: 1 }, cabbage: { u: 'pc', step: 1 }, lauki: { u: 'pc', step: 1 }
  };
  var MAXQ = 10, LIFT = 46, BYID = {};
  VEG.forEach(function (v) { var o = UNIT[v.id] || { u: 'kg', step: 0.5 }; v.u = o.u; v.step = o.step; BYID[v.id] = v; });

  /* ---------- amounts ---------- */
  function qtyText(v, q) { return v.u === 'pc' ? q + 'pc' : q + 'kg'; }                       /* 0.5kg, 1kg, 3pc */
  var HN = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह'];
  function qtyHindi(v, q) {                                                                    /* आधा किलो, डेढ़ किलो, ढाई किलो */
    var unit = v.u === 'pc' ? ' नग' : ' किलो', w = Math.floor(q), f = Math.round((q - w) * 100);
    if (v.u === 'pc') return (HN[q] || q) + unit;
    if (w === 0) return f === 25 ? 'पाव किलो' : f === 50 ? 'आधा किलो' : 'पौन किलो';
    if (f === 0) return HN[w] + unit;
    if (f === 25) return 'सवा ' + HN[w] + unit;
    if (f === 50) return (w === 1 ? 'डेढ़' : w === 2 ? 'ढाई' : 'साढ़े ' + HN[w]) + unit;
    return 'पौने ' + HN[w + 1] + unit;
  }

  /* ---------- dates ---------- */
  var DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
  var MON_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  function pd(s) { var a = s.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); }
  function addDays(s, n) { var d = pd(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dateEn(s) { var d = pd(s); return DAY_EN[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON_EN[d.getUTCMonth()]; }
  function dateHi(s) { var d = pd(s); return DAY_HI[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON_HI[d.getUTCMonth()]; }

  /* ---------- pictures ---------- */
  function iconHTML(id) {
    var v = BYID[id]; if (!v) return '';
    inject();
    return v.s ? '<svg class="sz-vi" viewBox="0 0 100 100" aria-hidden="true"><use href="#' + v.s + '"/></svg>' : '<span class="sz-em" aria-hidden="true">' + v.e + '</span>';
  }
  function glyph(v) { return v.s ? '<svg class="sz-vi"><use href="#' + v.s + '"/></svg>' : v.e; }

  /* The rows of one day's list in cart order: [{veg, q, text}] */
  function summary(rows) {
    return VEG.map(function (v) {
      var r = rows.filter(function (x) { return x.veg === v.id; })[0];
      return r ? { veg: v, q: r.q, text: qtyText(v, r.q), hindi: qtyHindi(v, r.q) } : null;
    }).filter(Boolean);
  }

  /* ---------- styles and drawn icons, added once ---------- */
  var CSS = `
.sz { --b: 60px; --lift: 46px; width: 100%; max-width: 480px; margin: 0 auto; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.sz * { box-sizing: border-box; }
.sz-days { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.sz-days button { border: 3px solid var(--dc); border-radius: 16px; background: #fff; color: var(--dc); padding: 8px 4px; font: inherit; font-weight: 800; font-size: 21px; line-height: 1.1; cursor: pointer; }
.sz-days button small { display: block; font-size: 13px; font-weight: 600; opacity: .85; }
.sz-days button[aria-pressed=true] { background: var(--dc); color: #fff; }
.sz-d0 { --dc: #1f8a4c; } .sz-d1 { --dc: #2a5db0; }
.sz-frame { border: 4px solid var(--dc); border-radius: 18px; overflow: hidden; background: #fff; }
.sz-banner { background: var(--dc); color: #fff; padding: 7px 14px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.sz-banner b { font-size: 26px; letter-spacing: .5px; text-transform: uppercase; }
.sz-banner span { font-size: 16px; font-weight: 600; opacity: .95; }
.sz-stage { position: relative; height: clamp(500px, calc(100svh - 290px), 700px); display: flex; flex-direction: column; touch-action: pan-y; }

.sz-cart { position: relative; flex: 0 0 47%; padding: 10px 22px 26px; background: #B9B2A2 radial-gradient(circle at 25% 30%, rgba(0,0,0,.07) 0 7px, transparent 8px) 0 0 / 46px 46px; }
.sz-wheel { position: absolute; top: calc(50% - 50px); width: 18px; height: 90px; border-radius: 8px; background: linear-gradient(90deg, #1d1d1d, #4a4a4a 50%, #1d1d1d); box-shadow: 0 4px 6px rgba(0,0,0,.3); }
.sz-wheel.l { left: 4px; } .sz-wheel.r { right: 4px; }
.sz-grip { position: absolute; bottom: 2px; width: 16px; height: 36px; border-radius: 9px; background: #5B3516; box-shadow: 0 3px 4px rgba(0,0,0,.35); }
.sz-grip.l { left: 27%; } .sz-grip.r { right: 27%; }
.sz-cb { position: relative; height: 100%; border-radius: 20px; border: 6px solid #6E4219; padding: 6px 2px;
  background: repeating-linear-gradient(180deg, #D8A05B 0 46px, #B97F3F 46px 49px); box-shadow: 0 8px 0 rgba(0,0,0,.2), inset 0 0 0 4px rgba(255,255,255,.14); }
.sz-grid { height: 100%; display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(4, 1fr); }
.sz-cell { display: flex; align-items: center; justify-content: center; }
.sz-bin { position: relative; width: var(--b); height: var(--b); border-radius: 50%; touch-action: none; cursor: grab;
  background: radial-gradient(circle, #F6E3B4 0 54%, #DDB467 55% 60%, #AE7A31 61% 67%, #7D5420 68% 71%, transparent 72%); filter: drop-shadow(0 5px 3px rgba(0,0,0,.35)); }
.sz-bin > span { position: absolute; left: 50%; top: 50%; line-height: 1; pointer-events: none; filter: drop-shadow(0 2px 2px rgba(0,0,0,.35)); }
.sz-bin .p1 { font-size: calc(var(--b) * .44); transform: translate(-50%, -50%) translate(-23%, -17%) rotate(-18deg); }
.sz-bin .p2 { font-size: calc(var(--b) * .44); transform: translate(-50%, -50%) translate(23%, -12%) rotate(16deg); }
.sz-bin .p3 { font-size: calc(var(--b) * .6);  transform: translate(-50%, -50%) translate(0, 9%); }
.sz-vi { display: block; width: 1em; height: 1em; }
.sz-em { font-style: normal; }
.sz-bin.bump { animation: sz-bump .3s; }
@keyframes sz-bump { 50% { transform: scale(1.12); } }

.sz-counter { position: relative; flex: 1; background: linear-gradient(#EADFC9, #D8CCB0); }
.sz-cloth { position: absolute; left: 12px; right: 12px; top: 14px; bottom: 14px; border-radius: 12px; transform: rotate(-.5deg); background-color: #fff;
  background-image: linear-gradient(90deg, rgba(51,102,204,.2) 50%, transparent 50%), linear-gradient(rgba(51,102,204,.2) 50%, transparent 50%); background-size: 38px 38px;
  box-shadow: 0 9px 18px rgba(0,0,0,.28), inset 0 0 0 9px rgba(255,255,255,.9), inset 0 0 0 12px rgba(51,102,204,.45); transition: box-shadow .12s; }
.sz-cloth::after { content: ""; position: absolute; inset: 0; border-radius: 12px; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,.4) 0 7%, transparent 19%, rgba(0,0,0,.06) 37%, transparent 52%, rgba(255,255,255,.35) 70%, rgba(0,0,0,.05) 88%, transparent); }
.sz-cloth.over { box-shadow: 0 0 0 7px #2B9348, 0 9px 18px rgba(0,0,0,.28), inset 0 0 0 9px rgba(255,255,255,.9), inset 0 0 0 12px rgba(51,102,204,.45); }
.sz-drop { position: absolute; font-size: 22px; opacity: .35; filter: saturate(.4); pointer-events: none; }
.sz-ci { position: absolute; width: 84px; height: 84px; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; font-size: 62px; line-height: 1;
  touch-action: none; cursor: grab; z-index: 2; filter: drop-shadow(0 5px 3px rgba(0,0,0,.3)); }
.sz-ci b { position: absolute; left: 50%; bottom: -14px; transform: translateX(-50%); white-space: nowrap; height: 30px; padding: 0 10px; border-radius: 15px; background: #D62828; color: #fff;
  font-size: 19px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 3px solid #fff; }
.sz-ci.pop { animation: sz-pop .38s; } .sz-ci.wob { animation: sz-wob .4s; }
@keyframes sz-pop { 0% { transform: translate(-50%, -50%) scale(.4); } 60% { transform: translate(-50%, -50%) scale(1.25); } 100% { transform: translate(-50%, -50%) scale(1); } }
@keyframes sz-wob { 25% { transform: translate(-50%, -50%) rotate(-10deg); } 75% { transform: translate(-50%, -50%) rotate(10deg); } }
.sz-hand { position: absolute; left: 0; top: 0; font-size: 56px; line-height: 1; pointer-events: none; z-index: 5; display: none; filter: drop-shadow(0 4px 4px rgba(0,0,0,.35)); animation: sz-hand 2.6s ease-in-out infinite; }
@keyframes sz-hand { 0% { transform: translate(var(--sx), var(--sy)) scale(1); opacity: 0; } 12% { opacity: 1; } 25% { transform: translate(var(--sx), var(--sy)) scale(.85); }
  75% { transform: translate(var(--ex), var(--ey)) scale(.85); opacity: 1; } 90% { opacity: 0; } 100% { transform: translate(var(--ex), var(--ey)) scale(.85); opacity: 0; } }
.sz-ghost { position: fixed; left: 0; top: 0; font-size: 88px; line-height: 1; transform: translate(-50%, -50%); pointer-events: none; z-index: 1000; display: none; filter: drop-shadow(0 12px 8px rgba(0,0,0,.35)); }
.sz-ico { display: inline-flex; width: 1.2em; height: 1.2em; align-items: center; justify-content: center; font-size: 28px; line-height: 1; vertical-align: middle; }
.sz-ico .sz-vi { width: 1em; height: 1em; }
`;
  var SPRITE = `<!-- drawn vegetable icons (the ones the emoji set doesn't have) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>

<symbol id="ic-gobhi" viewBox="0 0 100 100">
  <path d="M50 95 C20 93 4 70 8 44 C24 56 38 62 50 62 C62 62 76 56 92 44 C96 70 80 93 50 95Z" fill="#5CAE3A" stroke="#3F8A28" stroke-width="2"/>
  <path d="M50 95 C38 80 36 70 50 60 C64 70 62 80 50 95Z" fill="#82CC57"/>
  <g fill="#F8F3DE" stroke="#D5C998" stroke-width="2">
    <circle cx="27" cy="47" r="17"/><circle cx="73" cy="47" r="17"/><circle cx="50" cy="29" r="21"/><circle cx="37" cy="57" r="16"/><circle cx="63" cy="57" r="16"/>
  </g>
  <g fill="#fff" opacity=".95"><circle cx="43" cy="22" r="7"/><circle cx="21" cy="41" r="5"/><circle cx="67" cy="41" r="5"/><circle cx="33" cy="52" r="4"/></g>
</symbol>

<symbol id="ic-cabbage" viewBox="0 0 100 100">
  <defs><radialGradient id="gc" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#CBEF9C"/><stop offset="1" stop-color="#5BA838"/></radialGradient></defs>
  <circle cx="50" cy="54" r="41" fill="url(#gc)" stroke="#468C2B" stroke-width="2.5"/>
  <g fill="none" stroke="#E6F8CC" stroke-width="3.2" stroke-linecap="round">
    <path d="M50 93 C50 70 50 42 50 16"/><path d="M39 91 C25 70 24 44 36 22"/><path d="M61 91 C75 70 76 44 64 22"/>
    <path d="M27 83 C13 66 13 46 22 33"/><path d="M73 83 C87 66 87 46 78 33"/>
  </g>
  <path d="M13 58 C16 32 38 14 62 16" fill="none" stroke="#3F8A28" stroke-width="3" opacity=".45" stroke-linecap="round"/>
</symbol>

<symbol id="ic-okra" viewBox="0 0 100 100">
  <defs><linearGradient id="gk" x1="0" x2="1"><stop offset="0" stop-color="#4A972B"/><stop offset=".5" stop-color="#8FD25C"/><stop offset="1" stop-color="#4A972B"/></linearGradient></defs>
  <g transform="rotate(-27 50 95)">
    <path d="M42 22 C38 48 44 78 50 95 C56 78 62 48 58 22Z" fill="url(#gk)" stroke="#3C7F25" stroke-width="1.5"/>
    <path d="M46 26 C45 50 47 72 50 90 M54 26 C55 50 53 72 50 90" stroke="#3C7F25" stroke-width="1.4" fill="none" opacity=".55"/>
    <path d="M39 24 C39 12 61 12 61 24 C57 28 43 28 39 24Z" fill="#3A7727"/><rect x="47" y="6" width="6" height="10" rx="3" fill="#6B4A22"/>
  </g>
  <g transform="rotate(27 50 95)">
    <path d="M42 22 C38 48 44 78 50 95 C56 78 62 48 58 22Z" fill="url(#gk)" stroke="#3C7F25" stroke-width="1.5"/>
    <path d="M46 26 C45 50 47 72 50 90 M54 26 C55 50 53 72 50 90" stroke="#3C7F25" stroke-width="1.4" fill="none" opacity=".55"/>
    <path d="M39 24 C39 12 61 12 61 24 C57 28 43 28 39 24Z" fill="#3A7727"/><rect x="47" y="6" width="6" height="10" rx="3" fill="#6B4A22"/>
  </g>
  <g>
    <path d="M42 22 C38 48 44 78 50 95 C56 78 62 48 58 22Z" fill="url(#gk)" stroke="#3C7F25" stroke-width="1.5"/>
    <path d="M46 26 C45 50 47 72 50 90 M54 26 C55 50 53 72 50 90" stroke="#3C7F25" stroke-width="1.4" fill="none" opacity=".55"/>
    <path d="M39 24 C39 12 61 12 61 24 C57 28 43 28 39 24Z" fill="#3A7727"/><rect x="47" y="6" width="6" height="10" rx="3" fill="#6B4A22"/>
  </g>
</symbol>

<symbol id="ic-peas" viewBox="0 0 100 100">
  <defs><radialGradient id="gp" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#DCF7A8"/><stop offset="1" stop-color="#6DBF3A"/></radialGradient></defs>
  <g transform="rotate(-28 50 50)">
    <path d="M6 50 C20 22 80 22 94 50 C80 78 20 78 6 50Z" fill="#4A9929" stroke="#38801F" stroke-width="2"/>
    <path d="M13 50 C28 34 72 34 87 50 C72 66 28 66 13 50Z" fill="#92D45F"/>
    <g fill="url(#gp)" stroke="#5AA32F" stroke-width="1.6"><circle cx="26" cy="50" r="9.5"/><circle cx="42" cy="50" r="11"/><circle cx="59" cy="50" r="11"/><circle cx="75" cy="50" r="9.5"/></g>
    <g fill="#fff" opacity=".65"><circle cx="23" cy="46" r="2.4"/><circle cx="39" cy="45" r="2.8"/><circle cx="56" cy="45" r="2.8"/><circle cx="72" cy="46" r="2.4"/></g>
    <path d="M94 50 C99 44 101 37 98 32" stroke="#38801F" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </g>
</symbol>

<symbol id="ic-lauki" viewBox="0 0 100 100">
  <defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#9ACF66"/><stop offset=".45" stop-color="#D6F1A8"/><stop offset="1" stop-color="#88BF57"/></linearGradient></defs>
  <g transform="rotate(16 50 50)">
    <path d="M45 11 C41 13 41 24 42 32 C43 42 24 48 24 68 C24 86 37 95 50 95 C63 95 76 86 76 68 C76 48 57 42 58 32 C59 24 59 13 55 11Z" fill="url(#gl)" stroke="#78AE48" stroke-width="2"/>
    <path d="M44 7 C44 3 56 3 56 7 L55 13 L45 13Z" fill="#7A5A2A"/>
    <path d="M33 62 C32 74 38 84 46 89" stroke="#fff" stroke-width="4.5" opacity=".55" fill="none" stroke-linecap="round"/>
  </g>
</symbol>

<symbol id="ic-karela" viewBox="0 0 100 100">
  <defs><linearGradient id="gb" x1="0" x2="1"><stop offset="0" stop-color="#2C7728"/><stop offset=".5" stop-color="#5FB24C"/><stop offset="1" stop-color="#2C7728"/></linearGradient></defs>
  <g transform="rotate(32 50 50)">
    <path d="M50 3 C68 22 70 70 50 97 C30 70 32 22 50 3Z" fill="url(#gb)" stroke="#245F21" stroke-width="2"/>
    <path d="M50 8 L50 92" stroke="#245F21" stroke-width="2" opacity=".5"/>
    <g fill="#9ADA85" opacity=".9">
      <ellipse cx="42" cy="26" rx="4.2" ry="2.8"/><ellipse cx="58" cy="30" rx="4.2" ry="2.8"/><ellipse cx="40" cy="41" rx="4.4" ry="2.8"/><ellipse cx="60" cy="45" rx="4.4" ry="2.8"/>
      <ellipse cx="40" cy="56" rx="4.4" ry="2.8"/><ellipse cx="60" cy="60" rx="4.4" ry="2.8"/><ellipse cx="43" cy="71" rx="4" ry="2.6"/><ellipse cx="57" cy="74" rx="4" ry="2.6"/><ellipse cx="49" cy="85" rx="3.2" ry="2.2"/>
    </g>
  </g>
</symbol>

<symbol id="ic-beet" viewBox="0 0 100 100">
  <defs><radialGradient id="gbe" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#D63A72"/><stop offset="1" stop-color="#78123C"/></radialGradient></defs>
  <g fill="#C23A4E"><path d="M48 46 C44 32 36 24 26 16 L30 11 C40 19 48 30 52 44Z"/><path d="M52 46 C56 32 64 24 74 16 L70 11 C60 19 52 30 48 44Z"/><path d="M47 46 C46 32 46 22 45 10 L55 10 C54 22 54 32 53 46Z"/></g>
  <g fill="#4DAF50" stroke="#2F8A36" stroke-width="1.5"><ellipse cx="24" cy="14" rx="13" ry="7" transform="rotate(-38 24 14)"/><ellipse cx="76" cy="14" rx="13" ry="7" transform="rotate(38 76 14)"/><ellipse cx="50" cy="9" rx="7" ry="11"/></g>
  <path d="M50 41 C17 39 9 67 28 81 C38 89 46 91 50 99 C54 91 62 89 72 81 C91 67 83 39 50 41Z" fill="url(#gbe)" stroke="#640E33" stroke-width="2"/>
  <path d="M29 57 C27 65 31 73 38 77" stroke="#fff" stroke-width="4.5" opacity=".35" fill="none" stroke-linecap="round"/>
</symbol>

<symbol id="ic-mooli" viewBox="0 0 100 100">
  <defs><linearGradient id="gm" x1="0" x2="1"><stop offset="0" stop-color="#DDE5CF"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D3DCC3"/></linearGradient></defs>
  <g fill="#4DAF50" stroke="#2F8A36" stroke-width="1.5"><ellipse cx="27" cy="22" rx="17" ry="7.5" transform="rotate(-42 27 22)"/><ellipse cx="73" cy="22" rx="17" ry="7.5" transform="rotate(42 73 22)"/><ellipse cx="50" cy="14" rx="7.5" ry="14"/></g>
  <path d="M36 34 C31 63 42 87 50 99 C58 87 69 63 64 34 C60 27 40 27 36 34Z" fill="url(#gm)" stroke="#B8C3A6" stroke-width="2"/>
  <path d="M37 35 C42 29 58 29 63 35 C58 39 42 39 37 35Z" fill="#A6D98A" opacity=".8"/>
  <path d="M42 44 C41 58 45 72 49 84" stroke="#C3CCB1" stroke-width="3" opacity=".8" fill="none" stroke-linecap="round"/>
</symbol>

</defs></svg>`;
  function inject() {
    if (document.getElementById('sz-style')) return;
    var st = document.createElement('style'); st.id = 'sz-style'; st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div'); d.id = 'sz-sprite'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = SPRITE; document.body.insertBefore(d, document.body.firstChild);
  }

  /* ---------- the cart ---------- */
  function mount(host, o) {
    inject();
    var hi = o.lang === 'hi', day = 'today', dragging = false, stale = false;
    var ctl = { render: render, show: function (d) { day = d === 'tomorrow' ? 'tomorrow' : 'today'; render(); } };
    var ghost = document.querySelector('.sz-ghost');
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'sz-ghost'; document.body.appendChild(ghost); }
    function dateOf() { return day === 'today' ? o.today : addDays(o.today, 1); }
    var HINT = 'sz-hint-done';
    function hinted() { try { return localStorage.getItem(HINT) === '1'; } catch (e) { return false; } }

    host.innerHTML =
      '<div class="sz"><div class="sz-days">' +
      '<button type="button" class="sz-d0" data-sz-d="today"></button><button type="button" class="sz-d1" data-sz-d="tomorrow"></button></div>' +
      '<div class="sz-frame"><div class="sz-banner"><b></b><span></span></div><div class="sz-stage">' +
      '<div class="sz-cart"><div class="sz-wheel l"></div><div class="sz-wheel r"></div><div class="sz-grip l"></div><div class="sz-grip r"></div><div class="sz-cb"><div class="sz-grid"></div></div></div>' +
      '<div class="sz-counter"><div class="sz-cloth">' +
      '<span class="sz-drop" style="left:9%;top:12%">💧</span><span class="sz-drop" style="right:8%;top:20%">💧</span><span class="sz-drop" style="left:14%;bottom:12%">💧</span><span class="sz-drop" style="right:16%;bottom:9%">💧</span>' +
      '<div class="sz-items"></div></div></div><div class="sz-hand">👆</div></div></div></div>';
    var root = host.querySelector('.sz'), frame = host.querySelector('.sz-frame'), grid = host.querySelector('.sz-grid'), cloth = host.querySelector('.sz-cloth'),
      itemsEl = host.querySelector('.sz-items'), hand = host.querySelector('.sz-hand'), stage = host.querySelector('.sz-stage');

    function words(d) { return hi ? { big: d === o.today ? 'आज' : 'कल', sub: dateHi(d) } : { big: d === o.today ? 'Today' : 'Tomorrow', sub: dateEn(d) }; }
    function say(text) {
      try { var u = new SpeechSynthesisUtterance(text); u.lang = 'hi-IN'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { }
    }
    function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

    VEG.forEach(function (v) {
      var cell = document.createElement('div'); cell.className = 'sz-cell';
      var bin = document.createElement('div'); bin.className = 'sz-bin'; bin.setAttribute('aria-label', v.en);
      bin.innerHTML = '<span class="p1">' + glyph(v) + '</span><span class="p2">' + glyph(v) + '</span><span class="p3">' + glyph(v) + '</span>';
      cell.appendChild(bin); grid.appendChild(cell);
      bin.addEventListener('pointerdown', function (ev) {
        dragFrom(ev, v, { onEnd: function (moved, x, y, over) {
          if (!moved) { say(v.n); bin.classList.remove('bump'); void bin.offsetWidth; bin.classList.add('bump'); return; }
          if (over) addToCloth(v, x, y);
        } });
      });
    });

    function layout() {
      var r = grid.getBoundingClientRect(); if (!r.width) return;
      root.style.setProperty('--b', Math.floor(Math.min(r.width / 5, r.height / 4) * 0.95) + 'px');
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(grid); else window.addEventListener('resize', layout);

    function overCloth(x, y) { var r = cloth.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
    function dragFrom(ev, veg, opts) {
      var el = ev.currentTarget, id = ev.pointerId, sx = ev.clientX, sy = ev.clientY, moved = false;
      try { el.setPointerCapture(id); } catch (e) { }
      dragging = true;
      function move(e) {
        if (e.pointerId !== id) return;
        if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
          moved = true; ghost.innerHTML = glyph(veg); ghost.style.display = 'block'; vib(12); say(veg.n); opts.onStart && opts.onStart();
        }
        if (moved) { ghost.style.left = e.clientX + 'px'; ghost.style.top = (e.clientY - LIFT) + 'px'; cloth.classList.toggle('over', overCloth(e.clientX, e.clientY - LIFT)); }
      }
      function up(e) {
        if (e.pointerId !== id) return;
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        ghost.style.display = 'none'; cloth.classList.remove('over');
        var x = e.clientX, y = e.clientY - LIFT;
        dragging = false;
        opts.onEnd(moved, x, y, moved && e.type !== 'pointercancel' && overCloth(x, y));
        if (stale) { stale = false; render(); }
      }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function toFrac(x, y) { var r = cloth.getBoundingClientRect(); return { x: clamp((x - r.left) / r.width, .14, .86), y: clamp((y - r.top) / r.height, .14, .86) }; }
    function rowsNow() { return o.items(dateOf()) || []; }
    function addToCloth(v, x, y) {
      var d = dateOf(), id = d + '|' + v.id, f = toFrac(x, y), cur = rowsNow().filter(function (r) { return r.id === id; })[0], row;
      if (cur) row = { id: id, date: d, veg: v.id, q: Math.min(MAXQ, Math.round((cur.q + v.step) * 100) / 100), x: cur.x, y: cur.y };
      else row = { id: id, date: d, veg: v.id, q: v.step, x: f.x, y: f.y };
      o.put(row);
      try { localStorage.setItem(HINT, '1'); } catch (e) { }
      hand.style.display = 'none';
      renderCloth(v.id); vib(20);
      say((hi ? v.n : v.n) + ', ' + qtyHindi(v, row.q));
    }
    function renderCloth(popId) {
      itemsEl.innerHTML = '';
      rowsNow().forEach(function (r) {
        var v = BYID[r.veg]; if (!v) return;
        var d = document.createElement('div');
        d.className = 'sz-ci' + (popId === r.veg ? ' pop' : '');
        d.style.left = (r.x * 100) + '%'; d.style.top = (r.y * 100) + '%';
        d.innerHTML = glyph(v) + '<b>' + qtyText(v, r.q) + '</b>';
        d.addEventListener('pointerdown', function (ev) {
          dragFrom(ev, v, {
            onStart: function () { d.style.opacity = '.25'; },
            onEnd: function (moved, x, y, over) {
              if (!moved) { say(v.n + ', ' + qtyHindi(v, r.q)); d.classList.remove('wob'); void d.offsetWidth; d.classList.add('wob'); return; }
              if (over) { var f = toFrac(x, y); o.put({ id: r.id, date: r.date, veg: r.veg, q: r.q, x: f.x, y: f.y }); }   /* moved around the cloth */
              else o.del(r.id);                                                                                      /* dragged off = removed */
              renderCloth();
            }
          });
        });
        itemsEl.appendChild(d);
      });
    }
    function showHint() {
      if (hinted() || rowsNow().length || !stage.offsetWidth) { hand.style.display = 'none'; return; }
      var s = stage.getBoundingClientRect(), b = grid.querySelector('.sz-bin').getBoundingClientRect(), c = cloth.getBoundingClientRect();
      hand.style.setProperty('--sx', (b.left - s.left + b.width / 2 - 28) + 'px'); hand.style.setProperty('--sy', (b.top - s.top + b.height / 2 - 6) + 'px');
      hand.style.setProperty('--ex', (c.left - s.left + c.width / 2 - 28) + 'px'); hand.style.setProperty('--ey', (c.top - s.top + c.height / 2 - 6) + 'px');
      hand.style.display = 'block';
    }
    stage.addEventListener('pointerdown', function () { try { localStorage.setItem(HINT, '1'); } catch (e) { } hand.style.display = 'none'; }, true);

    host.querySelectorAll('[data-sz-d]').forEach(function (b) {
      b.addEventListener('click', function () { day = b.dataset.szD; render(); });
    });
    function render() {
      if (dragging) { stale = true; return; }
      var d = dateOf(), w = words(d), t0 = words(o.today), t1 = words(addDays(o.today, 1));
      var b0 = host.querySelector('.sz-d0'), b1 = host.querySelector('.sz-d1');
      b0.innerHTML = t0.big + '<small>' + t0.sub + '</small>'; b1.innerHTML = t1.big + '<small>' + t1.sub + '</small>';
      b0.setAttribute('aria-pressed', day === 'today'); b1.setAttribute('aria-pressed', day === 'tomorrow');
      frame.className = 'sz-frame sz-d' + (day === 'today' ? 0 : 1);
      frame.querySelector('.sz-banner b').textContent = w.big; frame.querySelector('.sz-banner span').textContent = w.sub;
      layout(); renderCloth(); showHint();
    }
    render();
    return ctl;
  }

  global.Sabzi = { VEG: VEG, BYID: BYID, mount: mount, summary: summary, iconHTML: iconHTML, qtyText: qtyText, qtyHindi: qtyHindi, addDays: addDays, MAXQ: MAXQ };
})(window);
