// Evidence: one case per client matter (DESIGN §4.6). Browser only: never in the address, never sent anywhere.
// Stored as atlas.cases; a case's "headings" are the lawyer's points, "loose" the unsorted passages.
import { esc, fmtDate, load, save } from './state.js';
import { DATA } from './data.js';
import { VENUES, venueOf, cite, toHTML, quoteAndCite, sources, sourcesClip } from './cite.js';
import { docx } from './docx.js';

const KEY = 'atlas.cases', OLD = 'atlas.casefile';
let store = load(KEY, null) || { current: '', cases: [] };
let drawer, button, live, hooks = {};
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const UNSORTED = 'Unsorted';

// Version 1 kept one shared case file. Its pins move into their own case, never into the lawyer's current one.
(function migrate() {
  const old = load(OLD, null);
  if (old) {
    const pins = (old.loose?.length || 0) + (old.headings || []).reduce((a, h) => a + h.pins.length, 0);
    if (pins) store.cases.push({ id: uid(), name: 'Imported pins (check)', made: today(), line: {}, loose: old.loose || [], headings: old.headings || [], target: '' });
    try { localStorage.removeItem(OLD); } catch { /* storage unavailable */ }
  }
  // Cases saved before 17 Nov have no venue: United States is the default. Nothing else changes.
  for (const c of store.cases) { c.venue = venueOf(c); c.loose ||= []; c.headings ||= []; }
  persist();
})();

function persist() { save(KEY, store); count(); }
export const cases = () => store.cases;
export const current = () => store.cases.find(c => c.id === store.current) || null;
const lists = c => (c ? [c.loose, ...c.headings.map(h => h.pins)] : []);
const all = c => lists(c).flat();
export const isPinned = key => lists(current()).some(l => l.some(x => x.key === key));

function count() {
  if (!button) return;
  const c = current();
  button.textContent = c ? `Evidence (${all(c).length})` : 'Evidence';
}

export function initCasefile(liveEl, h) {
  drawer = document.getElementById('drawer');
  button = document.getElementById('casefile-btn');
  live = liveEl; hooks = h;
  button.addEventListener('click', () => toggle());
  count();
  addEventListener('storage', e => { if (e.key === KEY) { store = load(KEY, store); count(); if (!drawer.hidden) draw(); hooks.changed?.(); } });
}

export function toggle(open = drawer.hidden) {
  drawer.hidden = !open;
  button.setAttribute('aria-expanded', open);
  if (open) { draw(); drawer.querySelector('h2')?.focus(); } else button.focus();
}

const freeName = name => {
  const names = new Set(store.cases.map(c => c.name));
  let n = name, i = 2;
  while (names.has(n)) n = `${name} (${i++})`;
  return n;
};
export function newCase(name, line) {
  const c = { id: uid(), name: freeName(name), made: today(), line: line || {}, loose: [], headings: [], target: '', venue: 'us' };
  store.cases.push(c); store.current = c.id; persist();
  return c;
}
export function switchCase(id) {
  store.current = id; persist();
  if (!drawer.hidden) draw();
  return current();
}
export function saveLine(line) {
  const c = current();
  if (!c || JSON.stringify(c.line) === JSON.stringify(line)) return;
  c.line = line; save(KEY, store);
}

// What is kept for a passage: verbatim text and everything a citation needs.
function entryOf(app, p) {
  const doc = app.S.docs[p.d], src = app.src(doc.s);
  return {
    id: uid(), key: `${doc.id}.${p.k}`, country: app.country.name, slug: app.S.slug, text: p.t, bt: p.bt || '',
    en: (doc.lang || 'English') !== 'English' ? p.en || null : null,
    publisher: src.name, reporting: src.country || '', ot: doc.ot || null, title: doc.title, type: app.typeLabel(doc), lang: doc.lang,
    date: doc.date, page: p.pg, url: doc.url, ol: doc.ol || null, ecoi: doc.id, at: today(), note: '',
  };
}

