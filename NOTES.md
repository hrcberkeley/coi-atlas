# Interface notes (Opus) — version 2

Readings of DESIGN.md v2 where it left a choice open, deviations with reasons, and data observations.
Version 1 notes are superseded by this file.

## Modules
`src/state.js` address · `src/count.js` word matching, type codes, counting (shared with the worker) ·
`src/data.js` static files and workers · `src/worker.js` passages, counts, lists, vectors ·
`src/embed.js` the phrase embedding for "wording like this" · `src/grid.js` landscape, Where panel,
document lists · `src/cards.js` passage card · `src/side.js` Compare sources ·
`src/page.js` Page panel · `src/casefile.js` Evidence (the case file) · `src/cite.js` citations and source lists per venue (pure) ·
`src/docx.js` Word export (OOXML + stored zip, pure) · `src/main.js` case line and wiring.
`node atlas/src/cite.check.mjs [out.docx]` checks the three citation formats and the .docx/zip writer.
`node atlas/src/count.check.mjs [slug]` checks matching (including the critique's HTS/HRD cases) and counts.

## Readings and deviations
- **Case files.** Stored as `atlas.cases` in localStorage: one record per case (name, the case line,
  headings, pins). The v1 shared file (`atlas.casefile`) is migrated once into a case named
  "Imported pins (check)", never into the current case, and the old key is removed. The current
  case saves the case line as it changes (never into the address).
- **Evidence (DESIGN §4.6 revised 17 Nov), phase 1.** Storage is unchanged apart from a `venue` field
  per case (`us` | `ecowas` | `coi`); cases saved before have it added as `us` on load, so no pin or note
  moves. Internally "headings" are the lawyer's points and "loose" the unsorted passages.
  - Adding with no case open starts "Untitled case" ("Untitled case (2)" if that name is taken) with the
    current case line. The live region says so, and the panel shows a line the first time it opens
    afterwards ("This case was started when you added the first passage"); it is then cleared.
  - Panel order: unsorted first (where new passages land unless a point is chosen in "New passages go
    to"), then the points. The Word export puts the points first and "Unsorted" last; the source list
    follows the export's order (first citation first).
  - Citations. Title is the official title (`ot`), else ecoi.net's description. "Publisher's URL" is
    `ol` when it differs from the ecoi.net record; when `ol` is null or the same record, only the
    ecoi.net link is given. "Last visited"/"accessed" is the date the passage was added (`at`).
    US: `Publisher, *Title* page (Bluebook date), publisher URL (last visited date), also available at
    ecoi.net, ecoi URL.` (no publisher URL: `ecoi URL (last visited date) (ecoi.net).`). ECOWAS:
    `Publisher, Title (22 April 2024) p. 14, URL, ecoi.net copy: URL, accessed date.` COI: `Publisher:
    Title, date, p. 14, URL; ecoi.net: URL (accessed date).` A non-English document adds "(in French)";
    with a machine translation quoted alongside, "(in French; English machine translation, not
    certified)". Source lists merge pages per document ("pp. 3, 14").
  - Newer editions: from the slice's docs.json (fetched once per slug): the members after the document in
    `ed` (both "c" and "t" kinds), else the `next` chain. Shown under the passage in the panel and in the
    source list of the Word export (in the Document cell of the US exhibit index).
  - Word export: Title, case header lines (from main.js `header()` plus venue and export date), Heading 1
    per point, quotes in a "Quote" style with a real footnote (footnotes.xml) holding the citation,
    "Machine translation, not certified:" paragraph, "Your note:" paragraph, then the source list with
    the venue's line at its top. US exhibit index is a real table (header row repeats) followed by
    "Full citations". Font Georgia (the atlas fonts are not embedded). Letter page, 1in margins.
  - "Copy quote and citation" and "Copy source list" put text/plain and text/html on the clipboard (a
    copy event first, else the async Clipboard API, else plain text). With no case open the format is US.
  - Backup is `{format: "atlas-evidence", version: 1, exported, case}`. Import checks the shape, gives the
    case and its passages new ids, adds " (2)", " (3)" on a name clash, and opens the imported case.
    A wrong file imports nothing and says so.
  - The Markdown export of version 2 is replaced by the Word export (not kept as a fourth button).
  - Print hides the controls; notes now print (they were hidden by the label rule before).
  - Focus: controls carry `data-fk`; after a re-render the same control gets focus back (rename, venue,
    move, new point); after Remove, Delete point or Delete case it goes to the panel heading.
  - Not done (phase 2): the evidence bundle PDF. LibreOffice is not installed on this machine, so the
    .docx was checked with `unzip -t`, `xmllint` on every part, macOS `textutil` (Cocoa's reader) and a
    Quick Look render; it has not been opened in Word itself.
- **Words.** Whole words by default, `*` prefix, quotes for phrases, space = all words, comma =
  either; on the source text and its machine translation. Apostrophes are literal (Hay'at ≠ Hay’at).
  The words chip shows one count per alternative; when nothing matches, the pane shows each word's
  own count and "together 0".
- **Wording like this.** The closest N are chosen among passages that pass the other What and Where
  conditions (words, described as, type, place), before the year range; the range and clock then
  narrow them. Ordered by closeness in the pane; no score shown. While the model or the vectors load,
  counts show "preparing" rather than zeros.
- **Outside requests (stage 3 must remove):** pdf.js from cdnjs; fonts from Google Fonts;
  transformers.js 3.1.2 from cdn.jsdelivr.net and the model files `Xenova/multilingual-e5-small`
  (quantised q8, ~135 MB: model 118 MB + tokenizer 17 MB, cached by the browser; was bge-small, ~34 MB, until 17 Nov) from huggingface.co. The phrase itself is embedded in a
  worker and never sent. q8 query vectors against fp32-derived int8 passage vectors: order is close to
  but not identical with fp32.
- **Year label** narrows the Passages pane to that year (4.2); Level 2 opens from "Compare sources".
  A click in the grid scrolls the pane into view when it is below the middle of the screen.
- **Compare sources** without a chooser list: the deciding country's sources plus every source with
  matching passages in the selected years. A chooser list (ticks apply at once) is kept exactly; it is
  stored in `s` with commas, so it survives the where chip. Year bands run newest first.
- **Cells**: height on a log scale relative to the tallest cell on screen, stacked by type bottom to
  top (query response, periodical, special report, position or guidance, other). The legend states
  the tallest cell. Row bars and the histogram are neutral grey.
- **Map** is shaded in neutral ink (no type colour, no accent) with five steps evenly on a log scale
  between the smallest and largest province count in view, stated under the map. The chosen place has
  an accent marker at its `ll`; its province is outlined in accent.
- **Type colours** adjusted within their hue families after a simulation (Machado 2009, full
  severity): periodical `#2D4789` (was `#3B5BA5`), position `#9C5A9D` (was `#8B4C8C`), other `#B8BEC5`
  (was `#9AA3AD`); response and special unchanged. Smallest CIELAB difference between any two types:
  protanopia 14.8 (was 12.6), deuteranopia 16.3, tritanopia 21.6. Types are always named in words too.
- **Editions** use docs `ed` (labelled "edition (catalogue)" or "same title, different year"),
  falling back to `prev`/`next`. Each edition is listed with date and official title; it opens at the
  passage with identical text, or at page 1 with "this passage's text does not appear word for word
  in that edition".
- **Folded lines** (`f`): left out of counts and lists, with a count and "Show them" (`ff=1` in the
  address, shown as a foot line, not a chip). Any value of `f` folds (the data also has `"nr"`).
- **First counts** come from docs.json and are labelled "first counts from the catalogue; exact once
  the text has loaded", because `docs[].n` includes folded passages (see data notes).
- **Opened** counts passages opened in the Page panel only (new storage key `atlas.opened2.<slug>`,
  so v1 "seen" counts do not carry over).
- **Loading order**: the selected years first, then key-date years (±2, nearest first), then the
  rest newest first; three files at a time. Syria loads fully in about 1 s from a local server.
- **Copy link** button: copies the address and says that the evidence is never in it.
- **"decided in"** offers only countries that have a government or COI-unit source.
- **Not built**: "Show them" for page furniture (`hidden`) — the slices do not contain those lines;
  per-passage on-demand translation (critique 3.4) is not in the design.

## Stage 2b (16 Nov)
- **Page panel address**: `p=<ecoi id>` opens a document with nothing selected; `p=<ecoi id>.<k>`
  selects a passage. Old `p=<id>.first` links read as "nothing selected". `pg` follows the page in
  view through `history.replaceState` (no history entry per scrolled page); selecting a passage is a
  history entry, so Back clears it as Escape does.
- **Selecting on the page**: every passage with a box is a transparent button over the page
  (faint outline on hover, accent outline when selected). The selected passage's extracted text,
  "Before this" and machine translation sit at the top of the right rail (the text under the page
  moved there, since pages now scroll continuously).
- **Continuous pages**: all page sizes are read first so the column has its full height; pages
  render within about 1,200 px of view and free their canvas when far away. Arrow keys and Page
  Up/Down move one page while the panel is open (they no longer scroll by lines there).
- **Document list**: with words or similar wording set, a document opens at its first matching
  passage; otherwise (including with only an ecoi.net-description chip or a type filter) at page 1
  with nothing selected.
- **Search line**: the switch is not in the address; chips are the address keys `q`, `lk`, `ds`,
  so v2 links restore. The similar-wording chip carries the closest-100/300/1,000 choice.
- **Type toggles**: `t` keeps the list of types shown; all off is written `t=none` (nothing matches).
  The counter adds "types: N of M" in the accent colour (the lawyer's choice).
- **Grid stays on screen**: the Who × When block is sticky under the case line, at most 56% of the
  screen high, and scrolls inside itself; the Passages pane scrolls beneath it. A click scrolls the
  page only enough to bring the pane's first card under the grid.
- **Saved case line**: only addresses this page wrote itself (the lawyer's edits) are saved into the
  current case; an opened or pasted link, Back and Forward never change it.
- **Folded lines** (any `f`, including `"boilerplate"` and `"nr"`) are never matched by exact words or
  similar wording, and are dropped from the similar-wording rail; "Show them" shows them only when no
  search is set. First counts use docs `nc` when present (then exact and unlabelled), else `n` with the
  "first counts from the catalogue" label.

## Stage 2c (16 Nov evening)
- **No Passages pane** (`src/pane.js` deleted, with its CSS). The grid takes the page; it is no longer
  sticky and has no inner scroll. Supersedes the 2b "grid stays on screen" note.
- **Clicks**: a cell writes `x` (open rows) plus `s=<source>` and `y=<year>`; that row's document list
  is limited to the year, shown as a removable "2026 ×" chip. A name or ▸ opens the list for the range.
  A year label (or a one-label drag) opens Compare sources for that year; leaving Compare drops that
  year. "Compare sources" sits beside the counter and uses the current `s`/`y`.
- **Old addresses** with a pane selection (`s` without a comma, optional `y`) open that row's
  document list, year-limited when `y` is one year. A `y` range on Level 1 has no effect.
- **Year limit under "year the text mentions"**: a document is listed when its text mentions that
  year at all (docs `yr`), and its count is for all years in view, as the list says; per-document,
  per-year search counts would need the passages.
- **Zero-result hint** now sits under the counter (it lived in the pane).
- **Map legend** in words with a fewer→more shade row and "grey: none"; hovering a province gives
  "Name · N passages" (SVG title).
- **Page counter** follows the page with the most visible height below the page bar.
- **Selecting / clearing a passage on the page** replaces the address (no history step); Escape with
  a selection clears it the same way.

## Stage 2d (16 Nov night)
- **Name**: "Investigations Lab Country Conditions Atlas" in `<title>`, the top-left name (a link to
  the welcome page) and the case-file export.
- **Welcome page** (`src/welcome.js`): the §4.0 text verbatim; every figure read from
  `data/about.json`. Layout choice: the country picker sits right after the introduction, before
  "The collection in numbers" (§4.0 lists it last), so a lawyer can pick a country without
  scrolling. Kinds of document are shown as "**Query responses (46,031)**" with the meaning on the
  next line (the colon after the count is dropped by the layout).
- **about.json as built** differs from what the page needs: `languages` is an object and includes
  an empty-named language (4 documents), so the page counts 15 named languages where §4.0's example
  says 16; `countries` is `{total, built}`. Publishers map: governments = `government`,
  international organisations = `igo`, specialised research units = `quasi-governmental-coi`,
  others = everything else (EUAA, EU institution, NGOs, think tanks). **Missing:** a per-country
  list with document counts (I read `country_list` [{name, slug, docs}] when it appears). Until then
  the picker lists the built countries with their counts and says "The other N countries are being
  prepared" instead of listing them in grey. (Later the same night `country_list` arrived; all 198
  countries now show, unbuilt ones grey with "being prepared".)
- The picker re-reads `index.json` every minute while the welcome page is open, so new countries
  appear.
- **Topics** (§4.7): address keys `tp` (topic id, part of the saved case line) and `rm=t` (rows are
  topics). The worker reads `t/<year>.json` next to each passage file and marks passages with their
  topic and heading; keys are ecoi ids (document indexes are also accepted). A passage under two
  topics counts in both rows. The topic chip filters passages before the Where counts, so the map
  narrows too. The lane lists topics that have matching passages, in topics.json order (largest
  first), 40 at a time with "Show all". Topic names in the lane add or remove the chip; ▸ and cells
  open the topic's document list with the heading each document used. Opening a document from a
  topic list (or with a topic chip) lands on its first passage under that topic.
- The Topics tab shows the documents-without-headings count once all passage files have loaded.

- **Question-anchored topics** (DESIGN §4.7 as revised; format in data/README "Topics"): topics.json is
  an object `{topics: [...], passages, in_topic, docs, docs_in_topic, …}` (a bare list is still read).
  Ids are global. The tab note now says how topics are made ("Machine-made: a passage is in a topic
  when its wording is close to the questions decision-makers asked … It can miss or include
  passages.") instead of the heading wording, which no longer describes the method; the coverage
  line reads "{in_topic} of {passages} passages are in a listed topic. {docs − docs_in_topic}
  documents are in none." Each topic opens to its documents/institutions/passages counts, its
  example questions (verbatim; open the response when it is in the slice, else the ecoi.net record)
  and the headings above its passages as supporting evidence. A document list shows "under the
  heading …" only when the range has a heading (index ≥ 0). The lane keeps topics.json order
  (by institutions, then documents). With a topic chip, the lane also shows other topics that share
  those passages (a passage can be in up to three).

## Topics, revision 3 (families)
- `t/<year>.json` ranges are read in the five-field form `[k_from, k_to, topic | null, heading, family]`
  (the four-field form still loads; its family comes from the topic's `fam`). A passage keeps every
  topic and family it is filed under (up to three ranges).
- **Lane**: rows are the families in topics.json order (largest first; "Other questions" (29) added
  when a topic carries it). ▸ on a family opens its topics as indented rows beneath it; a family's
  cell opens its documents for that year; a topic row's ▸ or cell opens its documents, with the
  heading each used when there is one.
- **Chips**: `fm` = family, `tp` = topic; both narrow grid, map and counts and combine with the
  others. A family counts every passage in a range carrying that family, family-only ranges included.
- **Topics tab**: families largest first, each opening to "Compare sources on this" and its topics;
  each topic opens to its counts, example questions and headings. Coverage line, from topics.json:
  "Topics cover {docs_in_topic_or_family} of {docs} documents: those whose headings or questions
  match. Search finds everything." No passage-level percentage is shown. A "specific" topic is marked
  "a narrow question (names a group, place or date)".
- **Empty topic lists** (topics.json present, no topics and no families, e.g. Andorra, Tuvalu): the
  Topics tab says only "Too few documents here to group by topic. Search finds everything."; the
  Rows switch is hidden; `tp`/`fm` in an address are ignored there (no chip, no filter). A slice with
  no topics.json at all shows no Topics tab.
- Who says what accepts a family as its question ("What 16 sources say about Military service,
  conscription, desertion in …").

## Who says what (Compare rebuilt, DESIGN §4.3, 16 Nov night)
- The old column view and the "Choose sources" picker are deleted (code and CSS). `src/side.js` is
  now the "Who says what" view; the worker answers it with one `who` request (per source: count,
  documents, the two passages, and the other sources' documents holding the same text).
- **Title sentences**: "What 12 sources say about **Military service** in **Syrian Arab Republic** ·
  key date **Mar 2019**"; words read "the words “activist”", similar wording "wording like “…”", the
  description "documents ecoi.net describes as …"; a place alone reads "about **Ituri** in **Congo,
  Democratic Republic**". The country name is the slice's catalogue name, so Syria reads "Syrian Arab
  Republic".
- **The two passages**: with a key date, "By the key date" (newest on or before it; a year-only key
  date counts its whole year) and "Latest"; when the latest is the same passage the right side says
  "Nothing newer from X; the passage on the left is its latest." Without a key date: "Oldest" and
  "Latest". From a year label: "Earliest in 2019" and "Latest in 2019". Under similar wording both
  are the closest in their period.
- **Same text also in**: other sources' documents in this country with the identical passage text,
  oldest first, at most six named; "(earlier: likely quoted)" when that document's date is before
  the shown passage's. Folded lines never count.
- **Silence line** names the sources in this country with nothing on the question; hidden sources get
  their own "Hidden: … show" line.
- **Address**: `v=s` (as before), `hd` hidden sources, `sp=a,b` the side-by-side pair (first tick is
  held in the page until the second). Escape leaves side by side first, then the view. Old compare
  links (`v=s&s=a,b,…`) open Who says what on the same question; the old source list is ignored.
- **Ways in**: Compare sources (counter), a year label, "Compare sources on this" in a topic's
  details (sets the topic), under the Where heading when a place is chosen, and one link at the end
  of the search chips (not one per chip: all chips together are the question).
- **Side by side**: two columns, years newest first, three cards per cell with "N more … in YYYY".
- No question set → "Compare what?" with the 8 topics that have the most documents.

## Data observations (for Sonnet)
- `docs[].n` counts folded passages (Syria: 498,749 including 9,671 with `f`). A `nf` per document
  (or `n` without folded) would make the first counts exact; the interface already subtracts `nf` if
  it appears.
- `f` has a fourth value, `"nr"` (115 in Syria), not in DESIGN §9.
- `ol` for many documents is the ecoi.net file link, not the publisher's own site; the interface
  labels it "Publisher's copy" as the contract says.
- `ed` is `null` (not absent) on documents without editions; handled.
- atlas/data/README.md does not yet list `ot`, `ol`, `ed`, `f`, `ll`; the interface uses them as
  found.

## Topics builder (16 Nov night)
- Replaced the heading-grouping design of DESIGN 9 with question-anchored topics (coordinator's change). `topics.py` (heading grouping prototype) is kept only for its helpers (heading detection, exclusion rules, translation call).
- Deviations from DESIGN 9: topics.json is an object, not a list (needs `no_vector` etc.); `id` is global and not dense; `t/` ranges are runs of assigned passages and `heading_index` indexes `h` (-1 allowed); `h` entries have two fields, no translation field; topics need 2 institutions and 3 documents.
- Threshold 0.82 (see topic_review.txt): passage-to-centroid cosines are low (median best topic 0.74), so 0.82 is precise and sparse: Syria 3% of unfolded passages. 0.78 gives 17%, 0.74 gives 46%, with visibly looser passages. The number is one constant, `THR` in topics_q.py.
- Sub-question splitting on ";" leaves some fragments; the dependent-clause filter removes only the short ones. Topic names such as "the Bharatiya Janata Party" are real fragments from titles.
- Never rewritten: p/, docs.json, v/. A swap deletes topics files; the watcher rebuilds them.

## Topics revision 2 (16 Nov night)
- Families are the fixed 29 of DESIGN 4.7 plus "Other questions" (id 29); a topic goes to the family whose name (query prefix) is closest to the topic's question centroid; below 0.66 cosine it goes to Other (eyeballed: below that the nearest family was plainly wrong, e.g. hukou -> Arrival after transfer). Ward families dropped.
- Fragments after ";" (lowercase start, or it/its/such/these/this/those/them/they/whether/and/which/who/that/there...) are joined to the previous part; 39,437 unique sub-questions, K=350.
- Passage space: `topics_q.py --centroids` builds centroids from query-response passages (unfolded, 80+ characters, vector, no boilerplate) of every slice with v/, up to 2,000 per topic (344 of 350 have one; the corpus beyond built slices is not used). QR passages inherit their questions' topics (3 closest centroids); others join when cos >= 0.76 and beat the second by 0.003; short passages (<80) take the next unfolded passage's topics. Passages with no vector get no topic. Boilerplate: `fold_rules.bp_phrase` plus "conclusive as to the determination".
- Margins between topics are tiny (many near-duplicate topics), so MARGIN is 0.003; THR/MARGIN picked so Syria non-QR coverage is 31%.

## Topics revision 3 (16 Nov night)
- Passage-similarity route dropped. Topics come from structure only: query-response questions (first 3 topics in title order) and section headings matched to the topic of the nearest question (query prefix on both, place words removed). Match needs cos >= 0.90, margin >= 0.04 over the best question of any other topic, and cos >= 0.78 to the topic's question centroid (stops heterogeneous k-means clusters from filing headings under an unrelated topic). A heading's section runs to the next heading of the same or higher numbering level (numbered) or the next heading (unnumbered); innermost heading first, 3 topics at most.
- Contents lines are not used (they have no range); noted as a deviation. The citation and "elsewhere" fold rules had not landed in fold_rules.py when this ran; only f flags and the boilerplate signature are honoured.
- Names: most frequent normalised question (ties: closest to centre), 2-12 words, not specific (digits, capitalised non-stoplist words, unknown first word); "specific": true when none qualifies. Frequencies are mostly ties of 1, so the names are still often the central question.
- Residue: place removal leaves "Democratic Republic of:" in some names (Congo), which also trips the specific check.
- Revision 3b: family route added (T_f 0.80, M_f 0.06; family_precision.txt, about 88-90% sensible by my reading of 100). Residue words ("Democratic Republic of", "Republic of", ...) are stripped from topic names. Not yet using the citation/elsewhere fold rules (not in fold_rules.py yet). Interface not told: ranges now have 5 fields and can have null topic.

## Ranking by words (BM25), 17 Nov
- `src/bm25.js` (new, pure): BM25 k1 1.2, b 0.75, token counts with the same regexes as `matches`; `fuse` is reciprocal rank fusion k=60. Worker: `bmScorer` in `worker.js`.
- Deviation: the whole-country statistics are built on first use, not at load: passage lengths (`p._n`, one pass, ~1 s on afghanistan, +13 MB heap on top of ~865 MB of loaded passages) and each query term's document frequency by one scan (cached per term, ~0.2-0.5 s on afghanistan). No vocabulary table, so prefixes and phrases get exact document frequencies.
- Exact words: `addPassages`/`matches` untouched, counts cannot change. Order only: lists (Who says what "N more", side by side) take `ord`; address key `o=n` = Newest first, default best match. The switch shows only with words and no similar wording. Who says what's Oldest/Latest/By-key-date picks stay date-based; document lists in the grid stay newest first.
- Similar wording: the phrase's own words (no stop-list: plain BM25 idf handles "the") are BM25-scored, fused with vector rank (RRF k=60). A passage with no vector enters only if a phrase word matches; `novec` counts those that did neither.
- Not browser-tested: the Chrome extension was not connected. Worker verified by node harness and `node src/count.check.mjs` (now includes BM25 and fusion asserts).

- 17 Nov (Fable): opening a document from the grid with Similar wording active now opens at its closest passage (worker `indoc`; before, every passage counted as a match, so passage 0 opened). BM25 scores of lines under 80 characters are divided by 1,000 so headings and citation lines rank after full passages (`bm25.js` SHORT).

- 17 Nov (data builder): audit fixes. (1) Fold rules v2 in `fold_rules.py` (README "Fold rules v2"): logo lines, photo credits, exact ecoi.net furniture, document title lines, IRB bibliography entries and blocks. Deviation from DESIGN 9: no new `f` value; furniture folds as `boilerplate` and bibliography as `references`, so interface counts needed no change. 326,009 more passages folded (not folded 9,781,666 -> 9,455,657). Four IRB title lines judged ok by Haiku are folded on purpose. Samples: `atlas/build/fold_review_v2.txt`; dry-run tool `atlas/build/fold_dry.py`; audit item loader `atlas/build/fold_eval.py`. (2) Topics floor 0.74 on question-to-centroid cosine (README "Topics revision 4"); in-topic passages 971,107 -> 800,667 and in topic or family 1,873,400 -> 1,555,551 (part of that drop is the folded junk passages leaving the denominator, 9,781,535 -> 9,455,526 unfolded). Not done: translation guard (length ratio), 1,346 mostly-hidden documents, place-tag classes.

## 17 Nov (data and interface builder): switch to multilingual-e5-small
- **Interface**: `src/embed.js` now loads `Xenova/multilingual-e5-small` (q8), embeds `"query: " + phrase`, mean pooling, normalised. Loading text: "preparing the language model in this browser (the first use downloads about 135 MB, once; N% so far)"; N% is one percentage over every model file seen so far (the model and the tokenizer report separately). The count line says "N passages with no vector are not included" (was "with no English text yet"); in this data it should never show, there are 0 zero rows. Page panel: the "Similar wording elsewhere" empty text no longer says that English text is needed. `worker.js` needed no change: it never assumed English vectors (it uses the `v/` row of every passage, and BM25 over text plus translation as before); `nn` is read as is. Not changed: the neighbour list shows a non-English neighbour's machine translation when it exists (the match itself is on the original wording).
- **Browser test** (headless Chrome through CDP, the extension was not connected; `scratchpad/cdp3.mjs` asks the page's own data worker for the closest-N list): mexico "drug cartels" 1,000: 1,000 passages, 182 documents, 10 sources, no "no vector" note. guinea: French phrase "enfants soldats recrutement forcé" closest 300: 194 French passages (by a stop-word test), the first ones about child soldiers and recruitment in Guinea; English phrase "forced recruitment of child soldiers": 2 of 300 and 13 of 1,000 are French. mali: French "déplacés internes violences sexuelles" 190 of 300 French; English "internally displaced people sexual violence" 3 of 300, 31 of 1,000. So French passages are found, and directly by a French phrase; an English phrase ranks English passages ahead of French ones (e5 scores same-language pairs higher). Say so if it matters.
- **Data**: `atlas/build/e5_pass.py` (build-check-swap per slice into `<slug>.new/`): fold rules re-applied (credit rule narrowed, step 0), `v/` rebuilt from `e5_vectors.duckdb` (sorted hash lookup `e5_cache/`, made by `e5_index.py`), `nn` recomputed with the e5 vector of each passage's own text (no use of `en`). 198 slices, 11,848,686 passages, 0 missing hashes (0 zero rows). bge `v/` files are hard-linked in `atlas/build/v_bge_backup/<slug>/`; `vectors.duckdb` untouched. `check_slices.py` `check_vec` now compares with the e5 vector.
- **nn threshold** 0.93 (README "Similar wording"): the density-matched value was about 0.91, but pairs read there were mostly shared topic or the same kind of line; so the e5 `nn` is sparser than the bge one (mean 1.24 neighbours per passage on five slices against 2.10). Deviation from the instruction, which was to match the density and adjust by reading. Folded passages are still allowed as neighbours (as before). Neighbours are found by top-16 on GPU (torch, fp16 matmul) then thresholded, so a passage whose top 16 are all in its own document, or identical text, can have fewer than 5 even if more lie above the threshold (same cap as the old top-12).
- **Credit rule**: see README "Fold rules v2". 9,727 passages unfolded (22 now fold as `elsewhere`). Passages not folded 9,455,657 to 9,465,384; `fold_counts.csv` regenerated by `review_all.py` (this also rewrote `fold_review_all.txt`). The credit samples are in `fold_review_v2_credit.txt` (only the slices processed after a restart of the pass; the counts are over all slices). `fold_review_v2.txt` itself was not regenerated.
- **Topics**: README "Topics revision 5". Reused the clustering (`topic_qlab.npy`), ids, names, families and examples; recomputed question vectors and centroids in e5 space (`topic_e5.py`). Thresholds: heading 0.90 / margin 0.0125 / centroid 0.93, family 0.91 / 0.0155, question floor 0.90. In-topic coverage per slice is close to the bge one for topics and a little lower for families. Audit (`audit_topics.py`, before then after): topic ok filed 18 then 15 of 20, bad 7 then 6 of 9; family ok 44 then 21 of 48, bad 16 then 9 of 22. Precision of filed items is unchanged (72/71% topics, 73/70% families); recall on the audit items is lower, mostly for families (the audit items were chosen from what bge filed). If more family coverage is wanted, lower `THR_F` toward 0.90 (audit: 29 ok / 8 bad filed); one constant in `topics_q.py`.
- `topics.py` `embed` has a `TOPIC_EMB=bge` switch that reads `bge_backup/`, used only for the calibration (`topic_cal.py`, `audit_exp.py`, `nn_calib.py`, `nn_pairs.py` are the tools). The topics watcher was stopped during the work and restarted at the end; because `topic_tree.json` is newer than every `topics.json` it will not rerun anything unless an input changes after this.
- Old bge files are in `atlas/build/bge_backup/` (topic vectors, centroids, tree, embedding cache 520 MB, every slice's old `topics.json` and `t/`) and `atlas/build/v_bge_backup/`.

## 17 Nov — Welcome map and Berkeley frame (Fable, DESIGN §4.0 and §6)
- `atlas/data/world.json` (250 KB) is made once by `atlas/build/make_world.mjs` from Natural Earth 1:50m (npm world-atlas@2.0.2), already projected; the page needs no map library. Tuvalu has no shape at this scale and is only in the A–Z list.
- Header is a Berkeley Blue band with a gold rule. Inside `.top` the `--grey`/`--line` tokens are redefined light, and reset to dark again on inputs and selects. All old `#2B4A7A` link blues are now `var(--link)`.
- Phone header now wraps (it never did before). The style sheet before this change is kept at scratchpad `style.before.css`.

## 17 Nov — Filters, About page, backups (Fable)
- Filters behind "Show filters" (DESIGN §4.2): keys `lg`, `sk`, `sc`, `le` (+ `r`) in state.js KEYS and CASE_KEYS; `docFilter` in count.js applies them (kinds and countries arrive as `q.srcs`, the source keys they leave, built in main.js `filterQ`); the worker's context key includes them. Checks added to count.check.mjs.
- `atlas/about.html` is a static page on the same style sheet; linked from the header ("About") and the welcome footer.
- bge backups deleted at the user's request. `e5_pass.py` now marks done slices by `stats_e5.json` instead of the backup folder and no longer hard-links old vectors.
- Topics family threshold THR_F 0.91 -> 0.90; all slices rerun (`atlas/build/run_topics_f090.log`), watcher restarted after.

## 17 Nov — Topics: classifier and passage layer; hosting (Fable)
- Heading route: `family_probe.py` (Gemma-labelled, 20,918 headings, cut 0.4); passage layer `passage_family.py` -> `<slug>/w/<year>.json` (cut 0.6, margin 0.2). Details and judge results in `atlas/data/README.md`, "Topics revision 6". Coverage 52.4% by headings and questions (after the question gate), about 69.8% with the passage layer. Query-response filings from the question alone need passage-level p(family) >= 0.05 (`GATE` in topics_q.py). A bug where family 0 counted as unfiled was fixed.
- App: worker loads `w/`; `p.fw` marks wording-only passages; card label in cards.js; state key `hw` ("Only passages under a matching heading"). Topics-tab counts (`np`) are heading filings only, so a family view can show more passages than its count.
- Hosting: app on GitHub Pages (`hrcberkeley/coi-atlas`), data and PDFs on Hugging Face (`kolenyo/coi-atlas`, PDFs in `pdfs/NN/<id>.pdf`); `data.js` picks the data root by host (local `data/` on localhost). Multi-country reports: `WIDE` = 10 other countries in count.js, label "covers N countries" and filter key `mc`.

## 17 Nov (evening) — Fixes after the scout run (Fable)
Three scouts clicked through topics, search and the live site. App-side fixes: multi-country reports (10+ countries) are hidden by default when a topic or family is open (`singleOn` in count.js, `mc=0` shows them; checkbox beside the family chip); search cards for long passages show the stretch around the first match (`data-ex`/`data-full`) instead of the start; PDF loading note; tooltip on family counts (heading filings only); About paragraph on regional reports. Rule lifted for topics (see DESIGN); a passage-level model labelling run is under way for the data side (junk, ranking).

## 18 Nov — Topics revision 7: model-taught passage scores (Fable)
Rule lifted for topics (DESIGN, 17 Nov). Qwen2.5-14B on Kaggle labelled 57,118 sampled passages: topic (1-29) and, as a separate yes/no question, reference material or page furniture. A three-way prompt (0 not content / topic / 30 fits none) was unstable: the 0-vs-30 choice flipped with small prompt changes, so "not content" comes only from the binary question. Students: logistic regressions on the e5 vectors (`build/passage_family.py`; MLP gave no gain). Output `w/<year>.json` = {v: 2, c: two chars per passage of p/<year>.json}: family letter (A = 0) or "-" junk or "." skipped, then strength 0-9. App: junk at strength >= 7 leaves topic views (stays in search); unfiled passages join their family at strength >= 6 ("grouped by wording"); topic lists rank heading filings above wording ones, then by strength ("clearest on the topic first", newest-first toggle). topics.json families now count docs with the wording layer (`hdocs` = by heading or question).
Totals: 9.46M passages scored: 2.43M junk (0.96M of them had a heading filing), 4.00M heading/question filed, 0.96M by wording, 2.07M unfiled (about 71% of real content in a topic).
Judged (audit/passages7, 480 items, 4 Sonnet judges, 60 planted wrong labels caught 93%): junk hidden 99% right among decided (91% clearly); wording filings 89% (83% clearly); heading filings kept 83% (78% clearly; bare headings are the main error).
Order matters: topics_q.py rewrites topics.json, so run passage_family.py apply after it.
Follow-up (re-scout): the Topics-tab lane now skips junk passages and, like topic views, hides reports covering 10+ countries by default (`singleOn` includes rm=t), so lane counts equal list totals (Chile Security 17 = 17, Human rights defenders 196 = 196).

## 18 Nov — Look across countries (Fable)
Welcome page: "Or look across countries" above the map. Words or a topic → the map shades countries in five steps of one ink by rank (documents, or share of the country's documents; under 50 documents ranked last for share), and a ranked list replaces the A–Z list: documents, share, a year strip; click opens the country with q or fm (+ mc=0 when 10+ country reports are included). State is module-level (not in the address) so typing never redraws; back from a country restores the look.
Data: data/across/ from build/across.py — documents.json (every document once: slugs, year, wide flag), families.json (per slug, family, year: docs without / with 10+ country reports; heading or wording filings, junk left out — same rules as the app; Chile SOGI 26 = 26), w/0000–4095.json word index (FNV-1a over code points; base64 gap varints; 1.46M words, 67.8M postings, 131 MB, largest shard 140 KB). Words: \w+ of lower-cased text + translation, folded passages out. Document-level AND, so counts are an upper bound; the note says so. Prefix words (activist*) are not expanded across countries; the note names them. Rebuild after passage_family.py apply.
Phrases (18 Nov): across/p/0000–8191.json, a pair index ("word word" for two words with only white space between; 16.6M pairs, 164M postings, 668 MB, largest shard 182 KB). A quoted phrase needs all its pairs plus any word not in a pair; hyphen-joined words fall back to words. Quoted "blood feud": Albania 113 across = 113 on the Albania page (mc=1); total 302 documents (421 with words only).

## 18 Nov — Header split (Fable)
Home: header shows the logo, About and Evidence only; the page leads with the title, a one-line lede and the search across countries; the map and results follow; the long intro and figures move to "About the collection" below. Country page: one bar — "◂ All countries" (carries the words back to the home search), the country as a title-like select, the search with its mode as a small menu inside the box and a "?" for the help line, and a "Case" button whose panel holds case, where, key date and decided in (summary on the button when set). Years and counting-by chips moved to the chips row. "⋯" holds Copy link and About.

## 18 Nov — Similar wording across countries (Fable)
build/across_vec.py (uv run --with faiss-cpu): FAISS IVF-PQ over 4.38M passages (each document once; folded, junk at >= 7 and zero vectors out), 4096 lists, PQ 96 x 8 bits on the residual, inner product. data/across/: vq.bin (centroids int8 x127), pq.bin (codebooks float32), v/NNNN.bin (uint32 n, int32 doc numbers, uint16 k, n x 96 codes; 434 MB), s/NN/NNNN.json snippets (16384 shards by FNV-1a of "doc.k": [pg, English or original text 240 chars, 1 if translated]; 916 MB), dm/NNN.json document facts (512 shards). Browser (across.js nearest): phrase embedded by embed.js ("query: "), 32 closest lists (~3.4 MB), score = q.c + LUT sums, top 2000. Recall test (30 noisy passage queries): recall@100 69%, but similarity of the found top 10 0.8725 vs true 0.8747 (random passage 0.70) — misses are near-ties. M 48 was worse (recall 47%).
Home: "Exact words / Similar wording" menu in the search box. Similar wording shows the closest passages first (one per source for identical wording, with a count of the others; ten at a time; "Open the page" opens the country at that page), then the countries by documents among the closest 2000. Model download ~135 MB once per visit; later searches ~0.6 s locally.
Fixes found while making the walkthrough (18 Nov): Compare sources opened straight from a similar-wording link drew before the phrase's counts arrived and stayed at "0 sources" — the side view's redraw key now includes lk readiness and the tally total. Closest passages anywhere skip texts under 80 characters (headings, fragments). The country bar keeps the case button on one line (narrower search and case button).
Walkthrough: tutorial/walkthrough.html with tutorial/img/ (21 screenshots made by a CDP script), published as a private claude.ai artifact.

## 18 Nov — Topics revision 8 (Fable)
Teacher: Qwen2.5-14B on Kaggle (coi-passage-multi, private dataset coi-passage-items3) relabelled the 31,891 substantive passages of the sample: up to 3 topics and up to 2 kinds of information (8 kinds). Students: one logistic regression per topic and per kind on e5 vectors (`build/passage_family.py train8 / apply8`). Qwen gave two topics to 90% of passages, so second topics need a high cut.
Filing (w/ v3): heading filings kept unless the wording model gives that family under 5% ("hv" drops them); main family by wording at 0.5 ("cut": 5), also under a heading; a passage leaning to a family (>= 0.3) joins when its neighbour in the same document is filed there; second family at 0.7 ("c2"); kinds at 0.5 ("k"); "o"/"on" mark passages of multi-country reports that name only another of the report's countries (`build/offcountry.py`, about 1M passages). Rule: headings naming sexual orientation / gender identity / LGBT file that family (the State Department renamed its section in 2023).
Measured (audit/passages8, Sonnet judges, 480 random passages, strict: a topic on reference material counts as wrong): revision 7 precision 64%, recall 34%; revision 8 as applied 66%, 48%. Variants tried in `audit/passages8/variants.py` (headings alone 59%/25%: long sections pass their family to unrelated passages). Kinds 63% precision, 41% recall. Reference material: 134 of 198 hidden; 13 of 282 real passages wrongly hidden. Two judges: same main topic 58/61. Planted wrong labels caught 27/40 (weaker judges than revision 7's 93%), so precision may be overstated. Per-family precision (14 filed passages each) and coverage in audit/passages8/results.json; weakest: arrival after transfer, human rights defenders, elections, women, journalists, exit and entry.
App: worker reads v3 (cut, c2, k, hv, o); kind filter "Kind of information" (state kd); compare picks prefer strong filings. across.py --families rewrites families.json alone (main() would delete the vector files).
Next lever: a fine-tuned small encoder (e5-small, multi-label) instead of linear probes, trained on the Qwen labels on Kaggle and run on every passage.

## 19 Nov — Topics revision 9

- Teacher changed from Qwen2.5-14B-AWQ to Qwen3-14B-AWQ (non-thinking), shown the section heading and the passage before (feasibility/cloud_multi3, private Kaggle kernel coi-passage-multi9). Students, rules and cut-offs unchanged, except kinds now cut at 0.75.
- Teachers' own labels on the 480 judged passages (topic P/R/F1): Qwen2.5 46/57/51, Qwen3 57/69/62, Qwen3 + context 59/71/64 (feasibility/cloud_teach). Gemma 4 12B does not run on Kaggle T4s (fp16: no room for the KV cache; 4-bit: Triton kernel needs 96 KB shared memory, T4 has 64 KB).
- Applied layer: topics 69% precision, 49% recall (rev 8: 66/48). Kinds 63/44 (rev 8: 63/41). Reference material unchanged (same junk model).
- Tried and dropped: neighbour + heading vectors as student features (audit/passages8/context.py): 64/47. The teacher labelled passages alone, so the students cannot use context the labels never reflected.
- Revision 8 files and model: atlas/build/w_rev8/.
- Topic definitions tested on the teacher (feasibility/cloud_multi4/definitions.txt, 480 judged passages): all 29 include/exclude definitions F1 58 (worse; long prompt confuses the 14B model); names + 4 short notes F1 63 (no gain: opposition found 13/20 vs 7/20, but ethnic groups and exit gained many wrong labels). Not used. The definitions stay as written guidance.
- Fine-tuned student tested (feasibility/cloud_ft, multilingual-e5-small with topic, kind and reference heads, heading prefix, 3 epochs, trained locally on MPS in 22 min because the Kaggle weekly GPU quota ran out). It copies the teacher more closely (held-out agreement at 0.5: 81% / 59% against 80% / 48%), so it also copies Qwen's extra topics: on the 480 judged passages 61% / 53% at revision 9's rules, and never more than 43% recall at 68% precision. Not used. Its reference-material head was better (hid 143 of 198 against 134, with 14 real passages hidden against 13); worth reusing only if a full inference run is done for another reason.
- Neighbour and heading vectors retried with the Qwen3 (context-seeing) labels: 65% / 49%, still worse than the own vector.
