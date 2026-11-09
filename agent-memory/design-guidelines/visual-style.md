# Visual style

Decisions about the look of the game, with the reason for each.

- Everything is built from flat axis-aligned rectangles, no sprites, no image
  files, no shaders beyond a solid colour.
  *Why:* the renderer needs no asset pipeline and stays readable; the shape of
  an object is enough to recognise it at a glance.

- Depth is expressed by value, not by blur: distant buildings are lighter and
  hazier (`0.24, 0.31, 0.4`), the near layer is darker (`0.16, 0.21, 0.29`).
  *Why:* lighter objects read as farther away, which makes the parallax layers
  legible without any texture.

- Each object is drawn with a body colour and a slightly lighter top edge.
  *Why:* a two-tone box looks like a lit solid much cheaper than a gradient.

- Walkable ground gets grass blades, brick mortar lines and occasional flowers;
  floating platforms use a warm plank colour.
  *Why:* the player must instantly see which surfaces are part of the level and
  which are background.

- Background buildings always extend below the bottom of the screen. The ground
  line of a background layer is computed with `belowBottom(cam, view)`, and the
  tower is drawn from that line up to its real top.
  *Why:* a building whose base ends inside the view looks like a floating
  rectangle. Anchoring the base below the visible area keeps the skyline
  continuous while the tops still show the parallax motion.

- Windows, bushes and other tiny details are drawn only after the main body.
  *Why:* drawing order gives the detail its shading for free, and the view test
  in `rect()` drops anything outside the screen.

- Stars, the moon and the clouds are fixed in clip space and never move with the
  camera; clouds drift slowly with the frame time.
  *Why:* a sky that does not move at all reads as infinitely far away.

See also: [background-parallax.md](background-parallax.md).
