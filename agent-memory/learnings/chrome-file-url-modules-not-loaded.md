# Chrome refuses ES modules opened from file://

- Date: 2026-11-09
- Status: verified
- Source: WebGL game project, `index.html` + `src/main.js`, headless Chrome probe

## Context

A modular browser game (`index.html` with `<script type="module" src="src/main.js">`)
worked over `http://localhost:8000` but did nothing when the HTML file was
opened directly from disk.

## Error / Hurdle

On a `file://` page Chrome silently skips the module script: no error in the
console, the game hook stayed `undefined`, the canvas kept its default 300x150
size. Module scripts need a fetchable, same-origin (http) URL.

## Solution

Either serve the page over HTTP:

```bash
python3 -m http.server 8000
```

or build one self-contained HTML file for double-clicking (strip the module
syntax and inline all sources):

```bash
node tools/build-standalone.mjs   # writes standalone.html
```

```js
source.replace(/^import[^;]*;$/gm, "").replace(/^export\s+/gm, "");
```

## Golden Rule

For a browser game that must work by double-clicking, generate one inline
single-file HTML; ES modules only load when the page is served over http(s).
