// Level 1 — the landscape: Who × When grid with stacked type cells, the Where panel, document lists (DESIGN §4.2).
import { state, set, esc, num, plural, fmtDate, range } from './state.js';
import { shades, height, pubYear, TYPES, typeIndex, KINDS, kindOf, WIDE, wide } from './count.js';
import { ask } from './data.js';
import { typeTag, officialTitle, editions } from './cards.js';

const yy = y => (y === 'undated' ? 'undated' : "'" + y.slice(2));
const sel = () => ({ s: new Set((state.s || '').split(',').filter(Boolean)), y: state.y });
// Rows whose document list is open: x, plus the institution a cell click named (s without a comma).
// Old addresses that named a passages selection (s, y) open the same list.
export function openRows() {
  const x = new Set((state.x || '').split(',').filter(Boolean));
  if (state.s && !state.s.includes(',')) x.add(state.s);
  return x;
}
const yearLimit = k => (state.s === k && state.y && !state.y.includes('-') ? state.y : '');

// Filters (DESIGN §4.2): hidden until asked for; what is on stays in the address and the counter line.
let filtersOpen = false;
const FKEYS = ['lg', 'sk', 'sc', 'le', 'mc', 'r'];
const activeFilters = () => FKEYS.filter(k => state[k]).length;

function filtersPanel(app) {
  const docs = app.S.docs, srcBy = new Map(app.idx.sources.map(s => [String(s.k), s]));
  const count = f => { const m = new Map(); for (const d of docs) { const k = f(d); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0])); };
  const on = k => new Set((state[k] || '').split(',').filter(Boolean));
  const box = (k, v, label, n) => `<label class="fbox"><input type="checkbox" data-f="${k}" value="${esc(v)}"${on(k).has(v) ? ' checked' : ''}> <span>${esc(label)}</span> <span class="grey tnum">${num(n)}</span></label>`;
  const kinds = new Map(count(d => srcBy.get(String(d.s)) && kindOf(srcBy.get(String(d.s)))));
  const ys = docs.map(pubYear).filter(y => y !== 'undated').map(Number), r = range(state.r);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const nSup = docs.filter(d => Array.isArray(d.ed) && d.ed.length ? String(d.ed.at(-1)[0]) !== String(d.id) : d.next != null).length;
  return `<div class="filters" id="filters" role="group" aria-label="Filters">
    <fieldset><legend>Language of the document</legend>${count(d => d.lang).map(([v, n]) => box('lg', v, v, n)).join('')}</fieldset>
    <fieldset><legend>Kind of institution</legend>${KINDS.filter(([k]) => kinds.has(k)).map(([k, label]) => box('sk', k, label, kinds.get(k))).join('')}</fieldset>
    <fieldset class="wide"><legend>Where the institution is based</legend><div class="fcols">${count(d => srcBy.get(String(d.s))?.country).map(([v, n]) => box('sc', v, v, n)).join('')}</div></fieldset>
    <fieldset><legend>Years published</legend>
      <label class="fyear">from <input type="number" data-fy="lo" min="${lo}" max="${hi}" placeholder="${lo}" value="${r ? r[0] : ''}"></label>
      <label class="fyear">to <input type="number" data-fy="hi" min="${lo}" max="${hi}" placeholder="${hi}" value="${r ? r[1] : ''}"></label>
      <legend class="sub">Editions</legend>
      <label class="fbox"><input type="checkbox" data-f="le" value="1"${state.le === '1' ? ' checked' : ''}> <span>Only the newest edition of each series</span> <span class="grey tnum">hides ${num(nSup)}</span></label>
      <label class="fbox"><input type="checkbox" data-f="mc" value="1"${state.mc === '1' ? ' checked' : ''}> <span>Hide reports that cover ${WIDE} or more other countries</span> <span class="grey tnum">hides ${num(docs.filter(wide).length)}</span></label>
      <p class="grey small">A series is the same report in later years, such as a yearly country report.</p>
    </fieldset>
    <p class="fnote grey small">Numbers are documents on ${esc(app.country.name)} before filtering. Ticking nothing in a group keeps all of it. ${activeFilters() ? '<button class="linkish" data-fclear>Clear all filters</button>' : ''}</p>
  </div>`;
}

export function counterLine(app) {
  const T = app.T;
  if (!T || (app.needsPassages && !app.progress.loaded?.length)) return `<span class="counter grey">${esc(app.waitText || 'Counting…')}</span>`;
  const nDocs = Object.keys(T.docs).length, nSrc = Object.values(T.rows).filter(Boolean).length;
  const opened = T.opened == null ? '' : ` · opened ${num(T.opened)}`;
  const nt = state.t ? `<span class="you"> · types: ${state.t.split(',').filter(c => c && c !== 'none').length} of ${shownTypes(app).length}</span>` : '';
  const nf = activeFilters() ? `<span class="you"> · filters: ${activeFilters()} on</span>` : '';
  return `<span class="counter tnum">${plural(T.total, 'passage', 'passages')} · ${plural(nDocs, 'document', 'documents')} · ${plural(nSrc, 'source', 'sources')}${opened}${nt}${nf}</span>${progress(app)}`;
}

