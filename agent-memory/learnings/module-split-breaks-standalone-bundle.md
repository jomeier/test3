# A module split breaks the standalone bundle twice

- Date: 2026-11-10
- Status: verified
- Source: renderer split, `tools/build-standalone.mjs`,
  `tests/standalone-build.test.js`

## Context

`src/renderer.js` was split into `batch.js`, `painter.js`, `shaders.js` and five
`draw*.js` modules. `standalone.html` is produced by concatenating the modules
into one plain script.

## Error / Hurdle

Two breaks, both invisible to the game itself:

1. The build used a hardcoded list of nine modules, so new files were silently
   left out of `standalone.html`.
2. Each draw module declared its own `const WHITE = [1, 1, 1]`. Concatenated,
   the names share one script scope:
   `SyntaxError: Identifier 'WHITE' has already been declared`.
   A re-export line made it worse: removing only the `export` keyword leaves
   `{ belowBottom } from "./camera.js";`, which is not valid JavaScript.

## Solution

Read the module list from the import graph, strip re-export lines whole, and
declare shared values once (in `painter.js`) and import them everywhere:

```bash
node tools/build-standalone.mjs   # built standalone.html + 20 modules
node --test tests/standalone-build.test.js
```

The test asserts that src and bundle contain the same files, that a dependency
is bundled before its importer, and that the bundle compiles:

```js
new Function(code); // throws on duplicate names or leftover module syntax
```

## Golden Rule

Never hand-maintain a module list for a concatenating build: resolve the
imports, and let a test run `new Function(bundle)` so scope collisions fail in
Node instead of in the browser.
