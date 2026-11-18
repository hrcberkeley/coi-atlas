// Loads one slice's passage files and answers counts and lists. Fetches only the atlas's own static files.
import { addPassages, blank, pubYear, placeIds, parseWords, matches, docFilter, inRange, hit } from './count.js';
import { len, scorer, fuse } from './bm25.js';

let base, docs, parent = {}, order = [], files = {}, byKey = new Map(), loading = {}, queue = [], active = 0;
let current = null, opened = new Set(), timer = null;
const vecs = {}, vloading = {}, phrases = new Map();   // year -> {v: Int8Array, nz: Uint8Array}; id -> Float32Array

const post = m => self.postMessage(m);
import { onTopic } from './count.js';
const loadedYears = () => order.filter(y => files[y]);
const complete = () => order.every(y => files[y]);

let topics = false, byEcoi = null, noTopic = null, topicFam = {};
function ensure(y) {
  const get = (u, empty) => fetch(u).then(r => (r.ok ? r.json() : empty)).catch(() => empty);
  return (loading[y] ||= Promise.all([get(`${base}/p/${y}.json`, []), topics ? get(`${base}/t/${y}.json`, {}) : {}, topics ? get(`${base}/w/${y}.json`, {}) : {}])
    .then(([ps, tr, wr]) => {
      for (const p of ps) { p._l = (p.t + '\n' + (p.en || '')).toLowerCase(); byKey.set(p.d + '.' + p.k, p); }
      // Topic ranges: {"<doc>": [[k_from, k_to, topic, heading], …]} → p.tp (topic ids) and p.th (heading index).
      for (const [key, ranges] of Object.entries(tr)) {
        const d = byEcoi.get(key) ?? (+key < docs.length ? +key : null);
        if (d == null) continue;
        // Five fields: [k_from, k_to, topic | null, heading, family]; the older four-field form has no family.
        for (const [a, b, id, h, fam0] of ranges) {
          const fam = fam0 ?? topicFam[id];
          for (let k = a; k <= b; k++) {
            const p = byKey.get(d + '.' + k);
            if (!p) continue;
            if (id != null && !(p.tp || []).includes(id)) { (p.tp ||= []).push(id); (p.th ||= []).push(h); }
            if (fam != null && !(p.fm || []).includes(fam)) (p.fm ||= []).push(fam);
          }
        }
      }
      // Passage classifier, revision 7: {v: 2, c: two chars per passage of p/<y>.json} — family letter (A = 0) or "-" not content or "." not scored,
      // then strength 0-9. Junk (strength >= 7) leaves topic views; an unfiled passage joins its family at strength >= 6 (p.fw: by wording).
      if (wr.v === 2) {
        const c = wr.c || '';
        ps.forEach((p, i) => {
          const f = c[2 * i], s = +c[2 * i + 1];
          if (!f || f === '.') return;
          p.ws = s;
          if (f === '-') { if (s >= 7) p.nc = 1; return; }
          p.wc = f.charCodeAt(0) - 65;
          if (!p.fm && s >= 6) { p.fm = [p.wc]; p.fw = [p.wc]; }
        });
      }
      // Layer 2, older form (grouped by wording, no heading): {"<doc>": [[k_from, k_to, family], …]} → p.fm and p.fw.
      else for (const [key, ranges] of Object.entries(wr)) {
        const d = byEcoi.get(key) ?? (+key < docs.length ? +key : null);
        if (d == null) continue;
        for (const [a, b, fam] of ranges) for (let k = a; k <= b; k++) { const p = byKey.get(d + '.' + k); if (p) { (p.fm ||= []).push(fam); (p.fw ||= []).push(fam); } }
      }
      files[y] = ps;
    }));
}
const ensureAll = () => Promise.all(order.map(ensure));

// Three files at a time, in queue order; "prio" moves years to the front (DESIGN rule 5.7).
function pump() {
  while (active < 3 && queue.length) {
    const y = queue.shift();
    if (loading[y]) continue;
    active++;
    ensure(y).then(() => { active--; post({ type: 'progress', loaded: loadedYears(), complete: complete() }); later(); pump(); });
  }
}
function later() { clearTimeout(timer); timer = setTimeout(answer, complete() ? 0 : 250); }

