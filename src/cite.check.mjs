// node atlas/src/cite.check.mjs [out.docx] — checks the three citation formats (DESIGN §4.6) and that
// the .docx writer makes a valid stored zip. With a path, also writes a sample .docx there.
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { cite, toText, toHTML, bbDate, longDate, sources, sourcesClip, quoteAndCite } from './cite.js';
import { docx, crc32 } from './docx.js';

const base = { publisher: 'US Department of State', title: 'ecoi.net description', ot: 'Mexico 2023 Human Rights Report',
  date: '2024-04-22', page: 14, url: 'https://www.ecoi.net/en/document/2107800.html',
  ol: 'https://www.state.gov/reports/2023-country-reports-on-human-rights-practices/mexico/', at: '2026-11-17',
  lang: 'English', en: null, ecoi: 2107800, text: 'Police were implicated in disappearances.' };
const noPub = { ...base, ol: base.url };   // the catalogue gives only the ecoi.net record
const mt = { ...base, publisher: 'Immigration and Refugee Board of Canada', ot: 'Mexique : violence conjugale', date: '2019-09-03',
  page: 3, lang: 'French', en: 'Domestic violence.', text: 'Violence conjugale.', ecoi: 1000379, url: 'https://www.ecoi.net/en/document/1000379.html', ol: null };

// Bluebook months
assert.deepEqual(['2024-01-05', '2024-05-01', '2024-06-30', '2024-07-04', '2024-09-11', '2024-12'].map(bbDate),
  ['Jan. 5, 2024', 'May 1, 2024', 'June 30, 2024', 'July 4, 2024', 'Sept. 11, 2024', 'Dec. 2024']);
assert.equal(bbDate('2024'), '2024');
assert.equal(longDate('2024-04-22'), '22 April 2024');

// United States (EOIR), Bluebook
assert.equal(toText(cite(base, 'us')), 'US Department of State, Mexico 2023 Human Rights Report 14 (Apr. 22, 2024), https://www.state.gov/reports/2023-country-reports-on-human-rights-practices/mexico/ (last visited Nov. 17, 2026), also available at ecoi.net, https://www.ecoi.net/en/document/2107800.html.');
assert.equal(toHTML(cite(base, 'us')).includes('<i>Mexico 2023 Human Rights Report</i> 14'), true, 'title in italics');
assert.equal(toText(cite(noPub, 'us')), 'US Department of State, Mexico 2023 Human Rights Report 14 (Apr. 22, 2024), https://www.ecoi.net/en/document/2107800.html (last visited Nov. 17, 2026).');
assert.equal(toText(cite(mt, 'us')), 'Immigration and Refugee Board of Canada, Mexique : violence conjugale 3 (Sept. 3, 2019) (in French; English machine translation, not certified), https://www.ecoi.net/en/document/1000379.html (last visited Nov. 17, 2026).');

// ECOWAS Court of Justice, neutral
assert.equal(toText(cite(base, 'ecowas')), 'US Department of State, Mexico 2023 Human Rights Report (22 April 2024) p. 14, https://www.state.gov/reports/2023-country-reports-on-human-rights-practices/mexico/, ecoi.net copy: https://www.ecoi.net/en/document/2107800.html, accessed 17 November 2026.');
assert.equal(toText(cite(noPub, 'ecowas')), 'US Department of State, Mexico 2023 Human Rights Report (22 April 2024) p. 14, https://www.ecoi.net/en/document/2107800.html, accessed 17 November 2026.');
assert.equal(toText(cite(mt, 'ecowas')), 'Immigration and Refugee Board of Canada, Mexique : violence conjugale (3 September 2019) p. 3 (in French; English machine translation, not certified), https://www.ecoi.net/en/document/1000379.html, accessed 17 November 2026.');

// Other (COI standard)
assert.equal(toText(cite(base, 'coi')), 'US Department of State: Mexico 2023 Human Rights Report, 22 April 2024, p. 14, https://www.state.gov/reports/2023-country-reports-on-human-rights-practices/mexico/; ecoi.net: https://www.ecoi.net/en/document/2107800.html (accessed 17 November 2026).');
assert.equal(toText(cite(noPub, 'coi')), 'US Department of State: Mexico 2023 Human Rights Report, 22 April 2024, p. 14, https://www.ecoi.net/en/document/2107800.html (accessed 17 November 2026).');
assert.equal(toText(cite(mt, 'coi')), 'Immigration and Refugee Board of Canada: Mexique : violence conjugale, 3 September 2019, p. 3 (in French; English machine translation, not certified), https://www.ecoi.net/en/document/1000379.html (accessed 17 November 2026).');

// A non-English passage without a translation names its language only
assert.ok(toText(cite({ ...mt, en: null }, 'coi')).includes('(in French),'));

// Quote and citation: verbatim, translation labelled
const q = quoteAndCite(mt, 'us');
assert.ok(q.text.startsWith('“Violence conjugale.”\n\nMachine translation, not certified: Domestic violence.\n\n'));
assert.ok(q.html.startsWith('<blockquote>Violence conjugale.</blockquote>'));

// Source lists: one row per document, pages merged, labels per venue
const ents = [base, { ...base, page: 3 }, mt, { ...base, page: 14 }];
const us = sources(ents, 'us');
assert.deepEqual(us.rows.map(r => [r.label, r.pages, r.date]), [['Tab A', '3, 14', 'Apr. 22, 2024'], ['Tab B', '3', 'Sept. 3, 2019']]);
assert.ok(us.note.includes('8 C.F.R. § 1003.33'));
assert.ok(toText(us.rows[0].runs).includes('Report 3, 14 (Apr. 22, 2024)'));
assert.deepEqual(sources(ents, 'ecowas').rows.map(r => r.label), ['Annex 1', 'Annex 2']);
assert.ok(toText(sources(ents, 'ecowas').rows[0].runs).includes('pp. 3, 14'));
assert.ok(sources(ents, 'ecowas').note.includes('Rules of Procedure'));
assert.equal(sources(ents, 'coi').note, '');
assert.ok(sourcesClip(us, 'us').text.includes('Tab\tDocument\tPublisher\tDate\tPages cited'));
assert.ok(sourcesClip(us, 'us').html.includes('<table>'));

// Zip and docx
assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
const model = { title: 'Untitled case & <test>', meta: ['Transferred to: Mexico'],
  sections: [{ heading: 'Police cannot protect her', items: [
    { before: 'The report says:', quote: base.text, cite: cite(base, 'us'), note: 'Para 4 of the brief.' },
    { quote: mt.text + '\u0001', mt: mt.en, cite: cite(mt, 'us') }] }, { heading: 'Unsorted', items: [] }],
  sources: { ...us, venue: 'us', rows: us.rows.map(r => ({ ...r, newer: ['A newer edition exists: X, 2025'] })) } };
const bytes = docx(model);
assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
const s = new TextDecoder().decode(bytes);
assert.ok(s.includes('<w:footnoteReference w:id="2"/>') && s.includes('<w:footnote w:id="2">'), 'real footnotes');
assert.ok(s.includes('w:val="Heading1"') && s.includes('w:val="Quote"'));
assert.ok(s.includes('Untitled case &amp; &lt;test&gt;') && s.includes('>Violence conjugale.</w:t>'), 'escaped, control characters dropped');
if (process.argv[2]) { writeFileSync(process.argv[2], bytes); console.log('wrote', process.argv[2], bytes.length, 'bytes'); }
console.log('cite.check: all assertions passed');
