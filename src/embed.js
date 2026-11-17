// "Wording like this": embeds the lawyer's phrase in the browser (DESIGN §4.1). The phrase never leaves
// this worker; only the library (jsdelivr) and the model files (huggingface.co) are fetched, once.
// Stage 3 serves both from the atlas itself.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2/dist/transformers.min.js';
// multilingual-e5-small (17 Nov): the passages were embedded with "passage: ", mean pooling, normalised; a phrase is a "query: ". q8 is about 135 MB (model 118 MB + tokenizer 17 MB), cached by the browser.
const MODEL = 'Xenova/multilingual-e5-small';
const PREFIX = 'query: ';
let extractor = null;

async function model() {
  if (extractor) return extractor;
  const { pipeline, env } = await import(LIB);
  env.allowLocalModels = false;
  extractor = await pipeline('feature-extraction', MODEL, {
    dtype: 'q8',
    progress_callback: p => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); },
  });
  return extractor;
}

self.onmessage = async ({ data: m }) => {
  try {
    const ex = await model();
    const out = await ex(PREFIX + m.text, { pooling: 'mean', normalize: true });
    self.postMessage({ type: 'vec', id: m.id, vec: Float32Array.from(out.data) });
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e?.message || e) });
  }
};
