// node atlas/src/count.check.mjs [slug] — checks word matching (DESIGN §4.1) and that counts from
// passages agree with counts from docs.json.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import { fromDocs, addPassages, blank, scale, parseWords, matches, docFilter, markRe } from './count.js';

// ---- Matching rules, including the critique's fragment cases ----
const m = (q, text) => matches(parseWords(q), text.toLowerCase());
assert(!m('HTS', 'the rights of women'), 'HTS must not match inside "rights"');
assert(!m('HTS', 'for three nights'), 'HTS must not match inside "nights"');
assert(!m('"HTS"', 'human rights'), 'quoted HTS must not match inside "rights"');
assert(m('HTS', 'arrested by HTS in Idlib'));
assert(m('HTS', 'Hay\'at Tahrir al-Sham (HTS).'));
assert(!m('HRD', 'Gefährdung der Person'), 'HRD must not match inside "Gefährdung"');
assert(!m('HRD', 'Wehrdienst'), 'HRD must not match inside "Wehrdienst"');
assert(m('HRD', 'an HRD was detained'));
assert(!m('activist', 'two activists were held'), 'whole word only');
assert(!m('activist', 'die Aktivisten und activisten'));
assert(m('activist*', 'two activists were held'), 'prefix with *');
assert(m('activist', 'an activist, a journalist'));
assert(!m('militant', 'militants attacked'), 'militant must not match militants');
assert(m('"human rights defender"', 'a human rights defender was'));
assert(m('"human rights defender"', 'a Human  Rights\nDefender was'), 'phrase across whitespace');
assert(!m('"human rights defender"', 'human rights defenders'), 'phrase is whole words');
assert(m('human rights defender', 'defender of human rights'), 'unquoted words: all of them, any order');
assert(m('activist journalist', 'the journalist and the activist'));
assert(!m('activist journalist', 'the journalist alone'));
assert(m('activist, defender', 'a defender'), 'comma: either');
assert(m('activist, "human rights defender"', 'a human rights defender'));
assert(!m('activist, defender', 'nobody'));
assert(m('Hay\'at', "Hay'at Tahrir"), 'apostrophes are literal');
assert(m('Ü*', 'Über alles'), 'unicode prefix');
const W = parseWords('activist journalist, "human rights defender"');
assert.equal(W.groups.length, 2);
assert.deepEqual(W.tokens.map(t => t.label), ['activist', 'journalist', '"human rights defender"']);
assert.equal('An activist; activists.'.replace(markRe(parseWords('activist')), '[$&]'), 'An [activist]; activists.');
assert.equal(parseWords('  ,  ').groups.length, 0);
assert.equal(parseWords('*').groups.length, 0);

// Folded lines are never found by a search, even when shown (DESIGN §10, 2b.5).
{
  const docs1 = [{ id: 1, s: 'x', type: 'Response', date: '2020', n: 2 }];
  const ps = [{ d: 0, k: 0, t: 'activist list', f: 'contents' }, { d: 0, k: 1, t: 'an activist' }].map(p => ({ ...p, _l: p.t.toLowerCase() }));
  const q0 = { words: 'activist', ds: '', types: [], place: '', clock: 'pub', lo: null, hi: null, folded: true, lk: '' };
  const T0 = addPassages(blank(), ps, { docs: docs1, parent: {}, W: parseWords('activist'), docOK: docFilter(docs1, q0), near: null }, q0);
  assert.equal(T0.total, 1, 'a folded line is not a word match');
  const q1 = { ...q0, words: '' };
  assert.equal(addPassages(blank(), ps, { docs: docs1, parent: {}, W: parseWords(''), docOK: docFilter(docs1, q1), near: null }, q1).total, 2, 'shown when asked, without a search');
}

// Filters (DESIGN §4.2): language, sources left by kind/country, newest edition of a series.
{
  const d = [{ id: 1, s: '1', type: 'Response', lang: 'French', ed: [[1, 't'], [3, 't']] }, { id: 2, s: '2', type: 'Response', lang: 'English', next: 4 }, { id: 3, s: '2', type: 'Response', lang: 'English', ed: [[1, 't'], [3, 't']] }];
  const f = q => Array.from(docFilter(d, { ds: '', types: [], ...q }));
  assert.deepEqual(f({ langs: ['French'] }), [1, 0, 0]);
  assert.deepEqual(f({ srcs: ['2'] }), [0, 1, 1]);
  assert.deepEqual(f({ srcs: [] }), [0, 0, 0], 'a kind with no sources keeps nothing');
  assert.deepEqual(f({ latest: true }), [0, 0, 1], 'newest edition only');
}

const k = scale(3000);
assert.deepEqual(k.ranges, ['1', '2–7', '8–55', '56–405', 'over 405']);

