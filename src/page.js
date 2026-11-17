// The Page panel (DESIGN §4.5): the document as a continuous column of pages; a passage is selected
// either by the way in (a card's page link) or by clicking it on the page.
// Address: p = "<ecoi id>" (document, nothing selected) or "<ecoi id>.<k>" (passage selected); pg = page in view.
import { state, set, replace, href, esc, num, plural, fmtDate } from './state.js';
import { ask, pdfUrl } from './data.js';
import { pin, isPinned, copyQuote } from './casefile.js';
import { matches, onTopic } from './count.js';
import { marked, passageKey, repeatsList, typeTag, editions, english, wireOpen } from './cards.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
let lib = null;
async function pdfjs() {
  if (!lib) { lib = await import(PDFJS); lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }
  return lib;
}

// One open document at a time.
let D = null;            // { id, d, doc, file, pages: [{el, vp, rendered, task}], ps, byK, sel, io, near }
let notice = '';
const returnFocus = { el: null };

export const parseP = p => {
  const [id, k] = String(p || '').split('.');
  return { id, k: k != null && k !== '' && k !== 'first' ? +k : null };
};

export function closePage(el) {
  if (el.hidden) return;
  D?.io?.disconnect();
  D = null;
  el.hidden = true; el.innerHTML = '';
  document.body.classList.remove('page-open');
  returnFocus.el?.isConnected && returnFocus.el.focus({ preventScroll: true });
}

export async function renderPage(app, el) {
  const { id, k } = parseP(state.p);
  const d = app.S.byId.get(id);
  if (d == null) {
    el.hidden = false;
    el.innerHTML = `<div class="page-err"><p>This document is not in the ${esc(app.country.name)} slice.</p><button data-close>Back</button></div>`;
    el.querySelector('[data-close]').onclick = () => set({ p: '', pg: '' });
    return;
  }
  if (el.hidden) { returnFocus.el = document.activeElement; el.hidden = false; document.body.classList.add('page-open'); }
  if (!D || D.id !== id) await openDoc(app, el, id, d, k);
  if (!D || D.id !== id) return;
  if (D.sel !== k) select(app, el, k, true);
  else if (D.qKey !== app.qKey) rail(app, el);   // words changed: re-mark
}

async function openDoc(app, el, id, d, k) {
  D?.io?.disconnect();
  const doc = app.S.docs[d];
  const mine = D = { id, d, doc, pages: [], ps: [], byK: new Map(), sel: undefined, qKey: '' };
  el.innerHTML = layout(app, doc);
  wire(app, el);
  notice = '';
  el.querySelector('.page-close').focus({ preventScroll: true });
  const [{ passages }, file] = await Promise.all([
    ask({ type: 'docps', d, folded: !!state.ff }),
    pdfjs().then(L => L.getDocument(pdfUrl(id)).promise).catch(e => ({ error: e })),
  ]);
  if (D !== mine) return;
  D.ps = passages;
  for (const p of passages) D.byK.set(p.k, p);
  const col = el.querySelector('.pages');
  if (file.error) {
    col.innerHTML = `<p class="grey sheet-msg">The PDF could not be shown here (${esc(file.error.message || 'unknown error')}). <a href="${esc(doc.url)}" target="_blank" rel="noopener">ecoi.net record</a>.</p>`;
    return;
  }
  D.file = file;
  const n = file.numPages;
  el.querySelector('.pof').textContent = `of ${n}`;
  el.querySelector('.pin-page').max = n;
  // Page sizes first, so the column has its full height before anything renders.
  const width = Math.min(col.clientWidth - 8, 900);
  const vps = await Promise.all(Array.from({ length: n }, (_, i) => file.getPage(i + 1).then(pg => pg.getViewport({ scale: 1 }))));
  if (D !== mine) return;
  col.innerHTML = vps.map((v, i) => `<div class="sheet" data-page="${i + 1}" style="width:${width}px;height:${Math.round(width * v.height / v.width)}px"><canvas></canvas><div class="hits"></div><span class="pageno">p. ${i + 1}</span></div>`).join('');
  D.pages = [...col.children].map((elp, i) => ({ el: elp, vp: vps[i], rendered: false, task: null }));
  D.io = new IntersectionObserver(es => es.forEach(e => {
    const i = +e.target.dataset.page - 1;
    if (e.isIntersecting) draw(app, i); else unrender(i);
  }), { root: col.closest('.stage'), rootMargin: '1200px 0px' });
  D.pages.forEach(P => D.io.observe(P.el));
  hits(app);
  const stage = el.querySelector('.stage');
  stage.addEventListener('scroll', () => trackPage(el), { passive: true });
  const start = k != null && D.byK.get(k) ? D.byK.get(k).pg : +state.pg || 1;
  goTo(el, start, false);
}

