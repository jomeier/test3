# gl.readPixels returns only zeros after the frame is presented

- Date: 2026-11-10
- Status: verified
- Source: `tools/verify-browser.mjs`, `src/main.js` (`readWorldRect` probe)

## Context

The browser checks needed to read the pixels of one platform to prove that a
photo texture does not slide when the camera moves.

## Error / Hurdle

`gl.readPixels` returned a buffer of all zeros (`distinct colours 1`) even
though the platform was clearly visible in the screenshot taken moments earlier.
After a frame is presented, the browser is free to reuse or clear the drawing
buffer, so reading it later sees nothing.

## Solution

Redraw the scene in the same JavaScript tick before reading:

```js
readWorldRect: (x, y, w, h) => {
  renderFrame();                 // draw again first
  gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
}
```

`renderFrame()` is a small helper extracted from the animation loop so the hook
can call it.

## Golden Rule

Before `gl.readPixels`, call the draw function again in the same JS tick; a
presented frame is not guaranteed to still be in the framebuffer.
