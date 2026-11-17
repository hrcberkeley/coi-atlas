// A Word document (.docx) written in the browser (DESIGN §4.6): the minimal OOXML parts and a stored
// (uncompressed) zip. No library, no outside service. Pure: returns bytes. Checked by cite.check.mjs.

// ---- zip, stored ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }

export function zip(files) {   // files: [[name, string | Uint8Array]]
  const enc = new TextEncoder(), local = [], central = [];
  let off = 0;
  for (const [name, body] of files) {
    const n = enc.encode(name), d = typeof body === 'string' ? enc.encode(body) : body, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);   // 1 Jan 1980
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    local.push(new Uint8Array(h.buffer), n, d); central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + d.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, off, true);
  const parts = [...local, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(off + size + 22);
  let p = 0; for (const a of parts) { out.set(a, p); p += a.length; }
  return out;
}

// ---- WordprocessingML ----
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
// Escape, and drop characters XML 1.0 does not allow (PDF text can carry them).
const x = s => String(s ?? '').replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A run; line breaks inside become <w:br/>.
const run = (t, { i, b } = {}) => `<w:r>${i || b ? `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}</w:rPr>` : ''}${String(t ?? '').split('\n').map(l => `<w:t xml:space="preserve">${x(l)}</w:t>`).join('<w:br/>')}</w:r>`;
const runs = rs => rs.map(([t, i]) => run(t, { i })).join('');
const para = (inner, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
const fnRef = id => `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/><w:spacing w:before="120" w:after="120"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="MachineTranslation"><w:name w:val="Machine translation"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Atlas line"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const SEPARATORS = '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';

// m: { title, meta: [string], sections: [{ heading, items: [{ before, quote, mt, cite: runs, note }] }],
//      sources: { heading, note, venue, rows: [{ label, title, publisher, date, pages, runs, newer: [string] }] } }
export function docx(m) {
  const body = [], notes = [];
  body.push(para(run(m.title), 'Title'));
  for (const l of m.meta) body.push(para(run(l), 'Small'));
  for (const s of m.sections) {
    body.push(para(run(s.heading), 'Heading1'));
    if (!s.items.length) body.push(para(run('No passages.'), 'Small'));
    for (const it of s.items) {
      const id = notes.length + 1;
      notes.push(`<w:footnote w:id="${id}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(' ')}${runs(it.cite)}</w:p></w:footnote>`);
      if (it.before) body.push(para(run('Before this: ', { i: true }) + run(`“${it.before}”`), 'Small'));
      body.push(para(run(it.quote) + fnRef(id), 'Quote'));
      if (it.mt) body.push(para(run('Machine translation, not certified: ', { i: true }) + run(it.mt), 'MachineTranslation'));
      if (it.note) body.push(para(run('Your note: ', { b: true }) + run(it.note)));
    }
  }
  const S = m.sources;
  body.push(para(run(S.heading), 'Heading1'));
  if (S.note) body.push(para(run(S.note), 'Small'));
  const newer = r => (r.newer || []).map(n => para(run(n), 'Small')).join('');
  if (S.venue === 'us') {
    const cell = (inner, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
    const Wd = [800, 3800, 2200, 1400, 1200];
    const row = (cells, head) => `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, Wd[i])).join('')}</w:tr>`;
    body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9400" w:type="dxa"/></w:tblPr><w:tblGrid>${Wd.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
      + row(['Tab', 'Document', 'Publisher', 'Date', 'Pages cited'].map(h => para(run(h, { b: true }))), true)
      + S.rows.map(r => row([para(run(r.label)), para(run(r.title, { i: true })) + newer(r), para(run(r.publisher)), para(run(r.date)), para(run(r.pages))])).join('')
      + '</w:tbl>');
    body.push(para(run('Full citations'), 'Heading2'));
  }
  for (const r of S.rows) body.push(para(run(`${r.label} `) + runs(r.runs)) + (S.venue === 'us' ? '' : newer(r)));
  const sect = '<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    ['[Content_Types].xml', `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${ct}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${ct}.styles+xml"/><Override PartName="/word/settings.xml" ContentType="${ct}.settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="${ct}.footnotes+xml"/></Types>`],
    ['_rels/.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument', 'word/document.xml')}</Relationships>`],
    ['word/_rels/document.xml.rels', `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'styles', 'styles.xml')}${rel('rId2', 'settings', 'settings.xml')}${rel('rId3', 'footnotes', 'footnotes.xml')}</Relationships>`],
    ['word/document.xml', `${H}<w:document ${W}><w:body>${body.join('')}${sect}</w:body></w:document>`],
    ['word/styles.xml', STYLES],
    ['word/settings.xml', `${H}<w:settings ${W}><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr></w:settings>`],
    ['word/footnotes.xml', `${H}<w:footnotes ${W}>${SEPARATORS}${notes.join('')}</w:footnotes>`],
  ]);
}
