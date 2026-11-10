# A renamed constant crashes only when something draws it

- Date: 2026-11-10
- Status: verified
- Source: renderer split, `src/drawThreats.js`, `tools/check-constants.mjs`

## Context

Hundreds of inline numbers were replaced by named constants across five new
draw modules. One constant was renamed in its declaration
(`BOMB_FIN_WIDTH_FACTOR` to `BOMB_FIN_WIDTH`) but not at the call site.

## Error / Hurdle

All 64 Node tests stayed green: no test draws. The browser only threw
`ReferenceError: BOMB_FIN_WIDTH_FACTOR is not defined` when a bomb happened to
be on screen, so the failure appeared far from the cause and the pixel checks
reported it as `undefined is not valid JSON`.

## Solution

Offline checker plus a test that runs it over the whole module graph:

```bash
node tools/check-constants.mjs     # prints <file> -> <unknown name>
node --test tests/constant-names.test.js
```

The checker collects the constants a module defines or imports, then reports
upper-case names that are used but unknown; comments and property accesses
(`gl.SOME_SHADER`) are stripped first.

## Golden Rule

After renaming or adding constants, run `node tools/check-constants.mjs`
before opening the browser - tests alone do not cover the draw path.
