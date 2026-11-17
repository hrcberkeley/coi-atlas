import { state, read, set, replace, href, lastSet, CASE_KEYS, range, left, parseLeft, fmtDate, esc, num, plural, save } from './state.js';
import * as data from './data.js';
import { fromDocs, docsSuffice, blank, pubYear, parseWords, markRe, docFilter, TYPES, typeIndex, kindOf } from './count.js';
import { renderLandscape, renderWhere, counterLine, openRows } from './grid.js';
import { renderSide, selection } from './side.js';
import { renderWelcome } from './welcome.js';
import { renderPage, closePage, stepPage, pinCurrent, hasSelection, parseP } from './page.js';
import { initCasefile, toggle, cases, current, switchCase, saveLine } from './casefile.js';

const $ = id => document.getElementById(id);
const main = $('main'), pageEl = $('page'), live = $('live');
const NATIONAL = new Set(['government', 'quasi-governmental-coi', 'nhri']);
const AUTHORITY = new Set(['government', 'quasi-governmental-coi']);
const INTL = new Set(['igo', 'eu-asylum-agency', 'eu-institution']);
const LN = ['100', '300', '1000'];
// One search box, three ways to read it (DESIGN §4.1). The address keys stay q / lk / ds.
const MODES = {
  q: { label: 'Exact words', ph: 'e.g. activist, "human rights defender"', help: 'Whole words. activist* finds words starting with it; quotes make a phrase; a space means all the words, a comma either.' },
  lk: { label: 'Similar wording', ph: 'e.g. arrested for documenting abuses', help: 'Finds passages whose wording is closest to your phrase. Machine-made: it can miss or include passages. Your phrase stays in this browser.' },
  ds: { label: 'ecoi.net description', ph: 'e.g. activists', help: 'Matches words in the description ecoi.net’s editors wrote for each document, with the same rules as exact words; keeps whole documents.' },
};

const app = {
  mode: 'q', draft: '',
  progress: { loaded: [], complete: false },
  workerT: null, docsT: null, qKey: '', T: null,
  src: k => app.srcMap.get(k) || { k, short: k, name: `Source ${k}`, country: null, type: '' },
  groupLabel: s => (NATIONAL.has(s.type) && s.country && s.country !== 'International' ? s.country : INTL.has(s.type) ? 'International bodies' : NATIONAL.has(s.type) ? 'National authorities, country not stated' : 'Civil society and research'),
  typeLabel: doc => TYPES[typeIndex(doc)].label,
  // "Opened" counts passages opened in the Page panel (DESIGN §4.2).
  markOpened(key) {
    if (app.opened.has(key)) return;
    app.opened.add(key);
    save('atlas.opened2.' + app.S.slug, [...app.opened]);
    data.post({ type: 'opened', keys: [...app.opened] });
  },
};

function groupsFor(S, dc) {
  const ks = [...new Set(S.docs.map(d => d.s))].map(app.src);
  const rank = s => (NATIONAL.has(s.type) && s.country === dc ? 0 : NATIONAL.has(s.type) && s.country && s.country !== 'International' ? 1 : INTL.has(s.type) ? 3 : NATIONAL.has(s.type) ? 2 : 4);
  const by = new Map();
  for (const s of ks) {
    const label = app.groupLabel(s);
    if (!by.has(label)) by.set(label, { label, r: rank(s), deciding: rank(s) === 0, rows: [] });
    by.get(label).rows.push(s);
  }
  const gs = [...by.values()].sort((a, b) => a.r - b.r || a.label.localeCompare(b.label));
  for (const g of gs) g.rows.sort((a, b) => a.short.localeCompare(b.short));
  return gs;
}

// Filters (DESIGN §4.2): kinds and countries of institution become the list of sources they leave.
const list = v => (v || '').split(',').filter(Boolean);
function filterQ() {
  const sk = list(state.sk), sc = list(state.sc);
  const srcs = sk.length || sc.length ? app.idx.sources.filter(s => (!sk.length || sk.includes(kindOf(s))) && (!sc.length || sc.includes(s.country))).map(s => String(s.k)) : null;
  return { langs: list(state.lg), srcs, latest: state.le === '1', single: state.mc === '1' };
}

