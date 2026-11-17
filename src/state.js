// The address is the state (DESIGN rule 5.6), except the case and its evidence.
// c country · w place id or "none" · l key date (YYYY or YYYY-MM) · dc deciding country
// q words · lk wording like this · ln how many closest (100/300/1000) · ds described by ecoi.net as
// t types (codes, comma) · ck clock ("m" = year the text mentions) · r year range "YYYY-YYYY"
// x opened rows · s sources selected · y year or range selected · v view ("s" = compare sources)
// fm family id · tp topic id (DESIGN §4.7) · rm rows mode ("t" = topics)
// hd sources hidden in Who says what · sp two sources side by side · o "n" = newest first (default: best word match first)
// lg languages · sk institution kinds · sc institution countries (comma lists) · le 1 = newest edition only (DESIGN §4.2 filters)
// p open passage "<ecoi id>.<k>" · pg page shown · ff 1 = show folded contents/reference lines
const KEYS = ['c', 'w', 'l', 'dc', 'q', 'lk', 'ln', 'ds', 'fm', 'tp', 't', 'ck', 'r', 'lg', 'sk', 'sc', 'le', 'rm', 'ff', 'x', 's', 'y', 'v', 'hd', 'sp', 'o', 'p', 'pg'];
export const CASE_KEYS = ['c', 'w', 'l', 'dc', 'q', 'lk', 'ln', 'ds', 'fm', 'tp', 't', 'ck', 'r', 'lg', 'sk', 'sc', 'le'];
export const state = {};

export function read() {
  const u = new URLSearchParams(location.hash.slice(1));
  for (const k of KEYS) state[k] = u.get(k) || '';
}

export function href(patch = {}) {
  const u = new URLSearchParams();
  for (const k of KEYS) {
    const v = k in patch ? patch[k] : state[k];
    if (v) u.set(k, v);
  }
  return '#' + u.toString();
}

// The last address this page wrote itself; an address that arrives any other way (a pasted link,
// back/forward) is not the lawyer editing the case line.
export let lastSet = null;
export function set(patch) {
  const h = href(patch);
  lastSet = h;
  if (h !== location.hash && !(h === '#' && !location.hash)) location.hash = h;
}

// Change the address without a history step (e.g. selecting a passage on the page).
export function replace(patch) {
  const h = href(patch);
  lastSet = h;
  history.replaceState(null, '', h);
  dispatchEvent(new HashChangeEvent('hashchange'));
}

export function range(r) {
  const m = /^(\d{4})-(\d{4})$/.exec(r || '');
  return m ? [+m[1], +m[2]] : null;
}

// "2019-03" -> {y: 2019, m: 3}; "2019" -> {y: 2019, m: 0}; anything else -> null
export function left(l) {
  const m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(l || '');
  return m ? { y: +m[1], m: m[2] ? +m[2] : 0 } : null;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseLeft(s) {
  s = (s || '').trim();
  let m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(s);
  if (m) return m[2] ? `${m[1]}-${m[2].padStart(2, '0')}` : m[1];
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/i.exec(s);
  if (m) {
    const i = MON.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  return null;
}

export function fmtDate(d) {
  if (!d) return 'undated';
  const [y, m, day] = d.split('-');
  if (!m) return y;
  return (day ? +day + ' ' : '') + MON[+m - 1] + ' ' + y;
}
export const fmtLeft = l => fmtDate(l);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = n => (n ?? 0).toLocaleString('en-GB');
export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

// localStorage, never trusted to exist (private windows, blocked storage).
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: kept for this visit only */ }
}
