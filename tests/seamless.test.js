// Purpose: Test the seamless noise engine: its fields must repeat exactly at
// the tile border (that is the whole point), must be deterministic per seed and
// must differ between seeds, because the level materials are built from them.

import test from "node:test";
import assert from "node:assert";

import { valueNoise, fractalNoise, warpOffset } from "../src/seamless.js";

const SIZE = 128;

test("value noise repeats exactly at the tile border", () => {
  for (const cells of [4, 24, 64]) {
    for (let x = 0; x < SIZE; x += 7) {
      for (let y = 0; y < SIZE; y += 11) {
        const here = valueNoise(3, SIZE, cells, cells, x, y, 1);
        const right = valueNoise(3, SIZE, cells, cells, x + SIZE, y, 1);
        const above = valueNoise(3, SIZE, cells, cells, x, y + SIZE * 2, 1);
        assert.strictEqual(here, right, `x + size must not change the cell of ${cells} lattices`);
        assert.strictEqual(here, above, "y + size must not change the value");
      }
    }
  }
});

test("the fBm repeats exactly at the tile border", () => {
  const options = { cells: 4, octaves: 4, salt: 2 };

  for (let x = 0; x < SIZE; x += 5) {
    const here = fractalNoise(9, SIZE, x, 40.5, options);
    const right = fractalNoise(9, SIZE, x + SIZE, 40.5, options);
    assert.ok(Math.abs(here - right) < 1e-9, "the warped coordinate meets at the border");
  }
});

test("the fields stay inside their promised ranges", () => {
  for (let x = 0; x < SIZE; x += 3) {
    const noise = fractalNoise(1, SIZE, x, x, { cells: 8, octaves: 3 });
    assert.ok(noise >= 0 && noise < 1, "fBm stays in 0..1");

    const offset = warpOffset(1, SIZE, x, x, 12, { cells: 6, octaves: 2 });
    assert.ok(Math.abs(offset) <= 12, "the warp never leaves its amplitude");
  }
});

test("the same seed gives the same field, another seed does not", () => {
  const sample = (seed) => Array.from({ length: 40 }, (_, i) => fractalNoise(seed, SIZE, i * 3, i * 5, { cells: 8, octaves: 3 }));

  assert.deepStrictEqual(sample(4), sample(4), "a field must be reproducible");
  assert.notDeepStrictEqual(sample(4), sample(5), "another seed must give another field");
});
