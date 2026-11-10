// Purpose: Build the texture pixel buffers that the renderer uploads to the GPU.
// The moon is a real photo from Wikimedia Commons. The two level materials
// (brick and wooden planks) are painted into a buffer by hand instead, because
// a photo never tiles cleanly: every module of a hand built pattern divides the
// texture size and every random value is looked up by the module index, so the
// pattern continues exactly at the tile border and no seam is ever visible.
// The level materials also need no network, so the game looks identical offline.

import { hash } from "./prng.js";

export const TEXTURE_SIZE = 512; // power of two, so WebGL 1 may tile it (REPEAT)

/**
 * The three textures of the game. `source` tells the HUD and the browser checks
 * where the pixels came from: "internet" for a real photo, "procedural" for a
 * pattern built in this file.
 */
export const TEXTURES = [
  {
    name: "moon",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/01/Phase-180.jpg",
    credit: "Moon photo: Jay Tanner, CC BY-SA 3.0 (Wikimedia Commons)",
    source: "internet",
  },
  {
    name: "brick",
    credit: "Brick pattern: drawn in code",
    source: "procedural",
  },
  {
    name: "wood",
    credit: "Plank pattern: drawn in code",
    source: "procedural",
  },
];

// How many modules fit into one tile. Every number divides TEXTURE_SIZE, which
// is what makes the pattern repeat without a seam.
const BRICK_COURSES = 8; // rows of bricks in one tile
const BRICKS_PER_COURSE = 4; // bricks per row, running bond offsets every other row
const PLANKS_PER_TILE = 4; // wooden planks in one tile

// Feature sizes as a fraction of the texture size, so the same pattern works
// for a 512 tile and for the small buffers the tests build.
const MORTAR_FACTOR = 0.008; // brick mortar joint width
const PLANK_GAP_FACTOR = 0.006; // dark gap between two planks

// Base colours of the materials, chosen for the finished look: the renderer
// still mixes them toward the object colour of the platform.
const MORTAR_COLOUR = [184, 176, 159];
const BRICK_COLOUR = [155, 88, 64];
const BRICK_TINT_RANGE = 0.42; // how much the bricks differ from each other
const BRICK_BLOTCH_RANGE = 0.16; // darker and brighter patches inside one brick
const PLANK_COLOUR = [173, 132, 86];
const PLANK_TINT_RANGE = 0.34; // how much the planks differ from each other
const GRAIN_NOISE = 13; // per pixel brightness noise, in 0..255 steps
const JOINT_SHADOW = 0.8; // how much darker the face right next to a joint is

/** Smooth (bilinear) interpolation between two values. */
function mix2(a, b, t) {
  return a + (b - a) * t;
}

/** Smoothstep of a fraction: 0 at the cell edge, 1 at the next one. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise over a lattice of cellsX x cellsY cells that wraps at the tile
 * border. The cell index is taken modulo the lattice, so a blob that is cut by
 * the border has the same value on both sides and no seam appears. Compared to
 * one hash per cell this is smooth: no squares, just soft variation.
 */
function noiseField(size, cellsX, cellsY, x, y, salt) {
  const gx = (x / size) * cellsX;
  const gy = (y / size) * cellsY;
  const cellX = Math.floor(gx);
  const cellY = Math.floor(gy);
  const fx = ease(gx - cellX);
  const fy = ease(gy - cellY);

  const corner = (column, row) => hash(mod(column, cellsX), mod(row, cellsY) * 13 + salt);
  return mix2(
    mix2(corner(cellX, cellY), corner(cellX + 1, cellY), fx),
    mix2(corner(cellX, cellY + 1), corner(cellX + 1, cellY + 1), fx),
    fy
  );
}

/** Wrap an index into one period so a module that crosses the border stays one module. */
function mod(value, period) {
  return ((value % period) + period) % period;
}

/** Write one rgb colour into an RGBA buffer, clamped to the byte range. */
function put(pixels, size, x, y, color, alpha = 255) {
  const i = (y * size + x) * 4;
  pixels[i] = Math.max(0, Math.min(255, Math.round(color[0])));
  pixels[i + 1] = Math.max(0, Math.min(255, Math.round(color[1])));
  pixels[i + 2] = Math.max(0, Math.min(255, Math.round(color[2])));
  pixels[i + 3] = alpha;
}

