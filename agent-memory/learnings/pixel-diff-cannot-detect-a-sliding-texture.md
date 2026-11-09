# A plain pixel diff cannot prove a texture stays anchored

- Date: 2026-11-10
- Status: verified
- Source: `tools/verify-browser.mjs` (`bestShift`), `src/renderer.js`

## Context

The check "the platform texture does not slide while jumping" compared two pixel
samples of the same world rectangle with a mean absolute difference and a
threshold of 0.01.

## Error / Hurdle

The check passed even after deliberately reintroducing the clip-space uv bug:
the sliding texture produced a raw diff of 0.0674 at shift (0,0), but the
sub-pixel noise of a correct render was already 0.02, so any reasonable
threshold either failed the good case or let the bug through.

## Solution

Scan for the shift that makes the two samples match best, then require that the
best shift is (0,0) and the residual is small:

```js
function bestShift(a, b, pw, ph, maxShift = 24) { /* try every dx, dy */ }

["no slide while jumping",
  Math.abs(jumpShift.dx) <= 2 && Math.abs(jumpShift.dy) <= 2 && jumpShift.diff < 0.05]
```

Measured values: correct render 0.0216 at (0,0); buggy render 0.109 at (0,0)
with the best match around dy = 26 px.

## Golden Rule

For "does the image move?" tests, cross-correlate the samples over a shift
range and assert the best shift is zero, instead of comparing raw diffs.
