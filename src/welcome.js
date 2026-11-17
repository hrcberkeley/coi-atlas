// The welcome page (DESIGN §4.0). Text as written in the design; every number from data/about.json.
import { set, esc, num } from './state.js';
import { DATA } from './data.js';

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
    </header>
    ${A.documents == null ? '<p class="grey small">The collection totals are still being counted.</p>' : ''}
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

    <section class="pick" aria-labelledby="pick-h">
      <div class="pick-head">
        <h2 id="pick-h">Pick a country</h2>
        <input class="findcountry" type="search" placeholder="Find a country" aria-label="Find a country">
      </div>
      <figure class="worldmap" hidden>
        <svg role="img" aria-label="World map. Click a country to open it. Every country is also in the list below."></svg>
        <figcaption class="readout"><span class="hint">Point at a country to see what the atlas holds. Blue countries open on click; pale ones have no files.</span></figcaption>
      </figure>
      <details class="az">
        <summary>All countries, A to Z</summary>
        <ul class="countries">${list.map(c => `<li data-name="${esc(c.name.toLowerCase())}">${c.slice
          ? `<button data-slug="${esc(c.slice.slug)}"><span class="nm">${esc(c.name)}</span><span class="tnum">${num(c.docs ?? c.slice.docs)}</span></button>`
          : `<span class="unbuilt"><span class="nm">${esc(c.name)}</span><span class="tnum">${num(c.docs)}</span><span class="prep">being prepared</span></span>`}</li>`).join('')}</ul>
      </details>
      <p class="grey small nomatch" hidden>No country by that name.</p>
      ${unlisted && nc ? `<p class="grey small">The other ${num(Math.max(0, nc - idx.countries.length))} countries are being prepared.</p>` : ''}
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

  drawMap(main, idx);
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
  const show = c => { out.innerHTML = c ? `<b>${esc(c.name)}</b> · ${num(c.docs)} documents · ${num(c.sources)} sources · ${esc(c.first)}–${esc(c.last)}` : hint; };
  svg.addEventListener('mouseover', e => { const iso = e.target.dataset?.iso; show(byIso.get(iso)); svg.querySelectorAll(`[data-iso="${iso}"]`).forEach(el => el.classList.add('hov')); });
  svg.addEventListener('mouseout', e => { show(null); svg.querySelectorAll('.hov').forEach(el => el.classList.remove('hov')); });
  svg.addEventListener('click', e => { const s = e.target.dataset?.slug; if (s) set({ c: s }); });
}