function layout(app, doc) {
  const src = app.src(doc.s);
  const eds = editions(app, doc).map(e => `<li>${e.doc
    ? `<button data-ed="${e.id}">${e.rel === 'earlier' ? 'Earlier' : 'Later'} · ${esc(fmtDate(e.doc.date))} ▸</button> <span class="t">${esc(e.doc.ot || e.doc.title)}</span><span class="grey small">${esc(e.kind)}</span>`
    : `${e.rel === 'earlier' ? 'Earlier' : 'Later'}: <a href="https://www.ecoi.net/en/document/${e.id}.html" target="_blank" rel="noopener">ecoi.net record ${e.id}</a> <span class="grey small">${esc(e.kind)}, not in this country's documents</span>`}</li>`).join('');
  return `
  <div class="page-grid">
    <aside class="doccard" aria-label="Document">
      <button class="page-close" data-close>◂ Back</button>
      <h2 class="h">Document</h2>
      <p class="pub">${esc(src.name)}</p>
      <p class="grey">${esc(src.country && src.country !== 'International' ? src.country : app.groupLabel(src))}</p>
      <dl>
        <dt>Type <span class="grey">(ecoi.net category)</span></dt><dd>${typeTag(doc)}</dd>
        <dt>Date</dt><dd>${esc(fmtDate(doc.date))}</dd>
        <dt>Language</dt><dd>${doc.lang ? 'catalogued as ' + esc(doc.lang) : '—'}</dd>
        <dt>Length</dt><dd>${doc.pages ? plural(doc.pages, 'page', 'pages') : '—'}</dd>
      </dl>
      <h3 class="h">Official title</h3>
      <p class="title">${doc.ot ? esc(doc.ot) : '<span class="grey">Not in the catalogue yet; see the description below.</span>'}</p>
      <h3 class="h">Described by ecoi.net as</h3>
      <p class="title desc" data-desc>${marked(doc.title, app.reDesc)}</p>
      <p class="links">${doc.ol ? `<a href="${esc(doc.ol)}" target="_blank" rel="noopener">Publisher's copy</a> · ` : ''}<a href="${esc(doc.url)}" target="_blank" rel="noopener">ecoi.net record</a></p>
      ${doc.also?.length ? `<p class="grey">Also covers: ${doc.also.map(esc).join(', ')}</p>` : ''}
      ${eds ? `<h3 class="h">Editions</h3><ul class="mini eds">${eds}</ul>` : ''}
    </aside>
    <section class="stage" aria-label="Pages of the source document" tabindex="-1">
      <nav class="pnav" aria-label="Pages">
        <button class="pbtn" data-step="-1" aria-label="Previous page">◂ Previous</button>
        <label class="pjump">p. <input class="pin-page tnum" type="number" min="1" value="1" aria-label="Page number; Enter to go"> <span class="pof">of …</span></label>
        <button class="pbtn" data-step="1" aria-label="Next page">Next ▸</button>
        <span class="mnav" hidden><button class="pbtn" data-m="-1" aria-label="Previous matching passage in this document">◂ Match</button> <span class="mcount tnum"></span> <button class="pbtn" data-m="1" aria-label="Next matching passage in this document">Match ▸</button></span>
      </nav>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
      <div class="pages"><p class="grey sheet-msg">Loading the PDF… large reports can take 20 seconds.</p></div>
    </section>
    <aside class="rail" aria-label="Selected passage"></aside>
  </div>`;
}

// Faint outlines over every passage on a page; click selects (DESIGN §4.5).
function hits(app) {
  const byPage = {};
  for (const p of D.ps) {
    const b = p.b;
    if (!(Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0)) continue;
    (byPage[p.pg] ||= []).push(p);
  }
  D.pages.forEach((P, i) => {
    const list = byPage[i + 1] || [];
    P.el.querySelector('.hits').innerHTML = list.map(p => `<button class="hit${p.k === D.sel ? ' sel' : ''}" data-k="${p.k}" style="left:${p.b[0] * 100}%;top:${p.b[1] * 100}%;width:${p.b[2] * 100}%;height:${p.b[3] * 100}%" aria-label="Select this passage: ${esc(p.t.slice(0, 80))}"></button>`).join('');
  });
  D.pages.forEach(P => P.el.querySelectorAll('.hit').forEach(h => h.addEventListener('click', () => {
    const k = +h.dataset.k;
    replace(D.sel === k ? { p: D.id } : { p: `${D.id}.${k}`, pg: String(D.byK.get(k).pg) });
  })));
}

function select(app, el, k, scroll) {
  D.sel = k;
  el.querySelectorAll('.hit.sel').forEach(h => h.classList.remove('sel'));
  if (k != null) {
    const h = el.querySelector(`.hit[data-k="${k}"]`);
    h?.classList.add('sel');
    const p = D.byK.get(k);
    if (p) app.markOpened(passageKey(app, p));
    if (scroll && h) {
      const stage = el.querySelector('.stage'), r = h.getBoundingClientRect(), s = stage.getBoundingClientRect();
      if (r.top < s.top + 60 || r.bottom > s.bottom) stage.scrollTop += r.top - s.top - s.height / 3;
    } else if (scroll && p) goTo(el, p.pg, false);
  }
  rail(app, el);
}

// Passages of this document that fit the search or topic in force, so a reader can step through them.
function mnav(app, el) {
  const box = el.querySelector('.mnav'), q = app.q || {}, w = app.W?.groups?.length, t = q.topic || q.fam;
  D.m = !w && !t ? [] : D.ps.filter(p => !p.f && (!t || onTopic(p, q)) && (!w || matches(app.W, (p.t + '\n' + (p.en || '')).toLowerCase())));
  box.hidden = !D.m.length;
  if (!D.m.length) return;
  const i = D.m.findIndex(p => p.k === D.sel);
  box.querySelector('.mcount').textContent = i >= 0 ? `${i + 1} of ${D.m.length}` : `${D.m.length} matching`;
  box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const step = +b.dataset.m, cur = D.byK.get(D.sel);
    let j = i >= 0 ? i + step : step > 0 ? D.m.findIndex(p => cur && (p.pg > cur.pg || (p.pg === cur.pg && p.k > cur.k))) : D.m.findLastIndex(p => cur && (p.pg < cur.pg || (p.pg === cur.pg && p.k < cur.k)));
    if (j < 0 || j >= D.m.length) j = step > 0 ? 0 : D.m.length - 1;
    const n = D.m[j]; replace({ p: `${D.id}.${n.k}`, pg: String(n.pg) });
  });
}

function rail(app, el) {
  D.qKey = app.qKey;
  mnav(app, el);
  const R = el.querySelector('.rail');
  const p = D.sel != null ? D.byK.get(D.sel) : null;
  const doc = D.doc, en = english(doc);
  el.querySelector('[data-desc]').innerHTML = marked(doc.title, app.reDesc);
  if (!p) {
    R.innerHTML = `<p class="hint">Click a passage on the page to see similar wording elsewhere and where else it appears.</p><p class="grey small">Hovering shows each passage's outline.</p>`;
    return;
  }
  R.innerHTML = `
    ${isPinned(`${doc.id}.${p.k}`) ? '<button class="pin big on" data-pin>In evidence</button>' : '<button class="pin big" data-pin>Add to evidence</button>'}
    <button class="copyq big" data-copyq>Copy quote and citation</button>
    <div class="passage-text">
      <p class="grey small">Selected passage · p. ${p.pg} <button class="linkish small" data-clearsel>Clear</button></p>
      ${p.bt ? `<p class="before"><span class="mlabel">Before this</span>“${esc(p.bt)}${p.bt.length >= 160 ? '…' : ''}”</p>` : ''}
      <blockquote class="src">${marked(p.t, app.re)}</blockquote>
      ${!en && p.en ? `<div class="mech"><span class="mlabel">Machine translated, may be incomplete · document catalogued as ${esc(doc.lang)}</span><p>${marked(p.en, app.re)}</p></div>` : !en ? `<p class="mech mlabel">catalogued as ${esc(doc.lang)} · not yet translated</p>` : ''}
    </div>
    <h2 class="h">Similar wording elsewhere</h2>
    <div class="nn grey small">${p.nn?.length ? 'Looking…' : 'No similar wording found in other documents on this country.'}</div>
    ${p.n > 1 ? `<h2 class="h">Appears in ${num(p.n)} reports</h2><div class="reps grey small">Looking…</div>` : ''}`;
  R.querySelector('[data-pin]').onclick = () => pinCurrent(app);
  R.querySelector('[data-copyq]').onclick = () => copyQuote(app, p);
  R.querySelector('[data-clearsel]').onclick = () => replace({ p: D.id });
  const mine = D, k = p.k;
  if (p.nn?.length) ask({ type: 'get', refs: p.nn }).then(({ passages }) => {
    let near = passages;
    if (D !== mine || D.sel !== k) return;
    const order = new Map(p.nn.map(([d, kk], i) => [d + '.' + kk, i]));
    near = near.filter(n => !n.f);   // folded lines never count as similar wording
    near.sort((a, b) => order.get(a.d + '.' + a.k) - order.get(b.d + '.' + b.k));
    R.querySelector('.nn').innerHTML = `<p class="mech">Machine-made: passages in other documents with close wording, closest first.</p><ul class="near">${near.map(n => {
      const nd = app.S.docs[n.d], src = app.src(nd.s);
      const first = (n.en && !english(nd) ? n.en : n.t).slice(0, 220);
      return `<li><button data-open="${nd.id}.${n.k}" data-pg="${n.pg}"><span class="who">${esc(app.groupLabel(src))} · ${esc(src.short)} · ${esc(fmtDate(nd.date))} · p. ${n.pg} ▸</span><span class="src">“${esc(first)}${first.length < n.t.length ? '…' : ''}”</span></button></li>`;
    }).join('')}</ul>`;
    wireOpen(R.querySelector('.nn'));
  });
  if (p.n > 1) ask({ type: 'same', t: p.t }).then(({ passages: same }) => {
    if (D !== mine || D.sel !== k) return;
    R.querySelector('.reps').innerHTML = repeatsList(app, same, p.n);
    wireOpen(R.querySelector('.reps'));
  });
}

