// Purpose: Test the texture list and the procedural stand-in patterns that are
// used when a photo cannot be downloaded, so the game still has texture offline.

import test from "node:test";
import assert from "node:assert";

import { TEXTURES, TEXTURE_SIZE, fallbackPixels } from "../src/textures.js";

/** Read one pixel of an RGBA buffer as [r, g, b]. */
function pixel(pixels, x, y, size) {
  const i = (y * size + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

test("every texture has an https source and a license credit", () => {
  assert.ok(TEXTURES.length >= 2 && TEXTURES.length <= 4, "the game uses only a few textures");

  for (const texture of TEXTURES) {
    assert.ok(texture.url.startsWith("https://"), texture.name + " must be fetched over https");
    assert.ok(texture.credit.length > 0, texture.name + " needs a credit line");
    assert.ok(typeof texture.name === "string", "each texture needs a name for the renderer");
  }
});

test("the texture size is a power of two so WebGL 1 can tile it", () => {
  assert.ok(Number.isInteger(TEXTURE_SIZE) && (TEXTURE_SIZE & (TEXTURE_SIZE - 1)) === 0);
});

test("the stand-in pattern is a full opaque RGBA buffer", () => {
  const pixels = fallbackPixels("brick", 64);

  assert.strictEqual(pixels.length, 64 * 64 * 4);
  for (let i = 3; i < pixels.length; i += 4) {
    assert.strictEqual(pixels[i], 255, "every pixel must be opaque");
  }
});

test("the brick pattern shows mortar lines between coloured bricks", () => {
  const size = 128;
  const pixels = fallbackPixels("brick", size);

  const mortar = pixel(pixels, 0, 0, size); // first row is a mortar line
  const brick = pixel(pixels, 10, 10, size);

  assert.ok(mortar[0] > brick[0] && mortar[1] > brick[1], "mortar is lighter than the brick");
  assert.ok(brick[0] > brick[2], "the brick is a warm reddish colour");
});

test("the wood pattern has darker gaps between the planks", () => {
  const size = 128;
  const pixels = fallbackPixels("wood", size);

  const gap = pixel(pixels, 5, 0, size);
  const plank = pixel(pixels, 5, 30, size);

  assert.ok(gap[0] < plank[0] && gap[1] < plank[1], "the gap between planks is darker");
});

test("no pattern is a single flat colour", () => {
  for (const name of ["moon", "brick", "wood"]) {
    const pixels = fallbackPixels(name, 64);
    const distinct = new Set();

    for (let i = 0; i < pixels.length; i += 4) {
      distinct.add(pixels[i] + "," + pixels[i + 1] + "," + pixels[i + 2]);
    }

    assert.ok(distinct.size > 8, name + " pattern must have visible variation");
  }
});

test("the moon pattern has craters that darken the surface", () => {
  const size = 256;
  const pixels = fallbackPixels("moon", size);

  let brightest = 0;
  let darkest = 255;
  for (let i = 0; i < pixels.length; i += 4) {
    brightest = Math.max(brightest, pixels[i]);
    darkest = Math.min(darkest, pixels[i]);
  }

  assert.ok(darkest < 220, "craters create dark patches");
  assert.ok(brightest - darkest > 40, "the surface shows light and dark areas");
});
