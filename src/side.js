// Level 2 — Who says what (DESIGN §4.3): every source with something on the current question, one row
// each, with what it had said by the key date and what it says latest.
// Address: v=s · y a year (from a year label) · hd hidden sources · sp two sources side by side · pp two periods (lo-hi,lo-hi) · cc another country.
import { state, set, esc, num, plural, fmtDate, range } from './state.js';
import { ask, ask2, slice } from './data.js';
import { card, wireCards, passageKey } from './cards.js';
import { stack } from './grid.js';

let token = 0;
let pickMode = '';   // the comparison the "Compare two" bar is offering to set up: s sources, p periods, c countries

// Years asked for by a year label (y), if any. Used by the worker's load order too.
export function selection(app) {
  const yr = range(state.y);
  const years = yr ? app.years.filter(y => y !== 'undated' && +y >= yr[0] && +y <= yr[1]) : state.y ? [state.y] : null;
  return { s: [], years };
}

const ordOf = () => (state.o === 'n' ? 'new' : 'best');
const hasQuestion = app => !!(((state.tp || state.fm) && app.S.hasTopics) || state.q || state.lk || state.ds || state.w || state.r || state.y);

// The question as a sentence: "What 14 sources say about Military service in Syria · Douma · key date Mar 2019".
function title(app, n) {
  const S = app.S, bits = [];
  if (state.fm && S.hasTopics) bits.push(`<b>${esc(S.famById.get(state.fm)?.name || 'Other questions')}</b>`);
  if (state.tp && S.hasTopics) bits.push(`<b>${esc(S.topicById.get(state.tp)?.name || 'this topic')}</b>`);
  if (state.q) bits.push(`the words <b>“${esc(state.q)}”</b>`);
  if (state.lk) bits.push(`wording like <b>“${esc(state.lk)}”</b>`);
  if (state.ds) bits.push(`documents ecoi.net describes as <b>${esc(state.ds)}</b>`);
  const place = state.w ? (state.w === 'none' ? 'no place named' : S.place.get(state.w)?.name || state.w) : '';
  const when = state.y ? state.y.replace('-', '–') : state.r ? state.r.replace('-', '–') : '';
  const who = `What ${plural(n, 'source', 'sources')} say${n === 1 ? 's' : ''} about `;
  const subject = bits.length ? `${bits.join(' and ')} in <b>${esc(app.country.name)}</b>${place ? ` · <b>${esc(place)}</b>` : ''}`
    : place ? `<b>${esc(place)}</b> in <b>${esc(app.country.name)}</b>` : `<b>${esc(app.country.name)}</b>`;
  const cc = state.cc && state.cc !== state.c ? app.idx.countries.find(c => c.slug === state.cc)?.name : '';
  return `${who}${subject}${cc ? ` and <b>${esc(cc)}</b>` : ''}${when ? ` · <b>${esc(when)}</b>` : ''}${state.l ? ` · key date <b>${esc(fmtDate(state.l))}</b>` : ''}`;
}