export function progress(app) {
  const P = app.progress;
  if (P.complete) return '';
  if (!app.needsPassages) return app.S.docs[0]?.nc != null ? '' : ' <span class="progress" role="status">first counts from the catalogue; exact once the text has loaded</span>';
  const ys = P.loaded.filter(y => y !== 'undated').map(Number);
  const txt = ys.length ? `searched ${Math.min(...ys)}–${Math.max(...ys)} so far; counts are partial` : 'loading passages';
  return ` <span class="progress" role="status">${txt}</span>`;
}

function typeBreak(tc) {
  return TYPES.map((t, i) => (tc?.[i] ? `${num(tc[i])} ${t.label}` : '')).filter(Boolean).join(', ');
}

function cellLabel(app, src, y, n) {
  const docs = n ? app.docsIn(src.k, y) : 0;
  const when = y === 'undated' ? 'undated' : y;
  if (!n) return `${src.short}, ${when}, nothing published matching this`;
  return `${src.short}, ${when}, ${plural(n, 'passage', 'passages')}${docs ? ` in ${plural(docs, 'document', 'documents')}` : ''} (${typeBreak(app.C?.ty[src.k]?.[y])})`;
}

export function stack(n, tc, max) {
  if (!n) return '';
  const segs = (tc || [n, 0, 0, 0, 0]).map((c, i) => (c ? `<i class="t-${TYPES[i].code}" style="flex-grow:${c}"></i>` : '')).join('');
  return `<span class="stack" style="height:${(height(n, max) * 100).toFixed(1)}%">${segs}</span>`;
}

function depAttr(y, app) {
  const L = app.left;
  if (!L || String(L.y) !== y) return '';
  return ` data-dep style="--dep:${L.m ? (L.m - 0.5) / 12 : 0.5}"`;
}

// The legend is the type filter (DESIGN §4.2): each type a toggle, all on by default.
export function shownTypes(app) {
  const present = new Set();
  for (const d of app.S.docs) present.add(typeIndex(d));
  return TYPES.filter((t, i) => i < 4 || present.has(i));
}
export function legend(app) {
  const show = shownTypes(app);
  const on = new Set(state.t ? state.t.split(',') : show.map(t => t.code));
  return `<span class="legend" aria-label="Cell height: passages, tallest cell ${num(app.max)}. Colour: document type. The type buttons filter by type.">
    <span class="tallest"><span class="bar-key" aria-hidden="true"></span>tallest: ${plural(app.max, 'passage', 'passages')}${state.ck === 'm' ? ' mentioning a year' : ''}</span>
    <span class="typetoggles" role="group" aria-label="Document types (ecoi.net categories)">${show.map(t => `<button class="tt${on.has(t.code) ? '' : ' off'}" data-type="${t.code}" aria-pressed="${on.has(t.code)}" title="${on.has(t.code) ? 'Leave out' : 'Show'} ${t.label}"><i class="tsq t-${t.code}"></i>${t.label}</button>`).join('')}</span>
    ${state.t ? '<button class="linkish" data-alltypes>Show all types</button>' : ''}</span>`;
}

// When nothing matches: each part's own count, never words of the atlas's own (DESIGN §4.1).
function zeroHint(app) {
  const T = app.T, W = app.W;
  if (!T || T.total || !T.parts || !W.tokens.length || !app.progress.complete) return '';
  const tok = W.tokens.map((t, i) => `${esc(t.label)} ${num(T.parts.tokens[i])}`).join(' · ');
  const grp = W.groups.filter(g => g.length > 1).map(g => `${esc(g.map(t => t.label).join(' '))} together ${num(T.parts.groups[W.groups.indexOf(g)])}`).join(' · ');
  return `<p class="empty-note">Nothing matches every part of this search. Each part alone: ${tok}${grp ? ' · ' + grp : ''}. Clear a chip, or choose other years, to widen it.</p>`;
}

