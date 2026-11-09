// Purpose: Test the seeded random generator and the hash helper that drives
// the procedural detail textures.

import test from "node:test";
import assert from "node:assert";

import { makeRng, hash, clamp, range, int } from "../src/prng.js";

test("the same seed produces the same random sequence", () => {
  const a = makeRng(7);
  const b = makeRng(7);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepStrictEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1), "values must be in [0, 1)");
});

test("hash is deterministic for the same pair of integers", () => {
  assert.strictEqual(hash(3, 5), hash(3, 5));
  assert.notStrictEqual(hash(3, 5), hash(3, 6));
});

test("hash spreads values over the whole range", () => {
  const values = [];
  for (let i = 0; i < 200; i++) values.push(hash(i, 11));
  assert.ok(values.some((v) => v < 0.2), "no low values");
  assert.ok(values.some((v) => v > 0.8), "no high values");
  assert.ok(values.every((v) => v >= 0 && v < 1), "hash must return [0, 1)");
});

test("range and int stay inside their bounds", () => {
  const rng = makeRng(3);
  for (let i = 0; i < 50; i++) {
    const r = range(rng, 2, 5);
    const n = int(rng, 1, 3);
    assert.ok(r >= 2 && r < 5, "range out of bounds: " + r);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 3, "int out of bounds: " + n);
  }
  assert.strictEqual(clamp(10, 1, 4), 4);
  assert.strictEqual(clamp(-3, 1, 4), 1);
});
