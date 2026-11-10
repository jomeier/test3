// Purpose: Write the material texture buffers out as image files so the patterns
// can be looked at (and tiled) without starting a browser.

import { mkdirSync, writeFileSync } from "node:fs";

import { TEXTURE_SIZE, proceduralPixels } from "../src/textures.js";

const OUT_DIR = "/tmp/opencode/tex";
const NAMES = ["brick", "wood", "moon"];

/** Write an RGBA buffer as a binary PPM (P6) file that image tools can read. */
function writePpm(path, pixels, size) {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = pixels[i * 4];
    rgb[i * 3 + 1] = pixels[i * 4 + 1];
    rgb[i * 3 + 2] = pixels[i * 4 + 2];
  }

  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), Buffer.from(rgb)]), "binary");
}

/** Paste the tile side by side so the tiling border is visible in one image. */
function writeTiledPpm(path, pixels, size) {
  const width = size * 2;
  const row = Buffer.from(`P6\n${width} ${size}\n255\n`);
  const rgb = new Uint8Array(width * size * 3);

  for (let y = 0; y < size; y++) {
    for (let tile = 0; tile < 2; tile++) {
      for (let x = 0; x < size; x++) {
        const from = (y * size + x) * 4;
        const to = (y * width + tile * size + x) * 3;
        rgb[to] = pixels[from];
        rgb[to + 1] = pixels[from + 1];
        rgb[to + 2] = pixels[from + 2];
      }
    }
  }

  writeFileSync(path, Buffer.concat([row, Buffer.from(rgb)]), "binary");
}

mkdirSync(OUT_DIR, { recursive: true });

for (const name of NAMES) {
  const pixels = proceduralPixels(name, TEXTURE_SIZE);
  writePpm(`${OUT_DIR}/${name}.ppm`, pixels, TEXTURE_SIZE);
  writeTiledPpm(`${OUT_DIR}/${name}-tiled.ppm`, pixels, TEXTURE_SIZE);
  console.log(`wrote ${OUT_DIR}/${name}.ppm and ${name}-tiled.ppm`);
}