export function renderLandscape(app, el) {
  const { T, C, years } = app;
  const groups = app.gridGroups;
  const topicMode = !!app.topicMode;
  const focused = document.activeElement?.dataset?.cell;
  const fa = document.activeElement?.dataset || {};
  const fsel = fa.f ? `[data-f="${fa.f}"][value="${CSS.escape(document.activeElement.value)}"]` : fa.fy ? `[data-fy="${fa.fy}"]` : fa.filters != null ? '[data-filters]' : '';
  const max = app.max;
  const colTotal = y => app.colTotal(y);
  const colMax = Math.max(1, ...years.map(colTotal));
  const rowMax = Math.max(1, ...groups.flatMap(g => g.rows).map(r => C?.rows[r.k] || 0));
  const expanded = openRows();
  const L = app.left;
  const S = sel();

  const hist = years.map(y => {
    const n = colTotal(y);
    return `<td${depAttr(y, app)}><span class="hbar" style="height:${n ? Math.max(2, Math.round((n / colMax) * 24)) : 0}px" title="${y}: ${plural(n, 'passage', 'passages')}"></span></td>`;
  }).join('');
  const ylabels = years.map((y, i) =>
    `<th scope="col"${depAttr(y, app)} class="${!S.s.size && S.y === y ? 'on' : ''}"><button class="yr${L && String(L.y) === y ? ' you' : ''}" data-y="${y}" data-i="${i}" aria-label="${y === 'undated' ? 'Undated' : y}: compare sources for this year, ${plural(colTotal(y), 'passage', 'passages')}">${years.length <= 45 || y === 'undated' || (L && String(L.y) === y) || (+y % 5 === 0 && !(L && Math.abs(+y - L.y) === 1)) ? yy(y) : ''}</button></th>`).join('');

  let r = 0;
  const body = groups.map(g => {
    const rows = g.rows.map(src => {
      const ri = r++;
      const row = C?.cells[src.k] || {};
      const tot = C?.rows[src.k] || 0;
      const rowOn = S.s.has(src.k) && !S.y;
      const cells = years.map((y, ci) => {
        const n = row[y] || 0;
        const id = `${ri}.${ci}`;
        const on = S.s.has(src.k) && S.y === y;
        const label = esc(cellLabel(app, src, y, n));
        return `<td${depAttr(y, app)}><button class="cell${n ? '' : ' nil'}${on ? ' on' : ''}" data-cell="${id}" data-s="${src.k}" data-y="${y}" tabindex="${id === (focused || '0.0') ? 0 : -1}" aria-label="${label}" title="${label}">${stack(n, C?.ty[src.k]?.[y], max)}</button></td>`;
      }).join('');
      const open = expanded.has(src.k);
      // A family's ▸ opens its topics; its cells open its documents for that year.
      const showDocs = src.fam ? state.s === src.k && !!state.y : open;
      const nameBtn = src.fam
        ? `<button class="src topicname fam${state.fm === String(src.fam.id) ? ' on' : ''}" data-fam="${src.fam.id}" title="${esc(src.name)}" aria-label="Family ${esc(src.name)}: narrow everything to it">${esc(src.short)}</button>`
        : '';
      return `<tr class="${rowOn ? 'on' : ''}${src.sub ? ' subrow' : ''}">
        <th scope="row" class="who"><button class="exp" data-x="${src.k}" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} the ${src.fam ? 'topics' : 'documents'} of ${esc(src.name)}">${open ? '▾' : '▸'}</button>${nameBtn ? nameBtn : src.topic ? `<button class="src topicname${state.tp === String(src.topic.id) ? ' on' : ''}" data-topic="${src.topic.id}" title="${esc(src.name)}" aria-label="Topic ${esc(src.name)}: narrow everything to it">${esc(src.short)}</button>` : `<button class="src" data-s="${src.k}" title="${esc(src.name)}" aria-label="${esc(src.name)}: show its documents">${esc(src.short)}</button>`}</th>
        ${cells}
        <td class="tot"><span class="rbar" style="width:${tot ? Math.max(1, Math.round((tot / rowMax) * 48)) : 0}px"></span><span class="tnum">${num(tot)}</span></td></tr>${showDocs ? docList(app, src, years.length) : ''}`;
    }).join('');
    return `<tbody><tr class="ghead"><th colspan="${years.length + 2}" scope="rowgroup">${esc(g.label)}${g.deciding ? ' <span class="you-note">deciding country</span>' : ''}${g.note ? ` <span class="grey small gnote">${esc(g.note)}</span>` : ''}</th></tr>${rows}${g.more ? `<tr><td colspan="${years.length + 2}"><button class="linkish" data-alltopics>Show all ${num(g.more)} topics</button></td></tr>` : ''}</tbody>`;
  }).join('');

  const silent = app.silentSources;
  const wwEl = el.querySelector('.who-when'), keep = wwEl.scrollTop;
  wwEl.innerHTML = `
      <div class="bar">
        <div class="countline">${counterLine(app)} <button class="compare" data-compare>Compare sources</button></div>
        <div class="controls">
          <span class="ranges" role="group" aria-label="Years">
            <button data-range="dep" ${L ? '' : 'disabled title="Set a key date first"'}>Around key date</button>
            <button data-range="recent">Recent</button>
            ${state.r ? '<button data-range="">All years</button>' : ''}
          </span>
          ${app.S.hasTopics ? `<span class="modes rowsmode" role="radiogroup" aria-label="Rows"><span class="lab">Rows</span><button role="radio" aria-checked="${!topicMode}" data-rm="">Institutions</button><button role="radio" aria-checked="${topicMode}" data-rm="t">Topics</button></span>` : ''}
          <button class="filters-btn" data-filters aria-expanded="${filtersOpen}" aria-controls="filters">${filtersOpen ? 'Hide filters' : 'Show filters'}${activeFilters() ? ` <span class="you">(${activeFilters()} on)</span>` : ''}</button>
          <label class="clock"><span class="sr-only">Year clock</span><select data-ck>
            <option value=""${state.ck !== 'm' ? ' selected' : ''}>Year published</option>
            <option value="m"${state.ck === 'm' ? ' selected' : ''}>Year the text mentions</option></select></label>
        </div>
      </div>
      ${filtersOpen ? filtersPanel(app) : ''}
      ${zeroHint(app)}
      <div class="legend-row">${legend(app)}</div>
      <table class="grid${topicMode ? ' topics' : ''}" style="--n:${years.length}">
        <caption class="sr-only">Passages matching the case line, by source and ${state.ck === 'm' ? 'year the text mentions' : 'year published'}. Cell height is the number of passages; colour is the document type. A cell opens that institution's documents for that year; a year label compares sources for that year.</caption>
        <colgroup><col class="c-who"><col span="${years.length}"><col class="c-tot"></colgroup>
        <thead>
          <tr class="hist" aria-hidden="true"><td></td>${hist}<td></td></tr>
          <tr class="years"><th scope="col" class="who-h">${state.ck === 'm' ? 'Year the text mentions' : 'Year published'}</th>${ylabels}<th scope="col" class="tot-h">Passages</th></tr>
        </thead>
        ${body}
      </table>
      <div class="foot">
        <span>Drag across the year labels to set a range.</span>
        ${L ? `<span class="dep-key">key date ${esc(fmtDate(state.l))}</span>` : ''}
        ${T?.folded ? `<span>${plural(T.folded, 'contents, reference or link line', 'contents, reference or link lines')} left out. <button class="linkish" data-ff>Show them</button></span>` : state.ff ? '<span>Contents, reference and link lines are shown. <button class="linkish" data-ff>Leave them out</button></span>' : ''}
      </div>
      ${silent.length ? `<details class="silent"><summary>${plural(silent.length, 'other source', 'other sources')} in the atlas ${silent.length === 1 ? 'has' : 'have'} published nothing on ${esc(app.country.name)}</summary><ul>${silent.map(s => `<li>${esc(s.name)}${s.country && s.country !== 'International' ? ` <span class="grey">${esc(s.country)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${app.country.hidden ? `<p class="grey small">${plural(app.country.hidden, 'line', 'lines')} of page furniture (ID stamps, viewer text, image placeholders) are left out of every list and count.</p>` : ''}`;
  wwEl.scrollTop = keep;
  wire(app, el);
  if (focused) el.querySelector(`[data-cell="${focused}"]`)?.focus({ preventScroll: true });
  if (app.refocus || fsel) { el.querySelector(app.refocus || fsel)?.focus({ preventScroll: true }); app.refocus = ''; }
}

// ▸ beside an institution: one line per document with matching passages, newest first.
function docList(app, src, n) {
  const { S, T } = app;
  const ds = [];
  const y = yearLimit(src.k);
  const inYear = doc => !y || (state.ck === 'm' ? (doc.yr?.[y] || 0) > 0 : pubYear(doc) === y);
  const C = app.C;
  const counts = src.topic || src.fam ? C?.docs[src.k] || {} : T?.docs || {};
  S.docs.forEach((doc, d) => { if ((src.topic || src.fam || doc.s === src.k) && counts[d] && inYear(doc)) ds.push(d); });
  ds.sort((a, b) => String(S.docs[b].date || '').localeCompare(String(S.docs[a].date || '')) || a - b);
  const all = app.allDocs?.has(src.k);
  const shown = all ? ds : ds.slice(0, 40);
  const lines = shown.map(d => {
    const doc = S.docs[d];
    const eds = editions(app, doc).filter(e => e.doc && T.docs[S.byId.get(String(e.id))]);
    const edTxt = [...new Set(eds.map(e => `${e.rel} edition (${e.kind === 'edition (catalogue)' ? 'catalogue' : 'same title'})`))].join(', ');
    return `<li><button class="docline" data-doc="${d}"${src.topic ? ` data-row-topic="${src.topic.id}"` : src.fam ? ` data-row-fam="${src.fam.id}"` : ''}><span class="date tnum">${esc(fmtDate(doc.date))}</span>${typeTag(doc)}<span class="t">${esc(officialTitle(doc))}${src.fam ? `<span class="heading-used"> · ${esc(app.src(doc.s).short)}</span>` : ''}${src.topic ? `<span class="heading-used"> · ${esc(app.src(doc.s).short)}${src.topic.h?.[C.dh[src.k]?.[d]] ? ` · under the heading “${esc(src.topic.h[C.dh[src.k][d]][0])}”` : ''}</span>` : ''}</span><span class="n tnum">${plural(counts[d], 'passage', 'passages')}</span><span class="edmark">${edTxt ? 'has ' + esc(edTxt) : ''}</span></button></li>`;
  }).join('');
  return `<tr class="doclist"><td colspan="${n + 2}"><div class="dl"><p class="grey small">${y ? `<span class="ychip">${state.ck === 'm' ? 'text mentions ' : ''}${esc(y)} <button class="x" data-unyear aria-label="Remove the year ${esc(y)}: show all years">×</button></span> ` : ''}${esc(src.name)}: ${plural(ds.length, 'document', 'documents')} with matching passages${!y && state.r ? ' in ' + state.r.replace('-', '–') : ''}, newest first.${state.ck === 'm' && y ? ' Counts are for all the years shown.' : ''} ${app.q.words.trim() || app.q.lk || app.q.topic || app.q.fam || src.topic || src.fam ? 'Each opens at its first matching passage.' : 'Each opens at its first page.'}</p><ul>${lines}</ul>${ds.length > shown.length ? `<button class="linkish" data-alldocs="${src.k}">Show all ${num(ds.length)} documents</button>` : ''}</div></td></tr>`;
}

// ---- Where panel ----
const openProv = new Set();
const openTopics = new Set();
let topicFind = '';
function tabs(app) {
  if (!app.S.topicsFile) return '';
  const t = app.leftTab === 'topics';
  return `<div class="ltabs" role="tablist"><button role="tab" aria-selected="${!t}" data-ltab="where">Where</button><button role="tab" aria-selected="${t}" data-ltab="topics">Topics</button></div>`;
}

// Example questions (verbatim, from query responses) and the headings found above its passages.
function topicDetail(app, t) {
  const qs = (t.q || []).map(([q, id]) => {
    const inSlice = app.S.byId.has(String(id));
    return `<li>${inSlice ? `<button class="qlink" data-open="${id}" data-pg="1">“${esc(q)}” ▸</button>` : `<a href="https://www.ecoi.net/en/document/${id}.html" target="_blank" rel="noopener">“${esc(q)}”</a>`}</li>`;
  }).join('');
  const hs = (t.h || []).map(([h, n]) => `<li><span class="hd">${esc(h)}</span><span class="tnum">${num(n)}</span></li>`).join('');
  return `<div class="tdetail"><p><button class="linkish small" data-compare-topic="${t.id}">Compare sources on this</button>${t.specific ? ' <span class="grey small">· a narrow question (names a group, place or date)</span>' : ''}</p>${t.src ? `<p class="grey small">${plural(t.docs, 'document', 'documents')} from ${plural(t.src, 'institution', 'institutions')}${t.np ? `, ${plural(t.np, 'passage', 'passages')}` : ''}.</p>` : ''}
    ${qs ? `<p class="grey small">Questions asked in query responses:</p><ul class="heads qs">${qs}</ul>` : ''}
    ${hs ? `<p class="grey small">Headings above its passages (documents):</p><ul class="heads">${hs}</ul>` : ''}</div>`;
}

// The Topics tab (DESIGN §4.7, revision 3): families largest first, each opening to its topics,
// each topic opening to its questions and headings.
const openFams = new Set();
function renderTopics(app, el) {
  const { S } = app;
  if (!S.hasTopics) {
    const aside = el.querySelector('.where');
    aside.innerHTML = `${tabs(app)}<p class="small">Too few documents here to group by topic. Search finds everything.</p>`;
    aside.querySelectorAll('[data-ltab]').forEach(b => b.onclick = () => { app.leftTab = b.dataset.ltab; renderWhere(app, el); });
    return;
  }
  const M = S.topicsMeta;
  const v = topicFind.trim().toLowerCase();
  const fams = S.families.slice();
  if (S.topics.some(t => t.fam === 29) && !S.famById.has('29')) fams.push({ id: 29, name: 'Other questions', docs: null });
  const hit = t => !v || t.name.toLowerCase().includes(v) || (t.h || []).some(([h]) => h.toLowerCase().includes(v)) || (t.q || []).some(([q]) => q.toLowerCase().includes(v));
  const covered = M?.docs_in_topic_or_family ?? M?.docs_in_topic;
  const famHTML = fams.map(f => {
    const ts = S.topics.filter(t => t.fam === f.id && hit(t));
    if (v && !ts.length && !f.name.toLowerCase().includes(v)) return '';
    const open = openFams.has(f.id) || (v && ts.length);
    return `<li><button class="tog" data-ftog="${f.id}" aria-expanded="${!!open}" aria-label="${open ? 'Hide' : 'Show'} the topics in ${esc(f.name)}">${open ? '▾' : '▸'}</button><button class="pl fam${state.fm === String(f.id) ? ' on' : ''}" data-famsel="${f.id}" aria-pressed="${state.fm === String(f.id)}"><span class="nm">${esc(f.name)}</span><span class="tnum">${f.docs != null ? num(f.docs) : ''}</span></button>
      ${open ? `<div class="tdetail"><p><button class="linkish small" data-compare-fam="${f.id}">Compare sources on this</button></p>${ts.length ? `<ul class="topics">${ts.map(t => {
        const to = openTopics.has(t.id);
        return `<li><button class="tog" data-ttog="${t.id}" aria-expanded="${to}" aria-label="${to ? 'Hide' : 'Show'} the questions of ${esc(t.name)}">${to ? '▾' : '▸'}</button><button class="pl${state.tp === String(t.id) ? ' on' : ''}" data-topic="${t.id}" aria-pressed="${state.tp === String(t.id)}"><span class="nm">${esc(t.name)}</span><span class="tnum">${num(t.docs)}</span></button>${to ? topicDetail(app, t) : ''}</li>`;
      }).join('')}</ul>` : '<p class="grey small">No single topic here; the family comes from headings alone.</p>'}</div>` : ''}</li>`;
  }).join('');
  const aside = el.querySelector('.where');
  aside.innerHTML = `${tabs(app)}
    <input class="findtopic" type="search" placeholder="Find a topic" aria-label="Find a topic" value="${esc(topicFind)}">
    ${M && covered != null ? `<p class="small">Topics cover ${num(covered)} of ${num(M.docs)} documents: those whose headings or questions match. Search finds everything.</p>` : ''}
    <p class="grey small mech">Filed by machine: query responses under their own question, report sections under the topic or family their heading matches. Topic names are questions asked in query responses, verbatim; family names are the atlas's own list.</p>
    <ul class="topics fams">${famHTML || '<li class="grey small">No topic by that name.</li>'}</ul>
    <p class="grey small">Counts are documents.</p>`;
  aside.querySelectorAll('[data-ltab]').forEach(b => b.onclick = () => { app.leftTab = b.dataset.ltab; renderWhere(app, el); });
  aside.querySelectorAll('[data-famsel]').forEach(b => b.onclick = () => set({ fm: state.fm === b.dataset.famsel ? '' : b.dataset.famsel }));
  aside.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => set({ tp: state.tp === b.dataset.topic ? '' : b.dataset.topic }));
  aside.querySelectorAll('[data-ftog]').forEach(b => b.onclick = () => { const id = +b.dataset.ftog; openFams.has(id) ? openFams.delete(id) : openFams.add(id); renderWhere(app, el); aside.querySelector(`[data-ftog="${id}"]`)?.focus(); });
  aside.querySelectorAll('[data-ttog]').forEach(b => b.onclick = () => { const id = +b.dataset.ttog; openTopics.has(id) ? openTopics.delete(id) : openTopics.add(id); renderWhere(app, el); aside.querySelector(`[data-ttog="${id}"]`)?.focus(); });
  aside.querySelectorAll('[data-compare-topic]').forEach(b => b.onclick = () => set({ tp: b.dataset.compareTopic, v: 's', sp: '' }));
  aside.querySelectorAll('[data-compare-fam]').forEach(b => b.onclick = () => set({ fm: b.dataset.compareFam, v: 's', sp: '' }));
  aside.querySelectorAll('[data-open]').forEach(b => b.onclick = () => set({ p: b.dataset.open, pg: '1' }));
  const f = aside.querySelector('.findtopic');
  f.oninput = () => { topicFind = f.value; renderWhere(app, el); const g = el.querySelector('.findtopic'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); };
}

export function renderWhere(app, el) {
  if (app.leftTab === 'topics' && app.S.topicsFile) return renderTopics(app, el);
  const { S, T } = app;
  const P = S.places.places || [];
  const provinces = P.filter(p => p.level === 1).sort((a, b) => a.name.localeCompare(b.name));
  const kids = {};
  for (const p of P) if (p.level !== 1 && p.parent) (kids[p.parent] ||= []).push(p);
  const w = state.w;
  const cnt = id => T?.places[id] || 0;
  const ink = app.mapInk = shades(provinces.map(p => cnt(p.id)));
  const item = (p, cls = '') => `<button class="pl ${cls}${w === String(p.id) ? ' on' : ''}" data-w="${esc(p.id)}" aria-pressed="${w === String(p.id)}" aria-label="${esc(p.name)}: ${plural(cnt(p.id), 'passage mentions', 'passages mention')} it"><span class="nm">${esc(p.name)}</span><span class="tnum">${num(cnt(p.id))}</span></button>`;
  const list = provinces.map(p => {
    const ks = (kids[p.id] || []).filter(k => cnt(k.id) || w === String(k.id)).sort((a, b) => a.name.localeCompare(b.name));
    const open = openProv.has(String(p.id)) || (w && (w === String(p.id) || ks.some(k => w === String(k.id))));
    return `<li>${ks.length ? `<button class="tog" data-tog="${esc(p.id)}" aria-expanded="${!!open}" aria-label="${open ? 'Hide' : 'Show'} places in ${esc(p.name)}">${open ? '▾' : '▸'}</button>` : '<span></span>'}${item(p)}${ks.length && open ? `<ul>${ks.map(k => `<li><span></span>${item(k, 'sub')}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  const none = T?.none;
  el.querySelector('.where').innerHTML = `${tabs(app) || '<h2 class="h">Where</h2>'}
    <div class="findplace"><input list="placenames" placeholder="Find a place" aria-label="Find a place in ${esc(app.country.name)}"><datalist id="placenames">${P.map(p => `<option value="${esc(p.name)}">${p.level === 1 ? 'province' : esc(S.place.get(String(p.parent))?.name || '')}</option>`).join('')}</datalist></div>
    ${S.geo ? mapSVG(app) + `<div class="maplegend grey small"><p>Darker: more passages name a place in that province.</p><p class="shades" aria-hidden="true"><span>fewer</span><i class="m1"></i><i class="m2"></i><i class="m3"></i><i class="m4"></i><i class="m5"></i><span>more</span><span class="none-key"><i class="m0"></i>grey: none</span></p></div>` : ''}
    ${state.w ? `<p class="small"><button class="linkish" data-compare-place>Compare sources on ${esc(state.w === 'none' ? 'passages naming no place' : S.place.get(state.w)?.name || 'this place')}</button></p>` : ''}
    ${provinces.length ? '' : '<p class="grey small">No place list for this country yet.</p>'}
    <ul class="places">${list}
      <li class="none"><span></span><button class="pl${w === 'none' ? ' on' : ''}" data-w="none" aria-pressed="${w === 'none'}"><span class="nm">No place named</span><span class="tnum">${none == null ? '…' : num(none)}</span></button></li>
    </ul>
    <p class="grey small mech">Place names found in the text, literally. Variant spellings can be missed.</p>`;
  wireWhere(app, el);
}

function mapSVG(app) {
  const { S, T } = app;
  const feats = (S.geo.features || []).filter(f => f.geometry);
  const rings = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of feats) for (const poly of rings(f)) for (const [x, y] of poly[0] || []) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (!isFinite(x0) || x1 === x0 || y1 === y0) return '';
  // Equirectangular, scaled by cos(latitude) and fitted into a 220 × 240 box, whatever the country's shape.
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const sc = Math.min(220 / ((x1 - x0) * k), 240 / (y1 - y0));
  const W = (x1 - x0) * k * sc, H = (y1 - y0) * sc;
  const pt = ([x, y]) => `${((x - x0) * k * sc).toFixed(1)},${((y1 - y) * sc).toFixed(1)}`;
  const chosen = S.place.get(state.w);
  const prov = chosen ? (chosen.level === 1 ? String(chosen.id) : String(chosen.parent)) : '';
  const paths = feats.map(f => {
    const id = String(f.properties?.id ?? '');
    const p = S.place.get(id);
    const n = T?.places[id] || 0;
    const d = rings(f).map(poly => poly.map(r => 'M' + r.map(pt).join('L') + 'Z').join('')).join('');
    const name = p?.name || f.properties?.name || id;
    return `<path d="${d}" class="m${app.mapInk.step(n)}${prov === id ? ' on' : ''}" data-w="${esc(p ? id : '')}"><title>${esc(name)} · ${plural(n, 'passage', 'passages')}</title></path>`;
  }).join('');
  const ll = chosen?.ll;
  const marker = Array.isArray(ll) && ll.length === 2 ? (() => { const [cx, cy] = pt([ll[1], ll[0]]).split(','); return `<g class="marker"><circle cx="${cx}" cy="${cy}" r="5"/><circle cx="${cx}" cy="${cy}" r="1.6" class="dot"/><title>${esc(chosen.name)}</title></g>`; })() : '';
  return `<svg class="map" viewBox="-6 -6 ${(W + 12).toFixed(0)} ${(H + 12).toFixed(0)}" role="img" aria-label="Map of provinces shaded by passages that mention a place there${chosen ? '; ' + esc(chosen.name) + ' is marked' : ''}. The list below is the full control.">${paths}${marker}</svg>`;
}

function wireWhere(app, el) {
  const w = el.querySelector('.where');
  w.querySelector('[data-compare-place]')?.addEventListener('click', () => set({ v: 's', sp: '' }));
  w.querySelectorAll('[data-ltab]').forEach(b => b.onclick = () => { app.leftTab = b.dataset.ltab; renderWhere(app, el); });
  w.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.w;
    if (id === '' && b.tagName === 'path') return;
    set({ w: state.w === id ? '' : id });
  }));
  w.querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.tog;
    openProv.has(id) ? openProv.delete(id) : openProv.add(id);
    renderWhere(app, el);
    el.querySelector(`[data-tog="${id}"]`)?.focus();
  }));
  const fp = w.querySelector('.findplace input');
  fp.addEventListener('change', () => {
    const v = fp.value.trim().toLowerCase();
    const p = (app.S.places.places || []).find(x => x.name.toLowerCase() === v) || (app.S.places.places || []).find(x => x.name.toLowerCase().startsWith(v));
    if (p) set({ w: String(p.id) });
  });
}

