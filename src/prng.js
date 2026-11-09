// Purpose: Provide a deterministic, seedable pseudo-random generator so the
// procedural world is reproducible: the same seed always builds the same level.

/**
 * Create a seeded random generator (mulberry32).
 * Returns a function that yields floats in [0, 1).
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a random float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Return a random integer in [min, max] inclusive. */
export function int(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

/** Return one random element from an array. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** Keep a number inside [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/**
 * Return a deterministic float in [0, 1) from two integers.
 * Used for detail patterns (bricks, windows) without storing extra data.
 */
export function hash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
