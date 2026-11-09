# WebGL draws only a corner after resizing the canvas

- Date: 2026-11-09
- Status: verified
- Source: WebGL jump-and-run game, `src/renderer.js`, headless Chrome screenshots

## Context

A full-screen WebGL canvas was resized to the window size after
`canvas.getContext("webgl")` was called. The HUD rendered, but the game only
appeared in a small rectangle at the bottom-left of the canvas.

## Error / Hurdle

`canvas.width` / `canvas.height` changed, but the GL viewport stayed at the
default 300x150 that existed when the context was created. Every quad was
clipped to that viewport, so only 300x150 pixels of the frame were painted.

## Solution

Update the viewport whenever the canvas size changes:

```js
function resize(cssWidth, cssHeight, scale) {
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
```

## Golden Rule

After every change of `canvas.width`/`canvas.height`, call
`gl.viewport(0, 0, canvas.width, canvas.height)` - the GL viewport does not
follow the canvas size automatically.
