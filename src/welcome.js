// The welcome page (DESIGN §4.0). Text as written in the design; every number from data/about.json.
import { set, esc, num } from './state.js';
import { DATA, embed, embedListeners } from './data.js';
import { look, lookNear, details, families, strip, yearsSpan, fmtShare } from './across.js';

let aboutP = null;
const about = () => (aboutP ||= fetch(`${DATA}/about.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));

const n = v => `<b class="fig">${num(v)}</b>`;

export async function renderWelcome(main, idx, refreshIndex) {
  const A = (await about()) || {};
  const types = A.types || {};
  // Kinds of publisher as named on the page: governments, international organisations (igo),
  // specialised research units (quasi-governmental COI units), others (everything else).
  const P = A.publishers || {};
  const pubs = { government: P.government, international: P.igo, research: P['quasi-governmental-coi'] };
  pubs.other = Object.entries(P).filter(([k]) => !['government', 'igo', 'quasi-governmental-coi'].includes(k)).reduce((a, [, v]) => a + v, 0);
  const langs = (Array.isArray(A.languages) ? A.languages : Object.entries(A.languages || {}).map(([name, docs]) => ({ name, docs })))
    .filter(l => l.name).sort((a, b) => b.docs - a.docs);
  const built = new Map(idx.countries.map(c => [c.slug, c]));
  const builtNames = new Map(idx.countries.map(c => [c.name.toLowerCase(), c]));
  // Every country with its document count needs a per-country list in about.json (country_list);
  // until it is there, only the built countries are listed.
  const list = (A.country_list || A.countries?.list || []).map(c => ({ ...c, slice: built.get(c.slug) || builtNames.get(String(c.name).toLowerCase()) || null }));
  for (const c of idx.countries) if (!list.some(x => x.slice === c)) list.push({ name: c.name, slug: c.slug, docs: c.docs, slice: c });
  list.sort((a, b) => a.name.localeCompare(b.name));
  const nc = typeof A.countries === 'object' ? A.countries?.total : A.countries;
  const unlisted = !(A.country_list || A.countries?.list);

  const yrs = `<b class="fig">${esc(A.first)}</b>–<b class="fig">${esc(A.last)}</b>`;
  main.innerHTML = `<article class="welcome">
    <header class="hero">
      <p class="eyebrow">Investigations Lab</p>
      <h1>Country Conditions Atlas</h1>
      <p class="lede">${n(A.documents)} reports on conditions in ${n(nc)} countries, written by governments, United Nations agencies and research groups, ${yrs}. Search them all, or pick a country.</p>
      <form class="across" role="search" aria-label="Look across countries">
        <div class="across-row">
          <span class="searchwrap big">
            <input class="aq searchbox" type="search" placeholder='${X.mode === 'lk' ? 'Search all countries by wording, e.g. police demanded bribes at checkpoints' : 'Search all countries, e.g. &quot;forced recruitment&quot;'}' aria-label="Search all countries" value="${esc(X.q)}">
            <select class="amode modesel" aria-label="How to match what you type"><option value="q"${X.mode === 'lk' ? '' : ' selected'}>Exact words</option><option value="lk"${X.mode === 'lk' ? ' selected' : ''}>Similar wording</option></select>
          </span>
          <span class="grey">or</span>
          <select class="af" aria-label="A topic to look for across countries"><option value="">a topic…</option></select>
          <button class="look" type="submit">Look</button>
        </div>
        <p class="guide-line small">New here? <a href="guide.html">Follow one case through the atlas.</a></p>
        <label class="fbox small"><input type="checkbox" class="ai"${X.wide ? ' checked' : ''}> <span>Include reports that cover 10 or more countries</span></label>
      </form>
    </header>
    ${A.documents == null ? '<p class="grey small">The collection totals are still being counted.</p>' : ''}
    <section class="pick" aria-labelledby="pick-h">
      <div class="pick-head">
        <h2 id="pick-h">Pick a country</h2>
        <input class="findcountry" type="search" placeholder="Find a country" aria-label="Find a country">
      </div>
      <figure class="worldmap" hidden>
        <svg role="img" aria-label="World map. Click a country to open it. Every country is also in the list below."></svg>
        <figcaption class="readout"><span class="hint">Point at a country to see what the atlas holds. Blue countries open on click; pale ones have no files.</span></figcaption>
      </figure>
      <div class="across-out" hidden></div>
      <details class="az">
        <summary>All countries, A to Z</summary>
        <ul class="countries">${list.map(c => `<li data-name="${esc(c.name.toLowerCase())}">${c.slice
          ? `<button data-slug="${esc(c.slice.slug)}"><span class="nm">${esc(c.name)}</span><span class="tnum">${num(c.docs ?? c.slice.docs)}</span></button>`
          : `<span class="unbuilt"><span class="nm">${esc(c.name)}</span><span class="tnum">${num(c.docs)}</span><span class="prep">being prepared</span></span>`}</li>`).join('')}</ul>
      </details>
      <p class="grey small nomatch" hidden>No country by that name.</p>
      ${unlisted && nc ? `<p class="grey small">The other ${num(Math.max(0, nc - idx.countries.length))} countries are being prepared.</p>` : ''}
    </section>

    <section class="collection" aria-labelledby="col-h">
      <h2 class="h" id="col-h">About the collection</h2>
      <div class="hero-grid">
      <div class="intro">
        <p>This atlas holds ${n(A.documents)} documents about conditions in ${n(nc)} countries.
        Governments, United Nations agencies and research groups wrote them
        between <b class="fig">${esc(A.first)}</b> and <b class="fig">${esc(A.last)}</b>. The website ecoi.net collected them. A computer
        copied the text out of every page, ${n(A.passages)} passages in all, so you
        can search them.</p>
        <p>Use it to find out what was written about a place, who wrote it, and when.
        Pick the country a person is being transferred to. You will see every
        institution that wrote about it, year by year. Click a mark to see the
        documents behind it. Click a document to see the page itself, as it was
        printed.</p>
        <p>The atlas does not judge. It will not tell you which report is right, or
        whether a place is safe. It shows you what was written and where to find
        it. The judging is up to you.</p>
      </div>
      <dl class="figs" aria-label="The collection in numbers">
        <div><dt>documents</dt><dd>${n(A.documents)}</dd></div>
        <div><dt>passages</dt><dd>${n(A.passages)}</dd></div>
        <div><dt>pages</dt><dd>${n(A.pages)}</dd></div>
        <div><dt>countries</dt><dd>${n(nc)}</dd></div>
        <div><dt>institutions</dt><dd>${n(A.institutions)}</dd></div>
        <div><dt>years</dt><dd>${yrs}</dd></div>
      </dl>
    </div>
    </section>

    <div class="two">
      <section class="numbers" aria-labelledby="num-h">
        <h2 class="h" id="num-h">What kind of document</h2>
        <dl class="kinds">
          <dt><i class="tsq t-response"></i>Query responses (${n(types['Response'])})</dt><dd>answers to one question a decision-maker asked, such as "How are journalists treated in Herat?"</dd>
          <dt><i class="tsq t-periodical"></i>Periodical reports (${n(types['Periodical Report'])})</dt><dd>reports that come out every year or so, on a whole country.</dd>
          <dt><i class="tsq t-special"></i>Special reports (${n(types['Special or Analytical Report'])})</dt><dd>one-off studies of one subject or region.</dd>
          <dt><i class="tsq t-position"></i>Positions and guidance (${n(types['Expert Opinion or Position'])})</dt><dd>what an authority tells decision-makers to do.</dd>
        </dl>
        <p>Who wrote them: governments ${n(pubs.government)} · international organisations ${n(pubs.international)} · specialised research units ${n(pubs.research)} · others ${n(pubs.other)}.</p>
        <p>Languages: ${langs.slice(0, 3).map(l => `${esc(l.name)} ${n(l.docs)}`).join(', ')}, and ${n(Math.max(0, langs.length - 3))} more.</p>
      </section>

      <section class="trust" aria-labelledby="trust-h">
        <h2 class="h" id="trust-h">Things to know before you trust a result</h2>
        <ul>
          <li>Reports in other languages were translated by machine. Translations can be wrong. The original is always one click away.</li>
          <li>Places are found by their spelling. A village spelled three ways may hide under two of them.</li>
          <li>This is a selection from ecoi.net, not all of it.</li>
          <li>What you search for stays on your computer.</li>
        </ul>
      </section>
    </div>
    <footer class="wfoot"><a href="about.html">About the atlas and how it was made</a> · Investigations Lab · Documents collected by ecoi.net · Map shapes from Natural Earth</footer>
  </article>`;

  await drawMap(main, idx);
  wireAcross(main, idx);
  main.querySelectorAll('[data-slug]').forEach(b => b.addEventListener('click', () => set({ c: b.dataset.slug })));
  const box = main.querySelector('.findcountry'), items = [...main.querySelectorAll('.countries li')];
  box.addEventListener('input', () => {
    const v = box.value.trim().toLowerCase();
    let shown = 0;
    for (const li of items) { const ok = !v || li.dataset.name.includes(v); li.hidden = !ok; shown += ok; }
    main.querySelector('.nomatch').hidden = shown > 0;
    main.querySelector('.az').open = !!v;
    main.querySelectorAll('.worldmap [data-name]').forEach(el => el.classList.toggle('match', !!v && el.dataset.name.includes(v)));
  });
  box.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const first = items.find(li => !li.hidden)?.querySelector('[data-slug]');
    first?.click();
  });
  // The list updates as countries arrive.
  clearInterval(renderWelcome.timer);
  renderWelcome.timer = setInterval(async () => {
    if (!main.querySelector('.welcome')) return clearInterval(renderWelcome.timer);
    const fresh = await refreshIndex();
    if (fresh && fresh.countries.length !== idx.countries.length && !box.value) renderWelcome(main, fresh, refreshIndex);
  }, 60000);
}

// The map picker (DESIGN §4.0): one flat tint for countries with files, no shading by amount.
let worldP = null;
const world = () => (worldP ||= fetch(`${DATA}/world.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));

