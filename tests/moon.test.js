// Purpose: Test the moon arc maths: where the moon is at each point of its
// rise, hold and set cycle, and that the cycle repeats.

import test from "node:test";
import assert from "node:assert";

import {
  moonPosition,
  moonTint,
  MOON_RISE,
  MOON_HOLD,
  MOON_SET,
  MOON_CYCLE,
} from "../src/moon.js";

test("the moon enters below the left horizon at time 0", () => {
  const moon = moonPosition(0);

  assert.strictEqual(moon.phase, "rise");
  assert.ok(moon.x < -1, "the moon starts off the left edge of the screen");
  assert.ok(moon.y < -1, "the moon starts below the bottom edge");
  assert.strictEqual(moon.altitude, 0);
});

test("the moon is at the top centre when the rise is over", () => {
  const moon = moonPosition(MOON_RISE);

  assert.ok(Math.abs(moon.x) < 1e-9, "the moon reaches the middle of the sky");
  assert.ok(moon.y > 0.5, "the moon is high up");
  assert.strictEqual(moon.altitude, 1);
});

test("the moon keeps its height during the pause at the top", () => {
  const before = moonPosition(MOON_RISE + 0.001);
  const after = moonPosition(MOON_RISE + MOON_HOLD - 0.001);

  assert.strictEqual(before.phase, "high");
  assert.strictEqual(after.phase, "high");
  assert.strictEqual(before.x, after.x);
  assert.strictEqual(before.y, after.y);
});

test("the moon sinks below the right horizon when the cycle ends", () => {
  const moon = moonPosition(MOON_RISE + MOON_HOLD + MOON_SET - 0.001);

  assert.strictEqual(moon.phase, "set");
  assert.ok(moon.x > 1, "the moon leaves on the right side");
  assert.ok(moon.y < -1, "the moon is below the bottom edge again");
  assert.ok(moon.altitude < 0.01, "the moon is down to horizon level");
});

test("the arc climbs from left to right in a smooth curve", () => {
  let previous = moonPosition(0);

  for (let t = 0.5; t <= MOON_RISE; t += 0.5) {
    const moon = moonPosition(t);
    assert.ok(moon.x > previous.x, "the moon moves to the right while rising");
    assert.ok(moon.y > previous.y, "the moon gains height while rising");
    previous = moon;
  }
});

test("the arc is symmetric: the same height at the same distance from the top", () => {
  const rising = moonPosition(MOON_RISE - 4); // four seconds before the top
  const setting = moonPosition(MOON_RISE + MOON_HOLD + 4); // four seconds after it

  assert.ok(Math.abs(rising.y - setting.y) < 1e-9, "both sides of the arc match");
  assert.ok(rising.x < 0 && setting.x > 0, "the moon rises on the left, sets on the right");
});

test("the cycle repeats after rise + hold + set", () => {
  const first = moonPosition(2);
  const next = moonPosition(2 + MOON_CYCLE);

  assert.strictEqual(first.x, next.x);
  assert.strictEqual(first.y, next.y);
});

test("negative time wraps into the cycle", () => {
  const moon = moonPosition(-1);

  assert.strictEqual(moon.phase, "set");
  assert.ok(Math.abs(moon.x - moonPosition(MOON_CYCLE - 1).x) < 1e-9);
});

test("the moon is warm and dim at the horizon, pale and bright at the top", () => {
  const low = moonTint(0);
  const high = moonTint(1);

  assert.ok(high[0] > low[0] && high[1] > low[1] && high[2] > low[2], "higher moon is brighter");
  assert.ok(low[0] > low[2], "near the horizon the moon is warmer than at the top");
});
