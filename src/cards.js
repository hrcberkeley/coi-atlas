// The passage card (DESIGN §4.4), used in Compare sources.
import { set, esc, num, plural, fmtDate } from './state.js';
import { TYPES, typeIndex, pubYear } from './count.js';
import { ask } from './data.js';
import { pin, isPinned, copyQuote } from './casefile.js';

// The lawyer's words, marked in a text (same rules as matching).
export function marked(text, re) {
  const t = String(text ?? '');
  if (!re) return esc(t);
  let out = '', last = 0;
  re.lastIndex = 0;
  for (const m of t.matchAll(re)) {
    if (!m[0]) continue;
    out += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

export const passageKey = (app, p) => `${app.S.docs[p.d].id}.${p.k}`;
export const english = doc => (doc.lang || 'English') === 'English';
export const officialTitle = doc => doc.ot || doc.title;

export function typeTag(doc) {
  const t = TYPES[typeIndex(doc)];
  return `<span class="ty"><i class="tsq t-${t.code}" aria-hidden="true"></i>${t.label}</span>`;
}

// Editions: docs "ed" ([ecoi id, "c" | "t"], oldest first, self included), else prev/next.
export function editions(app, doc) {
  const S = app.S, out = [];
  const at = id => { const i = S.byId.get(String(id)); return i == null ? null : S.docs[i]; };
  if (Array.isArray(doc.ed) && doc.ed.length) {
    const me = doc.ed.findIndex(([id]) => String(id) === String(doc.id));
    doc.ed.forEach(([id, kind], i) => {
      if (i === me) return;
      out.push({ id, doc: at(id), rel: i < me ? 'earlier' : 'later', kind: kind === 't' ? 'same title, different year' : 'edition (catalogue)' });
    });
  } else {
    if (doc.prev != null) out.push({ id: doc.prev, doc: at(doc.prev), rel: 'earlier', kind: 'edition (catalogue)' });
    if (doc.next != null) out.push({ id: doc.next, doc: at(doc.next), rel: 'later', kind: 'edition (catalogue)' });
  }
  return out;
}

export function card(app, p) {
  const doc = app.S.docs[p.d];
  const src = app.src(doc.s);
  const en = english(doc);
  const names = (p.pl || []).map(id => app.S.place.get(String(id))?.name).filter(Boolean);
  const key = passageKey(app, p);
  const long = p.t.length > 900;
  return `<article class="card" data-key="${key}" tabindex="0" aria-label="Passage from ${esc(src.short)}, ${esc(fmtDate(doc.date))}, page ${p.pg}">
    <p class="meta"><span class="who">${esc(src.short)}</span> · ${typeTag(doc)} · ${esc(fmtDate(doc.date))}</p>
    ${p.bt ? `<p class="before"><span class="mlabel">Before this</span>“${esc(p.bt)}${p.bt.length >= 160 ? '…' : ''}”</p>` : ''}
    <blockquote class="src${long ? ' clamp' : ''}"${en ? ' lang="en"' : ''}>${marked(p.t, app.re)}</blockquote>
    ${long ? '<button class="more-text" aria-expanded="false">Show all</button>' : ''}
    ${en ? '' : p.en
      ? `<button class="mt-toggle" aria-pressed="false" aria-expanded="false">Machine translated</button><div class="mt mech" hidden><span class="mlabel">Machine translated, may be incomplete · document catalogued as ${esc(doc.lang)}</span><p>${marked(p.en, app.re)}</p></div>`
      : `<p class="mech mlabel">catalogued as ${esc(doc.lang)} · not yet translated</p>`}
    ${names.length ? `<p class="mech places-found"><span class="mlabel">Mentions</span>${names.map(esc).join(', ')}</p>` : ''}
    <div class="cardfoot">
      <span class="otitle" title="${esc(officialTitle(doc))}">${esc(officialTitle(doc))}</span>
      <button class="pagelink" data-open="${key}" data-pg="${p.pg}" aria-label="Open page ${p.pg} of ${esc(officialTitle(doc))}">p. ${p.pg} ▸</button>
      <button class="copyq" data-copyq="${key}">Copy quote and citation</button>
      ${isPinned(key) ? `<button class="pin on" data-pin="${key}">In evidence</button>` : `<button class="pin" data-pin="${key}">Add to evidence</button>`}
    </div>
    ${p.n > 1 ? `<details class="repeats"><summary>appears in ${num(p.n)} reports</summary><div class="rep-list grey small">Looking in this country's documents…</div></details>` : ''}
  </article>`;
}

export function wireCards(app, root, byKey) {
  root.querySelectorAll('.mt-toggle').forEach(b => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on); b.setAttribute('aria-expanded', on);
    b.nextElementSibling.hidden = !on;
  }));
  root.querySelectorAll('.more-text').forEach(b => b.addEventListener('click', () => {
    const q = b.previousElementSibling, open = q.classList.toggle('clamp');
    b.textContent = open ? 'Show all' : 'Show less';
    b.setAttribute('aria-expanded', !open);
  }));
  wireOpen(root);
  root.querySelectorAll('[data-pin]').forEach(b => b.addEventListener('click', () => {
    if (pin(app, byKey.get(b.dataset.pin))) { b.textContent = 'In evidence'; b.classList.add('on'); }
  }));
  root.querySelectorAll('[data-copyq]').forEach(b => b.addEventListener('click', () => copyQuote(app, byKey.get(b.dataset.copyq))));
  root.querySelectorAll('details.repeats').forEach(det => det.addEventListener('toggle', async () => {
    if (!det.open || det.dataset.done) return;
    det.dataset.done = 1;
    const p = byKey.get(det.closest('.card').dataset.key);
    const { passages } = await ask({ type: 'same', t: p.t });
    det.querySelector('.rep-list').innerHTML = repeatsList(app, passages, p.n);
    wireOpen(det);
  }));
  root.querySelectorAll('.card').forEach(c => c.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target === c) c.querySelector('[data-open]')?.click();
  }));
}

export const wireOpen = root => root.querySelectorAll('[data-open]').forEach(b => {
  if (b.dataset.wired) return;
  b.dataset.wired = 1;
  b.addEventListener('click', () => set({ p: b.dataset.open, pg: b.dataset.pg }));
});

export function repeatsList(app, same, n) {
  return `<p>${plural(same.length, 'document', 'documents')} on ${esc(app.country.name)} in the atlas hold this exact text${n > same.length ? `; the others of the ${num(n)} reports are on other countries` : ''}.</p><ul class="mini">${same.map(s => {
    const doc = app.S.docs[s.d], src = app.src(doc.s);
    return `<li><button data-open="${doc.id}.${s.k}" data-pg="${s.pg}">${esc(src.short)} · ${esc(fmtDate(doc.date))} · p. ${s.pg} ▸</button> <span class="t">${esc(officialTitle(doc))}</span></li>`;
  }).join('')}</ul>`;
}

export const yearOf = pubYear;