async function drawMap(main, idx) {
  const W = await world(), fig = main.querySelector('.worldmap');
  if (!W || !fig) return;
  const byIso = new Map(idx.countries.filter(c => c.iso2).map(c => [c.iso2, c]));
  const attrs = iso => { const c = byIso.get(iso); return c ? `class="on" data-slug="${esc(c.slug)}" data-name="${esc(c.name.toLowerCase())}"` : ''; };
  const svg = fig.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${W.w} ${W.h}`);
  svg.innerHTML = Object.entries(W.shapes).map(([iso, d]) => `<path d="${d}" data-iso="${iso}" ${attrs(iso)}/>`).join('')
    + Object.entries(W.dots).filter(([iso]) => byIso.has(iso)).map(([iso, [x, y]]) => `<circle cx="${x}" cy="${y}" r="3.2" data-iso="${iso}" ${attrs(iso)}/>`).join('');
  fig.hidden = false;
  const out = fig.querySelector('.readout'), hint = out.innerHTML;
  const show = c => {
    const r = c && X.res?.get(c.slug);
    out.innerHTML = !c ? (X.res ? X.hint : hint) : X.res
      ? `<b>${esc(c.name)}</b> · ${r ? `${num(r.n)} of its ${num(c.docs)} documents ${X.what} (${fmtShare(r.n, c.docs)})` : `no documents ${X.what}`}`
      : `<b>${esc(c.name)}</b> · ${num(c.docs)} documents · ${num(c.sources)} sources · ${esc(c.first)}–${esc(c.last)}`;
  };
  X.show = show;
  svg.addEventListener('mouseover', e => { const iso = e.target.dataset?.iso; show(byIso.get(iso)); svg.querySelectorAll(`[data-iso="${iso}"]`).forEach(el => el.classList.add('hov')); });
  svg.addEventListener('mouseout', e => { show(null); svg.querySelectorAll('.hov').forEach(el => el.classList.remove('hov')); });
  svg.addEventListener('click', e => { const s = e.target.dataset?.slug; if (s) open(s); });
}

// Look across countries (across.js). The state lives here, not in the address, so typing never redraws the page.
const X = { q: '', mode: 'q', fam: '', wide: false, by: 'n', res: null, what: '', hint: '', near: null, shown: 10 };
// The country page's words come back to the search across countries ("◂ All countries").
export const carry = q => { if (q) { X.q = q; X.fam = ''; } };
const open = slug => set(X.res ? (X.q ? { c: slug, q: X.q } : { c: slug, fm: X.fam, mc: X.wide ? '0' : '' }) : { c: slug });

async function wireAcross(main, idx) {
  const form = main.querySelector('.across'), outEl = main.querySelector('.across-out'), sel = form.querySelector('.af'), box = form.querySelector('.aq');
  const byslug = new Map(idx.countries.map(c => [c.slug, c]));
  families().then(F => {
    sel.insertAdjacentHTML('beforeend', F.families.slice().sort((a, b) => a.name.localeCompare(b.name)).map(f => `<option value="${f.id}"${String(f.id) === X.fam ? ' selected' : ''}>${esc(f.name)}</option>`).join(''));
  }).catch(() => { sel.disabled = true; });
  box.addEventListener('input', () => { if (box.value) sel.value = ''; });
  sel.addEventListener('change', () => { if (sel.value) { box.value = ''; run(); } });
  form.querySelector('.ai').addEventListener('change', e => { X.wide = e.target.checked; if (X.res) run(false); });
  form.addEventListener('submit', e => { e.preventDefault(); run(); });
  const msel = form.querySelector('.amode');
  msel.addEventListener('change', () => {
    X.mode = msel.value;
    box.placeholder = X.mode === 'lk' ? 'Search all countries by wording, e.g. police demanded bribes at checkpoints' : 'Search all countries, e.g. "forced recruitment"';
    if (box.value.trim()) run(); else box.focus();
  });

  async function run(fromInputs = true) {
    if (fromInputs) { X.q = box.value.trim(); X.fam = X.q ? '' : sel.value; }
    if (!X.q && !X.fam) return clear();
    outEl.hidden = false; outEl.innerHTML = '<p class="grey small" role="status">Looking across countries…</p>';
    let r;
    const lk = X.q && X.mode === 'lk';
    if (lk) {
      embedListeners.progress = m => { if (m.total) outEl.innerHTML = `<p class="grey small" role="status">Preparing the wording model in your browser, once per visit (about 135 MB): ${Math.round(100 * m.loaded / m.total)}%…</p>`; };
      try {
        const e = await embed(X.q);
        if (!e.vec) throw new Error(e.message || 'no vector');
        outEl.innerHTML = '<p class="grey small" role="status">Finding the closest wording in every country…</p>';
        r = await lookNear(e.vec, X.wide);
      } catch (err) { outEl.innerHTML = `<p class="grey small">Similar wording could not run here (${esc(err.message || err)}). Try exact words, or open a country.</p>`; return; }
      finally { embedListeners.progress = null; }
    }
    else try { r = await look({ q: X.q, fam: X.fam, wide: X.wide }); }
    catch { outEl.innerHTML = '<p class="grey small">The cross-country index could not be loaded. Open a country to search it.</p>'; return; }
    const name = X.q ? (/^".*"$/.test(X.q) ? esc(X.q) : `“${esc(X.q)}”`) : esc((await families()).families.find(f => String(f.id) === X.fam)?.name || '');
    X.what = lk ? 'have passages among the closest' : X.q ? 'hold these words' : 'have passages on this topic';
    X.res = new Map(r.rows.map(x => [x.slug, x]));
    // Ranked by documents, or by share of the country's documents (countries with under 50 documents last: one of one is not a pattern).
    const share = x => x.n / byslug.get(x.slug).docs, small = x => byslug.get(x.slug).docs < 50;
    const rows = r.rows.filter(x => byslug.has(x.slug)), total = rows.reduce((a, x) => a + x.n, 0);
    if (X.by === 'share') rows.sort((a, b) => small(a) - small(b) || share(b) - share(a) || b.n - a.n);
    X.hint = `${num(rows.length)} countries · darker means ${X.by === 'share' ? 'a larger share of its documents' : 'more documents'}. Point at a country for its count; click to open it.`;
    shade(main, rows);
    X.show?.(null);
    const [lo, hi] = yearsSpan(rows), max = Math.max(1, ...rows.flatMap(x => Object.values(x.years)));
    const row = x => { const c = byslug.get(x.slug); return `<li><button data-open="${esc(x.slug)}"><span class="nm">${esc(c.name)}</span><span class="n tnum">${num(x.n)}</span><span class="sh tnum grey">${fmtShare(x.n, c.docs)}</span>${strip(x.years, lo, hi, max)}</button></li>`; };
    outEl.innerHTML = `<div class="across-head"><p>${lk ? `Wording like <b>${name}</b>: the ${num(r.top.length)} closest passages are in ${num(total)} documents from ${num(rows.length)} countries` : `<b>${name}</b>: ${num(total)} documents in ${num(rows.length)} countries`}${X.wide ? '' : ', not counting reports that cover 10 or more countries'}.</p><span class="across-by small" role="group" aria-label="Rank countries by"><span class="grey">Rank by</span> <button class="linkish" data-by="n" aria-pressed="${X.by === 'n'}">documents</button> · <button class="linkish" data-by="share" aria-pressed="${X.by === 'share'}">share of its documents</button> · <button class="linkish" data-aclear>Back to all countries</button></span></div>
      ${lk ? '<section class="near-list" aria-labelledby="near-h"><h3 class="h" id="near-h">Closest passages, anywhere</h3><ol class="nearp"></ol><button class="linkish small near-more" hidden>Ten more</button></section><h3 class="h across-by-h">By country</h3>' : ''}
      ${rows.length ? `<div class="across-cols grey small"><span>Country</span><span>Documents</span><span>Of its documents</span><span>By year published, ${lo}–${hi}</span></div>
      <ol class="across-list">${rows.slice(0, 15).map(row).join('')}</ol>
      ${rows.length > 15 ? `<details class="across-more"><summary>All ${num(rows.length)} countries</summary><ol class="across-list" start="16">${rows.slice(15).map(row).join('')}</ol></details>` : ''}`
      : '<p class="grey">No country\'s documents hold this. Check the spelling, or try a word in the language of the reports.</p>'}
      <p class="grey small across-note">${lk ? 'Similar wording is machine-made. It finds the passages whose wording is closest to your phrase, in any language, and counts their documents per country; it can miss passages and include loose ones. The country counts are among the closest passages, not totals. Your phrase stays on your computer.' : X.q ? `Counts are documents whose text, or its machine translation, holds your words: a phrase in quotes as words next to each other, other words anywhere in the document. ${/"/.test(X.q) || !/\s/.test(X.q.trim()) ? '' : '<b>For an exact phrase, put it in quotes.</b> '}Opening a country gives the passages; its count looks for the words within one passage, so it can be lower.` : 'Counts are documents with at least one passage filed under this topic, by a heading or by its wording; reference lists are left out.'} Large collections have more of everything: the share of a country's documents is often the fairer comparison.${r.notes.length ? ' Not looked up here: ' + r.notes.map(esc).join('; ') + '.' : ''}</p>`;
    outEl.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.open)));
    outEl.querySelector('[data-aclear]').addEventListener('click', clear);
    if (lk) { X.near = r.top; X.shown = 0; X.seen = new Map(); morePassages(idx, outEl); outEl.querySelector('.near-more').onclick = () => morePassages(idx, outEl); }
    outEl.querySelectorAll('[data-by]').forEach(b => b.addEventListener('click', () => { X.by = b.dataset.by; run(false); }));
    main.querySelector('.az').hidden = true;
  }
  function clear() {
    X.res = null; X.near = null; X.q = X.fam = ''; box.value = ''; sel.value = '';
    outEl.hidden = true; outEl.innerHTML = ''; main.querySelector('.az').hidden = false;
    shade(main, null); X.show?.(null);
  }
  if (X.q || X.fam) run(false);     // back from a country: the same look again
}

