// Purpose: Test the pure maths helper of the renderer that keeps the
// background skyline anchored below the bottom of the screen.

import test from "node:test";
import assert from "node:assert";

import { belowBottom } from "../src/renderer.js";

test("belowBottom is below the visible area of the view", () => {
  const cam = { x: 10, y: 3 };
  const view = { w: 32, h: 18 };
  const bottomEdge = cam.y - view.h / 2;
  const base = belowBottom(cam, view);

  assert.ok(base < bottomEdge, "base line must be under the bottom edge");
  assert.ok(bottomEdge - base >= 30, "there must be enough margin to cover the edge");
});

test("the base line follows the camera so towers always leave the screen", () => {
  const view = { w: 32, h: 18 };
  const a = belowBottom({ x: 0, y: 0 }, view);
  const b = belowBottom({ x: 50, y: 14 }, view);

  assert.notStrictEqual(a, b, "each parallax layer needs its own base line");
  // The distance to the bottom edge stays the same for every camera position.
  assert.ok(Math.abs(b - (14 - view.h / 2)) === Math.abs(a - (0 - view.h / 2)));
});
