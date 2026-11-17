// Matching and counting, shared by the page and the worker. Pure functions, no DOM.
//
// A query q (plain data, so it can be posted to the worker):
//   words: the lawyer's words, raw     ds: "described by ecoi.net as", raw
//   types: [type codes] or []          place: '' | place id | 'none'
//   clock: 'pub' | 'men'               lo, hi: year range or null
//   folded: true to include contents/reference/url passages (field f)
//   lk: key of the current "wording like this" set, or ''

// ---- Words (DESIGN §4.1) ----
// `activist` whole word · `activist*` prefix · `"human rights defender"` phrase ·
// `activist journalist` both · `activist, defender` either. Case-insensitive.
const B = '(?<![\\p{L}\\p{N}_])', E = '(?![\\p{L}\\p{N}_])';
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseWords(raw) {
  const groups = [];
  let cur = [], m;
  const re = /"([^"]*)"|(,)|([^\s,"]+)/g;
  while ((m = re.exec(raw || ''))) {
    if (m[2]) { if (cur.length) groups.push(cur); cur = []; continue; }
    const t = token(m[1] != null ? m[1] : m[3], m[1] != null);
    if (t && !cur.some(x => x.label === t.label)) cur.push(t);
  }
  if (cur.length) groups.push(cur);
  const tokens = [];
  for (const g of groups) for (const t of g) if (!tokens.some(x => x.label === t.label)) tokens.push(t);
  for (const g of groups) g.idx = g.map(t => tokens.findIndex(x => x.label === t.label));
  return { groups, tokens };
}

function token(s, quoted) {
  s = s.trim().toLowerCase();
  const prefix = !quoted && s.endsWith('*');
  if (prefix) s = s.replace(/\*+$/, '');
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  const words = s.split(/\s+/);
  const body = words.map(escRe).join('\\s+');
  const src = B + body + (prefix ? '' : E);
  return { label: quoted ? `"${s}"` : prefix ? s + '*' : s, lit: words[0], src, re: new RegExp(src, 'iu') };
}

export const hit = (t, l) => l.includes(t.lit) && t.re.test(l);

// Does a lower-cased text match the parsed words? (OR of groups, AND inside a group.)
export function matches(W, l) {
  return W.groups.some(g => g.every(t => hit(t, l)));
}

// One regex marking every token, for highlighting.
export function markRe(W) {
  return W.tokens.length ? new RegExp(W.tokens.map(t => t.src).join('|'), 'giu') : null;
}

// ---- Document types (ecoi.net categories), bottom to top in stacked cells ----
export const TYPES = [
  { code: 'response', label: 'query response', cat: 'Response' },
  { code: 'periodical', label: 'periodical report', cat: 'Periodical Report' },
  { code: 'special', label: 'special report', cat: 'Special or Analytical Report' },
  { code: 'position', label: 'position or guidance', cat: 'Expert Opinion or Position' },
  { code: 'other', label: 'other type', cat: null },
];
export function typeIndex(doc) {
  const i = TYPES.findIndex(t => t.cat === doc.type);
  return i < 0 ? 4 : i;
}

export const pubYear = doc => (doc.date ? String(doc.date).slice(0, 4) : 'undated');

export function inRange(y, q) {
  if (q.lo == null) return true;
  return y !== 'undated' && +y >= q.lo && +y <= q.hi;
}

// Document-level filters: type and "described by ecoi.net as". Returns a Uint8Array, 1 = kept.
// Kinds of institution in the filters, from the source type in index.json.
export const KINDS = [['gov', 'Governments'], ['int', 'International and EU bodies'], ['ngo', 'Non-governmental organisations'], ['res', 'Research groups and COI units']];
export const kindOf = s => ({ government: 'gov', igo: 'int', 'eu-asylum-agency': 'int', 'eu-institution': 'int', ngo: 'ngo', 'think-tank-academic': 'res', 'quasi-governmental-coi': 'res' }[s.type] || 'res');

// A later edition of the same series exists (title series `ed`, oldest first, or the catalogue's `next`).
// A report filed under many countries (ecoi.net lists them in `also`).
export const WIDE = 10;
export const wide = doc => (doc.also?.length || 0) >= WIDE;

export const superseded = doc => (Array.isArray(doc.ed) && doc.ed.length ? String(doc.ed.at(-1)[0]) !== String(doc.id) : doc.next != null);