// ---- Wording like this: vectors are loaded only on first use ----
function ensureVec(y) {
  return (vloading[y] ||= fetch(`${base}/v/${y}.bin`).then(r => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0))).catch(() => new ArrayBuffer(0)).then(buf => {
    const v = new Int8Array(buf), n = v.length / 384, nz = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const o = i * 384; for (let j = 0; j < 384; j++) if (v[o + j]) { nz[i] = 1; break; } }
    vecs[y] = { v, nz };
  }));
}
// ---- Ranking by words (BM25): word statistics over this country's unfolded passages, built on first use ----
// Passage lengths once per country load; a term's document frequency on its first use (one scan), then kept.
let stats = null;
async function bmScorer(tokens) {
  await ensureAll();
  if (!stats) {
    let N = 0, sum = 0;
    for (const y of order) for (const p of files[y]) if (!p.f) { p._n = len(p._l); N++; sum += p._n; }
    stats = { N, avg: sum / N || 1, df: new Map() };
  }
  const dfOf = t => {
    let d = stats.df.get(t.label);
    if (d == null) { d = 0; for (const y of order) for (const p of files[y]) if (!p.f && hit(t, p._l)) d++; stats.df.set(t.label, d); }
    return d;
  };
  return scorer(tokens, stats, dfOf);
}

