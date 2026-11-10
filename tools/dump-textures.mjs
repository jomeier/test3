// Purpose: Dump the procedural texture buffers as PPM images so the patterns can
// be looked at as files, without a browser.

import { writeFileSync } from "node:fs";

import { proceduralPixels } from "../src/textures.js";

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

const SIZE = 512;
for (const name of ["brick", "wood", "moon"]) {
  writePpm(`/tmp/opencode/tex/new-${name}.ppm`, proceduralPixels(name, SIZE), SIZE);
  console.log("wrote", name);
}