// q.langs: [language names] · q.srcs: [source keys] or null for all · q.latest: newest edition only.
export function docFilter(docs, q) {
  const D = parseWords(q.ds);
  const types = new Set(q.types || []), langs = new Set(q.langs || []), srcs = q.srcs ? new Set(q.srcs) : null;
  const ok = new Uint8Array(docs.length);
  docs.forEach((doc, d) => {
    ok[d] = (!types.size || types.has(TYPES[typeIndex(doc)].code)) && (!D.groups.length || matches(D, String(doc.title || '').toLowerCase()))
      && (!langs.size || langs.has(doc.lang)) && (!srcs || srcs.has(String(doc.s))) && (!q.latest || !superseded(doc)) && (!q.single || !wide(doc)) ? 1 : 0;
  });
  return ok;
}

export function blank() {
  return { cells: {}, ty: {}, cdocs: {}, rows: {}, docs: {}, places: {}, none: 0, total: 0, opened: 0, parts: null, folded: 0, novec: 0, _last: {} };
}

function cell(T, s, y, n, ti, d) {
  const row = (T.cells[s] ||= {});
  row[y] = (row[y] || 0) + n;
  const tr = (T.ty[s] ||= {});
  (tr[y] ||= [0, 0, 0, 0, 0])[ti] += n;
  // Documents per cell: a document's passages sit together in its file, so count each change of d.
  const key = s + '|' + y;
  if (T._last[key] !== d) { T._last[key] = d; const c = (T.cdocs[s] ||= {}); c[y] = (c[y] || 0) + 1; }
}

export function placeIds(pl, parent) {
  if (!pl || !pl.length) return [];
  const out = new Set();
  for (let id of pl) {
    id = String(id);
    for (let guard = 0; id && guard < 6; guard++) { out.add(id); id = parent[id]; }
  }
  return [...out];
}

// Passage-level tally. ctx: { docs, parent, W (parsed words), docOK, near (Set of "d.k") or null, opened (Set) }.
export function addPassages(T, ps, ctx, q) {
  const { docs, parent, W, docOK, near, opened } = ctx;
  const nT = W.tokens.length;
  if (nT && !T.parts) T.parts = { tokens: new Array(nT).fill(0), groups: new Array(W.groups.length).fill(0) };
  const th = new Uint8Array(nT);
  for (const p of ps) {
    // Folded lines (contents, references, links, boilerplate…) are never found by a search (DESIGN §10, 2b.5).
    if (p.f && (!q.folded || nT || near)) { if (docOK[p.d]) T.folded++; continue; }
    if (!docOK[p.d]) continue;
    if (near && !near.has(p.d + '.' + p.k)) continue;
    const doc = docs[p.d];
    const years = q.clock === 'men' ? (p.yr || []).map(String) : [pubYear(doc)];
    if (!years.some(y => inRange(y, q))) continue;
    const ids = placeIds(p.pl, parent);
    const placeOK = !q.place || (q.place === 'none' ? !ids.length : ids.includes(q.place));
    let ok = true;
    if (nT) {
      for (let i = 0; i < nT; i++) th[i] = hit(W.tokens[i], p._l) ? 1 : 0;
      ok = false;
      for (let g = 0; g < W.groups.length; g++) {
        const all = W.groups[g].idx.every(i => th[i]);
        if (all) ok = true;
        if (placeOK && all) T.parts.groups[g]++;
      }
      if (placeOK) for (let i = 0; i < nT; i++) T.parts.tokens[i] += th[i];
    }
    if (!ok) continue;
    // Topic and family (DESIGN §4.7): only passages filed under them.
    if (!onTopic(p, q)) continue;
    const tp = p.tp == null ? null : [].concat(p.tp);
    // Where panel counts ignore the place filter so the lawyer can move between places.
    if (ids.length) for (const id of ids) T.places[id] = (T.places[id] || 0) + 1;
    else T.none++;
    if (!placeOK) continue;
    const ti = typeIndex(doc);
    for (const y of years) cell(T, doc.s, y, 1, ti, p.d);
    T.rows[doc.s] = (T.rows[doc.s] || 0) + 1;
    T.docs[p.d] = (T.docs[p.d] || 0) + 1;
    T.total++;
    if (opened && opened.has(doc.id + '.' + p.k)) T.opened++;
    // The topic lane: the same counts with families ('f<id>') and topics ('t<id>') as rows.
    if (p.fm) {
      const L = (T.topic ||= { cells: {}, ty: {}, cdocs: {}, rows: {}, docs: {}, dh: {}, _last: {} });
      for (const f of p.fm) {
        const key = 'f' + f;
        for (const y of years) cell(L, key, y, 1, ti, p.d);
        L.rows[key] = (L.rows[key] || 0) + 1;
        const dd = (L.docs[key] ||= {});
        dd[p.d] = (dd[p.d] || 0) + 1;
      }
    }
    if (tp) {
      const L = (T.topic ||= { cells: {}, ty: {}, cdocs: {}, rows: {}, docs: {}, dh: {}, _last: {} });
      tp.forEach((id, j) => {
        const key = 't' + id;
        for (const y of years) cell(L, key, y, 1, ti, p.d);
        L.rows[key] = (L.rows[key] || 0) + 1;
        const dd = (L.docs[key] ||= {});
        dd[p.d] = (dd[p.d] || 0) + 1;
        const hh = (L.dh[key] ||= {});
        if (hh[p.d] == null) hh[p.d] = Array.isArray(p.th) ? p.th[j] : p.th;
      });
    }
  }
  return T;
}