export async function renderSide(app, el) {
  const my = ++token;
  const close = `<button class="back" data-back>× Close</button>`;
  if (!hasQuestion(app)) {
    const top = (app.S.topics || []).slice().sort((a, b) => b.docs - a.docs).slice(0, 8);
    el.innerHTML = `<div class="who"><div class="who-head"><h2 class="who-title">Compare what?</h2>${close}</div>
      <p>Pick a topic, type a search, or choose a place.</p>
      ${top.length ? `<div class="topicpick">${top.map(t => `<button data-pick="${t.id}">${esc(t.name)} <span class="grey tnum">${num(t.docs)}</span></button>`).join('')}</div>` : ''}</div>`;
    el.querySelector('[data-back]').onclick = back;
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => set({ tp: b.dataset.pick, v: 's' }));
    return;
  }
  const { T } = app;
  const sel = selection(app);
  const hidden = new Set((state.hd || '').split(',').filter(Boolean));
  const pair = (state.sp || '').split(',').filter(Boolean);
  const withData = app.rowsInOrder.filter(s => T?.rows[s.k]);
  const silent = app.rowsInOrder.filter(s => !T?.rows[s.k]);
  const shown = withData.filter(s => !hidden.has(s.k));

  el.innerHTML = `<div class="who">
    <div class="who-head"><h2 class="who-title">${title(app, withData.length)}</h2>${close}</div>
    ${silent.length ? `<p class="silence"><span class="grey">Sources with nothing on this (${silent.length}):</span> ${silent.map(s => esc(s.short)).join(', ')}</p>` : ''}
    ${hidden.size ? `<p class="grey small">Hidden: ${[...hidden].map(k => `${esc(app.src(k).short)} <button class="linkish" data-unhide="${esc(k)}">show</button>`).join(' · ')}</p>` : ''}
    ${(state.q.trim() || state.fm || state.tp) && !state.lk ? `<p class="small order" role="group" aria-label="Order of passages in lists"><span class="grey">Lists show</span> <button class="linkish" data-ord=""${state.o === 'n' ? '' : ' aria-pressed="true"'}>${state.q.trim() ? 'best match for your words first' : 'clearest on the topic first'}</button> · <button class="linkish" data-ord="n"${state.o === 'n' ? ' aria-pressed="true"' : ''}>Newest first</button></p>` : ''}
    ${bar(app, withData)}
    <div class="who-body"><p class="busy" role="status">Reading the passages…</p></div>
  </div>`;
  el.querySelector('[data-back]').onclick = back;
  el.querySelectorAll('[data-ord]').forEach(b => b.onclick = () => set({ o: b.dataset.ord }));
  el.querySelectorAll('[data-unhide]').forEach(b => b.onclick = () => set({ hd: [...hidden].filter(k => k !== b.dataset.unhide).join(',') }));
  wireBar(app, el, withData);
  const body = el.querySelector('.who-body');
  const ok = new Set(withData.map(s => s.k));
  if (pair.length === 2 && pair.every(k => ok.has(k))) return sideBySide(app, body, pair, my);
  if (state.cc && state.cc !== state.c) return countriesView(app, body, state.cc, my);
  const periods = parsePeriods(state.pp);

  const r = await ask({ type: 'who', q: app.q, years: periods ? null : sel.years, key: state.l || '', periods });
  if (my !== token) return;
  if (r.waiting) { body.innerHTML = '<p class="grey small">Preparing “wording like this” in this browser…</p>'; return; }
  const rows = new Map(r.rows.map(x => [x.s, x]));
  const byKey = new Map();
  let lastGroup = '';
  body.innerHTML = shown.map(s => {
    const R = rows.get(s.k);
    if (!R) return '';
    const g = app.groupLabel(s);
    const head = g !== lastGroup ? `<h3 class="who-group">${esc(g)}${app.groups[0]?.deciding && app.groups[0].rows.includes(s) ? ' <span class="you-note">deciding country</span>' : ''}</h3>` : '';
    lastGroup = g;
    for (const p of [R.a, R.b]) if (p) byKey.set(passageKey(app, p), p);
    return head + rowHTML(app, s, R, sel, periods);
  }).join('') || '<p class="empty-note">No source has a passage on this question.</p>';
  wireCards(app, body, byKey);
  wireRows(app, el, body, sel);
}