function columns(S, clock, r) {
  const seen = new Set();
  for (const d of S.docs) {
    if (clock === 'm') for (const y in d.yr || {}) seen.add(+y);
    else if (d.date) seen.add(+pubYear(d));
  }
  const pubs = S.docs.filter(d => d.date).map(d => +pubYear(d));
  const lastPub = pubs.length ? Math.max(...pubs) : new Date().getFullYear();
  const ys = [...seen].filter(y => y >= 1945 && y <= lastPub);
  let lo = ys.length ? Math.min(...ys) : lastPub, hi = ys.length ? Math.max(...ys) : lastPub;
  if (r) [lo, hi] = r;
  const out = [];
  for (let y = lo; y <= hi; y++) out.push(String(y));
  if (!r && clock !== 'm' && S.docs.some(d => !d.date)) out.unshift('undated');
  return { years: out, lastYear: lastPub };
}

// ---- The case line (DESIGN §4.1) ----
function caseline() {
  const idx = app.idx;
  const focusK = $('caseline').contains(document.activeElement) ? document.activeElement.dataset?.k : null;
  const c = idx.countries.find(x => x.slug === state.c);
  const countries = idx.countries.slice().sort((a, b) => a.name.localeCompare(b.name));
  const dcs = [...new Set(idx.sources.filter(s => AUTHORITY.has(s.type)).map(s => s.country).filter(x => x && x !== 'International'))].sort();
  const place = state.w === 'none' ? 'No place named' : app.S?.place.get(state.w)?.name || state.w;
  const clear = (k, what) => `<button class="x" data-clear="${k}" aria-label="Clear ${what}">×</button>`;
  const cf = current();
  const T = app.T;
  const parts = wordCounts();
  const draft = app.draft ?? '';
  const descDocs = state.ds && app.S ? docFilter(app.S.docs, { ds: state.ds, types: [] }).reduce((a, b) => a + b, 0) : 0;
  $('caseline').innerHTML = `
    <div class="cl-row">
      <label class="chip case"><span class="lab">Case</span><select data-case aria-label="Case in use">
        <option value=""${cf ? '' : ' selected'}>no case open</option>
        ${cases().map(x => `<option value="${x.id}"${cf === x ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
        <option value="+">New case…</option></select></label>
      <label class="chip req"><span class="lab">Transferred to</span>
        <select data-k="c" class="${state.c ? 'you' : ''}"><option value="">choose the destination</option>${countries.map(x => `<option value="${x.slug}"${x.slug === state.c ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <span class="chip"><span class="lab">where</span>${state.w ? `<button class="val you" data-goto-where>${esc(place)}</button>${clear('w', 'where')}` : `<button class="val unset" data-goto-where ${c ? '' : 'disabled'}>any place</button>`}</span>
      <label class="chip"><span class="lab">key date</span><input data-k="l" class="${state.l ? 'you' : ''}" size="9" placeholder="Mar 2019" title="e.g. when your client left, or the planned transfer date" value="${esc(state.l ? fmtDate(state.l) : '')}" aria-label="Key date: a year or month, e.g. when your client left, or the planned transfer date">${state.l ? clear('l', 'key date') : ''}</label>
      <label class="chip"><span class="lab">decided in</span><select data-k="dc" class="${state.dc ? 'you' : ''}"><option value="">not set</option>${dcs.map(x => `<option${x === state.dc ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>${state.dc ? clear('dc', 'deciding country') : ''}</label>
      ${state.r ? `<span class="chip"><span class="lab">years</span><span class="val you">${state.r.replace('-', '–')}</span>${clear('r', 'year range')}</span>` : ''}
      ${state.ck === 'm' ? `<span class="chip"><span class="lab">counting by</span><span class="val">year the text mentions</span>${clear('ck', 'year the text mentions')}</span>` : ''}
    </div>
    <div class="cl-row what">
      <span class="lab what-lab">Search</span>
      <input class="searchbox${draft ? ' you' : ''}" data-k="search" value="${esc(draft)}" placeholder="${esc(MODES[app.mode].ph)}" aria-label="Search: ${MODES[app.mode].label}. Press / to come here." aria-describedby="search-help">
      <span class="modes" role="radiogroup" aria-label="How to match what you type">${Object.entries(MODES).map(([k, m]) => `<button role="radio" aria-checked="${app.mode === k}" data-mode="${k}">${m.label}</button>`).join('')}</span>
    </div>
    <p class="search-help grey small" id="search-help">${MODES[app.mode].help}</p>
    ${state.q || state.lk || state.ds || (app.S?.hasTopics && (state.tp || state.fm)) ? `<div class="cl-row chips">
      ${state.q ? `<span class="schip"><button class="edit" data-edit="q" title="Edit">exact words: <b>${esc(state.q)}</b> <span class="cnt" data-cnt="q">${parts}</span></button>${clear('q', 'exact words')}</span>` : ''}
      ${state.lk ? `<span class="schip"><button class="edit" data-edit="lk" title="Edit">similar wording: <b>“${esc(state.lk)}”</b></button><select data-k="ln" aria-label="How many closest passages">${LN.map(n => `<option value="${n}"${(state.ln || '300') === n ? ' selected' : ''}>closest ${num(+n)}</option>`).join('')}</select>${clear('lk', 'similar wording')}</span>` : ''}
      ${state.fm && app.S?.hasTopics ? `<span class="schip"><button class="edit" data-edit-topic title="Show in the Topics tab">family: <b>${esc(app.S?.famById.get(state.fm)?.name || (state.fm === '29' ? 'Other questions' : state.fm))}</b></button>${clear('fm', 'family')}</span>` : ''}
      ${state.tp && app.S?.hasTopics ? `<span class="schip"><button class="edit" data-edit-topic title="Show in the Topics tab">topic: <b>${esc(app.S?.topicById.get(state.tp)?.name || state.tp)}</b></button>${clear('tp', 'topic')}</span>` : ''}
      ${'' /* chips */}${state.ds ? `<span class="schip"><button class="edit" data-edit="ds" title="Edit">ecoi.net description: <b>${esc(state.ds)}</b> <span class="cnt">${plural(descDocs, 'document', 'documents')}</span></button>${clear('ds', 'ecoi.net description')}</span>` : ''}
      ${app.S && state.v !== 's' ? '<button class="linkish small" data-compare-on>Compare sources on this</button>' : ''}
    </div>` : ''}
    ${state.lk ? `<p class="lk-note mech">${lkNote()}</p>` : ''}`;
  const cl = $('caseline');
  if (focusK) { const f = cl.querySelector(`[data-k="${focusK}"]`); f?.focus({ preventScroll: true }); if (f?.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); }
  cl.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => set(s.dataset.k === 'c' ? { c: s.value, w: '', s: '', y: '', p: '', pg: '', x: '', r: '', v: '' } : { [s.dataset.k]: s.value }));
  cl.querySelectorAll('input[data-k]:not([data-k="search"])').forEach(i => {
    const apply = () => {
      if (i.dataset.k === 'l') {
        const v = i.value.trim() ? parseLeft(i.value) : '';
        if (v === null) { i.setAttribute('aria-invalid', 'true'); live.textContent = 'Write a year (2019) or a month (Mar 2019).'; return; }
        set({ l: v });
      } else set({ [i.dataset.k]: i.value.trim() });
    };
    i.onchange = apply;
    i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
  });
  cl.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => set({ [b.dataset.clear]: '' }));
  const box = cl.querySelector('[data-k="search"]');
  box.oninput = () => { app.draft = box.value; };
  box.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = box.value.trim();
    app.draft = '';
    set({ [app.mode]: v });
  };
  cl.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { app.mode = b.dataset.mode; caseline(); cl.querySelector('[data-k="search"]').focus(); });
  cl.querySelector('[data-compare-on]')?.addEventListener('click', () => set({ v: 's', sp: '' }));
  cl.querySelector('[data-edit-topic]')?.addEventListener('click', () => { app.leftTab = 'topics'; if (app.S && !state.v) renderWhere(app, main); });
  cl.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    app.mode = b.dataset.edit; app.draft = state[app.mode];
    caseline();
    const f = $('caseline').querySelector('[data-k="search"]'); f.focus(); f.select();
  });
  cl.querySelectorAll('[data-goto-where]').forEach(b => b.onclick = () => {
    if (state.v || state.p) set({ v: '', p: '', pg: '' });
    requestAnimationFrame(() => { window.scrollTo({ top: 0 }); main.querySelector('.findplace input')?.focus({ preventScroll: true }); });
  });
  cl.querySelector('[data-case]').onchange = e => {
    const v = e.target.value;
    if (v === '+') { switchCase(''); toggle(true); caseline(); return; }
    const cs = switchCase(v);
    restoreLine(cs);
  };
}

function wordCounts() {
  const T = app.T;
  return state.q && T?.parts ? app.W.groups.map((g, i) => `${esc(g.map(t => t.label).join(' '))} ${num(T.parts.groups[i])}`).join(' · ') : '';
}

function lkNote() {
  const L = app.lk;
  const phrase = `closest wording to “${esc(state.lk)}” (machine-made, may miss or include passages)`;
  if (L.error) return `${phrase}: could not be prepared (${esc(L.error)}).`;
  if (!L.ready) return `${phrase}: preparing the language model in this browser (the first use downloads about 135 MB, once${L.pct != null ? `; ${L.pct}% so far` : ''}). The phrase is not sent anywhere.`;
  if (app.waitText) return `${phrase}: ${esc(app.waitText)}.`;
  const nv = app.T?.novec;
  return `${phrase}${nv ? `. ${plural(nv, 'passage', 'passages')} with no vector are not included` : ''}.`;
}

function restoreLine(cs) {
  if (!cs) { caseline(); return; }
  const patch = { s: '', y: '', v: '', p: '', pg: '', x: '' };
  for (const k of CASE_KEYS) patch[k] = cs.line?.[k] || '';
  if (!patch.c) patch.c = state.c;
  set(patch);
  caseline();
}

function lineNow() {
  const line = {};
  for (const k of CASE_KEYS) if (state[k]) line[k] = state[k];
  line.names = { c: app.country?.name || '', w: state.w === 'none' ? 'No place named' : app.S?.place.get(state.w)?.name || '' };
  return line;
}

function header(c) {
  const L = c.line || {}, n = L.names || {};
  const types = (L.t || '').split(',').filter(Boolean).map(t => TYPES.find(x => x.code === t)?.label).join(', ');
  const what = [L.q && `words ${L.q}`, L.lk && `wording like this “${L.lk}” (closest ${L.ln || 300}, machine-made)`, L.ds && `described by ecoi.net as ${L.ds}`, types && `type ${types}`].filter(Boolean).join(' · ');
  return [
    `Transferred to: ${n.c || L.c || '—'} · where: ${n.w || 'any place'} · key date: ${L.l ? fmtDate(L.l) : '—'} · decided in: ${L.dc || '—'}`,
    `What: ${what || '—'}${L.r ? ` · years ${L.r.replace('-', '–')}` : ''}`,
  ];
}

// ---- Counting ----
function tallyNow() {
  const q = app.q;
  const W = app.workerT;
  if (W?.tally && (W.complete || !docsSuffice(q))) return W.tally;
  if (docsSuffice(q)) {
    const T = app.docsT;
    if (!q.place) T.opened = openedInRange(q);
    return T;
  }
  return W?.tally || null;
}
function openedInRange(q) {
  let n = 0;
  for (const key of app.opened) {
    const d = app.S.byId.get(key.split('.')[0]);
    if (d == null || !app.docOK[d]) continue;
    const y = pubYear(app.S.docs[d]);
    if (q.lo == null || (y !== 'undated' && +y >= q.lo && +y <= q.hi)) n++;
  }
  return n;
}

data.listeners.tally = m => {
  if (m.id !== data.lastQuery()) return;
  if (!m.tally) { app.waitText = m.waiting === 'vectors' ? 'loading the wording vectors for this country' : 'counting'; refresh(); return; }
  app.waitText = '';
  app.workerT = m;
  app.progress = { loaded: m.loaded, complete: m.complete };
  refresh();
};
data.listeners.progress = m => { app.progress = m; };
data.listeners.vprogress = m => { app.waitText = `loading the wording vectors for this country (${m.done} of ${m.of} files)`; refreshLk(); };
const dl = {};   // file -> [loaded, total]: one percentage over every model file seen so far
data.embedListeners.progress = m => { if (m.total) { dl[m.file] = [m.loaded, m.total]; const v = Object.values(dl); app.lk.pct = Math.round(100 * v.reduce((a, x) => a + x[0], 0) / v.reduce((a, x) => a + x[1], 0)); refreshLk(); } };
const refreshLk = () => { const n = document.querySelector('.lk-note'); if (n) n.innerHTML = lkNote(); };

let rafPending = false;
function refresh() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!app.S) return;
    derive();
    if (!$('caseline').contains(document.activeElement)) caseline();
    else { const c = $('caseline').querySelector('[data-cnt="q"]'); if (c) c.innerHTML = wordCounts(); refreshLk(); }
    if (!state.v) { renderLandscape(app, main); renderWhere(app, main); }
    else if (app.progress.complete || !app.needsPassages) render();
  });
}

const NO_C = { cells: {}, ty: {}, cdocs: {}, rows: {}, docs: {}, dh: {} };
function derive() {
  app.T = app.q.lk && !app.lk.ready ? null : tallyNow();
  if (app.q.lk && !app.lk.ready) app.waitText = 'preparing “wording like this” in this browser';
  const T = app.T;
  // Rows: institutions, or (DESIGN §4.7) the country's topics, largest first.
  app.topicMode = state.rm === 't' && app.S.hasTopics;
  app.C = app.topicMode ? T?.topic || (T ? NO_C : null) : T;
  if (app.topicMode) {
    // Families as rows (largest first), each opening to its topics (DESIGN §4.7, revision 3).
    const S = app.S, open = openRows(), rows = [];
    const fams = S.families.slice();
    if (S.topics.some(t => t.fam === 29) && !S.famById.has('29')) fams.push({ id: 29, name: 'Other questions' });
    for (const f of fams) {
      if (!app.C?.rows['f' + f.id]) continue;
      rows.push({ k: 'f' + f.id, short: f.name, name: f.name, fam: f });
      if (open.has('f' + f.id)) for (const t of S.topics.filter(t => t.fam === f.id && app.C?.rows['t' + t.id])) rows.push({ k: 't' + t.id, short: t.name, name: t.name, topic: t, sub: true });
    }
    app.gridGroups = [{ label: 'Families of topics', note: 'filed by machine from headings and the questions query responses answer', rows }];
  } else app.gridGroups = app.groups;
  let max = 0;
  const C = app.C;
  if (C) for (const r of app.gridGroups.flatMap(g => g.rows)) { const row = C.cells[r.k]; if (row) for (const y of app.years) max = Math.max(max, row[y] || 0); }
  app.max = max;
  app.colTotal = y => (C ? app.gridGroups.flatMap(g => g.rows).reduce((a, r) => a + (C.cells[r.k]?.[y] || 0), 0) : 0);
  app.docsIn = (k, y) => {
    const c = C?.cdocs?.[k];
    return c ? c[y] || 0 : 0;
  };
}
app.refreshGrid = () => { derive(); renderLandscape(app, main); };

// ---- Wording like this: embed the phrase once per phrase ----
app.lk = { phrase: '', ready: false };
async function prepareLike() {
  const phrase = state.lk;
  if (!phrase || app.lk.phrase === phrase) return;
  app.lk = { phrase, ready: false, pct: null };
  const r = await data.embed(phrase);
  if (app.lk.phrase !== phrase) return;
  if (r.type === 'error') { app.lk.error = r.message; refreshLk(); return; }
  data.post({ type: 'phrase', key: phrase, vec: r.vec });
  app.lk.ready = true;
  app.waitText = '';
  refresh();
}

// ---- Render ----
let renderSeq = 0, lastSel = '';
async function render() {
  const my = ++renderSeq;
  read();
  app.idx ||= await data.index().catch(e => ({ error: e, countries: [], sources: [] }));
  if (app.idx.error) { main.innerHTML = `<p class="empty">The atlas data could not be loaded (${esc(app.idx.error.message)}).</p>`; return; }
  app.srcMap ||= new Map(app.idx.sources.map(s => [String(s.k), s]));
  if (!state.c) {
    app.S = null;
    caseline();
    closePage(pageEl);
    main.dataset.side = '';
    await renderWelcome(main, app.idx, async () => { const i = await data.refreshIndex(); if (i) { app.idx = i; app.srcMap = new Map(i.sources.map(s => [String(s.k), s])); } return i; });
    window.scrollTo(0, 0);
    return;
  }
  let S;
  try { S = await data.slice(state.c); } catch (e) {
    caseline();
    main.innerHTML = `<p class="empty">No data for this country yet (${esc(e.message)}).</p>`; return;
  }
  if (my !== renderSeq) return;
  if (app.S !== S) { app.opened = new Set(data.openedKeys(S.slug)); app.workerT = null; app.qKey = ''; main.innerHTML = ''; }
  app.S = S;
  app.country = app.idx.countries.find(x => x.slug === state.c) || { name: state.c, hidden: 0 };
  app.left = left(state.l);
  const r = range(state.r);
  Object.assign(app, columns(S, state.ck, r));
  const selYears = selection(app).years || [];
  data.worker(S, app.left?.y, state.ck !== 'm' ? selYears : []);
  if (state.ck !== 'm' && selYears.join() !== lastSel) { lastSel = selYears.join(); data.post({ type: 'prio', years: selYears }); }

  const lk = state.lk ? `${state.lk}|${LN.includes(state.ln) ? state.ln : '300'}` : '';
  app.q = { words: state.q || '', ds: state.ds || '', types: (state.t || '').split(',').filter(Boolean), place: state.w, clock: state.ck === 'm' ? 'men' : 'pub', lo: r ? r[0] : null, hi: r ? r[1] : null, folded: !!state.ff, lk, topic: S.hasTopics ? state.tp || '' : '', fam: S.hasTopics ? state.fm || '' : '', rows: state.rm === 't' ? 't' : '', ...filterQ() };
  app.W = parseWords(app.q.words);
  app.re = markRe(app.W);
  app.reDesc = markRe(parseWords([state.ds, state.q].filter(Boolean).join(', ')));
  const qKey = JSON.stringify(app.q);
  if (qKey !== app.qKey) {
    app.qKey = qKey;
    app.workerT = null;
    app.docOK = docFilter(S.docs, app.q);
    app.docsT = docsSuffice(app.q) ? fromDocs(S.docs, app.q, S.places.none, app.docOK) : null;
    app.progress = { ...app.progress, complete: false };
    data.query(app.q);
  }
  prepareLike();
  app.needsPassages = !docsSuffice(app.q);
  app.groups = groupsFor(S, state.dc);
  app.rowsInOrder = app.groups.flatMap(g => g.rows);
  const inSlice = new Set(S.docs.map(d => d.s));
  app.silentSources = app.idx.sources.filter(s => !inSlice.has(String(s.k))).sort((a, b) => a.name.localeCompare(b.name));
  derive();
  caseline();
  // Only the lawyer's own edits change the current case's saved line, never an opened link.
  if (lastSet != null && (location.hash || '#') === lastSet) saveLine(lineNow());

  if (state.p) renderPage(app, pageEl); else closePage(pageEl);
  if (state.v === 's') {
    const ready = !app.needsPassages || app.progress.complete;
    const key = JSON.stringify([state.c, state.y, state.l, state.hd, state.sp, state.dc, qKey, ready]);
    if (main.dataset.side !== key) {
      main.dataset.side = key;
      if (!ready) { main.innerHTML = `<div class="side"><p class="grey small loading" role="status">${counterLine(app)}</p></div>`; return; }
      await renderSide(app, main);
    }
  } else {
    main.dataset.side = '';
    if (!main.querySelector('.land')) main.innerHTML = `<div class="land"><aside class="where" aria-label="Where"></aside><section class="who-when" aria-label="Who and when"></section></div>`;
    renderWhere(app, main);
    renderLandscape(app, main);
  }
}

addEventListener('hashchange', render);
const topBar = document.querySelector('header.top');
new ResizeObserver(() => document.documentElement.style.setProperty('--top', topBar.offsetHeight + 'px')).observe(topBar);

$('copylink').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); live.textContent = 'Link copied. It holds the search, never your evidence.'; }
  catch { live.textContent = 'Copy the address from the address bar. It holds the search, never your evidence.'; }
  $('copylink').textContent = 'Link copied';
  setTimeout(() => { $('copylink').textContent = 'Copy link'; }, 2000);
});

// ---- Keyboard: / words · arrows in the grid · Enter opens · Escape up one level · P adds to evidence ----
addEventListener('keydown', e => {
  const t = e.target, a = document.activeElement;
  const typing = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  if (e.key === 'Escape') {
    if (typing(t) && t.closest('#caseline')) { t.blur(); return; }
    if (!$('drawer').hidden && $('drawer').contains(a)) return toggle(false);
    if (state.p) return hasSelection() ? replace({ p: parseP(state.p).id }) : set({ p: '', pg: '' });
    if (state.sp) return set({ sp: '' });
    if (state.v) return set({ v: '', ...(state.s ? {} : { y: '' }) });
    if (!$('drawer').hidden) return toggle(false);
    return;
  }
  if (typing(t) || typing(a) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); const i = $('caseline').querySelector('input[data-k="search"]'); i?.focus(); i?.select(); }
  else if (e.key === 'p' || e.key === 'P') {
    if (state.p) { pinCurrent(app); return; }
    a?.closest?.('.card')?.querySelector('[data-pin]')?.click();
  } else if (state.p && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
    e.preventDefault(); stepPage(['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? -1 : 1);
  }
});

initCasefile(live, { line: lineNow, header, changed: () => { caseline(); if (app.S && !state.v) renderLandscape(app, main); }, open: id => { restoreLine(switchCase(id)); } });
render();