/** Scale a colour by a factor and add a flat offset to every channel. */
function shade(color, factor, offset = 0) {
  return [color[0] * factor + offset, color[1] * factor + offset, color[2] * factor + offset];
}

/**
 * Brick wall: courses of bricks with a mortar joint, every other row shifted
 * by half a brick. Each brick gets its own tone, a lighter top edge and a
 * darker bottom edge, which is what makes a flat wall look like solid stones.
 */
function brickPixels(size) {
  const pixels = new Uint8Array(size * size * 4);
  const courseH = size / BRICK_COURSES;
  const brickW = size / BRICKS_PER_COURSE;
  const mortar = Math.max(1, Math.round(size * MORTAR_FACTOR));

  for (let y = 0; y < size; y++) {
    const course = Math.floor(y / courseH);
    const rowOffset = (course % 2) * (brickW / 2);
    const faceH = courseH - mortar;
    // The joint sits at the top of every course, so it lands on a whole world
    // unit and a block edge always ends on a mortar line.
    const faceY = mod(y, courseH);

    for (let x = 0; x < size; x++) {
      const position = x + rowOffset;
      const inBrick = mod(position, brickW);
      // The brick index is taken modulo the row so a brick that is cut by the
      // tile border keeps the same tone on both halves: one brick, one colour.
      const brick = mod(Math.floor(position / brickW), BRICKS_PER_COURSE);
      const noise = hash(x, y) - 0.5;

      if (faceY < mortar || inBrick < mortar) {
        // Mortar: a light band that gets slightly brighter in the middle of the
        // joint, which is what makes the joints look pressed in instead of drawn.
        const depth = faceY < mortar ? faceY / mortar : inBrick / mortar;
        put(pixels, size, x, y, shade(MORTAR_COLOUR, 0.9 + 0.1 * depth + noise * 0.07));
        continue;
      }

      const tone = 1 - BRICK_TINT_RANGE / 2 + BRICK_TINT_RANGE * hash(brick, course * 7 + 3);
      const blotch = 1 - BRICK_BLOTCH_RANGE / 2 + BRICK_BLOTCH_RANGE * noiseField(size, 8, 16, x, y, 5);
      const clay = 1 - 0.06 + 0.12 * noiseField(size, 24, 48, x, y, 11);
      const bevel = 1.06 - 0.13 * ((faceY - mortar) / faceH); // light on top, shadow below
      const sideLight = 1.02 - 0.04 * ((inBrick - mortar) / (brickW - mortar));
      const jointShadow = faceY === mortar || inBrick === mortar ? JOINT_SHADOW : 1;
      const speck = hash(x * 3 + 1, y * 5 + 2) > 0.985 ? -20 : 0;

      put(pixels, size, x, y, shade(BRICK_COLOUR, tone * blotch * clay * bevel * sideLight * jointShadow, noise * GRAIN_NOISE + speck));
    }
  }

  return pixels;
}

/**
 * Wooden planks: horizontal boards with a dark gap between them, a light top
 * edge, long grain streaks that follow the board and a butt joint now and then.
 * The streaks use sine waves with a whole number of periods across the tile, so
 * the grain also continues at the border.
 */
