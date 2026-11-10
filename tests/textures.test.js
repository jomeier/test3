// Purpose: Test the texture list and the hand painted material patterns: they
// must be opaque, must show their joints and - the point of building them in
// code - must repeat without a seam, so no joint is ever cut at the tile border.

import test from "node:test";
import assert from "node:assert";

import { TEXTURES, TEXTURE_SIZE, proceduralPixels, levelMaterialPixels } from "../src/textures.js";

/** Read one pixel of an RGBA buffer as [r, g, b]. */
function pixel(pixels, x, y, size) {
  const i = (y * size + x) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

/** Mean brightness of a pixel list. */
function brightness(color) {
  return (color[0] + color[1] + color[2]) / 3;
}

/** Start positions of the light mortar bands along one row of the brick pattern. */
function mortarColumns(pixels, size, row) {
  const starts = [];

  for (let x = 0; x < size; x++) {
    const isJoint = brightness(pixel(pixels, x, row, size)) > 150;
    const wasJoint = brightness(pixel(pixels, x - 1 < 0 ? size - 1 : x - 1, row, size)) > 150;
    if (isJoint && !wasJoint) starts.push(x);
  }

  return starts;
}

test("every texture has a credit and a known source", () => {
  assert.ok(TEXTURES.length === 3, "the game uses one photo and two drawn materials");

  for (const texture of TEXTURES) {
    assert.ok(typeof texture.name === "string", "each texture needs a name for the renderer");
    assert.ok(texture.credit.length > 0, texture.name + " needs a credit line");
    assert.ok(["internet", "procedural"].includes(texture.source), texture.name + " needs a source");
  }

  const photo = TEXTURES.find((texture) => texture.source === "internet");
  assert.ok(photo.url.startsWith("https://"), "a photo must be fetched over https");
  assert.ok(TEXTURES.filter((texture) => texture.source === "procedural").length === 2, "the level materials need no network");
});

test("the texture size is a power of two so WebGL 1 can tile it", () => {
  assert.ok(Number.isInteger(TEXTURE_SIZE) && (TEXTURE_SIZE & (TEXTURE_SIZE - 1)) === 0);
});

test("a material pattern is a full opaque RGBA buffer", () => {
  const pixels = proceduralPixels("brick", 64);

  assert.strictEqual(pixels.length, 64 * 64 * 4);
  for (let i = 3; i < pixels.length; i += 4) {
    assert.strictEqual(pixels[i], 255, "every pixel must be opaque");
  }
});

test("building the same pattern twice gives the same bytes", () => {
  assert.deepStrictEqual(proceduralPixels("wood", 64), proceduralPixels("wood", 64), "the look must be reproducible");
});

test("the brick pattern shows mortar lines between coloured bricks", () => {
  const size = 128;
  const pixels = proceduralPixels("brick", size);

  const mortar = pixel(pixels, 0, 0, size); // the first row of a course is a joint
  const brick = pixel(pixels, 10, 10, size);

  assert.ok(brightness(mortar) > brightness(brick), "mortar is lighter than the brick");
  assert.ok(brick[0] > brick[2], "the brick is a warm reddish colour");
});

test("the brick joints keep their spacing across the tile border", () => {
  const size = 512;
  const courseH = size / 8;
  const row = Math.floor(courseH * 2.5); // middle of a brick row
  const brickW = size / 4;

  for (const seed of [0, 7, 4242]) {
    const pixels = proceduralPixels("brick", size, seed);
    const starts = mortarColumns(pixels, size, row);
    assert.ok(starts.length === 4, `seed ${seed}: one tile shows four vertical joints in a row, found ${starts.length}`);

    const gaps = starts.map((start, index) => {
      const next = index + 1 < starts.length ? starts[index + 1] : starts[0] + size;
      return next - start;
    });

    for (const gap of gaps) {
      assert.ok(Math.abs(gap - brickW) <= 2, `seed ${seed}: a joint gap is ${gap}, expected ${brickW}: no brick may be cut at the border`);
    }
  }
});

test("a brick joint lands on a whole world unit, so a block edge ends on a joint", () => {
  const size = 512;
  const pixels = proceduralPixels("brick", size);
  const unit = size / 4; // the renderer covers four world units with one tile

  assert.ok(brightness(pixel(pixels, 60, 0, size)) > 150, "the tile starts with a joint");

  for (const height of [1, 2, 3, 4]) {
    const row = (height * unit) % size;
    assert.ok(brightness(pixel(pixels, 60, row, size)) > 150, `a block edge at ${height} world units lands on a joint`);
  }
});

test("the wood pattern has darker gaps between the planks", () => {
  const size = 128;
  const pixels = proceduralPixels("wood", size);

  const gap = pixel(pixels, 5, 0, size);
  const plank = pixel(pixels, 5, 30, size);

  assert.ok(brightness(gap) < brightness(plank), "the gap between planks is darker");
});

test("the plank gaps keep their spacing across the tile border", () => {
  const size = 512;
  const pixels = proceduralPixels("wood", size);
  const plankH = size / 4;
  const column = Math.floor(size * 0.3);

  const starts = [];
  for (let y = 0; y < size; y++) {
    const isGap = brightness(pixel(pixels, column, y, size)) < 90;
    const wasGap = brightness(pixel(pixels, column, y - 1 < 0 ? size - 1 : y - 1, size)) < 90;
    if (isGap && !wasGap) starts.push(y);
  }

  assert.ok(starts.length === 4, "one tile shows four plank gaps, found " + starts.length);
  for (let index = 0; index < starts.length; index++) {
    const next = index + 1 < starts.length ? starts[index + 1] : starts[0] + size;
    assert.ok(Math.abs(next - starts[index] - plankH) <= 1, "no plank may be cut at the border");
  }
});

test("no pattern is a single flat colour", () => {
  for (const name of ["moon", "brick", "wood"]) {
    const pixels = proceduralPixels(name, 64);
    const distinct = new Set();

    for (let i = 0; i < pixels.length; i += 4) {
      distinct.add(pixels[i] + "," + pixels[i + 1] + "," + pixels[i + 2]);
    }

    assert.ok(distinct.size > 8, name + " pattern must have visible variation");
  }
});

test("every world seed paints its own material, and the same seed again", () => {
  const first = proceduralPixels("brick", 128, 11);
  const same = proceduralPixels("brick", 128, 11);
  const other = proceduralPixels("brick", 128, 12);

  assert.deepStrictEqual(first, same, "a world seed must reproduce its material");

  let differences = 0;
  for (let i = 0; i < first.length; i += 4) {
    if (Math.abs(first[i] - other[i]) > 3) differences++;
  }
  assert.ok(differences > first.length / 4 / 8, "another world seed must visibly change the material");
});

test("levelMaterialPixels hands the renderer both tiled level materials", () => {
  const materials = levelMaterialPixels(5);

  assert.deepStrictEqual(materials.map((material) => material.name).sort(), ["brick", "wood"]);
  for (const material of materials) {
    assert.ok(material.ok, material.name + " is always available offline");
    assert.strictEqual(material.size, TEXTURE_SIZE);
    assert.strictEqual(material.pixels.length, TEXTURE_SIZE * TEXTURE_SIZE * 4);
  }
});

test("the moon pattern has craters that darken the surface", () => {
  const size = 256;
  const pixels = proceduralPixels("moon", size);

  let brightest = 0;
  let darkest = 255;
  for (let i = 0; i < pixels.length; i += 4) {
    brightest = Math.max(brightest, pixels[i]);
    darkest = Math.min(darkest, pixels[i]);
  }

  assert.ok(darkest < 220, "craters create dark patches");
  assert.ok(brightest - darkest > 40, "the surface shows light and dark areas");
});