function rowHTML(app, s, R, sel, periods) {
  const ys = app.years, max = Math.max(1, ...ys.map(y => app.T.cells[s.k]?.[y] || 0)), dated = ys.filter(y => y !== 'undated');
  const strip = `<span class="wstripw"><span class="wy">${esc(dated[0] || '')}</span><span class="wstrip" aria-hidden="true">${ys.map(y => `<span class="wc${app.left && String(app.left.y) === y ? ' dep' : ''}${sel.years?.includes(y) || periods?.some(([lo, hi]) => +y >= lo && +y <= hi) ? ' lit' : ''}" title="${esc(y)}: ${plural(app.T.cells[s.k]?.[y] || 0, 'passage', 'passages')}">${stack(app.T.cells[s.k]?.[y] || 0, app.T.ty[s.k]?.[y], max)}</span>`).join('')}</span><span class="wy">${esc(dated[dated.length - 1] || '')}</span></span>`;
  const keyTxt = state.l ? fmtDate(state.l) : '';
  const pl = ([lo, hi]) => (lo === hi ? String(lo) : `${lo}–${hi}`);
  const labels = R.mode === 'periods' ? [`${pl(periods[0])} <span class="grey">· ${plural(R.na, 'passage', 'passages')}</span>`, `${pl(periods[1])} <span class="grey">· ${plural(R.nb, 'passage', 'passages')}</span>`]
    : R.mode === 'key' ? ['By the key date', 'Latest'] : R.mode === 'earlier' ? ['About five years earlier', 'Latest']
    : R.mode === 'year' ? [`Earliest in ${sel.years.length > 1 ? state.y.replace('-', '–') : state.y}`, `Latest in ${sel.years.length > 1 ? state.y.replace('-', '–') : state.y}`] : ['Oldest', 'Latest'];
  const empty = R.mode === 'key' ? `Nothing on this from ${esc(s.short)} before ${esc(keyTxt)}.` : R.mode === 'earlier' ? `Nothing earlier from ${esc(s.short)} on this.` : 'Nothing more.';
  const emptyP = i => `Nothing from ${esc(s.short)} in ${esc(pl(periods[i]))} on this.`;
  const side = (p, label, sameList, i) => p
    ? `<div class="wside"><p class="wlabel">${label} <span class="grey">(${esc(fmtDate(app.S.docs[p.d].date))})</span></p>${card(app, p)}${sameLine(app, sameList)}</div>`
    : `<div class="wside"><p class="wlabel">${label}</p><p class="nothing">${R.mode === 'periods' ? emptyP(i) : R.one && label !== labels[0] ? `Nothing newer from ${esc(s.short)}; the passage on the left is its latest.` : empty}</p></div>`;
  const more = R.n - [R.a, R.b].filter(Boolean).length;
  return `<section class="wrow" data-row="${s.k}">
    <div class="whead">
      <span class="wname"><b>${esc(s.short)}</b> <span class="grey">${esc(s.name !== s.short ? s.name : '')}</span></span>
      ${strip}
      <span class="wcount tnum">${plural(R.n, 'passage', 'passages')} in ${plural(R.docs, 'document', 'documents')}</span>
      <span class="wact"><button class="linkish small" data-hide="${s.k}">Hide</button></span>
    </div>
    <div class="wpair">${side(R.a, labels[0], R.sa, 0)}${side(R.b, labels[1], R.sb, 1)}</div>
    ${more > 0 ? `<button class="more" data-more="${s.k}" aria-expanded="false">${num(more)} more from ${esc(s.short)} ▾</button><div class="wmore" hidden></div>` : ''}
  </section>`;
}

// "Same text also in": other sources' documents holding the exact text; an earlier one is marked.
function sameLine(app, list) {
  if (!list?.length) return '';
  return `<p class="same small"><span class="mlabel">Same text also in:</span> ${list.slice(0, 6).map(o => `<button class="linkish" data-open="${o.id}.${o.k}" data-pg="${o.pg}">${esc(app.src(o.s).short)} ${esc(fmtDate(o.date))}</button>${o.earlier ? ' <span class="grey">(earlier: likely quoted)</span>' : ''}`).join(', ')}${list.length > 6 ? `, and ${num(list.length - 6)} more` : ''}</p>`;
}

function wireRows(app, el, body, sel) {
  body.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => {
    const h = new Set((state.hd || '').split(',').filter(Boolean)); h.add(b.dataset.hide);
    set({ hd: [...h].join(',') });
  });
  body.querySelectorAll('[data-more]').forEach(b => b.onclick = async () => {
    const box = b.nextElementSibling;
    if (!box.hidden) { box.hidden = true; b.setAttribute('aria-expanded', 'false'); b.textContent = b.textContent.replace('▴', '▾'); return; }
    box.hidden = false; b.setAttribute('aria-expanded', 'true'); b.textContent = b.textContent.replace('▾', '▴');
    if (box.dataset.done) return;
    box.dataset.done = 1;
    box.innerHTML = '<p class="busy" role="status">Loading…</p>';
    const row = b.closest('.wrow');
    const shownKeys = new Set([...row.querySelectorAll('.wpair .card')].map(c => c.dataset.key));
    const { items } = await ask({ type: 'list', q: app.q, sources: [b.dataset.more], years: sel.years, offset: 0, limit: 2000, ord: ordOf(), clean: true });
    const rest = items.filter(p => !shownKeys.has(passageKey(app, p)));
    const byKey = new Map(rest.map(p => [passageKey(app, p), p]));
    box.innerHTML = rest.map(p => card(app, p)).join('');
    wireCards(app, box, byKey);
  });
}

