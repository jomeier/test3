// Purpose: Load a few real photo textures from the internet (Wikimedia
// Commons) and turn them into square RGBA pixel buffers WebGL can upload. If a
// download fails, a small procedural pattern is generated instead so the game
// still looks good without a network connection.

import { hash } from "./prng.js";

export const TEXTURE_SIZE = 512; // power of two, so WebGL 1 may tile it (REPEAT)

/** The three textures the renderer uses. Kept small on purpose. */
export const TEXTURES = [
  {
    name: "moon",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/01/Phase-180.jpg",
    credit: "Moon photo: Jay Tanner, CC BY-SA 3.0 (Wikimedia Commons)",
  },
  {
    name: "brick",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Surfaces_brick_wall_with_mortar_closeup_view.JPG",
    credit: "Brick wall: Tomwsulcer, CC0 (Wikimedia Commons)",
  },
  {
    name: "wood",
    url: "https://upload.wikimedia.org/wikipedia/commons/6/6d/Wood_planks_-_Preview_%28Amal_Kumar_via_Poly_Haven%29.webp",
    credit: "Wood planks: Amal Kumar via Poly Haven, CC0 (Wikimedia Commons)",
  },
];

/** RGB colour of one pixel of the procedural stand-in pattern. */
function pattern(name, x, y, size) {
  if (name === "brick") {
    const rowH = 32;
    const brickW = 64;
    const row = Math.floor(y / rowH);
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    if (y % rowH < 2 || (x + offset) % brickW < 2) return [135, 135, 128]; // mortar
    const shade =
      (0.85 + 0.3 * hash(Math.floor((x + offset) / brickW), row)) * (0.94 + 0.12 * hash(x, y));
    return [Math.round(140 * shade), Math.round(92 * shade), Math.round(72 * shade)];
  }

  if (name === "wood") {
    const plank = 64;
    const row = Math.floor(y / plank);
    if (y % plank < 2) return [58, 42, 30]; // gap between planks
    const shade = (0.8 + 0.3 * hash(row, 5)) * (0.9 + 0.2 * hash(Math.floor(x / 3), row * 13));
    return [Math.round(150 * shade), Math.round(120 * shade), Math.round(88 * shade)];
  }

  // moon: pale grey rock with a handful of darker craters
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  let shade = 0.78 + 0.12 * hash(Math.floor(x / 6), Math.floor(y / 6));
  for (let i = 0; i < 8; i++) {
    const cx = hash(i, 3);
    const cy = hash(i, 7);
    const r = 0.05 + hash(i, 11) * 0.08;
    const d = Math.sqrt((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy));
    if (d < r) shade -= 0.22 * (1 - d / r);
  }
  return [Math.round(248 * shade), Math.round(250 * shade), Math.round(238 * shade)];
}

/** Build a size x size RGBA buffer for one texture without any network access. */
export function fallbackPixels(name, size = TEXTURE_SIZE) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = pattern(name, x, y, size);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
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
 * Load every texture. Each entry carries the pixel buffer plus ok/source so the
 * HUD can tell a real photo from the procedural stand-in.
 */
export async function loadTextures() {
  const loaded = [];

  for (const texture of TEXTURES) {
    try {
      loaded.push({ ...texture, ok: true, source: "internet", size: TEXTURE_SIZE, pixels: await fetchPixels(texture.url) });
    } catch (error) {
      loaded.push({
        ...texture,
        ok: false,
        source: "fallback",
        error: error.message,
        size: TEXTURE_SIZE,
        pixels: fallbackPixels(texture.name),
      });
    }
  }

  return loaded;
}