async function draw(app, i) {
  const P = D?.pages[i];
  if (!P || P.rendered) return;
  P.rendered = true;
  const mine = D;
  try {
    const page = await D.file.getPage(i + 1);
    if (D !== mine || !P.rendered) return;
    const w = parseFloat(P.el.style.width), vp = page.getViewport({ scale: w / P.vp.width });
    const dpr = window.devicePixelRatio || 1, canvas = P.el.querySelector('canvas');
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    P.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    await P.task.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') P.el.querySelector('.pageno').textContent = `p. ${i + 1}: could not be drawn`;
  }
}

// Far pages give their memory back.
function unrender(i) {
  const P = D?.pages[i];
  if (!P || !P.rendered) return;
  P.task?.cancel();
  P.rendered = false;
  const c = P.el.querySelector('canvas');
  c.width = 0; c.height = 0;
}

// The page filling most of the view (below the page bar).
function current(el) {
  const stage = el.querySelector('.stage').getBoundingClientRect();
  const top = stage.top + el.querySelector('.pnav').offsetHeight, bottom = stage.bottom;
  let best = 1, most = -1;
  for (const P of D.pages) {
    const r = P.el.getBoundingClientRect();
    if (r.bottom < top) continue;
    if (r.top > bottom) break;
    const seen = Math.min(r.bottom, bottom) - Math.max(r.top, top);
    if (seen > most) { most = seen; best = +P.el.dataset.page; }
  }
  return best;
}