// Two sources face to face, aligned by year, newest first.
async function sideBySide(app, body, pair, my) {
  const [A, B] = pair.map(k => app.src(k));
  const sel = selection(app);
  const { items } = await ask({ type: 'list', q: app.q, sources: pair, years: sel.years, offset: 0, limit: 5000, ord: ordOf(), clean: true });
  if (my !== token) return;
  markRepeats(app, items);
  const grid = {};
  for (const p of items) for (const y of p.bands) ((grid[y] ||= {})[app.S.docs[p.d].s] ||= []).push(p);
  const years = Object.keys(grid).sort((a, b) => (a === 'undated' ? 1 : b === 'undated' ? -1 : b - a));
  const byKey = new Map(items.map(p => [passageKey(app, p), p]));
  // New text first, each card once; text repeated from an earlier edition folds into one line.
  const show = L => { const fresh = L.filter(p => !p.rep), rep = L.filter(p => p.rep); return [...fresh.map(p => repCard(app, p)), ...rep.map(p => repCard(app, p))]; };
  const cell = (y, s) => {
    const L = grid[y][s.k] || [];
    if (!L.length) return `<div class="wcol"><p class="nothing">Nothing from ${esc(s.short)} in ${esc(y)} on this.</p></div>`;
    const nNew = L.filter(p => !p.rep).length, nRep = L.length - nNew, all = show(L);
    const lead = L.some(p => p.isNew) || nRep ? `<p class="wsum small">${nNew ? `${plural(nNew, 'new passage', 'new passages')}` : 'Nothing new'}${nRep ? ` · ${plural(nRep, 'passage', 'passages')} repeated from earlier years` : ''}</p>` : '';
    return `<div class="wcol">${lead}${all.slice(0, 4).join('')}${L.length > 4 ? `<button class="more" data-cellmore="${y}|${s.k}">${num(L.length - 4)} more from ${esc(s.short)} in ${esc(y)} ▾</button>` : ''}</div>`;
  };
  body.innerHTML = `<div class="wgrid"><div class="wcolhead">${esc(A.short)} <span class="grey">${esc(app.groupLabel(A))}</span></div><div class="wcolhead">${esc(B.short)} <span class="grey">${esc(app.groupLabel(B))}</span></div>
    ${years.map(y => `<h3 class="wyear">${esc(y)}</h3>${cell(y, A)}${cell(y, B)}`).join('') || '<p class="empty-note">Neither source has a passage on this question.</p>'}</div>`;
  wireCards(app, body, byKey);
  body.querySelectorAll('[data-cellmore]').forEach(b => b.onclick = () => {
    const [y, k] = b.dataset.cellmore.split('|');
    const host = b.parentElement;
    host.innerHTML = show(grid[y][k]).join('');
    wireCards(app, host, byKey);
  });
}

function back() { pickMode = ''; set({ v: '', sp: '', pp: '', cc: '', ...(state.s ? {} : { y: '' }) }); }
export const leaveCompare = back;

