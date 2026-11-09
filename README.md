# Blocky Jump & Run (WebGL)

A side-view jump-and-run game that runs entirely in the browser with HTML5,
JavaScript and raw WebGL (no libraries, no build step).

- The world is generated procedurally, chunk by chunk, while the player moves.
- Enemies patrol back and forth on the platforms.
- Jump on an enemy from above to defeat it, touch it from the side and you lose a life.

## Run it

Option 1 - with a local web server (uses the ES modules in `src/`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

Option 2 - a single self-contained file (works by double-clicking):

```bash
node tools/build-standalone.mjs
# open standalone.html in the browser
```

Chrome refuses ES module imports on `file://` URLs, hence the standalone build.

## Controls

| Key | Action |
|---|---|
| `A` / `D` or arrow keys | run left / right |
| `Space` or `W` or `Up` | jump (tap for a short hop, hold for a full jump) |
| `S` or `Down` | fast fall |
| `R` | generate a new world with a new seed |

The seed can also be fixed with `?seed=1234`.

## Tests

```bash
node --test tests/*.test.js
```

Covers the world generator, the physics (gravity, jumping, collision, stomping)
and the camera maths.

## Browser verification

```bash
node tools/verify-browser.mjs          # 1200x720
WIDTH=1920 HEIGHT=1080 node tools/verify-browser.mjs
```

The script starts a local HTTP server and headless Chrome, presses WASD/Space
through the DevTools protocol, saves screenshots to
`/tmp/opencode/screenshots/` and checks that the canvas fills the window, that
WebGL draws geometry, that the player moves and is visible, that enemies patrol
and that stomping scores points.

## Structure

```
index.html          page, HUD and canvas
src/prng.js         seeded random generator
src/world.js        procedural platform / enemy / scenery generation
src/physics.js      player movement, collision, enemy patrol
src/camera.js       camera follow and world -> clip space conversion
src/renderer.js     WebGL shader and quad batching
src/main.js         game loop, input, HUD
tools/              build and browser verification scripts
tests/              node test suite
standalone.html     generated single-file version
```