let nearCache = { key: '', set: null, rank: null, novec: 0 };
async function near(q, ctx) {
  const key = JSON.stringify([q.lk, q.words, q.place, q.types, q.ds, q.folded, q.topic, q.fam, q.hw]);
  if (nearCache.key === key) return nearCache;
  const vec = phrases.get(q.lk.split('|')[0]);
  const n = +q.lk.split('|')[1] || 300;
  if (!vec) return { set: new Set(), rank: new Map(), novec: 0 };
  await ensureAll();
  let done = 0;
  await Promise.all(order.map(y => ensureVec(y).then(() => post({ type: 'vprogress', done: ++done, of: order.length }))));
  // Wording closeness and the phrase's own words (BM25) are fused; a passage with no vector can enter through its words.
  const PT = parseWords(q.lk.split('|')[0].replace(/["*,]/g, ' ')).tokens;
  const sc = PT.length ? await bmScorer(PT) : null;
  const scores = [], bm = [], refs = [];
  let novec = 0;
  for (const y of order) {
    const ps = files[y], V = vecs[y];
    if (!V) continue;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.f || !ctx.docOK[p.d]) continue;
      if (ctx.W.groups.length && !matches(ctx.W, p._l)) continue;
      if (!onTopic(p, q)) continue;
      if (q.place) { const ids = placeIds(p.pl, parent); if (q.place === 'none' ? ids.length : !ids.includes(q.place)) continue; }
      const b = sc ? sc(p) : 0;
      if (!V.nz[i] && !b) { novec++; continue; }
      let s = NaN;
      if (V.nz[i]) {
        s = 0;
        const o = i * 384, v = V.v;
        for (let j = 0; j < 384; j++) s += v[o + j] * vec[j];
      }
      scores.push(s); bm.push(b); refs.push(p.d + '.' + p.k);
    }
  }
  const idx = fuse(scores, bm, n);
  nearCache = { key, set: new Set(idx.map(i => refs[i])), rank: new Map(idx.map((i, r) => [refs[i], r])), novec };
  return nearCache;
}

const ctxCache = { key: '', ctx: null };
function context(q) {
  const key = JSON.stringify([q.words, q.ds, q.types, q.langs, q.srcs, q.latest, q.single]);
  if (ctxCache.key !== key) ctxCache.ctx = { docs, parent, W: parseWords(q.words), docOK: docFilter(docs, q), opened };
  ctxCache.key = key;
  return ctxCache.ctx;
}

async function answer() {
  if (!current) return;
  const { id, q } = current;
  const ctx = { ...context(q), opened, near: null };
  let novec = 0;
  if (q.lk) {
    if (!complete() || !vecReady()) { post({ type: 'tally', id, tally: null, waiting: 'vectors', loaded: loadedYears(), complete: false }); }
    const N = await near(q, ctx);
    if (current?.id !== id) return;
    ctx.near = N.set; novec = N.novec;
  }
  const T = blank();
  for (const y of order) if (files[y]) addPassages(T, files[y], ctx, q);
  delete T._last;
  if (T.topic) delete T.topic._last;
  T.novec = novec;
  if (topics && complete()) {
    if (noTopic == null) { const has = new Set(); for (const y of order) for (const p of files[y]) if (p.tp || p.fm) has.add(p.d); noTopic = docs.filter((d, i) => d.n && !has.has(i)).length; }
    T.notopic = noTopic;
  }
  post({ type: 'tally', id, tally: T, loaded: loadedYears(), complete: complete() });
}
const vecReady = () => order.every(y => vecs[y]);

// Topic strength: a heading or question filing (10) above a filing by wording alone, then the classifier's strength for that family.
const topicOf = q => (q.fam !== '' && q.fam != null ? +q.fam : q.topic ? topicFam[q.topic] ?? null : null);
// A bare heading or fragment (under 60 characters) sinks below real text.
const tscore = (p, f) => ((p.fw || []).includes(f) ? 0 : 10) + (p.wc === f ? p.ws : 0) - (p.t.length < 60 ? 12 : 0);
const slim = p => { const { _l, ...rest } = p; const prev = byKey.get(p.d + '.' + (p.k - 1)); if (prev) rest.bt = prev.t.slice(0, 160); return rest; };
const newestFirst = (a, b) => {
  const da = docs[a.d].date || '', db = docs[b.d].date || '';
  return da > db ? -1 : da < db ? 1 : a.d - b.d || a.pg - b.pg || a.k - b.k;
};

// Passages behind a selection: newest first, then page order; closest first for "wording like this".
const listCache = new Map();
// Which passages a question keeps; returns the matching years (on the active clock) or null.
function acceptor(q, ctx, sources, years) {
  const src = sources?.length ? new Set(sources) : null;
  const ysel = years ? new Set(years.map(String)) : null;
  return p => {
    if ((p.f && (!q.folded || ctx.W.groups.length || q.lk)) || !ctx.docOK[p.d]) return null;
    const doc = docs[p.d];
    if (src && !src.has(doc.s)) return null;
    if (ctx.near && !ctx.near.has(p.d + '.' + p.k)) return null;
    if (ctx.W.groups.length && !matches(ctx.W, p._l)) return null;
    if (!onTopic(p, q)) return null;
    if (q.place) { const ids = placeIds(p.pl, parent); if (q.place === 'none' ? ids.length : !ids.includes(q.place)) return null; }
    const ys = (q.clock === 'men' ? (p.yr || []).map(String) : [pubYear(doc)]).filter(y => inRange(y, q) && (!ysel || ysel.has(y)));
    return ys.length ? ys : null;
  };
}

// Who says what (DESIGN §4.3): per source, its count and two passages — by the key date and the
// latest (or the oldest and the latest; or the earliest and latest within the years asked) — with
// the other sources' documents that hold the same text.
let textIndex = null;
async function who(m) {
  const { q, years, key } = m;
  const ctx = { ...context(q), near: null };
  let rank = null;
  if (q.lk) {
    if (!phrases.has(q.lk.split('|')[0])) return { waiting: true };
    const N = await near(q, ctx); ctx.near = N.set; rank = N.rank;
  }
  await ensureAll();
  const accept = acceptor(q, ctx, null, years);
  const by = new Map();
  for (const y of order) for (const p of files[y]) if (accept(p)) {
    const s = docs[p.d].s;
    (by.get(s) || by.set(s, []).get(s)).push(p);
  }
  const date = p => docs[p.d].date || '';
  const f = topicOf(q), ts = p => (f == null ? 0 : tscore(p, f));
  const order3 = (a, b) => a.d < b.d || (a.d === b.d && (a.pg < b.pg || (a.pg === b.pg && a.k < b.k)));
  // a before b in "newest first"; on the same date the stronger topic filing first
  const newer = (a, b) => (date(a) !== date(b) ? date(a) > date(b) : ts(a) !== ts(b) ? ts(a) > ts(b) : order3(a, b));
  const older = (a, b) => (date(a) !== date(b) ? date(a) < date(b) : ts(a) !== ts(b) ? ts(a) > ts(b) : !order3(a, b) && a !== b);
  const best = (list, cmp) => list.reduce((x, p) => (x == null || cmp(p, x) ? p : x), null);
  const closer = (a, b) => rank.get(a.d + '.' + a.k) < rank.get(b.d + '.' + b.k);
  textIndex ||= (() => { const T = new Map(); for (const y of order) for (const p of files[y]) if (!p.f) (T.get(p.t) || T.set(p.t, []).get(p.t)).push(p); return T; })();
  const same = p => {
    if (!p) return [];
    const seen = new Set();
    return (textIndex.get(p.t) || []).filter(o => docs[o.d].s !== docs[p.d].s && !seen.has(o.d) && seen.add(o.d))
      .map(o => ({ s: docs[o.d].s, id: docs[o.d].id, k: o.k, pg: o.pg, date: date(o), earlier: !!date(o) && date(o) < date(p) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  };
  const rows = [];
  for (const [s, list] of by) {
    const docsN = new Set(list.map(p => p.d)).size;
    const pickNew = l => best(l, rank ? closer : newer);
    const pickOld = l => best(l, rank ? closer : older);
    let a, b, mode;
    if (years) { mode = 'year'; a = pickOld(list); b = pickNew(list); }
    else if (key) { mode = 'key'; a = pickNew(list.filter(p => date(p) && date(p).slice(0, key.length) <= key)); b = pickNew(list); }
    else { mode = 'span'; a = pickOld(list); b = pickNew(list); }
    if (a && b && a === b) a = mode === 'key' ? a : null;
    const sameAB = a === b;
    rows.push({ s, n: list.length, docs: docsN, mode, a: a && slim(a), b: !sameAB && b ? slim(b) : null, one: sameAB, sa: same(a), sb: sameAB ? [] : same(b) });
  }
  return { rows };
}

async function list(m) {
  const { q, sources, years, offset = 0, limit = 50, ord } = m;
  const ctx = { ...context(q), near: null };
  let rank = null;
  if (q.lk) {
    if (!phrases.has(q.lk.split('|')[0])) return { items: [], end: false, waiting: true };
    const N = await near(q, ctx); ctx.near = N.set; rank = N.rank;
  }
  const ysel = years ? new Set(years.map(String)) : null;
  const accept = acceptor(q, ctx, sources, years);
  const best = !rank && ord !== 'new' && ctx.W.tokens.length > 0;   // exact words: best match first unless asked for newest
  const strong = !rank && !best && ord !== 'new' && topicOf(q) != null;   // a topic alone: strongest filings first
  const key = JSON.stringify([q, sources, years, best, strong]);
  let c = listCache.get(key);
  if (!c) { listCache.clear(); c = { years: {}, all: null }; listCache.set(key, c); }
  const want = offset + limit;

  if (q.clock === 'pub' && !rank && !best && !strong) {
    // Year by year from the newest, loading only what the requested page needs.
    const cand = order.filter(y => y !== 'undated' && (!ysel || ysel.has(y)) && inRange(y, q)).sort((a, b) => b - a);
    if (order.includes('undated') && (!ysel || ysel.has('undated')) && q.lo == null) cand.push('undated');
    const out = [];
    let i = 0;
    for (; i < cand.length && out.length < want; i++) {
      const y = cand[i];
      if (!c.years[y]) {
        await ensure(y);
        c.years[y] = files[y].map(p => { const b = accept(p); return b ? { p, b } : null; }).filter(Boolean).sort((a, b) => newestFirst(a.p, b.p));
      }
      out.push(...c.years[y]);
    }
    return { items: out.slice(offset, want).map(x => ({ ...slim(x.p), bands: x.b })), end: i >= cand.length && out.length <= want };
  }
  if (!c.all) {
    await ensureAll();
    c.all = [];
    for (const y of order) for (const p of files[y]) { const b = accept(p); if (b) c.all.push({ p, b }); }
    if (best) {
      const sc = await bmScorer(ctx.W.tokens);
      for (const x of c.all) x.s = sc(x.p);
      c.all.sort((a, b) => b.s - a.s || newestFirst(a.p, b.p));
    } else if (strong) {
      const f = topicOf(q);
      c.all.sort((a, b) => tscore(b.p, f) - tscore(a.p, f) || newestFirst(a.p, b.p));
    } else c.all.sort(rank ? (a, b) => rank.get(a.p.d + '.' + a.p.k) - rank.get(b.p.d + '.' + b.p.k) : (a, b) => newestFirst(a.p, b.p));
  }
  return { items: c.all.slice(offset, want).map(x => ({ ...slim(x.p), bands: x.b })), end: want >= c.all.length };
}

self.onmessage = async ({ data: m }) => {
  const reply = r => post({ type: 'reply', id: m.id, ...r });
  if (m.type === 'init') {
    ({ base, docs, order, topics } = m);
    topicFam = m.topicFam || {};
    byEcoi = new Map(docs.map((d, i) => [String(d.id), i]));
    for (const pl of m.places) if (pl.parent) parent[String(pl.id)] = String(pl.parent);
    opened = new Set(m.opened || []);
    queue = [...m.queue];
    pump();
  } else if (m.type === 'prio') {
    const want = m.years.filter(y => order.includes(y) && !loading[y]);
    queue = [...want, ...queue.filter(y => !want.includes(y))];
    pump();
  } else if (m.type === 'query') {
    current = m; answer();
  } else if (m.type === 'opened') {
    opened = new Set(m.keys); ctxCache.key = ''; answer();
  } else if (m.type === 'phrase') {
    phrases.set(m.key, m.vec); answer();
  } else if (m.type === 'who') {
    reply(await who(m));
  } else if (m.type === 'list') {
    reply(await list(m));
  } else if (m.type === 'get') {
    await Promise.all([...new Set(m.refs.map(([d]) => pubYear(docs[d] || {})))].filter(y => order.includes(y)).map(ensure));
    reply({ passages: m.refs.map(([d, k]) => byKey.get(d + '.' + k)).filter(Boolean).map(slim) });
  } else if (m.type === 'same') {
    await ensureAll();
    const out = [];
    for (const y of order) for (const p of files[y]) if (p.t === m.t) out.push(slim(p));
    out.sort(newestFirst);
    reply({ passages: out });
  } else if (m.type === 'docps') {
    // Every passage of one document, in page order, for selecting on the page.
    const y = pubYear(docs[m.d]);
    if (order.includes(y)) await ensure(y);
    reply({ passages: (files[y] || []).filter(p => p.d === m.d && !(p.f && !m.folded)).map(slim) });
  } else if (m.type === 'indoc') {
    // First passage of document d (page order) that matches q, or with text identical to m.t.
    const y = pubYear(docs[m.d]);
    if (order.includes(y)) await ensure(y);
    const ps = (files[y] || []).filter(p => p.d === m.d && !(p.f && !m.q?.folded));
    let found = null;
    if (m.t) found = ps.find(p => p.t === m.t) || null;
    else if (m.q) {
      const W = parseWords(m.q.words);
      // With similar wording: the document's closest passage, not its first.
      const N = m.q.lk && phrases.has(m.q.lk.split('|')[0]) ? await near(m.q, { ...context(m.q), near: null }) : null;
      const ok = ps.filter(p => (!W.groups.length || matches(W, p._l)) && onTopic(p, m.q) && (!N || N.set.has(p.d + '.' + p.k)));
      found = (N ? ok.sort((a, b) => N.rank.get(a.d + '.' + a.k) - N.rank.get(b.d + '.' + b.k)) : ok)[0] || null;
    }
    reply({ passage: found && slim(found) });
  }
};
