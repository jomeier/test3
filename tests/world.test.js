// Purpose: Test the procedural world generator (determinism, shapes, enemies).

import test from "node:test";
import assert from "node:assert";

import { createWorld, ensureWorld, deathY, MIN_PLATFORM_WIDTH } from "../src/world.js";

test("the same seed always produces the same world", () => {
  const a = createWorld(42);
  const b = createWorld(42);
  assert.deepStrictEqual(a.platforms.map((p) => [p.x, p.top, p.w]), b.platforms.map((p) => [p.x, p.top, p.w]));
  assert.strictEqual(a.enemies.length, b.enemies.length);
});

test("different seeds produce different worlds", () => {
  const a = createWorld(1);
  const b = createWorld(2);
  assert.notDeepStrictEqual(a.platforms.map((p) => p.x), b.platforms.map((p) => p.x));
});

test("platforms have a sane width and never overlap", () => {
  const world = createWorld(7);
  for (const plat of world.platforms) {
    // The starting wall is a narrow pillar, all real platforms must be wide.
    if (plat.kind !== "wall") {
      assert.ok(plat.w >= MIN_PLATFORM_WIDTH, "platform too narrow: " + plat.w);
    }
    assert.ok(plat.top >= -6 && plat.top <= 18, "platform outside the height range");
  }

  const sorted = [...world.platforms].sort((p1, p2) => p1.x - p2.x);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    assert.ok(cur.x >= prev.x + prev.w - 1e-6, "overlapping platforms at x=" + cur.x);
  }
});

test("generated platforms leave a jumpable gap", () => {
  const world = createWorld(99);
  const generated = world.platforms.slice(2);
  const sorted = [...generated].sort((p1, p2) => p1.x - p2.x);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.x - (prev.x + prev.w);
    assert.ok(gap >= 1.0 && gap <= 4.0, "unfair gap of " + gap);
    if (cur.top > prev.top) {
      assert.ok(gap <= 2.5, "climb of " + (cur.top - prev.top) + " with a gap of " + gap + " is not jumpable");
    }
  }
});

test("enemies patrol inside the bounds of their platform", () => {
  const world = createWorld(123);
  for (const e of world.enemies) {
    const plat = world.platforms.find((p) => p.top === e.y && e.x >= p.x - 1e-6 && e.x + e.w <= p.x + p.w + 1e-6);
    assert.ok(plat, "enemy is not standing on a platform");
    assert.ok(e.left >= plat.x && e.right + e.w <= plat.x + plat.w, "patrol range outside platform");
    assert.ok(e.right > e.left, "patrol range is empty");
    assert.ok(e.speed > 0 && e.speed < 4, "enemy speed out of range");
  }
});

test("ensureWorld extends the level on demand", () => {
  const world = createWorld(5);
  const before = world.platforms.length;
  ensureWorld(world, 600);
  assert.ok(world.platforms.length > before, "world did not grow");
  assert.ok(world.nextX >= 600, "world frontier did not advance");
});

test("the death floor is below every platform", () => {
  const world = createWorld(31);
  const lowest = Math.min(...world.platforms.map((p) => p.top));
  assert.ok(deathY(world) < lowest);
});
