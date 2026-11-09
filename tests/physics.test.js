// Purpose: Test the physics: gravity, jumping, platform collision and enemies.

import test from "node:test";
import assert from "node:assert";

import {
  createPlayer,
  stepPlayer,
  stepEnemy,
  playerEnemyCollision,
  intersects,
  GRAVITY,
  JUMP_VELOCITY,
  RUN_SPEED,
} from "../src/physics.js";

/** One platform used by most physics tests. */
function ground(top = 2, w = 10) {
  return { x: 0, y: top - 3, w, h: 3, top, kind: "ground" };
}

/** Run n physics steps with a fixed dt. */
function run(p, platforms, dt, input, n) {
  for (let i = 0; i < n; i++) stepPlayer(p, platforms, dt, input);
  return p;
}

test("gravity pulls a falling player down", () => {
  const p = createPlayer(5, 10);
  run(p, [], 1 / 60, {}, 60);
  assert.ok(p.vy < 0, "player should be falling");
  assert.ok(p.vy > -GRAVITY, "fall speed should still be under the terminal velocity");
  assert.ok(p.y < 10, "player lost height");
});

test("a falling player lands on a platform instead of passing through", () => {
  const plat = ground(2);
  const p = createPlayer(5, 12);
  run(p, [plat], 1 / 60, {}, 120);
  assert.strictEqual(p.y, plat.top, "player must rest exactly on the platform top");
  assert.strictEqual(p.vy, 0, "vertical velocity must be zero after landing");
  assert.ok(p.onGround, "player should be reported as on the ground");
});

test("fast falling does not tunnel through a thin platform", () => {
  const plat = { x: 0, y: 9.9, w: 6, h: 1, top: 10.9, kind: "float" };
  const p = createPlayer(3, 20);
  p.vy = -28;
  run(p, [plat], 1 / 60, {}, 60);
  assert.strictEqual(p.y, plat.top, "player tunneled through the platform");
  assert.ok(p.onGround, "player should land on the thin platform");
});

test("jumping gains height and can clear a gap", () => {
  const left = { x: 0, y: 0, w: 6, h: 2, top: 2, kind: "ground" };
  const right = { x: 9.4, y: 0, w: 12, h: 2, top: 2, kind: "ground" };
  const p = createPlayer(4, 2);
  run(p, [left, right], 1 / 60, {}, 30); // settle on the left platform
  p.vx = RUN_SPEED; // a running start, as a real player would have

  const startX = p.x;
  run(p, [left, right], 1 / 60, { jump: true, right: true }, 1);
  assert.ok(p.vy > 0, "jump must push the player upwards");

  // Hold the jump key through the ascent, as a real held jump does.
  for (let i = 0; i < 90; i++) stepPlayer(p, [left, right], 1 / 60, { jump: i < 20, right: true });
  assert.ok(p.x > right.x, "player did not cross the gap: x=" + p.x);
  assert.ok(p.x - startX > 3, "player barely moved");
  assert.ok(p.y >= right.top - 1e-6, "player fell into the gap");
  assert.ok(p.onGround, "player should land on the far platform");
});

test("release of the jump key shortens the jump", () => {
  const plat = ground(2);
  const p = createPlayer(3, 2);
  run(p, [plat], 1 / 60, {}, 10);

  run(p, [plat], 1 / 60, { jump: true }, 1);
  const full = createPlayer(3, 2);
  run(full, [plat], 1 / 60, {}, 10);
  run(full, [plat], 1 / 60, { jump: true }, 40);

  const short = createPlayer(3, 2);
  run(short, [plat], 1 / 60, {}, 10);
  run(short, [plat], 1 / 60, { jump: true }, 1);
  run(short, [plat], 1 / 60, {}, 40);

  assert.ok(short.y < full.y, "short tap should not jump as high as a held jump");
  assert.ok(full.vy <= JUMP_VELOCITY, "jump velocity must not exceed the jump impulse");
  assert.ok(RUN_SPEED > 0, "run speed must be defined");
});

test("the head bumps against a platform above", () => {
  const floor = { x: 0, y: 0, w: 8, h: 2, top: 2, kind: "ground" };
  const ceiling = { x: 0, y: 4, w: 8, h: 1, top: 5, kind: "float" };
  const p = createPlayer(3, 2);
  run(p, [floor, ceiling], 1 / 60, { jump: true }, 90);
  assert.ok(p.y + p.h <= ceiling.y + 1e-6, "player passed through the ceiling");
  assert.ok(p.vy <= 0, "player must not keep moving upwards after the bump");
});

test("running is blocked by the side of a platform", () => {
  const floor = { x: -6, y: 0, w: 6, h: 2, top: 2, kind: "ground" };
  const wall = { x: 0, y: 0, w: 2, h: 8, top: 8, kind: "wall" };
  const p = createPlayer(-3, 2);
  run(p, [floor, wall], 1 / 60, { right: true }, 120);
  assert.ok(p.x + p.w <= wall.x + 1e-6, "player walked into the wall");
});

test("enemies turn around at the edges of their patrol range", () => {
  const e = { x: 4, y: 2, w: 1.2, h: 1.2, left: 1, right: 8, dir: 1, speed: 3, alive: true, squash: 0 };
  let sawLeftTurn = false;
  let sawRightTurn = false;

  for (let i = 0; i < 600; i++) {
    stepEnemy(e, 1 / 60);
    if (e.dir === -1) sawLeftTurn = true;
    if (e.dir === 1) sawRightTurn = true;
    assert.ok(e.x >= e.left - 1e-6 && e.x <= e.right + 1e-6, "enemy left its platform");
  }

  assert.ok(sawLeftTurn && sawRightTurn, "enemy never changed direction");
});

test("landing on an enemy stomps it, side contact is a hit", () => {
  const enemy = { x: 5, y: 2, w: 1.2, h: 1.2, left: 5, right: 5, dir: 1, speed: 0, alive: true, squash: 0 };
  const plat = ground(2);

  const stompPlayer = createPlayer(5.6, 3.1); // feet just inside the enemy box
  stompPlayer.vy = -5;
  const result = playerEnemyCollision(stompPlayer, [enemy]);
  assert.strictEqual(result, "stomp", "falling onto an enemy must stomp it");
  assert.strictEqual(enemy.alive, false, "stomped enemy must be dead");
  assert.ok(stompPlayer.vy > 0, "stomp should bounce the player upwards");

  const sidePlayer = createPlayer(4.2, 2.2);
  const aliveEnemy = { x: 5, y: 2, w: 1.2, h: 1.2, left: 5, right: 5, dir: 1, speed: 1, alive: true, squash: 0 };
  assert.strictEqual(playerEnemyCollision(sidePlayer, [aliveEnemy]), "hit", "side contact must be a hit");
  assert.ok(intersects(sidePlayer, aliveEnemy), "test setup must actually overlap");
  void plat;
});

test("dead enemies do not move and do not cause hits", () => {
  const dead = { x: 5, y: 2, w: 1.2, h: 1.2, left: 5, right: 5, dir: 1, speed: 2, alive: false, squash: 0 };
  const p = createPlayer(5.2, 2.2);
  stepEnemy(dead, 1 / 60);
  assert.strictEqual(dead.x, 5, "dead enemy must not move");
  assert.strictEqual(playerEnemyCollision(p, [dead]), null, "dead enemy must not hit the player");
});
