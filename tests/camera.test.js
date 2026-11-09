// Purpose: Test the camera helpers that map world coordinates into WebGL clip
// space and decide which boxes are visible.

import test from "node:test";
import assert from "node:assert";

import { computeView, worldToClip, inView, followCamera, createCamera, VIEW_HEIGHT } from "../src/camera.js";

test("the camera centre maps to clip space (0, 0)", () => {
  const cam = createCamera(10, 5);
  const view = computeView(16 / 9);
  const [x, y] = worldToClip(10, 5, cam, view);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9);
});

test("the view edges map to -1 and 1", () => {
  const cam = createCamera(0, 0);
  const view = computeView(2); // square view: 26 wide, 26 tall
  const [left, bottom] = worldToClip(-view.w / 2, -view.h / 2, cam, view);
  const [right, top] = worldToClip(view.w / 2, view.h / 2, cam, view);
  assert.ok(Math.abs(left + 1) < 1e-9 && Math.abs(bottom + 1) < 1e-9);
  assert.ok(Math.abs(right - 1) < 1e-9 && Math.abs(top - 1) < 1e-9);
});

test("a wider window shows more of the world", () => {
  const square = computeView(1);
  const wide = computeView(16 / 9);
  assert.strictEqual(square.h, VIEW_HEIGHT);
  assert.ok(wide.w > square.w);
});

test("inView culls boxes outside the camera rectangle", () => {
  const cam = createCamera(0, 0);
  const view = computeView(1);
  assert.ok(inView({ x: -1, y: -1, w: 2, h: 2 }, cam, view), "centre box must be visible");
  assert.ok(!inView({ x: 40, y: 0, w: 1, h: 1 }, cam, view), "box far to the right must be culled");
  assert.ok(inView({ x: view.w / 2 - 1, y: 0, w: 20, h: 1 }, cam, view), "a wide box still reaches the view");
});

test("the camera moves towards the player and reaches it", () => {
  const cam = createCamera(0, 0);
  for (let i = 0; i < 300; i++) followCamera(cam, 50, 10, 1 / 60);
  assert.ok(Math.abs(cam.x - 50) < 0.01, "camera did not follow in x");
  assert.ok(Math.abs(cam.y - 10) < 0.01, "camera did not follow in y");
});