function trackPage(el) {
  if (!D?.pages.length) return;
  const n = current(el);
  const box = el.querySelector('.pin-page');
  if (document.activeElement !== box) box.value = n;
  if (String(n) !== state.pg) { state.pg = String(n); history.replaceState(null, '', href({ pg: state.pg })); }
}

function goTo(el, n, smooth = true) {
  if (!D?.pages.length) return;
  n = Math.max(1, Math.min(D.pages.length, n));
  const stage = el.querySelector('.stage');
  const top = D.pages[n - 1].el.offsetTop - el.querySelector('.pnav').offsetHeight - 8;
  stage.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  el.querySelector('.pin-page').value = n;
  if (D.sel != null && D.byK.get(D.sel)?.pg === n) requestAnimationFrame(() => el.querySelector('.hit.sel')?.scrollIntoView({ block: 'center' }));
}

function wire(app, el) {
  el.querySelector('[data-close]').addEventListener('click', () => set({ p: '', pg: '' }));
  el.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => stepPage(+b.dataset.step)));
  const box = el.querySelector('.pin-page');
  box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goTo(el, +box.value || 1); box.blur(); } });
  // An edition opens at the same text when it exists there word for word.
  el.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', async () => {
    const d = app.S.byId.get(b.dataset.ed), ed = app.S.docs[d];
    const p = D?.sel != null ? D.byK.get(D.sel) : null;
    const { passage } = p ? await ask({ type: 'indoc', d, t: p.t }) : { passage: null };
    if (passage) set({ p: `${ed.id}.${passage.k}`, pg: String(passage.pg) });
    else { notice = p ? "This passage's text does not appear word for word in that edition; it opens at its first page." : ''; set({ p: String(ed.id), pg: '1' }); }
  }));
}

export function pinCurrent(app) {
  const p = D?.sel != null ? D.byK.get(D.sel) : null;
  if (!p || !pin(app, p)) return;
  const b = document.querySelector('#page [data-pin]');
  if (b) { b.textContent = 'In evidence'; b.classList.add('on'); }
}

export const hasSelection = () => D?.sel != null;

export function stepPage(dir) {
  const el = document.getElementById('page');
  if (!D?.pages.length) return;
  goTo(el, current(el) + dir);
}
