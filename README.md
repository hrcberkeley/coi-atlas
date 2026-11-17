# Investigations Lab Country Conditions Atlas

A static tool for finding what country-of-origin reports say, built on documents listed by [ecoi.net](https://www.ecoi.net).
Made at the Human Rights Center Investigations Lab, UC Berkeley. See `about.html` for the methodology.

- **App:** this repository, served as static files (GitHub Pages). No server; search runs in the browser.
- **Data:** the Hugging Face dataset [kolenyo/coi-atlas](https://huggingface.co/datasets/kolenyo/coi-atlas), loaded by the browser. `src/data.js` holds the data root.

To run locally, put the dataset in `data/` and run `python3 serve.py 8766`, then open http://localhost:8766.
