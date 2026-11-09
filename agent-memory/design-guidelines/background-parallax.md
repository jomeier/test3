# Background and parallax

Decisions about the city skyline behind the level, with the reason for each.

- The background has three layers: sky (fixed), far skyline + hills (factor
  0.22 / 0.12), near skyline (factor 0.48 / 0.28), then the playable level.
  *Why:* the smaller the factor, the slower a layer moves, so the eye reads the
  order as distance. Two city layers are enough to feel like depth without
  hiding the level.

- A layer is moved by scaling the camera, not by scaling the world data.
  *Why:* `rect(x, y, w, h, color, cam, view)` already converts world
  coordinates to clip space; passing a scaled camera is one line and needs no
  separate coordinate system.

- The vertical parallax is smaller than the horizontal one (0.12 and 0.28).
  *Why:* the player mostly runs sideways. Strong vertical shifts would make the
  buildings slide up and down and distract from the platforms.

- The base of every background building and hill is `belowBottom(cam, view)`,
  which is the bottom edge of the current view minus a 40 unit margin.
  *Why:* the towers must run off the screen. If the base comes from the world
  data (`b.y`), the building ends in mid-air and looks cut off. Recomputing the
  base from the camera keeps the ground line off-screen for every camera
  position and for every layer.

- Window rows are counted from the roof downwards.
  *Why:* the roof is the only fixed reference of a tower; anchoring the windows
  to the top keeps them tidy even when the drawn height grows.

- Buildings in the far layer are generated more often than in the near layer
  (0.9 versus 0.6 per chunk) and are placed farther to the left.
  *Why:* the far layer should look like a continuous city, while the near layer
  stays sparse so the level remains readable.

- The skyline is generated with the same seeded RNG as the platforms.
  *Why:* the whole world, including the background, must be reproducible from
  one seed.

See also: [world-generation.md](world-generation.md),
[visual-style.md](visual-style.md).