// Add to evidence. With no case open, the first passage starts "Untitled case".
export function pin(app, p) {
  if (!p) return false;
  let c = current(), started = false;
  if (!c) { c = newCase('Untitled case', hooks.line?.()); c.auto = true; started = true; hooks.changed?.(); }
  const e = entryOf(app, p);
  if (isPinned(e.key)) { live.textContent = 'Already in evidence.'; return true; }
  const h = c.headings.find(h => h.id === c.target);
  (h ? h.pins : c.loose).push(e);
  persist();
  live.textContent = started ? `Added to evidence. This started a case called “${c.name}”; rename it in Evidence.`
    : `Added to evidence${h ? ', under ' + h.name : ', unsorted'}.`;
  if (!drawer.hidden) draw();
  return true;
}

// ---- Clipboard: plain text and rich text ----
async function clip({ text, html }) {
  let ok = false;
  const on = e => { e.clipboardData.setData('text/plain', text); e.clipboardData.setData('text/html', html); e.preventDefault(); ok = true; };
  document.addEventListener('copy', on);
  try { document.execCommand('copy'); } catch { /* not allowed here */ }
  document.removeEventListener('copy', on);
  if (ok) return true;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    return true;
  } catch { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
}

// "Copy quote and citation": needs no case; the format is the open case's venue, else United States.
export async function copyQuote(app, p) {
  if (!p) return;
  const v = venueOf(current());
  const ok = await clip(quoteAndCite(entryOf(app, p), v));
  live.textContent = ok ? `Quote and citation copied (${VENUES[v].label}).` : 'Could not reach the clipboard in this browser.';
  return ok;
}

// ---- Newer editions, from the slice's docs.json (docs "ed", else "next") ----
const docsBySlug = {};
const sliceDocs = slug => (docsBySlug[slug] ||= fetch(`${DATA}/${slug}/docs.json`).then(r => r.json()).then(d => new Map(d.map(x => [String(x.id), x]))).catch(() => new Map()));
async function newer(x) {
  const byId = await sliceDocs(x.slug), d = byId.get(String(x.ecoi));
  if (!d) return [];
  let later = [];
  if (Array.isArray(d.ed) && d.ed.length) {
    const i = d.ed.findIndex(([id]) => String(id) === String(d.id));
    later = i < 0 ? [] : d.ed.slice(i + 1).map(([id]) => byId.get(String(id)));
  } else for (let n = d.next, seen = new Set(); n != null && !seen.has(n); n = byId.get(String(n))?.next) { seen.add(n); later.push(byId.get(String(n))); }
  return later.filter(Boolean).map(n => `A newer edition exists: ${n.ot || n.title}, ${fmtDate(n.date)}`);
}
async function newerByDoc(c) {
  const out = new Map();
  for (const x of all(c)) if (!out.has(String(x.ecoi))) out.set(String(x.ecoi), await newer(x));
  return out;
}

// ---- The panel ----
function pinHTML(c, x, where) {
  const v = venueOf(c);
  const opts = [`<option value="">${UNSORTED}</option>`, ...c.headings.map(h => `<option value="${h.id}"${h.id === where ? ' selected' : ''}>${esc(h.name)}</option>`)].join('');
  return `<li class="pinned" draggable="true" data-id="${x.id}">
    ${x.bt && /:\s*$/.test(x.bt) ? `<p class="before small"><span class="mlabel">Before this</span>“${esc(x.bt)}”</p>` : ''}
    <blockquote class="src">${esc(x.text.length > 600 ? x.text.slice(0, 600) + '…' : x.text)}</blockquote>
    ${x.en ? `<p class="mech small"><span class="mlabel">Machine translated, may be incomplete</span>${esc(x.en.slice(0, 300))}</p>` : ''}
    <p class="cite small"><span class="mlabel">Citation, ${esc(VENUES[v].label)}</span>${toHTML(cite(x, v))}</p>
    <p class="newer small" data-newer="${esc(String(x.ecoi))}"></p>
    <label class="small note">Your note <textarea data-note data-fk="note-${x.id}" rows="2">${esc(x.note)}</textarea></label>
    <div class="row small"><label class="grey">Move to <select data-move data-fk="move-${x.id}">${opts}</select></label>
      <button data-copy data-fk="copy-${x.id}">Copy quote and citation</button>
      <a href="#c=${encodeURIComponent(x.slug || '')}&p=${x.key}&pg=${x.page}">Open page ▸</a>
      <button data-remove aria-label="Remove this passage from evidence">Remove</button></div>
  </li>`;
}

