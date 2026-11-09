// Purpose: Test the pure maths helpers of the renderer: the skyline base line
// that keeps towers running off the screen, and the photo texture coordinates
// that must stay anchored to the world while the camera moves.

import test from "node:test";
import assert from "node:assert";

import { belowBottom, textureUV, texturedQuad } from "../src/renderer.js";

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

test("a photo texture is anchored to the world, not to the camera", () => {
  const plat = { x: 12, y: 3, w: 6, h: 3 };
  const view = { w: 32, h: 18 };
  const scale = 3;

  const standing = texturedQuad(plat.x, plat.y, plat.w, plat.h, { x: 12, y: 5 }, view, scale);
  // The camera rises with the player during a jump and slides sideways while
  // running. The picture on the platform must not move with it.
  const jumping = texturedQuad(plat.x, plat.y, plat.w, plat.h, { x: 12, y: 9 }, view, scale);
  const running = texturedQuad(plat.x, plat.y, plat.w, plat.h, { x: 20, y: 5 }, view, scale);

  assert.notDeepStrictEqual(standing[0], jumping[0], "the box does move on screen while jumping");
  assert.notDeepStrictEqual(standing[0], running[0], "the box does move on screen while running");

  for (let i = 0; i < 6; i++) {
    assert.strictEqual(standing[i][2], jumping[i][2], "u must not depend on the camera");
    assert.strictEqual(standing[i][3], jumping[i][3], "v must not depend on the camera");
    assert.strictEqual(standing[i][2], running[i][2], "u must not depend on the camera");
    assert.strictEqual(standing[i][3], running[i][3], "v must not depend on the camera");
  }
});

test("one photo tile covers scale world units of the platform", () => {
  const scale = 3;
  const a = textureUV(10, 3, 1, 1, scale);
  const b = textureUV(10 + scale, 3, 1, 1, scale);

  assert.ok(Math.abs(b.u1 - a.u1 - 1) < 1e-9, "one tile equals scale world units");
  assert.ok(Math.abs(a.v1 - b.v1) < 1e-9, "the vertical pattern is not shifted");
});
