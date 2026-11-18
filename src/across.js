// Look across countries (welcome page): which countries' documents hold some words or a topic, and when.
// Data: data/across/ (build/across.py) — documents.json, families.json, and a word index in 4096 shards.
// Counts are documents, not passages; the country view gives the passages.
import { DATA } from './data.js';
import { parseWords } from './count.js';

const json = u => fetch(u).then(r => (r.ok ? r.json() : Promise.reject(new Error(u + ': ' + r.status))));
let docsP, famsP;
const docsT = () => (docsP ||= json(`${DATA}/across/documents.json`).catch(e => { docsP = null; throw e; }));
export const families = () => (famsP ||= json(`${DATA}/across/families.json`).catch(e => { famsP = null; throw e; }));

// The word index: FNV-1a over code points, 4096 shards; each word holds its documents as gaps-minus-one varints, base64.
const fnv = s => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const shards = new Map();
const shard = n => { const k = String(n).padStart(4, '0'); if (!shards.has(k)) shards.set(k, json(`${DATA}/across/w/${k}.json`).catch(e => { shards.delete(k); throw e; })); return shards.get(k); };
function decode(b64) {
  const b = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), out = [];
  let prev = -1, v = 0, sh = 0;
  for (const x of b) { v |= (x & 127) << sh; if (x & 128) { sh += 7; continue; } prev += v + 1; out.push(prev); v = 0; sh = 0; }
  return out;
}
async function postings(word) {
  const sh = await shard(fnv(word) % 4096);
  return sh[word] ? decode(sh[word]) : [];
}
const and = (a, b) => { const s = new Set(b); return a.filter(x => s.has(x)); };

// Words → document numbers. A token such as "al-shabaab" or a quoted phrase needs all its words (document level).
async function wordDocs(raw) {
  const W = parseWords(raw), out = new Set(), notes = [];
  for (const g of W.groups) {
    let docs = null;
    for (const t of g) {
      if (t.label.endsWith('*')) notes.push(`${t.label} (word endings are checked inside a country)`);
      const words = t.lit && t.label.match(/[\p{L}\p{N}_]+/gu) || [];
      for (const w of words) { const p = await postings(w); docs = docs ? and(docs, p) : p; if (!docs.length) break; }
      if (docs && !docs.length) break;
    }
    for (const d of docs || []) out.add(d);
  }
  return { docs: out, notes };
}

// → [{slug, n, years: {y: n}}] for words or a family.
export async function look({ q, fam, wide }) {
  const T = await docsT(), by = new Map();
  const add = (slug, y, n) => { const r = by.get(slug) || by.set(slug, { slug, n: 0, years: {} }).get(slug); r.n += n; r.years[y] = (r.years[y] || 0) + n; };
  let notes = [];
  if (q) {
    const r = await wordDocs(q); notes = r.notes;
    for (const d of r.docs) { if (T.w[d] && !wide) continue; for (const c of T.c[d]) add(T.slugs[c], T.y[d], 1); }
  } else {
    const F = await families();
    for (const [slug, fs] of Object.entries(F.n)) for (const [y, a, b] of fs[fam] || []) { const n = wide ? b : a; if (n) add(slug, y, n); }
  }
  return { rows: [...by.values()].sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug)), notes };
}

// A row's years as a small strip of bars, the same scale for every row of one result.
export function strip(years, lo, hi, max) {
  const w = 3, gap = 1, H = 18, n = hi - lo + 1;
  let bars = '';
  for (let y = lo; y <= hi; y++) {
    const v = years[y] || 0; if (!v) continue;
    const h = Math.max(1.5, Math.round(H * Math.sqrt(v / max) * 10) / 10);
    bars += `<rect x="${(y - lo) * (w + gap)}" y="${H - h}" width="${w}" height="${h}"/>`;
  }
  return `<svg class="ystrip" viewBox="0 0 ${n * (w + gap)} ${H}" width="${n * (w + gap)}" height="${H}" aria-hidden="true"><line x1="0" x2="${n * (w + gap)}" y1="${H - .5}" y2="${H - .5}"/>${bars}</svg>`;
}

export const yearsSpan = rows => {
  let lo = 9999, hi = 0;
  for (const r of rows) for (const y of Object.keys(r.years)) if (+y) { lo = Math.min(lo, +y); hi = Math.max(hi, +y); }
  return lo > hi ? [1986, 2026] : [lo, hi];
};

export const fmtShare = (n, of) => (of ? (n / of >= 0.995 ? 'all' : n / of < 0.01 ? 'under 1%' : `${Math.round(100 * n / of)}%`) : '');