// ---- "Compare two": sources, periods or countries ----
const parsePeriods = pp => {
  const m = (pp || '').split(',').map(x => x.split('-').map(Number));
  return m.length === 2 && m.every(r => r.length === 2 && r.every(Number.isFinite)) ? m : null;
};
const active = () => ((state.sp || '').split(',').filter(Boolean).length === 2 ? 's' : parsePeriods(state.pp) ? 'p' : state.cc ? 'c' : '');
function periodsDefault(app) {
  const ys = app.years.filter(y => y !== 'undated').map(Number), lo = Math.min(...ys), hi = Math.max(...ys);
  return parsePeriods(state.pp) || [[Math.max(lo, hi - 9), Math.max(lo, hi - 5)], [Math.max(lo, hi - 4), hi]];
}
function picker(app, mode, withData) {
  const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
  if (mode === 's') {
    const [a, b] = (state.sp || '').split(',');
    const list = sel => withData.map(s => opt(s.k, `${s.short} (${app.groupLabel(s)})`, s.k === sel)).join('');
    return `<select data-ca aria-label="First source">${list(a || withData[0]?.k)}</select> <span class="grey">and</span> <select data-cb aria-label="Second source">${list(b || withData[1]?.k)}</select> <button class="compare" data-cgo="s">Compare</button>`;
  }
  if (mode === 'p') {
    const ys = app.years.filter(y => y !== 'undated').map(Number).sort((x, y) => x - y), P = periodsDefault(app);
    const yr = (k, v) => `<select data-${k} aria-label="${k}">${ys.map(y => opt(y, y, y === v)).join('')}</select>`;
    return `${yr('p0a', P[0][0])}–${yr('p0b', P[0][1])} <span class="grey">and</span> ${yr('p1a', P[1][0])}–${yr('p1b', P[1][1])} <button class="compare" data-cgo="p">Compare</button>`;
  }
  if (mode === 'c') {
    const cs = app.idx.countries.filter(c => c.slug !== state.c).sort((x, y) => x.name.localeCompare(y.name));
    return `<span class="grey">${esc(app.country.name)} and</span> <select data-cc aria-label="Other country"><option value="">choose a country</option>${cs.map(c => opt(c.slug, c.name, c.slug === state.cc)).join('')}</select> <button class="compare" data-cgo="c">Compare</button>`;
  }
  return '';
}
function bar(app, withData) {
  const on = active(), mode = pickMode || on;   // what the address holds wins once a comparison is set
  const b = (k, t) => `<button role="radio" aria-checked="${mode === k}" data-cm="${k}">${t}</button>`;
  return `<div class="cbar" role="group" aria-label="Compare two">
    <span class="clab">Compare two</span><span class="modes" role="radiogroup">${b('s', 'sources')}${b('p', 'periods')}${b('c', 'countries')}</span>
    <span class="cpick">${picker(app, mode, withData)}</span>
    ${on ? '<button class="linkish small" data-cstop>Back to all sources</button>' : ''}
  </div>${mode ? '' : '<p class="grey small chint">Choose two sources, two periods or another country to see them side by side.</p>'}`;
}
function wireBar(app, el, withData) {
  const host = el.querySelector('.cbar');
  host.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => {
    pickMode = b.dataset.cm;
    host.querySelectorAll('[data-cm]').forEach(x => x.setAttribute('aria-checked', x === b));
    host.querySelector('.cpick').innerHTML = picker(app, pickMode, withData);
    el.querySelector('.chint')?.remove();
    wireGo();
  });
  const wireGo = () => host.querySelectorAll('[data-cgo]').forEach(b => b.onclick = () => {
    const m = b.dataset.cgo, v = s => host.querySelector(s)?.value; pickMode = '';
    if (m === 's') { const a = v('[data-ca]'), c = v('[data-cb]'); if (a && c && a !== c) set({ sp: `${a},${c}`, pp: '', cc: '' }); }
    if (m === 'p') { const r = [[+v('[data-p0a]'), +v('[data-p0b]')], [+v('[data-p1a]'), +v('[data-p1b]')]].map(([x, y]) => [Math.min(x, y), Math.max(x, y)]); set({ pp: r.map(x => x.join('-')).join(','), sp: '', cc: '' }); }
    if (m === 'c') { const c = v('[data-cc]'); if (c) set({ cc: c, sp: '', pp: '' }); }
  });
  wireGo();
  host.querySelector('[data-cstop]')?.addEventListener('click', () => { pickMode = ''; set({ sp: '', pp: '', cc: '' }); });
}

// ---- Repeated text across editions (side by side) ----
// Per source, oldest first: a passage whose words overlap an earlier year's passage by 70% or more is a repeat of it.
const wordsOf = t => new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
function markRepeats(app, items) {
  const by = new Map();
  for (const p of items) { const s = app.S.docs[p.d].s; (by.get(s) || by.set(s, []).get(s)).push(p); }
  for (const list of by.values()) {
    list.sort((a, b) => (app.S.docs[a.d].date || '').localeCompare(app.S.docs[b.d].date || ''));
    const seen = []; const firstY = app.S.docs[list[0].d].date?.slice(0, 4);
    for (const p of list) {
      const y = app.S.docs[p.d].date?.slice(0, 4) || '', w = wordsOf(p.t);
      p.rep = null; p.isNew = false;
      if (w.size >= 6) {
        let best = null, bj = 0;
        for (const o of seen) {
          if (o.y === y) continue;
          let n = 0; for (const x of w) if (o.w.has(x)) n++;
          const j = n / (w.size + o.w.size - n); if (j > bj) { bj = j; best = o; }
        }
        if (best && bj >= 0.7) { p.rep = { y: best.y, same: best.t === p.t }; continue; }
        if (seen.length < 600) seen.push({ w, y, t: p.t });
      }
      p.isNew = !!y && y !== firstY;
    }
  }
}
function repCard(app, p) {
  if (!p.rep) return p.isNew ? card(app, p).replace('<p class="meta">', '<p class="meta"><span class="newtag">New this year</span> ') : card(app, p);
  const t = p.t.length > 140 ? p.t.slice(0, 140).replace(/\s+\S*$/, '') + '…' : p.t;
  return `<details class="repfold"><summary><span class="mlabel">${p.rep.same ? 'Same text as in' : 'Nearly the same as in'} ${esc(p.rep.y)}</span> “${esc(t)}”</summary>${card(app, p)}</details>`;
}