const intro = '<p class="grey small">Kept in this browser only. Nothing is sent anywhere and nothing goes into the page address. Quotes are verbatim; your notes and points are marked as yours; the atlas adds nothing else.</p>';
const importBtn = '<button data-import data-fk="import">Import a backup (.json)…</button><input type="file" accept=".json,application/json" data-file hidden>';

function draw(focus) {
  const fk = focus || (drawer.contains(document.activeElement) && document.activeElement.dataset?.fk) || null;
  render();
  const el = fk && drawer.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
  (el || (fk || focus === false ? drawer.querySelector('h2') : null))?.focus();
}

function render() {
  const c = current();
  const others = store.cases.filter(x => x !== c);
  if (!c) {
    drawer.innerHTML = `
      <div class="dhead"><h2 tabindex="-1">Evidence</h2><button data-close>Close</button></div>
      ${intro}
      <p class="small">Nothing in evidence for an open case. “Add to evidence” on any passage starts a case called “Untitled case”, which you can rename here.</p>
      ${others.length ? `<h3 class="h">Open a case</h3><ul class="caselist">${others.map(x => `<li><button data-open-case="${x.id}">${esc(x.name)}</button> <span class="grey small">${esc(fmtDate(x.made))} · ${all(x).length} passages</span></li>`).join('')}</ul>` : ''}
      <form class="newcase"><label class="small grey" for="nc">Or name a new case</label><div class="row"><input id="nc" name="n" data-fk="nc" placeholder="e.g. client initials and destination" required><button>Start case</button></div></form>
      <div class="dfoot">${importBtn}</div>`;
    wireCommon();
    drawer.querySelector('.newcase').onsubmit = e => {
      e.preventDefault();
      const name = e.target.n.value.trim(); if (!name) return;
      newCase(name, hooks.line?.());
      hooks.changed?.();
      draw('name');
    };
    drawer.querySelectorAll('[data-open-case]').forEach(b => b.onclick = () => hooks.open?.(b.dataset.openCase));
    return;
  }
  const v = venueOf(c), n = all(c).length;
  const section = (h, pins, id) => `<section class="heading" data-h="${id}">
      ${h ? `<div class="hrow"><textarea class="hname" data-rename="${id}" data-fk="rename-${id}" rows="1" aria-label="Your point">${esc(h.name)}</textarea><button data-delh="${id}" class="small">Delete point</button></div>` : `<h3 class="h">${UNSORTED}</h3>`}
      <ul class="pins">${pins.map(x => pinHTML(c, x, id)).join('') || `<li class="grey small droponly">${h ? 'No passages under this point yet. Move or drag passages here.' : 'Nothing unsorted.'}</li>`}</ul></section>`;
  drawer.innerHTML = `
    <div class="dhead"><div><p class="h">Evidence · ${n} ${n === 1 ? 'passage' : 'passages'}</p><h2 tabindex="-1">${esc(c.name)}</h2></div><button data-close>Close</button></div>
    ${c.auto ? `<p class="started small">This case was started when you added the first passage. Give it a name below.</p>` : ''}
    ${intro}
    <div class="fields">
      <label class="small grey">Case name <input data-name data-fk="name" value="${esc(c.name)}" required></label>
      <label class="small grey">Venue <select data-venue data-fk="venue">${Object.entries(VENUES).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(x.label)}${k === 'us' ? ', default' : ''}</option>`).join('')}</select></label>
      <p class="grey small">The venue changes only how citations and the source list are written, never the content.</p>
    </div>
    <h3 class="h">Your points</h3>
    <form class="newh"><input name="h" data-fk="newp" placeholder="e.g. Police cannot protect her" aria-label="A new point, in your words"><button>Add point</button></form>
    <label class="small grey">New passages go to <select data-target data-fk="target">${[`<option value="">${UNSORTED}</option>`, ...c.headings.map(h => `<option value="${h.id}"${h.id === c.target ? ' selected' : ''}>${esc(h.name)}</option>`)].join('')}</select></label>
    ${section(null, c.loose, '')}
    ${c.headings.map(h => section(h, h.pins, h.id)).join('')}
    <h3 class="h out">Take it out</h3>
    <ul class="exports">
      <li><button data-docx data-fk="docx">Word document (.docx)</button><span class="grey small">To write your submission from.</span></li>
      <li><button data-srclist data-fk="srclist">Copy source list</button><span class="grey small">To paste into a document you already have.</span></li>
      <li><span><button data-backup data-fk="backup">Backup (.json)</button> ${importBtn}</span><span class="grey small">To move this case to another computer or a colleague. Import adds a case and never overwrites one.</span></li>
      <li><button data-print data-fk="print">Print</button></li>
    </ul>
    <div class="dfoot danger"><button data-delete-case>Delete this case…</button></div>`;
  if (c.auto) { delete c.auto; save(KEY, store); }   // the line shows once
  wireCommon();
  const q = s => drawer.querySelector(s);
  q('[data-name]').onchange = e => {
    const name = e.target.value.replace(/\s+/g, ' ').trim();
    if (!name || name === c.name) { e.target.value = c.name; return; }
    c.name = name; persist(); hooks.changed?.(); draw('name');
    live.textContent = `Case renamed “${name}”.`;
  };
  q('[data-venue]').onchange = e => { c.venue = e.target.value; persist(); draw('venue'); live.textContent = `Citations now in ${VENUES[c.venue].label} format.`; };
  q('.newh').onsubmit = e => {
    e.preventDefault();
    const name = e.target.h.value.trim();
    if (!name) return;
    const h = { id: uid(), name, pins: [] };
    c.headings.push(h); c.target = h.id; persist(); draw('newp');
    live.textContent = `Point added. New passages go under it.`;
  };
  q('[data-target]').onchange = e => { c.target = e.target.value; persist(); };
  drawer.querySelectorAll('[data-rename]').forEach(i => {
    i.onchange = () => { const h = c.headings.find(h => h.id === i.dataset.rename); h.name = i.value.replace(/\s+/g, ' ').trim() || h.name; persist(); };
    i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } };
  });
  drawer.querySelectorAll('[data-delh]').forEach(b => b.onclick = () => {
    const h = c.headings.find(h => h.id === b.dataset.delh);
    c.loose.push(...h.pins); c.headings = c.headings.filter(x => x !== h);
    if (c.target === h.id) c.target = '';
    persist(); draw(false);
    live.textContent = `Point deleted; its passages are now unsorted.`;
  });
  const find = id => { for (const l of lists(c)) { const i = l.findIndex(x => x.id === id); if (i >= 0) return [l, i]; } return [null, -1]; };
  const move = (id, to) => {
    const [l, i] = find(id); if (!l) return;
    const [x] = l.splice(i, 1);
    const h = c.headings.find(h => h.id === to);
    (h?.pins || c.loose).push(x);
    persist(); draw(`move-${id}`);
    live.textContent = `Moved to ${h ? h.name : UNSORTED}.`;
  };
  drawer.querySelectorAll('li.pinned').forEach(li => {
    const id = li.dataset.id;
    li.querySelector('[data-note]').oninput = e => { const [l, i] = find(id); l[i].note = e.target.value; save(KEY, store); };
    li.querySelector('[data-move]').onchange = e => move(id, e.target.value);
    li.querySelector('[data-copy]').onclick = async () => {
      const [l, i] = find(id);
      const ok = await clip(quoteAndCite(l[i], v));
      live.textContent = ok ? 'Quote and citation copied.' : 'Could not reach the clipboard in this browser.';
    };
    li.querySelector('[data-remove]').onclick = () => { const [l, i] = find(id); l.splice(i, 1); persist(); draw(false); hooks.changed?.(); live.textContent = 'Removed from evidence.'; };
    li.ondragstart = e => e.dataTransfer.setData('text/x-pin', id);
  });
  drawer.querySelectorAll('section.heading').forEach(s => {
    s.ondragover = e => { e.preventDefault(); s.classList.add('over'); };
    s.ondragleave = () => s.classList.remove('over');
    s.ondrop = e => { e.preventDefault(); s.classList.remove('over'); const id = e.dataTransfer.getData('text/x-pin'); if (id) move(id, s.dataset.h); };
  });
  q('[data-docx]').onclick = () => exportDocx(c);
  q('[data-srclist]').onclick = async () => {
    const ok = await clip(sourcesClip(sources(docOrder(c), v), v));
    live.textContent = ok ? `Source list copied (${VENUES[v].list.toLowerCase()}).` : 'Could not reach the clipboard in this browser.';
  };
  q('[data-backup]').onclick = () => download(new Blob([JSON.stringify({ format: 'atlas-evidence', version: 1, exported: today(), case: c }, null, 1)], { type: 'application/json' }), `${fileName(c)}-backup-${today()}.json`);
  q('[data-print]').onclick = () => print();
  q('[data-delete-case]').onclick = () => {
    if (!confirm(`Delete the case "${c.name}" and its ${n} passages from this browser? This cannot be undone.`)) return;
    store.cases = store.cases.filter(x => x !== c); store.current = ''; persist(); draw(false); hooks.changed?.();
  };
  newerByDoc(c).then(m => {
    if (current() !== c) return;
    drawer.querySelectorAll('[data-newer]').forEach(p => { const l = m.get(p.dataset.newer) || []; p.innerHTML = l.map(esc).join('<br>'); p.hidden = !l.length; });
  });
}

function wireCommon() {
  drawer.querySelector('[data-close]').onclick = () => toggle(false);
  const b = drawer.querySelector('[data-import]'), f = drawer.querySelector('[data-file]');
  if (!b) return;
  b.onclick = () => f.click();
  f.onchange = async () => { const file = f.files[0]; if (file) importCase(await file.text()); };
}

// ---- Exports ----
const fileName = c => c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'case';
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Word order: the points, then unsorted passages. The source list follows that order.
const docSections = c => [...c.headings.map(h => ({ heading: h.name, pins: h.pins })), ...(c.loose.length ? [{ heading: UNSORTED, pins: c.loose }] : [])];
const docOrder = c => docSections(c).flatMap(s => s.pins);

async function exportDocx(c) {
  const v = venueOf(c), nw = await newerByDoc(c);
  const list = sources(docOrder(c), v);
  const bytes = docx({
    title: c.name,
    meta: [`Case: ${c.name}`, ...(hooks.header?.(c) || []), `Venue: ${VENUES[v].label}`,
      `Exported ${fmtDate(today())} from the Investigations Lab Country Conditions Atlas. Passages are quoted verbatim from the source documents in their original language; machine translations are labelled; points and notes marked “Your note” are your own words.`],
    sections: docSections(c).map(s => ({ heading: s.heading, items: s.pins.map(x => ({
      before: x.bt && /:\s*$/.test(x.bt) ? x.bt.trim() : '', quote: x.text, mt: x.en || '', cite: cite(x, v), note: x.note.trim() })) })),
    sources: { ...list, venue: v, rows: list.rows.map(r => ({ ...r, newer: nw.get(r.id) || [] })) },
  });
  download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${fileName(c)}-evidence-${today()}.docx`);
  live.textContent = 'Word document saved to your downloads.';
}

// Import adds a case; it never overwrites one. A name already in use gets " (2)".
function importCase(text) {
  let k;
  try { const j = JSON.parse(text); k = j.case || j; } catch { k = null; }
  const ok = k && typeof k === 'object' && Array.isArray(k.loose) && Array.isArray(k.headings) && k.headings.every(h => Array.isArray(h?.pins))
    && [k.loose, ...k.headings.map(h => h.pins)].flat().every(x => x && typeof x.text === 'string' && x.key);
  if (!ok) { live.textContent = 'That file is not an Evidence backup from this atlas. Nothing was imported.'; alert(live.textContent); return; }
  const c = { ...k, id: uid(), name: freeName(String(k.name || 'Imported case')), venue: venueOf(k), line: k.line || {}, target: '', made: k.made || today() };
  delete c.auto;
  for (const x of all(c)) { x.id = uid(); x.note = String(x.note || ''); }
  store.cases.push(c); persist();
  hooks.open?.(c.id);
  draw('name');
  live.textContent = `Imported “${c.name}”. It is now the open case.`;
}
