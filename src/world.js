// Purpose: Generate the jump-and-run world procedurally in chunks (platforms,
// patrolling enemies, scenery, background hills) so the level grows endlessly
// to the right and is reproducible from a seed.

import { makeRng, range, int, pick, clamp } from "./prng.js";

export const MIN_PLATFORM_WIDTH = 3.2;
export const MAX_GAP = 3.4;
export const START_TOP = 2;

/**
 * Create a new world for a seed.
 * Always starts with a safe ground strip and a wall on the left edge.
 */
export function createWorld(seed) {
  const world = {
    seed: seed >>> 0,
    rng: makeRng(seed),
    platforms: [],
    enemies: [],
    decor: [],
    hills: [],
    nextX: 0,
    top: START_TOP,
    lowestTop: START_TOP,
    spawn: { x: 2, y: START_TOP },
  };

  addPlatform(world, -2, START_TOP, 12, 2, "ground");
  addPlatform(world, -3.5, 12, 1.5, 20, "wall"); // tall pillar, no escape to the left
  world.nextX = 10;
  ensureWorld(world, 120);
  return world;
}

/** Generate chunks until the world covers everything left of `upToX`. */
export function ensureWorld(world, upToX) {
  while (world.nextX < upToX) generateChunk(world);
}

/**
 * Add one platform at the right frontier of the world, plus optional
 * decoration, an enemy and a background hill.
 */
function generateChunk(world) {
  const rng = world.rng;
  // A climb must be reachable, so a rise gets a shorter gap than a flat step
  // or a drop.
  const delta = rng() < 0.45 ? int(rng, 0, 2) : -int(rng, 0, 3);
  const maxGap = delta > 0 ? 2.4 : MAX_GAP;
  const gap = range(rng, 1.2, maxGap);
  const x = world.nextX + gap;

  // Height change: mostly small steps, sometimes a bigger drop.
  const top = clamp(world.top + delta, -6, 18);
  const w = range(rng, MIN_PLATFORM_WIDTH, 9);
  const kind = rng() < 0.55 ? "ground" : "float";
  const h = kind === "ground" ? 3 : 1;

  const plat = addPlatform(world, x, top, w, h, kind);
  world.top = top;
  world.lowestTop = Math.min(world.lowestTop, top);
  world.nextX = x + w;

  if (rng() < 0.55) addDecor(world, plat);
  if (w >= 4.5 && rng() < 0.5) addEnemy(world, plat);
  if (rng() < 0.4) {
    world.hills.push({
      x: x - range(rng, 2, 8),
      y: top - 10,
      w: range(rng, 10, 26),
      h: range(rng, 5, 12),
    });
  }
}

/**
 * Add a platform box. `top` is the walkable surface height.
 * Returns the created platform object.
 */
function addPlatform(world, x, top, w, h, kind) {
  const plat = { x, y: top - h, w, h, top, kind };
  world.platforms.push(plat);
  return plat;
}

/** Add scenery (bush, rock, flower) sitting on a platform. */
function addDecor(world, plat) {
  const rng = world.rng;
  const type = pick(rng, ["bush", "rock", "flower", "tree"]);
  const size = pick(rng, [0.6, 0.9, 1.2]);
  world.decor.push({
    type,
    x: plat.x + range(rng, 0.3, Math.max(0.3, plat.w - size - 0.3)),
    y: plat.top,
    w: size,
    h: type === "tree" ? size * 2.2 : size,
  });
}

/** Add an enemy that patrols back and forth on a platform. */
function addEnemy(world, plat) {
  const rng = world.rng;
  const margin = 0.4;
  const w = 1.2;
  const left = plat.x + margin;
  const right = plat.x + plat.w - margin - w;
  if (right <= left) return;

  world.enemies.push({
    x: range(rng, left, right),
    y: plat.top,
    w,
    h: 1.2,
    left,
    right,
    dir: rng() < 0.5 ? -1 : 1,
    speed: range(rng, 1.2, 3.0),
    alive: true,
    squash: 0,
  });
}

/** Y below which the player falls to their death. */
export function deathY(world) {
  return world.lowestTop - 12;
}
