// Level 2 — Who says what (DESIGN §4.3): every source with something on the current question, one row
// each, with what it had said by the key date and what it says latest.
// Address: v=s · y a year (from a year label) · hd hidden sources · sp two sources side by side.
import { state, set, esc, num, plural, fmtDate, range } from './state.js';
import { ask } from './data.js';
import { card, wireCards, passageKey } from './cards.js';
import { stack } from './grid.js';

let token = 0;
let firstTick = '';   // the first "Side by side" tick waits here for the second

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
  return `${who}${subject}${when ? ` · <b>${esc(when)}</b>` : ''}${state.l ? ` · key date <b>${esc(fmtDate(state.l))}</b>` : ''}`;
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
    <div class="who-body"><p class="grey small" role="status">Reading the passages…</p></div>
  </div>`;
  el.querySelector('[data-back]').onclick = back;
  el.querySelectorAll('[data-ord]').forEach(b => b.onclick = () => set({ o: b.dataset.ord }));
  el.querySelectorAll('[data-unhide]').forEach(b => b.onclick = () => set({ hd: [...hidden].filter(k => k !== b.dataset.unhide).join(',') }));
  const body = el.querySelector('.who-body');
  if (pair.length === 2) return sideBySide(app, body, pair, my);

  const r = await ask({ type: 'who', q: app.q, years: sel.years, key: state.l || '' });
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
    return head + rowHTML(app, s, R, sel);
  }).join('') || '<p class="empty-note">No source has a passage on this question.</p>';
  wireCards(app, body, byKey);
  wireRows(app, el, body, sel);
}

function rowHTML(app, s, R, sel) {
  const ys = app.years, max = Math.max(1, ...ys.map(y => app.T.cells[s.k]?.[y] || 0));
  const strip = `<span class="wstrip" aria-hidden="true">${ys.map(y => `<span class="wc${app.left && String(app.left.y) === y ? ' dep' : ''}${sel.years?.includes(y) ? ' lit' : ''}">${stack(app.T.cells[s.k]?.[y] || 0, app.T.ty[s.k]?.[y], max)}</span>`).join('')}</span>`;
  const keyTxt = state.l ? fmtDate(state.l) : '';
  const labels = R.mode === 'key' ? ['By the key date', 'Latest'] : R.mode === 'year' ? [`Earliest in ${sel.years.length > 1 ? state.y.replace('-', '–') : state.y}`, `Latest in ${sel.years.length > 1 ? state.y.replace('-', '–') : state.y}`] : ['Oldest', 'Latest'];
  const empty = R.mode === 'key' ? `Nothing on this from ${esc(s.short)} before ${esc(keyTxt)}.` : 'Nothing more.';
  const side = (p, label, sameList) => p
    ? `<div class="wside"><p class="wlabel">${label} <span class="grey">(${esc(fmtDate(app.S.docs[p.d].date))})</span></p>${card(app, p)}${sameLine(app, sameList)}</div>`
    : `<div class="wside"><p class="wlabel">${label}</p><p class="nothing">${R.one && label !== labels[0] ? `Nothing newer from ${esc(s.short)}; the passage on the left is its latest.` : empty}</p></div>`;
  const more = R.n - [R.a, R.b].filter(Boolean).length;
  return `<section class="wrow" data-row="${s.k}">
    <div class="whead">
      <span class="wname"><b>${esc(s.short)}</b> <span class="grey">${esc(s.name !== s.short ? s.name : '')}</span></span>
      ${strip}
      <span class="wcount tnum">${plural(R.n, 'passage', 'passages')} in ${plural(R.docs, 'document', 'documents')}</span>
      <span class="wact"><label class="small"><input type="checkbox" data-pairtick="${s.k}"${firstTick === s.k ? ' checked' : ''}> Side by side</label><button class="linkish small" data-hide="${s.k}">Hide</button></span>
    </div>
    <div class="wpair">${side(R.a, labels[0], R.sa)}${side(R.b, labels[1], R.sb)}</div>
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
  body.querySelectorAll('[data-pairtick]').forEach(c => c.onchange = () => {
    const k = c.dataset.pairtick;
    if (!c.checked) { if (firstTick === k) firstTick = ''; return; }
    if (firstTick && firstTick !== k) { const a = firstTick; firstTick = ''; set({ sp: `${a},${k}` }); }
    else firstTick = k;
  });
  body.querySelectorAll('[data-more]').forEach(b => b.onclick = async () => {
    const box = b.nextElementSibling;
    if (!box.hidden) { box.hidden = true; b.setAttribute('aria-expanded', 'false'); b.textContent = b.textContent.replace('▴', '▾'); return; }
    box.hidden = false; b.setAttribute('aria-expanded', 'true'); b.textContent = b.textContent.replace('▾', '▴');
    if (box.dataset.done) return;
    box.dataset.done = 1;
    box.innerHTML = '<p class="grey small">Loading…</p>';
    const row = b.closest('.wrow');
    const shownKeys = new Set([...row.querySelectorAll('.wpair .card')].map(c => c.dataset.key));
    const { items } = await ask({ type: 'list', q: app.q, sources: [b.dataset.more], years: sel.years, offset: 0, limit: 2000, ord: ordOf() });
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
  const { items } = await ask({ type: 'list', q: app.q, sources: pair, years: sel.years, offset: 0, limit: 5000, ord: ordOf() });
  if (my !== token) return;
  const grid = {};
  for (const p of items) for (const y of p.bands) ((grid[y] ||= {})[app.S.docs[p.d].s] ||= []).push(p);
  const years = Object.keys(grid).sort((a, b) => (a === 'undated' ? 1 : b === 'undated' ? -1 : b - a));
  const byKey = new Map(items.map(p => [passageKey(app, p), p]));
  const cell = (y, s) => {
    const L = grid[y][s.k] || [];
    if (!L.length) return `<div class="wcol"><p class="nothing">Nothing from ${esc(s.short)} in ${esc(y)} on this.</p></div>`;
    return `<div class="wcol">${L.slice(0, 3).map(p => card(app, p)).join('')}${L.length > 3 ? `<button class="more" data-cellmore="${y}|${s.k}">${num(L.length - 3)} more from ${esc(s.short)} in ${esc(y)} ▾</button>` : ''}</div>`;
  };
  body.innerHTML = `<p><button class="linkish" data-unpair>Back to all sources</button></p>
    <div class="wgrid"><div class="wcolhead">${esc(A.short)} <span class="grey">${esc(app.groupLabel(A))}</span></div><div class="wcolhead">${esc(B.short)} <span class="grey">${esc(app.groupLabel(B))}</span></div>
    ${years.map(y => `<h3 class="wyear">${esc(y)}</h3>${cell(y, A)}${cell(y, B)}`).join('') || '<p class="empty-note">Neither source has a passage on this question.</p>'}</div>`;
  body.querySelector('[data-unpair]').onclick = () => set({ sp: '' });
  wireCards(app, body, byKey);
  body.querySelectorAll('[data-cellmore]').forEach(b => b.onclick = () => {
    const [y, k] = b.dataset.cellmore.split('|');
    const host = b.parentElement;
    host.innerHTML = grid[y][k].map(p => card(app, p)).join('');
    wireCards(app, host, byKey);
  });
}

function back() { set({ v: '', sp: '', ...(state.s ? {} : { y: '' }) }); }
export const leaveCompare = back;
