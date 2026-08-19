# Bilingual Single-Page Website

A dark-themed single-page site that switches the entire page between **English** and **العربية**, including full RTL layout mirroring.

## Running it locally

No build step or dependencies — it's plain HTML, CSS, and JavaScript. Either open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and content |
| `styles.css` | Design tokens, dark theme, and RTL styles |
| `translations.js` | English and Arabic string tables |
| `app.js` | Language toggle and DOM text swapping |
| `prompts-log.md` | Log of the prompts used to build this project |
