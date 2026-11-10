// Purpose: Generate the jump-and-run world procedurally in chunks (platforms,
// patrolling enemies, scenery and a parallax city skyline) so the level grows
// endlessly to the right and is reproducible from one seed.
// Every generation value is a named constant here; the reason for each value is
// written down in agent-memory/design-guidelines/world-generation.md.
// Pure data in, data out, so the generator is testable without a browser.

import { makeRng, range, int, pick, clamp } from "./prng.js";

// Shape of the level. Tests import the first three.
export const MIN_PLATFORM_WIDTH = 3.2;
export const MAX_GAP = 3.4; // gap before a flat step or a drop
export const START_TOP = 2; // walkable surface of the first platform
const MAX_PLATFORM_WIDTH = 9;
const MIN_GAP = 1.2;
const MAX_GAP_BEFORE_CLIMB = 2.4; // climbing is harder than jumping across
const MIN_TOP = -6; // clamped so the level never drifts out of view
const MAX_TOP = 18;
const RISE_CHANCE = 0.45; // most steps go up, drops are the exception
const MAX_RISE = 2; // a small upward step is always reachable
const MAX_DROP = 3; // a bigger drop gives the player room to fall
const GROUND_CHANCE = 0.55; // ground is the dominant kind
const GROUND_HEIGHT = 3; // thick, green, walkable
const FLOAT_HEIGHT = 1; // thin, warm planks, reads as a light platform

// The first chunk is placed by hand: a wide safe strip to land on and a tall
// pillar on the left edge that stops the player from running into the void.
const SAFE_STRIP_X = -2;
const SAFE_STRIP_WIDTH = 12;
const SAFE_STRIP_HEIGHT = 2;
const LEFT_PILLAR = { x: -3.5, top: 12, w: 1.5, h: 20 };
const SPAWN_X = 2;
const START_FRONTIER_X = 10; // first platform that is generated, not placed
const INITIAL_WORLD_X = 120; // how much of the level exists from the start

// Scenery. Bushes are listed twice so greenery is the dominant impression.
const DECOR_TYPES = ["bush", "bush", "tree", "flower", "rock", "lamp"];
const DECOR_SIZES = [0.6, 0.9, 1.2];
const DECOR_EDGE_MARGIN = 0.3;
const EXTRA_DECOR_CHANCE = 0.35; // a second prop on the same platform
const DECOR_HEIGHT_FACTORS = { tree: 2.2, lamp: 2.4, bush: 1.2 };

// Enemies. A patrolling enemy needs room, otherwise it always stands in a
// corner and cannot be passed fairly.
const ENEMY_MIN_WIDTH = 4.5;
const ENEMY_CHANCE = 0.5;
const ENEMY_EDGE_MARGIN = 0.4;
const ENEMY_SIZE = 1.2;
const ENEMY_SPEED_MIN = 1.2;
const ENEMY_SPEED_MAX = 3.0;

// Background hills, seen between the city layers.
const HILL_CHANCE = 0.4;
const HILL_BACK = [2, 8]; // hills sit behind the platform they belong to
const HILL_BASE_DROP = 10; // their base stays below the platform top
const HILL_WIDTH = [10, 26];
const HILL_HEIGHT = [5, 12];

// Background city: layer 0 is the far skyline (generated almost every chunk so
// it reads as one continuous city), layer 1 is the nearer and sparser one.
const CITY_LAYERS = [
  { layer: 0, chance: 0.9, back: [2, 14], baseDrop: 12, width: [5, 16], height: [6, 20] },
  { layer: 1, chance: 0.6, back: [1, 9], baseDrop: 8, width: [4, 11], height: [3, 12] },
];

// Falling out of the level must end the run, but the line has to follow the
// generated world so a deep chunk is not instantly lethal.
const DEATH_DROP = 12;

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
    buildings: [],
    nextX: 0, // right frontier of the generated level
    top: START_TOP, // surface height of the last platform
    lowestTop: START_TOP, // deepest surface seen so far
    spawn: { x: SPAWN_X, y: START_TOP },
  };

  addPlatform(world, SAFE_STRIP_X, START_TOP, SAFE_STRIP_WIDTH, SAFE_STRIP_HEIGHT, "ground");
  addPlatform(world, LEFT_PILLAR.x, LEFT_PILLAR.top, LEFT_PILLAR.w, LEFT_PILLAR.h, "wall");
  world.nextX = START_FRONTIER_X;
  ensureWorld(world, INITIAL_WORLD_X);
  return world;
}

