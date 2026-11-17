// BM25 (k1 1.2, b 0.75) over the same whole-word tokens as Words matching (count.js), plus reciprocal rank
// fusion. Pure functions, shared by the worker and the check. DESIGN §4.1 "Ranking by words (BM25)".
const K1 = 1.2, B = 0.75, SHORT = 80;

// Passage length in words (same word characters as the matcher's boundaries).
export const len = l => (l.match(/[\p{L}\p{N}_]+/gu) || []).length;
export const idf = (N, df) => Math.log(1 + (N - df + 0.5) / (df + 0.5));

// How often a parsed token (word, prefix* or phrase) occurs in a lower-cased text.
export function tf(t, l) {
  if (!l.includes(t.lit)) return 0;
  return (l.match(t.g ||= new RegExp(t.src, 'giu')) || []).length;
}

// A scorer for tokens: stats = { N, avg } of the country's unfolded passages, dfOf(token) -> document frequency.
// The passage must carry _l (lower-cased text + translation) and _n (its length in words).
export function scorer(tokens, stats, dfOf) {
  const w = tokens.map(t => idf(stats.N, dfOf(t)));
  return p => {
    let s = 0;
    for (let i = 0; i < tokens.length; i++) {
      const f = tf(tokens[i], p._l);
      if (f) s += w[i] * f * (K1 + 1) / (f + K1 * (1 - B + B * p._n / stats.avg));
    }
    // Headings and citation lines win BM25 on length alone; lines under SHORT characters go after full passages.
    return p.t.length < SHORT ? s / 1000 : s;
  };
}

// Reciprocal rank fusion (k = 60). vec[i] / bm[i]: scores (vec NaN = none, bm 0 = no word). Returns indices, best first.
export function fuse(vec, bm, n, k = 60) {
  const fused = new Float64Array(vec.length);
  const add = (score, ok) => {
    const idx = [];
    for (let i = 0; i < score.length; i++) if (ok(score[i])) idx.push(i);
    idx.sort((a, b) => score[b] - score[a]);
    idx.forEach((i, r) => { fused[i] += 1 / (k + r + 1); });
  };
  add(vec, s => !Number.isNaN(s));
  add(bm, s => s > 0);
  const all = Array.from(fused.keys());
  return all.sort((a, b) => fused[b] - fused[a] || a - b).slice(0, n);
}