// Document-level counts are exact when no passage-level condition is in force.
export const onTopic = (p, q) =>
  (q.topic === '' || q.topic == null || [].concat(p.tp ?? []).includes(+q.topic)) &&
  (q.fam === '' || q.fam == null || ((p.fm || []).includes(+q.fam) && !(q.hw && (p.fw || []).includes(+q.fam))));

export const docsSuffice = q => !q.words.trim() && !q.lk && q.clock === 'pub' && q.place !== 'none' && !q.folded && !q.topic && !q.fam && q.rows !== 't';

export function fromDocs(docs, q, placesNone, docOK) {
  const T = blank();
  docs.forEach((doc, d) => {
    if (!docOK[d]) return;
    const y = pubYear(doc);
    const n = q.place ? (doc.pl?.[q.place] || 0) : q.folded ? (doc.n || 0) : (doc.nc ?? Math.max(0, (doc.n || 0) - (doc.nf || 0)));
    if (n) cell(T, doc.s, y, n, typeIndex(doc), d);
    if (!inRange(y, q)) return;
    for (const [id, c] of Object.entries(doc.pl || {})) T.places[id] = (T.places[id] || 0) + c;
    if (!n) return;
    T.rows[doc.s] = (T.rows[doc.s] || 0) + n;
    T.docs[d] = n;
    T.total += n;
  });
  const all = docOK.every(Boolean);
  T.none = q.lo == null && all ? placesNone : null;
  T.opened = null;
  T.folded = null;
  delete T._last;
  return T;
}

// Ink steps for the map (DESIGN §4.2: the map is shaded): step 1 is exactly 1; steps 2–5 split
// (1, max] evenly on a log scale.
export function scale(max) {
  max = Math.max(1, max || 1);
  const up = [1];
  for (let j = 1; j <= 3; j++) up.push(Math.max(up[j - 1] + 1, Math.round(max ** (j / 4))));
  const step = n => { if (!n) return 0; const i = up.findIndex(u => n <= u); return i < 0 ? 5 : i + 1; };
  const ranges = ['1', ...[1, 2, 3].map(j => (up[j - 1] + 1 === up[j] ? `${up[j]}` : `${up[j - 1] + 1}–${up[j]}`)), `over ${up[3]}`];
  return { step, ranges };
}

// Map shading: five steps evenly on a log scale between the smallest and largest non-zero count in view.
export function shades(values) {
  const nz = values.filter(v => v > 0);
  if (!nz.length) return { step: () => 0, ranges: [] };
  const lo = Math.min(...nz), hi = Math.max(...nz);
  if (lo === hi) return { step: n => (n ? 5 : 0), ranges: [`${lo}`] };
  const up = [1, 2, 3, 4].map(j => Math.round(lo * (hi / lo) ** (j / 5)));
  for (let j = 1; j < 4; j++) up[j] = Math.max(up[j], up[j - 1] + 1);
  const step = n => { if (!n) return 0; const i = up.findIndex(u => n <= u); return i < 0 ? 5 : i + 1; };
  const r = (a, b) => (a >= b ? `${b}` : `${a}–${b}`);
  const ranges = [r(lo, up[0]), ...[1, 2, 3].map(j => r(up[j - 1] + 1, up[j])), r(up[3] + 1, hi)].filter((x, i, a) => a.indexOf(x) === i);
  return { step, ranges };
}

// Cell height on a log scale relative to the tallest cell in view: 0..1.
export const height = (n, max) => (n ? Math.max(0.12, Math.log1p(n) / Math.log1p(Math.max(1, max))) : 0);
