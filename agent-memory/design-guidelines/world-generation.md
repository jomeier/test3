# World generation

Decisions about how the level is built, with the reason for each.

- Generation is chunk based and driven by a seed passed to `createWorld`.
  *Why:* the level is endless, and a seed makes a run reproducible and shareable
  (`?seed=1234`).

- Chunks are only generated when the camera needs them (`ensureWorld(world, x)`).
  *Why:* generating ahead of the player wastes memory and makes the first frame
  slow.

- The height change per platform is `+0..2` with 45 % probability, otherwise a
  drop of `0..3`, clamped to `[-6, 18]`.
  *Why:* small upward steps keep the level varied, larger drops give the player
  room to fall, and the clamp stops the level from drifting out of view.

- The gap before a climb is capped at 2.4, the gap before a flat step or a drop
  at 3.4 (`MAX_GAP`).
  *Why:* jumping upward is harder than jumping across, so a reachable level
  needs shorter gaps when the next platform is higher.

- Platforms are either `ground` (height 3, green, grass on top) or `float`
  (height 1, warm planks), with 55 % ground.
  *Why:* the two kinds are distinguishable by colour and thickness, which tells
  the player at a glance what is solid.

- A world starts with a 12 unit safe strip and a tall pillar on the left edge.
  *Why:* the player needs a place to land, and the pillar prevents running off
  to the left into the void.

- Enemies are placed only on platforms at least 4.5 units wide, with a 0.4 unit
  margin from both edges.
  *Why:* a patrolling enemy needs room; on a narrow platform it would spend the
  whole time in a corner and be impossible to pass fairly.

- Scenery picks from `["bush", "bush", "tree", "flower", "rock", "lamp"]`.
  *Why:* listing the bush twice makes greenery the dominant impression, which is
  what the user asked for, without hiding the other props.

- Scenery is decoration only: it is never part of the collision test.
  *Why:* the player should not lose a run on an invisible detail. Objects that
  matter for physics are platforms and enemies.

- `deathY(world)` is 12 units below the lowest platform top seen so far.
  *Why:* falling out of the level has to end the run, but the number has to
  follow the generated world so a deep chunk is not instantly lethal.

See also: [architecture.md](architecture.md),
[background-parallax.md](background-parallax.md).
