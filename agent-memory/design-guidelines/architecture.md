# Architecture

Decisions about how the code is organised, with the reason for each.

- Raw WebGL 1 and two hand-built programs are used instead of a game engine or
  a rendering library.
  *Why:* the project must run with only JavaScript and the browser; a
  quad-based scene needs no lighting, no 3D math and no asset pipeline, so
  fewer dependencies mean fewer things that can break.

- Every visible box is batched into one Float32Array and drawn with a single
  `gl.drawArrays` call per program: one flat program and one textured program,
  so at most two draw calls per frame.
  *Why:* a textured batch cannot mix two pictures, so it needs its own program,
  but each program is still flushed exactly once per frame; per-object draw
  calls would dominate the frame time.

- Game logic lives in small modules (`prng.js`, `world.js`, `physics.js`,
  `camera.js`, `jets.js`, `moon.js`) and the loop only connects them in
  `main.js`; the drawing is split the same way (`renderer.js` sets the context
  and the painting order, `shaders.js`, `batch.js` and `painter.js` build the
  picture, `drawSky.js`, `drawCity.js`, `drawLevel.js`, `drawActors.js` and
  `drawThreats.js` own one scene part each).
  *Why:* pure functions (generation, collision, camera math) can be tested in
  Node without a browser, which is how the tests are able to cover the game,
  and one topic per file keeps a change in one place.

- The scene modules receive a `painter` object (`rect`, `rectTex`, `disc`,
  `belowView`, `flushTextures`, ...) and never import `renderer.js`.
  *Why:* `standalone.html` concatenates the modules into one plain script, and
  an import cycle back into the renderer would break that bundle.

- Every colour, size, distance and animation speed is a named constant in the
  module that uses it; `tools/check-constants.mjs` proves each name resolves.
  *Why:* the value and its reason sit together, and a half-applied rename would
  only crash in the browser, where no node test can see it.

- The renderer never mutates the world. It only reads `world`, `player` and
  `enemies` and turns them into triangles.
  *Why:* state changes stay in `physics.js`, so rendering can change without
  affecting gameplay and the tests stay meaningful.

- Detail patterns (bricks, windows, grass) are computed from `hash(a, b)`
  instead of being stored in the world data.
  *Why:* it keeps the world small and deterministic, and the detail is always
  reproducible from the same coordinates.

- The world is generated in chunks as the player moves, never all at once.
  *Why:* the level is endless; generating it up front would grow unbounded.

- A `standalone.html` build is produced by `tools/build-standalone.mjs`.
  *Why:* Chrome refuses to load ES modules from a `file://` URL, so the game
  can only be opened by double-click if the modules are inlined.

See also: [background-parallax.md](background-parallax.md),
[visual-style.md](visual-style.md), [world-generation.md](world-generation.md).