// ---- Real slice: passages vs docs.json ----
const slug = process.argv[2] || 'syrian-arab-republic';
const dir = new URL(`../data/${slug}/`, import.meta.url);
const docs = JSON.parse(readFileSync(new URL('docs.json', dir)));
const places = JSON.parse(readFileSync(new URL('places.json', dir)));
const parent = Object.fromEntries(places.places.filter(p => p.parent).map(p => [p.id, p.parent]));
const q = { words: '', ds: '', types: [], place: '', clock: 'pub', lo: null, hi: null, folded: false, lk: '' };
const docOK = docFilter(docs, q);
const ctx = { docs, parent, W: parseWords(''), docOK, near: null, opened: null };
const T = blank();
const files = readdirSync(new URL('p/', dir));
const all = [];
for (const f of files) {
  const ps = JSON.parse(readFileSync(new URL('p/' + f, dir)));
  for (const p of ps) p._l = (p.t + '\n' + (p.en || '')).toLowerCase();
  addPassages(T, ps, ctx, q);
  all.push(ps);
}
const D = fromDocs(docs, q, places.none, docOK);
const folded = T.folded;
if (!folded) {
  assert.equal(T.total, D.total, 'passage total = sum of docs[].n');
  assert.deepEqual(T.cells, D.cells, 'grid from passages = grid from docs.json');
  assert.deepEqual(T.ty, D.ty, 'type stacks from passages = from docs.json');
  assert.equal(T.none, places.none, 'passages naming no place');
} else if (docs[0]?.nc != null) {
  assert.equal(T.total, D.total, 'passage total = sum of docs[].nc');
  assert.deepEqual(T.cells, D.cells, 'grid from passages = grid from docs[].nc');
} else console.log('note:', folded, 'folded passages and no docs[].nc yet; first-count comparison skipped');

// A type filter and a description filter keep only their documents.
const q2 = { ...q, types: ['position'], ds: 'activists' };
const ok2 = docFilter(docs, q2);
docs.forEach((d, i) => { if (ok2[i]) { assert.equal(d.type, 'Expert Opinion or Position'); assert(/(^|[^\p{L}\p{N}_])activists([^\p{L}\p{N}_]|$)/iu.test(d.title)); } });

// Word counts: HTS is far below "rights" once matching is whole-word.
const T3 = blank();
const q3 = { ...q, words: 'HTS, rights' };
const ctx3 = { ...ctx, W: parseWords(q3.words) };
for (const ps of all) addPassages(T3, ps, ctx3, q3);
console.log('HTS', T3.parts.tokens[0], '· rights', T3.parts.tokens[1], '· either', T3.total);
assert(T3.parts.tokens[0] < T3.parts.tokens[1] / 5, 'HTS no longer counts the fragments inside "rights"');
console.log('ok', T.total, 'passages in', slug);

// ---- BM25 ranking (DESIGN §4.1): scores on a tiny hand corpus; ranking never changes which passages match ----
{
  const { len, idf, scorer, fuse } = await import('./bm25.js');
  const texts = ['militia attacked the village', 'the militia militia militia and the party', 'weather in the village', 'party officials met the village elders for many hours today', 'nothing here'];
  const pad = ' ' + 'z'.repeat(80);   // one long filler word, so no hand passage counts as a short line
  const ps = texts.map((t, i) => (t += pad, { d: 0, k: i, t, _l: t, _n: len(t) }));
  const N = ps.length, avg = ps.reduce((a, p) => a + p._n, 0) / N;
  const tok = parseWords('militia').tokens;
  const df = ps.filter(p => matches(parseWords('militia'), p._l)).length;
  assert.equal(df, 2);
  const f = scorer(tok, { N, avg }, () => df);
  const hand = (tf, dl) => idf(N, df) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * dl / avg));
  assert(Math.abs(f(ps[1]) - hand(3, ps[1]._n)) < 1e-12, 'BM25 by hand, tf 3');
  assert(Math.abs(f(ps[0]) - hand(1, ps[0]._n)) < 1e-12, 'BM25 by hand, tf 1');
  assert(f(ps[1]) > f(ps[0]) && f(ps[0]) > 0 && f(ps[2]) === 0, 'more occurrences rank higher, no word scores 0');
  assert(f(ps[1]) < 3 * f(ps[0]), 'term frequency saturates');
  const head = { t: 'Militia', _l: 'militia', _n: 1 };
  assert(f(head) > 0 && f(head) < f(ps[0]), 'a short line ranks after a full passage');
  const g = scorer(parseWords('party village').tokens, { N, avg }, t => (t.label === 'party' ? 2 : 3));
  assert(g(ps[3]) > g(ps[2]), 'a passage with both words beats one word');
  // Exact-word counts are the same with or without ranking: ranking only scores the passages that matched.
  const q5 = { words: 'militia, "the village"', ds: '', types: [], place: '', clock: 'pub', lo: null, hi: null, folded: false, lk: '' };
  const docs5 = [{ id: 1, s: 'x', type: 'Response', date: '2020', n: N }];
  const ctx5 = { docs: docs5, parent: {}, W: parseWords(q5.words), docOK: docFilter(docs5, q5), near: null };
  const before = addPassages(blank(), ps, ctx5, q5).total;
  const hits = ps.filter(p => matches(ctx5.W, p._l));
  const sc = scorer(ctx5.W.tokens, { N, avg }, () => 2);
  hits.forEach(p => sc(p));
  assert.equal(before, hits.length);
  assert.equal(addPassages(blank(), ps, ctx5, q5).total, before, 'counts unchanged after ranking');
  // Fusion: a passage ranked mid in both lists beats ones that lead only one; no vector can still enter by words.
  assert.deepEqual(fuse([0.9, 0.5, NaN, 0.1], [0, 3, 5, 0], 3), [1, 0, 2]);
  assert.deepEqual(fuse([0.9, 0.5, NaN], [0, 0, 0], 2), [0, 1], 'no words: vector order');
}