// ---- The same question in another country ----
async function countriesView(app, body, slug2, my) {
  const c2 = app.idx.countries.find(c => c.slug === slug2);
  if (!c2) { body.innerHTML = '<p class="empty-note">That country is not in the atlas.</p>'; return; }
  if (state.lk) { body.innerHTML = '<p class="empty-note">Similar wording cannot be compared across countries yet. Use exact words or a topic.</p>'; return; }
  body.innerHTML = `<p class="busy" role="status">Loading the reports on ${esc(c2.name)}…</p>`;
  const S2 = await slice(slug2);
  if (my !== token) return;
  // Compare like with like: a country's own topic becomes its family, which both countries share.
  const fam = state.fm || (state.tp ? String(app.S.topicById.get(state.tp)?.fam ?? '') : '');
  const q1 = state.tp && !state.fm ? { ...app.q, topic: '', fam } : app.q;
  const q2 = { ...app.q, topic: '', fam: S2.hasTopics ? fam : '', place: '', lk: '' };
  const [r1, r2] = await Promise.all([ask({ type: 'who', q: q1, key: '' }), ask2(S2, { type: 'who', q: q2, key: '' })]);
  if (my !== token) return;
  const m1 = new Map(r1.rows.map(x => [x.s, x])), m2 = new Map(r2.rows.map(x => [x.s, x]));
  const keys = [...new Set([...m1.keys(), ...m2.keys()])].map(k => app.src(k));
  const rank = s => (m1.has(s.k) && m2.has(s.k) ? 0 : 1);
  const pos = new Map(app.rowsInOrder.map((s, i) => [s.k, i]));
  keys.sort((a, b) => rank(a) - rank(b) || (pos.get(a.k) ?? 999) - (pos.get(b.k) ?? 999) || a.short.localeCompare(b.short));
  const app2 = { ...app, S: S2, country: c2 }, by1 = new Map(), by2 = new Map();
  const n = m => [...m.values()].reduce((t, r) => t + r.n, 0);
  const side = (A, R, nm) => {
    if (!R?.b) return `<div class="wside"><p class="wlabel">${esc(nm)}</p><p class="nothing">Nothing on this.</p></div>`;
    const p = { ...R.b, n: 0 };
    (A === app ? by1 : by2).set(passageKey(A, p), p);
    return `<div class="wside"><p class="wlabel">${esc(nm)} · latest <span class="grey">(${esc(fmtDate(A.S.docs[p.d].date))}) · ${plural(R.n, 'passage', 'passages')}</span></p>${card(A, p)}</div>`;
  };
  let both = true;
  body.innerHTML = `<p class="small"><b>${esc(app.country.name)}</b>: ${plural(n(m1), 'passage', 'passages')} from ${plural(m1.size, 'source', 'sources')} · <b>${esc(c2.name)}</b>: ${plural(n(m2), 'passage', 'passages')} from ${plural(m2.size, 'source', 'sources')}. Sources that wrote about both come first.</p>
    <div class="wcmp"><div class="wcolhead">${esc(app.country.name)}</div><div class="wcolhead">${esc(c2.name)}</div></div>` +
    keys.map(s => {
      const h = rank(s) && both ? (both = false, '<h3 class="who-group">Sources that wrote about only one of the two</h3>') : '';
      return `${h}<section class="wrow"><div class="whead"><span class="wname"><b>${esc(s.short)}</b> <span class="grey">${esc(s.name !== s.short ? s.name : '')}</span></span></div>
        <div class="wpair"><div class="c1">${side(app, m1.get(s.k), app.country.name)}</div><div class="c2">${side(app2, m2.get(s.k), c2.name)}</div></div></section>`;
    }).join('');
  body.querySelectorAll('.c2 [data-open]').forEach(b => { b.dataset.wired = 1; b.onclick = () => set({ c: slug2, p: b.dataset.open, pg: b.dataset.pg, v: '', cc: '', sp: '', pp: '', w: '', y: '', s: '', x: '', tp: q2.topic, fm: q2.fam }); });
  body.querySelectorAll('.c1').forEach(c => wireCards(app, c, by1));
  body.querySelectorAll('.c2').forEach(c => wireCards(app2, c, by2));
}
