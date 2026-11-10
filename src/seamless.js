// Purpose: The seamless noise engine. Every field here is periodic by
// construction: the noise lattice wraps at the tile edge (corner indices are
// taken modulo the lattice), so a field built on a square of `size` continues
// exactly at the border - field(x + size, y) equals field(x, y) everywhere.
// This "evaluate the noise on a torus" trick is the classic algorithm for
// tileable procedural textures; anything built from these fields stays seamless.

import { hash } from "./prng.js";

const SALT_STEP = 256; // keeps the corner indices of two fields apart

/** Corner value of the wrapped lattice: the corner belongs to one field only. */
function wrappedCorner(seed, cellsX, cellsY, column, row, salt) {
  const wrappedX = ((column % cellsX) + cellsX) % cellsX;
  const wrappedY = ((row % cellsY) + cellsY) % cellsY;
  return hash(wrappedX, wrappedY + cellsY * (seed * SALT_STEP + salt));
}

/** Smoothstep of a fraction, so noise is continuous across cell edges. */
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Tileable value noise in [0, 1) on a lattice of cellsX x cellsY cells across
 * the tile. Any integer cell count works: the wrap makes the tile period exact.
 */
export function valueNoise(seed, size, cellsX, cellsY, x, y, salt = 0) {
  const gx = (x / size) * cellsX;
  const gy = (y / size) * cellsY;
  const column = Math.floor(gx);
  const row = Math.floor(gy);
  const fx = smooth(gx - column);
  const fy = smooth(gy - row);

  const corner = wrappedCorner;
  const top = corner(seed, cellsX, cellsY, column, row, salt);
  const topRight = corner(seed, cellsX, cellsY, column + 1, row, salt);
  const bottom = corner(seed, cellsX, cellsY, column, row + 1, salt);
  const bottomRight = corner(seed, cellsX, cellsY, column + 1, row + 1, salt);

  const left = top + (topRight - top) * fx;
  const right = bottom + (bottomRight - bottom) * fx;
  return left + (right - left) * fy;
}

/**
 * Tileable fBm: octaves of value noise with doubling lattice counts, each one
 * still wrapping at the tile edge. The result stays in [0, 1) and is smooth.
 * `cellsY` may differ from `cells` to stretch the pattern into one axis, which
 * turns blobs into streaks (wood grain) without losing the tileable wrap.
 */
export function fractalNoise(seed, size, x, y, { cells, cellsY = cells, octaves, salt = 0 }) {
  let sum = 0;
  let weight = 0;
  let amplitude = 1;
  let latticeX = cells;
  let latticeY = cellsY;

  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * valueNoise(seed, size, latticeX, latticeY, x, y, salt + octave * 3);
    weight += amplitude;
    amplitude *= 0.5;
    latticeX *= 2;
    latticeY *= 2;
  }

  return sum / weight;
}

/**
 * A periodic offset in [-amp, +amp]. Using this to displace coordinates keeps
 * the displaced pattern seamless: the offset at x and x + size is the same, so
 * the warped field lines up at the tile border again.
 */
export function warpOffset(seed, size, x, y, amp, { cells, octaves, salt = 0 }) {
  return (fractalNoise(seed, size, x, y, { cells, octaves, salt }) - 0.5) * 2 * amp;
}