/** Generate chunks until the world covers everything left of `upToX`. */
export function ensureWorld(world, upToX) {
  while (world.nextX < upToX) generateChunk(world);
}

/**
 * Add one platform at the right frontier of the world, plus optional
 * decoration, an enemy, a background hill and city buildings.
 * The order of the random rolls is fixed: the seed must always build the same
 * level, so a value may never be rolled conditionally unless the skip is part
 * of the design (see the enemy check below).
 */
function generateChunk(world) {
  const rng = world.rng;

  // Height change: mostly a small step up, otherwise a bigger drop.
  const delta = rng() < RISE_CHANCE ? int(rng, 0, MAX_RISE) : -int(rng, 0, MAX_DROP);
  const gap = range(rng, MIN_GAP, delta > 0 ? MAX_GAP_BEFORE_CLIMB : MAX_GAP);
  const x = world.nextX + gap;
  const top = clamp(world.top + delta, MIN_TOP, MAX_TOP);
  const w = range(rng, MIN_PLATFORM_WIDTH, MAX_PLATFORM_WIDTH);
  const kind = rng() < GROUND_CHANCE ? "ground" : "float";
  const h = kind === "ground" ? GROUND_HEIGHT : FLOAT_HEIGHT;

  const plat = addPlatform(world, x, top, w, h, kind);
  world.top = top;
  world.lowestTop = Math.min(world.lowestTop, top);
  world.nextX = x + w;

  addDecor(world, plat);
  if (rng() < EXTRA_DECOR_CHANCE) addDecor(world, plat);

  if (w >= ENEMY_MIN_WIDTH && rng() < ENEMY_CHANCE) addEnemy(world, plat);

  if (rng() < HILL_CHANCE) addHill(world, x, top);

  addCity(world, x, top);
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

/** Add scenery (bush, tree, flower, rock or street lamp) sitting on a platform. */
function addDecor(world, plat) {
  const rng = world.rng;
  const type = pick(rng, DECOR_TYPES);
  const size = pick(rng, DECOR_SIZES);
  const h = size * (DECOR_HEIGHT_FACTORS[type] ?? 1);

  world.decor.push({
    type,
    x: plat.x + range(rng, DECOR_EDGE_MARGIN, Math.max(DECOR_EDGE_MARGIN, plat.w - size - DECOR_EDGE_MARGIN)),
    y: plat.top,
    w: size,
    h,
  });
}

/** Add an enemy that patrols back and forth on a platform. */
function addEnemy(world, plat) {
  const rng = world.rng;
  const left = plat.x + ENEMY_EDGE_MARGIN;
  const right = plat.x + plat.w - ENEMY_EDGE_MARGIN - ENEMY_SIZE;
  if (right <= left) return;

  world.enemies.push({
    x: range(rng, left, right),
    y: plat.top,
    w: ENEMY_SIZE,
    h: ENEMY_SIZE,
    left,
    right,
    dir: rng() < 0.5 ? -1 : 1,
    speed: range(rng, ENEMY_SPEED_MIN, ENEMY_SPEED_MAX),
    alive: true,
    squash: 0,
  });
}

/** Add a background hill behind the platform that was just generated. */
function addHill(world, x, top) {
  const rng = world.rng;
  world.hills.push({
    x: x - range(rng, ...HILL_BACK),
    y: top - HILL_BASE_DROP,
    w: range(rng, ...HILL_WIDTH),
    h: range(rng, ...HILL_HEIGHT),
  });
}

/**
 * Add city buildings for the parallax background, one roll per layer.
 * The ids are numbered from the first building of this chunk so the window
 * pattern of a tower stays stable for the seed.
 */
function addCity(world, x, top) {
  const rng = world.rng;
  const firstId = world.buildings.length;

  for (const [index, layer] of CITY_LAYERS.entries()) {
    if (rng() >= layer.chance) continue;

    world.buildings.push({
      layer: layer.layer,
      id: firstId + index,
      x: x - range(rng, ...layer.back),
      y: top - layer.baseDrop,
      w: range(rng, ...layer.width),
      h: range(rng, ...layer.height),
    });
  }
}

/** Y below which the player falls to their death. */
export function deathY(world) {
  return world.lowestTop - DEATH_DROP;
}