// Five steps of one ink by rank among the countries with any; countries with none stay pale.
function shade(main, rows) {
  const fig = main.querySelector('.worldmap'); if (!fig) return;
  fig.classList.toggle('across-on', !!rows);
  const q = new Map((rows || []).map((x, i, a) => [x.slug, 1 + Math.floor(5 * (a.length - 1 - i) / Math.max(1, a.length))]));
  fig.querySelectorAll('[data-slug]').forEach(el => { el.classList.remove('q1', 'q2', 'q3', 'q4', 'q5'); const v = q.get(el.dataset.slug); if (v) el.classList.add('q' + Math.min(5, v)); });
}

// The closest passages themselves, ten at a time: country, source, date, page; a click opens the page in that country.
async function morePassages(idx, outEl) {
  const list = outEl.querySelector('.nearp'), more = outEl.querySelector('.near-more');
  if (!list || !X.near) return;
  more.hidden = true;
  const src = new Map(idx.sources.map(s => [String(s.k), s])), names = new Map(idx.countries.map(c => [c.slug, c.name]));
  // The same sentence in a series' later editions is shown once, with a count of the others.
  const add = [];
  while (add.length < 10 && X.shown < X.near.length && X.shown < 400) {
    const batch = X.near.slice(X.shown, X.shown + 30); X.shown += batch.length;
    let ds;
    try { ds = await details(batch); } catch { list.insertAdjacentHTML('beforeend', '<li class="grey small">These passages could not be loaded.</li>'); return; }
    for (const p of ds) {
      if (p.text.length < 80) continue;   // headings and fragments: real passages first
      const key = p.src + '|' + p.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 90);
      const had = X.seen.get(key);
      if (had) { had.n++; const el = list.querySelector(`[data-rep="${had.i}"]`); if (el) el.textContent = `the same words in ${had.n} other ${had.n === 1 ? 'edition' : 'editions'} or reports by this source`; continue; }
      if (add.length >= 10) continue;
      const i = X.seen.size; X.seen.set(key, { i, n: 0 }); add.push([p, i]);
    }
  }
  list.insertAdjacentHTML('beforeend', add.map(([p, i]) => {
    const s = src.get(String(p.src)), where = p.slugs.filter(x => names.has(x)), slug = where[0];
    const cn = where.length > 3 ? `${esc(names.get(slug))} and ${where.length - 1} other countries` : where.map(x => esc(names.get(x))).join(', ');
    return `<li><p class="meta"><b>${cn || 'a country being prepared'}</b> · ${esc(s?.short || s?.name || '')} · ${esc(p.date || 'undated')}${p.pg ? ` · p. ${p.pg}` : ''}</p>
      <blockquote class="src">${esc(p.text)}${p.text.length >= 240 ? '…' : ''}</blockquote>
      <p class="foot"><span class="otitle grey small" title="${esc(p.title || '')}">${esc(p.title || '')}</span>${p.mt ? ` <span class="mlabel">machine translated from ${esc(p.lang)}</span>` : ''}<span class="grey small rep" data-rep="${i}"></span>${slug ? ` <button class="pagelink" data-np="${esc(slug)}|${p.id}.${p.k}|${p.pg || 1}">Open the page ▸</button>` : ''}</p></li>`;
  }).join(''));
  for (const [, i] of add) { const h = [...X.seen.values()].find(v => v.i === i); const el = list.querySelector(`[data-rep="${i}"]`); if (h?.n && el) el.textContent = `the same words in ${h.n} other ${h.n === 1 ? 'edition' : 'editions'} or reports by this source`; }
  list.querySelectorAll('[data-np]:not([data-w])').forEach(b => { b.dataset.w = 1; b.onclick = () => { const [c, key, pg] = b.dataset.np.split('|'); set({ c, p: key, pg }); }; });
  more.hidden = X.shown >= X.near.length || X.shown >= 400 || list.children.length >= 100;
}
