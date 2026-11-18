// Static files only. The data root is one constant.
import { pubYear } from './count.js';
import { load } from './state.js';

// Local copy when served from this machine; the published data on Hugging Face otherwise.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const DATA = LOCAL ? 'data' : 'https://huggingface.co/datasets/kolenyo/coi-atlas/resolve/main';
// Published PDFs sit in 100 folders by the id's last two digits (Hugging Face wants under 10,000 files per folder).
export const pdfUrl = id => (LOCAL ? `pdfs/${id}.pdf` : `${DATA}/pdfs/${String(id).slice(-2)}/${id}.pdf`);

const json = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

let indexP;
export const index = () => (indexP ||= json(`${DATA}/index.json`));
export const refreshIndex = () => json(`${DATA}/index.json`).then(i => { indexP = Promise.resolve(i); return i; }).catch(() => null);

const slices = {};
export function slice(slug) {
  return (slices[slug] ||= (async () => {
    const base = `${DATA}/${slug}`;
    const [docs, places] = await Promise.all([json(`${base}/docs.json`), json(`${base}/places.json`).catch(() => ({ geo: null, none: null, places: [] }))]);
    const [geo, topics] = await Promise.all([places.geo ? json(`${base}/${places.geo}`).catch(() => null) : null, json(`${base}/topics.json`).catch(() => null)]);
    const byId = new Map(docs.map((d, i) => [String(d.id), i]));
    const place = new Map((places.places || []).map(p => [String(p.id), p]));
    const years = [...new Set(docs.map(pubYear))];
    // topics.json is {topics: [...], passages, in_topic, docs, docs_in_topic, …}; a bare list is also read.
    const topicList = Array.isArray(topics) ? topics : topics?.topics || null;
    const topicsMeta = Array.isArray(topics) ? null : topics;
    const topicById = new Map((topicList || []).map(t => [String(t.id), t]));
    const families = topicsMeta?.families || [];
    const famById = new Map(families.map(f => [String(f.id), f]));
    // topicsFile: the slice has a topics.json; hasTopics: it lists at least one topic or family.
    const hasTopics = !!(topicList?.length || families.length);
    return { slug, base, docs, places, place, geo, byId, years, topics: topicList || [], topicsFile: topics != null, hasTopics, topicsMeta, topicById, families, famById };
  })().catch(e => { delete slices[slug]; throw e; }));
}

// The passage worker. Load order (DESIGN rule 5.7): the selected years, then the key-date years
// (nearest first), then the rest, newest first.
let W = null, wSlug = null, seq = 0;
const waiting = new Map();
export const listeners = { tally: null, progress: null, vprogress: null };

export function loadOrder(years, keyYear, selected = []) {
  const dated = years.filter(y => y !== 'undated').map(Number);
  const near = keyYear ? dated.filter(y => Math.abs(y - keyYear) <= 2).sort((a, b) => Math.abs(a - keyYear) - Math.abs(b - keyYear)) : [];
  const rest = dated.filter(y => !near.includes(y)).sort((a, b) => b - a);
  const out = [...selected.filter(y => years.includes(y)), ...[...near, ...rest].map(String)];
  if (years.includes('undated')) out.push('undated');
  return [...new Set(out)];
}

export function worker(S, keyYear, selected) {
  if (wSlug === S.slug) return W;
  W?.terminate();
  W = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  wSlug = S.slug;
  W.onmessage = ({ data: m }) => {
    if (m.type === 'reply') { waiting.get(m.id)?.(m); waiting.delete(m.id); }
    else listeners[m.type]?.(m);
  };
  const order = loadOrder(S.years, keyYear, selected);
  W.postMessage({ type: 'init', base: new URL(S.base, location.href).href, docs: S.docs, places: S.places.places || [], order, queue: order, opened: openedKeys(S.slug), topics: S.hasTopics, topicFam: Object.fromEntries((S.topics || []).map(t => [t.id, t.fam])) });
  return W;
}

export function ask(msg) {
  const id = ++seq;
  return new Promise(res => { waiting.set(id, res); W.postMessage({ ...msg, id }); });
}
export const post = msg => W?.postMessage(msg);

// A second passage worker, for comparing the same question in another country.
let W2 = null, w2Slug = null, seq2 = 0;
const wait2 = new Map();
export function ask2(S2, msg) {
  if (w2Slug !== S2.slug) {
    W2?.terminate();
    W2 = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); w2Slug = S2.slug;
    W2.onmessage = ({ data: m }) => { if (m.type === 'reply') { wait2.get(m.id)?.(m); wait2.delete(m.id); } };
    const order = loadOrder(S2.years, null, []);
    W2.postMessage({ type: 'init', base: new URL(S2.base, location.href).href, docs: S2.docs, places: S2.places.places || [], order, queue: order, opened: [], topics: S2.hasTopics, topicFam: Object.fromEntries((S2.topics || []).map(t => [t.id, t.fam])) });
  }
  const id = ++seq2;
  return new Promise(res => { wait2.set(id, res); W2.postMessage({ ...msg, id }); });
}

let qid = 0;
export function query(q) { W?.postMessage({ type: 'query', id: ++qid, q }); return qid; }
export const lastQuery = () => qid;

export const openedKeys = slug => load('atlas.opened2.' + slug, []);

// The embedding worker, started on first use of "wording like this".
let E = null, eseq = 0;
const ewait = new Map();
export const embedListeners = { progress: null };
export function embed(text) {
  if (!E) {
    E = new Worker(new URL('./embed.js', import.meta.url), { type: 'module' });
    E.onmessage = ({ data: m }) => {
      if (m.type === 'progress') embedListeners.progress?.(m);
      else { ewait.get(m.id)?.(m); ewait.delete(m.id); }
    };
  }
  const id = ++eseq;
  return new Promise(res => { ewait.set(id, res); E.postMessage({ id, text }); });
}
