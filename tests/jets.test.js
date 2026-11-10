// Purpose: Test the jet fighters and their bombs: the spawn rhythm, the drop
// above the player, the 1.5 second warning, the explosion on solid ground and
// the damage radius of the blast.

import test from "node:test";
import assert from "node:assert";

import { createWorld } from "../src/world.js";
import { createPlayer } from "../src/physics.js";
import {
  createThreats,
  stepThreats,
  surfaceBelow,
  explode,
  BOMB_WARNING,
  BLAST_RADIUS,
  BLAST_DURATION,
  FIRST_JET,
  JET_MIN_GAP,
  JET_MAX_GAP,
  JET_HEIGHT,
  JET_SPAWN_DISTANCE,
} from "../src/jets.js";

const DT = 1 / 120; // same fixed sub-step the game loop uses

/** Simple flat world with one wide platform, so the tests are predictable. */
function flatWorld(top = 0) {
  return {
    platforms: [{ x: -20, y: top - 3, w: 60, h: 3, top, kind: "ground" }],
    enemies: [],
    decor: [],
    buildings: [],
    hills: [],
    lowestTop: top,
  };
}

/** Add an enemy standing on a platform so blast damage can be measured. */
function addEnemy(world, x, top) {
  world.enemies.push({ x, y: top, w: 1.2, h: 1.2, left: x - 1, right: x + 1, dir: 1, speed: 1, alive: true, squash: 0 });
}

/**
 * Run the threats for `seconds` seconds and return the summed events plus the
 * list of spawn times, drop times and explosion times.
 */
function simulate(threats, world, player, seconds) {
  const marks = { spawns: [], drops: [], blasts: [], blastPoints: [], bombIds: [] };
  let events = { jets: 0, dropped: 0, exploded: 0, hits: 0, kills: 0 };
  let t = 0;

  while (t < seconds - 1e-9) {
    const e = stepThreats(threats, world, player, DT, t);
    if (e.jetSpawned) {
      events.jets += 1;
      marks.spawns.push(t);
    }
    if (e.bombDropped) {
      events.dropped += 1;
      marks.drops.push(t);
      // The bomb that was just released is the last entry in the list.
      marks.bombIds.push(threats.bombs[threats.bombs.length - 1].id);
    }
    if (e.exploded) {
      events.exploded += e.exploded;
      marks.blasts.push(t);
      const blast = threats.blasts[threats.blasts.length - 1];
      if (blast) marks.blastPoints.push({ x: blast.x, y: blast.y });
    }
    if (e.playerHit) events.hits += 1;
    events.kills += e.enemiesKilled;
    t += DT;
  }

  return { events, marks, time: t };
}

test("no jet appears before the first one is scheduled", () => {
  const world = flatWorld();
  const player = createPlayer(0, 0);
  const threats = createThreats(7);

  const { events } = simulate(threats, world, player, FIRST_JET - 0.5);
  assert.strictEqual(events.jets, 0, "jets must not spawn before FIRST_JET seconds");
  assert.strictEqual(threats.bombs.length, 0, "nothing can drop a bomb before a jet exists");
});

test("jets cross the sky every few seconds", () => {
  const world = flatWorld();
  const player = createPlayer(0, 0);
  const threats = createThreats(7);

  const { marks } = simulate(threats, world, player, 40);
  assert.ok(marks.spawns.length >= 4, "several jets must appear in 40 seconds");

  for (let i = 1; i < marks.spawns.length; i++) {
    const gap = marks.spawns[i] - marks.spawns[i - 1];
    assert.ok(gap >= JET_MIN_GAP - 0.05, `gap ${gap} is shorter than JET_MIN_GAP`);
    assert.ok(gap <= JET_MAX_GAP + 0.05, `gap ${gap} is longer than JET_MAX_GAP`);
  }
});

test("jets come from both sides", () => {
  const world = flatWorld();
  const player = createPlayer(0, 0);
  const threats = createThreats(42);
  const dirs = new Set();

  for (let i = 0; i < 12; i++) {
    const before = threats.jets.length;
    stepThreats(threats, world, player, DT, i * 6 + 4);
    if (threats.jets.length > before) dirs.add(threats.jets[threats.jets.length - 1].dir);
    // Keep the list short so old jets do not hide the new one.
    threats.jets = threats.jets.filter((jet) => Math.abs(jet.x - player.x) < 45);
  }

  assert.ok(dirs.has(1) && dirs.has(-1), "jets must fly left to right and right to left");
});

test("a jet flies at a fixed height above the player and enters off screen", () => {
  const world = flatWorld();
  const player = createPlayer(0, 0);
  const threats = createThreats(3);

  // Only a few frames after the spawn the jet has barely moved.
  simulate(threats, world, player, FIRST_JET + 0.05);
  const jet = threats.jets[0];
  assert.ok(jet, "the first jet must exist");
  assert.strictEqual(jet.y, player.y + JET_HEIGHT, "the jet flies JET_HEIGHT above the player");
  assert.ok(Math.abs(jet.x - player.x) >= JET_SPAWN_DISTANCE - 2, "the jet enters outside the view");
  assert.ok(jet.speed >= 13 && jet.speed <= 18, "jet speed is in the documented range");
});