function wire(app, el) {
  const ww = el.querySelector('.who-when');
  const table = ww.querySelector('table.grid');
  // A cell: that institution's documents for that year. A name or ▸: its documents for the range.
  const rows = () => new Set((state.x || '').split(',').filter(Boolean));
  ww.querySelectorAll('button.cell').forEach(b => b.addEventListener('click', () => {
    const x = rows(); x.add(b.dataset.s);
    set({ x: [...x].join(','), s: b.dataset.s, y: b.dataset.y, v: '' });
  }));
  const toggleRow = k => {
    const x = rows();
    if (!openRows().has(k)) { x.add(k); return set({ x: [...x].join(','), v: '' }); }
    x.delete(k);
    set({ x: [...x].join(','), ...(state.s === k ? { s: '', y: '' } : {}), v: '' });
  };
  ww.querySelectorAll('[data-fam]').forEach(b => b.addEventListener('click', () => set({ fm: state.fm === b.dataset.fam ? '' : b.dataset.fam })));
  ww.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => set({ tp: state.tp === b.dataset.topic ? '' : b.dataset.topic })));
  ww.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => set({ rm: b.dataset.rm, x: '', s: '', y: '' })));
  ww.querySelector('[data-alltopics]')?.addEventListener('click', () => { app.allTopics = true; app.refreshGrid(); });
  ww.querySelectorAll('button.src:not([data-topic]):not([data-fam])').forEach(b => b.addEventListener('click', () => {
    const x = rows(); x.add(b.dataset.s);
    set({ x: [...x].join(','), s: state.s === b.dataset.s ? '' : state.s, y: state.s === b.dataset.s ? '' : state.y, v: '' });
  }));
  ww.querySelectorAll('button.exp').forEach(b => b.addEventListener('click', () => toggleRow(b.dataset.x)));
  ww.querySelectorAll('[data-unyear]').forEach(b => b.addEventListener('click', () => set({ y: '' })));
  ww.querySelector('[data-compare]').addEventListener('click', () => set({ v: 's' }));
  ww.querySelectorAll('[data-alldocs]').forEach(b => b.addEventListener('click', () => { (app.allDocs ||= new Set()).add(b.dataset.alldocs); renderLandscape(app, el); }));
  ww.querySelectorAll('button.docline').forEach(b => b.addEventListener('click', async () => {
    const d = +b.dataset.doc, doc = app.S.docs[d];
    // With a search: its first matching passage. With none: page 1, nothing selected (DESIGN §4.5).
    const q = b.dataset.rowTopic != null ? { ...app.q, topic: b.dataset.rowTopic } : b.dataset.rowFam != null ? { ...app.q, fam: b.dataset.rowFam } : app.q;
    const searching = q.words.trim() || q.lk || q.topic || q.fam;
    const { passage } = searching ? await ask({ type: 'indoc', d, q }) : { passage: null };
    set(passage ? { p: `${doc.id}.${passage.k}`, pg: String(passage.pg) } : { p: String(doc.id), pg: '1' });
  }));
  ww.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
    const all = shownTypes(app).map(t => t.code);
    const on = new Set(state.t ? state.t.split(',') : all);
    on.has(b.dataset.type) ? on.delete(b.dataset.type) : on.add(b.dataset.type);
    const t = all.filter(c => on.has(c));
    app.refocus = `[data-type="${b.dataset.type}"]`;
    set({ t: t.length === all.length ? '' : t.join(',') || 'none' });
  }));
  ww.querySelector('[data-alltypes]')?.addEventListener('click', () => set({ t: '' }));
  ww.querySelector('[data-ck]').addEventListener('change', e => set({ ck: e.target.value, r: '', y: '' }));
  ww.querySelector('[data-filters]').addEventListener('click', () => { filtersOpen = !filtersOpen; app.refocus = '[data-filters]'; renderLandscape(app, el); });
  ww.querySelectorAll('[data-f]').forEach(b => b.addEventListener('change', () => {
    const k = b.dataset.f;
    app.refocus = `[data-f="${k}"][value="${CSS.escape(b.value)}"]`;
    if (k === 'le' || k === 'mc') return set({ [k]: b.checked ? '1' : '' });
    set({ [k]: [...ww.querySelectorAll(`[data-f="${k}"]:checked`)].map(x => x.value).join(','), y: '' });
  }));
  ww.querySelectorAll('[data-fy]').forEach(b => b.addEventListener('change', () => {
    const [lo, hi] = [...ww.querySelectorAll('[data-fy]')].map(x => parseInt(x.value, 10));
    app.refocus = `[data-fy="${b.dataset.fy}"]`;
    if (lo > 999 && hi > 999) set({ r: `${Math.min(lo, hi)}-${Math.max(lo, hi)}`, y: '' });
    else if (!b.value) set({ r: '', y: '' });
  }));
  ww.querySelector('[data-fclear]')?.addEventListener('click', () => { app.refocus = '[data-filters]'; set({ lg: '', sk: '', sc: '', le: '', mc: '', r: '', y: '' }); });
  ww.querySelector('[data-ff]')?.addEventListener('click', () => set({ ff: state.ff ? '' : '1' }));
  ww.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.range;
    if (!k) return set({ r: '' });
    if (k === 'dep') return set({ r: `${app.left.y - 2}-${app.left.y + 2}`, y: '' });
    set({ r: `${app.lastYear - 2}-${app.lastYear}`, y: '' });
  }));

  // Year labels: a click shows that year below; a drag sets a range.
  const labels = [...ww.querySelectorAll('button.yr')];
  let from = null, to = null;
  const mark = () => labels.forEach(l => {
    const i = +l.dataset.i;
    l.parentElement.classList.toggle('sel', from != null && i >= Math.min(from, to) && i <= Math.max(from, to));
  });
  labels.forEach(l => {
    l.addEventListener('pointerdown', e => { if (e.button) return; from = to = +l.dataset.i; mark(); e.preventDefault(); });
    l.addEventListener('pointerenter', () => { if (from != null) { to = +l.dataset.i; mark(); } });
    l.addEventListener('click', e => { if (e.detail === 0) set({ s: '', y: l.dataset.y, v: 's' }); });
  });
  window.onpointerup = () => {
    if (from == null) return;
    const a = Math.min(from, to), b = Math.max(from, to);
    from = null;
    const ys = app.years.slice(a, b + 1).filter(y => y !== 'undated');
    if (a === b) set({ s: '', y: app.years[a], v: 's' });
    else if (ys.length) set({ r: `${ys[0]}-${ys[ys.length - 1]}`, y: '' });
    mark();
  };

  table.addEventListener('keydown', e => {
    const c = e.target.dataset?.cell;
    if (!c || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    let [r, k] = c.split('.').map(Number);
    if (e.key === 'ArrowLeft') k--; if (e.key === 'ArrowRight') k++;
    if (e.key === 'ArrowUp') r--; if (e.key === 'ArrowDown') r++;
    if (e.key === 'Home') k = 0; if (e.key === 'End') k = app.years.length - 1;
    const next = table.querySelector(`[data-cell="${r}.${k}"]`);
    if (next) { e.preventDefault(); e.target.tabIndex = -1; next.tabIndex = 0; next.focus(); }
  });
}

export { typeIndex };
