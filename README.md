# Blocky Jump & Run (WebGL)

A side-view jump-and-run game that runs entirely in the browser with HTML5,
JavaScript and raw WebGL (no libraries, no build step).

- The world is generated procedurally, chunk by chunk, while the player moves.
- Enemies patrol back and forth on the platforms.
- Jump on an enemy from above to defeat it, touch it from the side and you lose a life.
- A two-layer city skyline with lit, blinking windows and distant hills moves
  behind the level with a parallax effect.
- Platforms are textured (grass blades, brick mortar), and bushes, trees,
  flowers and street lamps decorate them.
- Jet fighters cross the sky every few seconds and drop a bomb right over the
  player. The bomb hits the solid ground after 1.5 seconds and explodes there;
  the blast kills enemies and costs the player a life.
- The moon rises on the left in an arc, pauses at the top, and sets on the
  right: 10 s up, 3 s pause, 10 s down, then the cycle starts again.
- Three real photo textures are downloaded from the internet and used sparingly:
  the moon disc, the body of ground platforms (brick) and the body of floating
  platforms (wood). If a download fails, a procedural stand-in pattern is drawn
  instead, so the game also works offline.

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

Covers the world generator, the physics (gravity, jumping, collision, stomping),
the camera maths, the moon arc, the jets, bombs and explosions, and the
procedural texture stand-ins.

## Texture credits

| Texture | Photo | License |
|---|---|---|
| Moon | Wikimedia Commons: `Phase-180.jpg` (Jay Tanner) | CC BY-SA 3.0 |
| Brick | Wikimedia Commons: `Surfaces brick wall with mortar closeup view.JPG` (Tomwsulcer) | CC0 |
| Wood | Wikimedia Commons: `Wood planks - Preview` (Amal Kumar via Poly Haven) | CC0 |

The images are fetched at runtime and never stored in the repository. The HUD
shows which textures were really downloaded.

## Browser verification

```bash
node tools/verify-browser.mjs          # 1200x720
WIDTH=1920 HEIGHT=1080 node tools/verify-browser.mjs
```

The script starts a local HTTP server and headless Chrome, presses WASD/Space
through the DevTools protocol, saves screenshots to
`/tmp/opencode/screenshots/` and checks that the canvas fills the window, that
WebGL draws geometry, that the player moves and is visible, that enemies patrol
and that stomping scores points. It also forces a jet to appear and captures the
falling bomb and the explosion.

## Structure

```
index.html          page, HUD and canvas
src/prng.js         seeded random generator
src/world.js        procedural platform / enemy / scenery generation
src/physics.js      player movement, collision, enemy patrol
src/camera.js       camera follow and world -> clip space conversion
src/renderer.js     WebGL shaders and quad batching (flat + textured)
src/jets.js         jet fighters, falling bombs and explosions
src/moon.js         maths for the moon arc across the sky
src/textures.js     downloads photo textures, procedural stand-ins
src/main.js         game loop, input, HUD
tools/              build and browser verification scripts
tests/              node test suite
standalone.html     generated single-file version
```