test("the bomb reaches the ground exactly BOMB_WARNING seconds after the drop", () => {
  const world = flatWorld(0);
  const player = createPlayer(0, 0);
  const threats = createThreats(11);

  const { marks } = simulate(threats, world, player, 12);
  assert.ok(marks.drops.length > 0, "a bomb must be dropped");
  assert.ok(marks.blasts.length > 0, "the bomb must explode on the ground");

  const delay = marks.blasts[0] - marks.drops[0];
  assert.ok(Math.abs(delay - BOMB_WARNING) < 0.02, `impact took ${delay}s, expected ~${BOMB_WARNING}s`);
  assert.ok(
    Math.abs(threats.lastWarningDelay - BOMB_WARNING) < 0.02,
    "the threats state records the same warning delay the simulation measured"
  );
});

test("the bomb explodes on the highest solid surface below it", () => {
  const world = {
    platforms: [
      { x: -5, y: -6, w: 10, h: 3, top: 0, kind: "ground" },
      { x: 2, y: 2, w: 4, h: 1, top: 3, kind: "float" },
    ],
    enemies: [],
    decor: [],
    buildings: [],
    hills: [],
    lowestTop: 0,
  };

  assert.strictEqual(surfaceBelow(world, 3, 10), 3, "the higher platform is the surface the bomb hits");
  assert.strictEqual(surfaceBelow(world, -4, 10), 0, "the lower platform is used where nothing is above it");
  assert.strictEqual(surfaceBelow(world, 20, 10), null, "there is no ground outside the platforms");

  const player = createPlayer(3, 3);
  const threats = createThreats(5);
  const { marks } = simulate(threats, world, player, 12);

  assert.ok(marks.blastPoints.length > 0, "the explosion must be recorded");
  assert.ok(marks.blastPoints.every((blast) => blast.y === 3), "the fireball starts at the surface the bomb hit");
});

test("a bomb that finds no ground falls into the void without exploding", () => {
  const world = { platforms: [], enemies: [], decor: [], buildings: [], hills: [], lowestTop: 0 };
  const player = createPlayer(0, 0);
  const threats = createThreats(9);

  const { events } = simulate(threats, world, player, 15);
  assert.ok(events.dropped > 0, "the jet still drops a bomb");
  assert.strictEqual(events.exploded, 0, "a bomb in the void never detonates");
  assert.strictEqual(threats.blasts.length, 0, "no fireball is created in the void");
  assert.strictEqual(threats.bombs.length, 0, "the bomb is removed after falling out of the world");
});

test("the blast damages everything inside the radius and nothing outside", () => {
  const world = flatWorld(0);
  addEnemy(world, 2, 0); // 2 units away -> killed
  addEnemy(world, BLAST_RADIUS + 1, 0); // outside the radius -> survives
  const player = createPlayer(1, 0);
  const threats = createThreats(1);
  const events = { jetSpawned: false, bombDropped: false, exploded: 0, playerHit: false, enemiesKilled: 0 };

  explode(threats, world, player, { x: 0, y: 0, targetY: 0 }, 10, events);

  assert.ok(events.playerHit, "a player inside the blast radius is hit");
  assert.strictEqual(events.exploded, 1, "one explosion is created");
  assert.strictEqual(events.enemiesKilled, 1, "only the enemy inside the radius dies");
  assert.ok(world.enemies[0].alive === false && world.enemies[1].alive === true);
  assert.ok(threats.blasts.length === 1, "the fireball is stored for the renderer");
});

test("a player who ran away is not hit by the explosion", () => {
  const world = flatWorld(0);
  const player = createPlayer(BLAST_RADIUS + 2, 0);
  const threats = createThreats(2);
  const events = { jetSpawned: false, bombDropped: false, exploded: 0, playerHit: false, enemiesKilled: 0 };

  explode(threats, world, player, { x: 0, y: 0, targetY: 0 }, 10, events);
  assert.strictEqual(events.playerHit, false, "standing outside the radius is safe");
});

test("the fireball fades out after BLAST_DURATION seconds", () => {
  const world = flatWorld(0);
  const player = createPlayer(10, 0);
  const threats = createThreats(1);
  const events = { jetSpawned: false, bombDropped: false, exploded: 0, playerHit: false, enemiesKilled: 0 };

  explode(threats, world, player, { x: 0, y: 0, targetY: 0 }, 10, events);
  stepThreats(threats, world, player, DT, 10 + BLAST_DURATION - 0.01);
  assert.strictEqual(threats.blasts.length, 1, "the blast is still visible before it ends");
  stepThreats(threats, world, player, DT, 10 + BLAST_DURATION + 0.01);
  assert.strictEqual(threats.blasts.length, 0, "the blast is removed once it is over");
});

test("a jet drops exactly one bomb", () => {
  const world = createWorld(77);
  const player = createPlayer(world.spawn.x, world.spawn.y);
  const threats = createThreats(77);

  const { marks } = simulate(threats, world, player, 30);
  const ids = new Set(marks.bombIds);
  assert.strictEqual(ids.size, marks.drops.length, "no jet may drop a second bomb");

  // Every jet that had at least two seconds to cross the player must have dropped.
  const passed = marks.spawns.filter((spawn) => spawn < 28);
  assert.strictEqual(marks.drops.length, passed.length, "each jet that flew over the player dropped one bomb");
});
