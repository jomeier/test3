# Renderer helpers cannot read the frame time from draw()

- Date: 2026-11-09
- Status: verified
- Source: WebGL game, `src/renderer.js`, adding blinking city windows

## Context

While adding animated window lights to the parallax city, the helper function
`drawBuilding()` was defined next to `draw()` and used `time`.

## Error / Hurdle

`time` is destructured inside `draw()`, so it is not visible in the sibling
helper `drawBuilding()`. The reference would throw `ReferenceError: time is not
defined` at runtime - the WebGL shader compiles fine, so the failure only shows
up when a frame is drawn.

## Solution

Pass the frame time (and camera/view) into the helper explicitly:

```js
function drawBuilding(b, cam, view, near, time) { ... }

// in draw():
for (const b of world.buildings) drawBuilding(b, farCam, view, false, time);
```

## Golden Rule

Helper functions that need per-frame data must receive that data as parameters -
never rely on a variable that only exists inside another function's body.
