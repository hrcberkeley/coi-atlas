// Citations and source lists per venue (DESIGN §4.6). Pure: no DOM, no storage. Checked by cite.check.mjs.
// A citation is a list of runs [text, italic]; toText / toHTML render it.
// An entry x has: publisher, title, ot (official title), date (YYYY[-MM[-DD]]), page, url (ecoi.net record),
// ol (publisher's copy, or the ecoi.net record again), at (date added = last visited), lang, en (machine translation).

export const VENUES = {
  us: { label: 'United States, immigration court and BIA (EOIR)', list: 'Exhibit index',
    note: 'Machine translations in this atlas are not certified translations. A foreign-language document filed in immigration court needs an English translation with a translator’s certification (8 C.F.R. § 1003.33).' },
  ecowas: { label: 'ECOWAS Court of Justice', list: 'Schedule of annexes',
    note: 'Documents not in a language of the Court may need a translation. Check the Court’s current Rules of Procedure.' },
  coi: { label: 'Other (COI standard)', list: 'Sources', note: '' },
};
export const venueOf = c => (c && VENUES[c.venue] ? c.venue : 'us');

const BB = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = d => (d || '').split('-').map(Number);
// Bluebook: "Apr. 22, 2024", "Apr. 2024", "2024".
export function bbDate(d) {
  const [y, m, day] = parts(d);
  if (!y) return 'n.d.';
  return !m ? `${y}` : day ? `${BB[m - 1]} ${day}, ${y}` : `${BB[m - 1]} ${y}`;
}
// Neutral: "22 April 2024".
export function longDate(d) {
  const [y, m, day] = parts(d);
  if (!y) return 'undated';
  return [day || '', m ? LONG[m - 1] : '', y].filter(Boolean).join(' ');
}

const title = x => (x.ot || x.title || '').trim();
const pubUrl = x => (x.ol && x.ol !== x.url ? x.ol : null);   // no publisher's copy: only the ecoi.net record
const english = x => (x.lang || 'English') === 'English';
// Language note: always for a non-English document; says so when a machine translation is quoted with it.
const langNote = x => english(x) ? '' : x.en ? `in ${x.lang}; English machine translation, not certified` : `in ${x.lang}`;
const pp = pages => (pages.length > 1 ? `pp. ${pages.join(', ')}` : `p. ${pages[0]}`);

// One citation. pages: the pinpoint page(s); omitted for a source-list entry that lists no page.
export function cite(x, venue, pages = [x.page]) {
  const t = title(x), pu = pubUrl(x), ln = langNote(x), pg = pages.filter(p => p != null && p !== '');
  if (venue === 'ecowas') {
    const urls = pu ? `${pu}, ecoi.net copy: ${x.url}` : x.url;
    return [[`${x.publisher}, `, false], [t, true], [` (${longDate(x.date)})${pg.length ? ' ' + pp(pg) : ''}${ln ? ` (${ln})` : ''}, ${urls}, accessed ${longDate(x.at)}.`, false]];
  }
  if (venue === 'coi') {
    const urls = pu ? `${pu}; ecoi.net: ${x.url}` : x.url;
    return [[`${x.publisher}: ${t}, ${longDate(x.date)}${pg.length ? ', ' + pp(pg) : ''}${ln ? ` (${ln})` : ''}, ${urls} (accessed ${longDate(x.at)}).`, false]];
  }
  // United States (Bluebook, reports): Publisher, Title pinpoint (date), URL (last visited date), then ecoi.net.
  const pin = pg.length ? ' ' + pg.join(', ') : '';
  const urls = pu ? `${pu} (last visited ${bbDate(x.at)}), also available at ecoi.net, ${x.url}` : `${x.url} (last visited ${bbDate(x.at)})`;
  return [[`${x.publisher}, `, false], [t, true], [`${pin} (${bbDate(x.date)})${ln ? ` (${ln})` : ''}, ${urls}.`, false]];
}

export const toText = runs => runs.map(r => r[0]).join('');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const toHTML = runs => runs.map(([t, i]) => (i ? `<i>${esc(t)}</i>` : esc(t))).join('');

// Quote and citation for the clipboard. Verbatim text; a machine translation is labelled.
export function quoteAndCite(x, venue) {
  const mt = x.en ? `Machine translation, not certified: ${x.en}` : '';
  const c = cite(x, venue);
  return {
    text: [`“${x.text}”`, mt, toText(c)].filter(Boolean).join('\n\n'),
    html: `<blockquote>${esc(x.text)}</blockquote>${mt ? `<p><i>Machine translation, not certified:</i> ${esc(x.en)}</p>` : ''}<p>${toHTML(c)}</p>`,
  };
}

const tab = i => (i < 26 ? String.fromCharCode(65 + i) : tab(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

// The source list: one row per cited document, in order of first citation, with the pages cited.
export function sources(entries, venue) {
  const by = new Map();
  for (const x of entries) {
    const id = String(x.ecoi ?? x.url);
    if (!by.has(id)) by.set(id, { x, pages: [] });
    const r = by.get(id);
    if (!r.pages.includes(x.page)) r.pages.push(x.page);
  }
  const rows = [...by.values()].map((r, i) => {
    r.pages.sort((a, b) => a - b);
    return {
      id: String(r.x.ecoi ?? r.x.url), x: r.x,
      label: venue === 'us' ? `Tab ${tab(i)}` : venue === 'ecowas' ? `Annex ${i + 1}` : `${i + 1}.`,
      title: title(r.x), publisher: r.x.publisher, date: venue === 'us' ? bbDate(r.x.date) : longDate(r.x.date),
      pages: r.pages.join(', '), runs: cite(r.x, venue, r.pages),
    };
  });
  return { heading: VENUES[venue].list, note: VENUES[venue].note, rows };
}

// Source list for the clipboard: an exhibit index table (US), or one citation per line.
export function sourcesClip(list, venue) {
  if (venue === 'us') {
    const head = ['Tab', 'Document', 'Publisher', 'Date', 'Pages cited'];
    const cells = r => [r.label, r.title, r.publisher, r.date, r.pages];
    return {
      text: [list.note, '', head.join('\t'), ...list.rows.map(r => cells(r).join('\t')), '', ...list.rows.map(r => `${r.label}. ${toText(r.runs)}`)].join('\n'),
      html: `<p>${esc(list.note)}</p><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${list.rows.map(r => `<tr>${cells(r).map((c, i) => `<td>${i === 1 ? `<i>${esc(c)}</i>` : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${list.rows.map(r => `<p>${esc(r.label)}. ${toHTML(r.runs)}</p>`).join('')}`,
    };
  }
  return {
    text: [list.note, ...list.rows.map(r => `${r.label} ${toText(r.runs)}`)].filter(Boolean).join('\n'),
    html: (list.note ? `<p>${esc(list.note)}</p>` : '') + list.rows.map(r => `<p>${esc(r.label)} ${toHTML(r.runs)}</p>`).join(''),
  };
}