function woodPixels(size) {
  const pixels = new Uint8Array(size * size * 4);
  const plankH = size / PLANKS_PER_TILE;
  const gap = Math.max(1, Math.round(size * PLANK_GAP_FACTOR));
  const faceH = plankH - gap;

  for (let y = 0; y < size; y++) {
    const plank = Math.floor(y / plankH);
    const faceY = mod(y, plankH); // the gap sits at the top of every plank
    const joint = Math.round(size * (0.12 + 0.76 * hash(plank, 31)));
    const tone = 1 - PLANK_TINT_RANGE / 2 + PLANK_TINT_RANGE * hash(plank, 5);

    for (let x = 0; x < size; x++) {
      if (faceY < gap) {
        // The gap is a shadow line: darkest at the very top of the tile row.
        put(pixels, size, x, y, shade(PLANK_COLOUR, 0.34 + 0.05 * hash(x, y)));
        continue;
      }

      // The grain runs along the board. The wobble comes from a noise lattice
      // that wraps at the border, so the grain lines are organic and still
      // meet exactly at the tile edge. Its amplitude changes along the board so
      // the waves do not all look the same.
      const sway = 0.45 + noiseField(size, 2, 1, x, y, 13);
      const wobble = ((noiseField(size, 3, 1, x, y, 3) - 0.5) * 6 + (noiseField(size, 12, 1, x, y, 7) - 0.5) * 2.5) * sway;
      const streak = mod(Math.floor(((faceY - gap) / faceH) * 9 + wobble * 3 + 12), 48);
      const grain = 0.9 + 0.16 * hash(streak, plank * 11 + 3);
      const fibre = 0.97 + 0.06 * noiseField(size, 64, 32, x, y, 23); // fine wood structure
      const bevel = 1.08 - 0.15 * ((faceY - gap) / faceH); // bright under the gap, darker below
      const isJoint = Math.abs(x - joint) <= Math.max(1, gap / 2);

      const factor = tone * grain * fibre * bevel * (isJoint ? 0.6 : 1);
      put(pixels, size, x, y, shade(PLANK_COLOUR, factor, (hash(x, y) - 0.5) * GRAIN_NOISE));
    }
  }

  return pixels;
}

/**
 * Moon surface used when the photo cannot be downloaded: pale rock with a few
 * darker maria and craters. Drawn as one disc, so tiling does not matter here.
 */
function moonPixels(size) {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tone = 0.8 + 0.12 * hash(Math.floor(x / 6), Math.floor(y / 6));

      for (let crater = 0; crater < 9; crater++) {
        const centreX = hash(crater, 3);
        const centreY = hash(crater, 7);
        const radius = 0.05 + hash(crater, 11) * 0.09;
        const distance = Math.hypot((x + 0.5) / size - centreX, (y + 0.5) / size - centreY);
        if (distance < radius) tone -= 0.22 * (1 - distance / radius);
        else if (distance < radius * 1.3) tone += 0.05; // bright rim around a crater
      }

      put(pixels, size, x, y, shade([246, 248, 236], tone));
    }
  }

  return pixels;
}

/**
 * Paint one texture into a size x size RGBA buffer. All patterns are periodic:
 * their modules divide the size, so the GPU can repeat them without a seam.
 */
export function proceduralPixels(name, size = TEXTURE_SIZE) {
  if (name === "brick") return brickPixels(size);
  if (name === "wood") return woodPixels(size);
  return moonPixels(size);
}

/**
 * Download an image and cut its centre square into a size x size RGBA buffer.
 * Throws when the network or the image decoder is not available.
 */
export async function fetchPixels(url, size = TEXTURE_SIZE) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("HTTP " + response.status);

  const blob = await response.blob();
  if (typeof createImageBitmap !== "function") throw new Error("no image decoder");

  const image = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const side = Math.min(image.width, image.height);
  ctx.drawImage(
    image,
    Math.floor((image.width - side) / 2),
    Math.floor((image.height - side) / 2),
    side,
    side,
    0,
    0,
    size,
    size
  );

  if (typeof image.close === "function") image.close();
  return new Uint8Array(ctx.getImageData(0, 0, size, size).data);
}

/**
 * Load every texture. A photo that cannot be downloaded falls back to the
 * pattern from this file, so the run never ends up with a flat coloured box.
 */
export async function loadTextures() {
  const loaded = [];

  for (const texture of TEXTURES) {
    if (texture.source !== "internet") {
      loaded.push({ ...texture, ok: true, size: TEXTURE_SIZE, pixels: proceduralPixels(texture.name) });
      continue;
    }

    try {
      loaded.push({ ...texture, ok: true, size: TEXTURE_SIZE, pixels: await fetchPixels(texture.url) });
    } catch (error) {
      loaded.push({
        ...texture,
        ok: false,
        error: error.message,
        size: TEXTURE_SIZE,
        pixels: proceduralPixels(texture.name),
      });
    }
  }

  return loaded;
}
