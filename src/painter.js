// Purpose: Provide the drawing primitives every scene module uses: boxes in
// world or clip space, photo-textured boxes, round discs built from thin strips
// and the full-screen sky gradient. The primitives only fill the two batches of
// batch.js; they never change game state.

import { inView, belowBottom, OFFSCREEN_MARGIN } from "./camera.js";
import { MAX_FLAT_QUADS, MAX_TEXTURE_QUADS } from "./batch.js";

// A disc is approximated by a stack of thin boxes. More rows look rounder but
// cost more quads, and a tiny disc would waste rows on nothing.
const CLIP_DISC_ROWS = 24; // discs in clip space (the moon halo)
const WORLD_DISC_ROWS = 9; // discs in world space (explosion fireball)
const MIN_CLIP_DISC_RADIUS = 0.01; // smaller clip-space discs are not worth rows
const MIN_WORLD_DISC_RADIUS = 0.05; // smaller world-space discs are invisible

// Shared mixing colours: every lighter edge is a mix toward WHITE, every seam
// and shadow is a mix toward BLACK.
export const WHITE = [1, 1, 1];
export const BLACK = [0, 0, 0];

/** Blend two rgb colours: t = 0 keeps the first colour, t = 1 the second. */
export function mix(colorA, colorB, t) {
  return [colorA[0] + (colorB[0] - colorA[0]) * t, colorA[1] + (colorB[1] - colorA[1]) * t, colorA[2] + (colorB[2] - colorA[2]) * t];
}

/**
 * Texture coordinates for a world box. `tile` is the number of world units one
 * photo covers. The uv values may only depend on the world position, never on
 * the camera, otherwise the photo slides over the platform whenever the camera
 * moves (for example when the player jumps). World y grows upwards while row 0
 * of the image is at the top, so v is negated.
 */
export function textureUV(x, y, w, h, tile) {
  return {
    u1: x / tile,
    v1: -y / tile,
    u2: (x + w) / tile,
    v2: -(y + h) / tile,
  };
}

/**
 * Build the six vertices of one textured box in clip space: [x, y, u, v] per
 * vertex, two triangles covering the box. The positions follow the camera, the
 * uv values follow the world only.
 */
export function texturedQuad(x, y, w, h, cam, view, tile) {
  const uv = textureUV(x, y, w, h, tile);

  return [
    [clipX(x, cam, view), clipY(y, cam, view), uv.u1, uv.v1],
    [clipX(x + w, cam, view), clipY(y, cam, view), uv.u2, uv.v1],
    [clipX(x, cam, view), clipY(y + h, cam, view), uv.u1, uv.v2],
    [clipX(x, cam, view), clipY(y + h, cam, view), uv.u1, uv.v2],
    [clipX(x + w, cam, view), clipY(y, cam, view), uv.u2, uv.v1],
    [clipX(x + w, cam, view), clipY(y + h, cam, view), uv.u2, uv.v2],
  ];
}

/** Horizontal clip space position (-1..1) of a world x. */
function clipX(x, cam, view) {
  return ((x - cam.x) * 2) / view.w;
}

/** Vertical clip space position (-1..1) of a world y. */
function clipY(y, cam, view) {
  return ((y - cam.y) * 2) / view.h;
}

/**
 * Create the primitives for one canvas.
 * `batch` collects the quads, `canvas` supplies the aspect ratio that keeps
 * clip-space discs round on a wide screen.
 */
export function createPainter(batch, canvas) {
  let view = null; // size of the view that is currently being drawn

  /** Remember the view of the frame; every primitive reads it from here. */
  function beginFrame(frameView) {
    view = frameView;
  }

  /** How much taller a clip-space unit is than a wide one. */
  function aspect() {
    return canvas.width / canvas.height;
  }

  /** Draw a box given in world coordinates, using `cam` for the view transform. */
  function rect(x, y, w, h, color, cam, topColor, alpha = 1) {
    if (batch.flatQuads() >= MAX_FLAT_QUADS) return;
    if (!inView({ x, y, w, h }, cam, view)) return;

    batch.addFlatQuad(clipX(x, cam, view), clipY(y, cam, view), clipX(x + w, cam, view), clipY(y + h, cam, view), color, topColor || color, alpha);
  }

  /** Draw a box directly in clip space (-1..1) for the fixed sky layer. */
  function rectClip(x, y, w, h, color, alpha = 1) {
    if (batch.flatQuads() >= MAX_FLAT_QUADS) return;
    batch.addFlatQuad(x, y, x + w, y + h, color, color, alpha);
  }

  /**
   * Draw a box with a real photo texture. `tile` is the number of world units
   * one photo covers. Returns false when the texture is not loaded, so the
   * caller can fall back to a flat colour.
   */
  function rectTex(x, y, w, h, tint, cam, name, tile) {
    if (batch.flatQuads() >= MAX_FLAT_QUADS) return false;
    if (!inView({ x, y, w, h }, cam, view)) return false;
    if (!batch.useTexture(name, false)) return false;

    // The positions move with the camera, the uv values stay in world space,
    // so the photo never slides when the player jumps.
    batch.addTexturedQuad(texturedQuad(x, y, w, h, cam, view, tile), tint);
    return true;
  }

  /** Draw one photo-textured circle in clip space with a soft edge. */
  function discTex(cx, cy, radius, tint, name) {
    if (!batch.useTexture(name, true)) return;

    // A clip-space square is stretched on a wide screen, so the vertical radius
    // is multiplied by the aspect ratio to keep the disc round on the display.
    const halfY = radius * aspect();
    batch.addTexturedQuad(
      [
        [cx - radius, cy - halfY, 0, 1],
        [cx + radius, cy - halfY, 1, 1],
        [cx - radius, cy + halfY, 0, 0],
        [cx - radius, cy + halfY, 0, 0],
        [cx + radius, cy - halfY, 1, 1],
        [cx + radius, cy + halfY, 1, 0],
      ],
      tint
    );
  }

  /**
   * Approximate a round disc in clip space with a stack of thin boxes. The
   * vertical radius is scaled by the aspect ratio so the disc ends up round.
   */
  function discClip(cx, cy, radius, color, alpha = 1) {
    if (radius <= MIN_CLIP_DISC_RADIUS) return;

    const halfY = radius * aspect();
    const rowHeight = (2 * halfY) / CLIP_DISC_ROWS;

    for (let row = 0; row < CLIP_DISC_ROWS; row++) {
      const dy = -halfY + (row + 0.5) * rowHeight;
      const heightRatio = dy / halfY;
      const halfWidth = radius * Math.sqrt(Math.max(0, 1 - heightRatio * heightRatio));
      rectClip(cx - halfWidth, cy + dy - rowHeight / 2, halfWidth * 2, rowHeight, color, alpha);
    }
  }

  /** Approximate a round disc in world space with a stack of thin boxes. */
  function disc(cx, cy, radius, color, cam) {
    if (radius <= MIN_WORLD_DISC_RADIUS) return;

    const rowHeight = (2 * radius) / WORLD_DISC_ROWS;

    for (let row = 0; row < WORLD_DISC_ROWS; row++) {
      const dy = -radius + (row + 0.5) * rowHeight;
      const heightRatio = dy / radius;
      const halfWidth = radius * Math.sqrt(Math.max(0, 1 - heightRatio * heightRatio));
      rect(cx - halfWidth, cy + dy - rowHeight / 2, halfWidth * 2, rowHeight, color, cam);
    }
  }

  /** Paint the whole screen as one vertical gradient: the sky. */
  function skyGradient(topColor, bottomColor) {
    batch.addFlatQuad(-1, -1, 1, 1, bottomColor, topColor, 1);
  }

  /** World y of the base line a background layer draws down to. */
  function belowView(cam, margin = OFFSCREEN_MARGIN) {
    return belowBottom(cam, view, margin);
  }

  /** Return true when a box is at least partly inside the current view. */
  function isVisible(box, cam) {
    return inView(box, cam, view);
  }

  return {
    beginFrame,
    aspect,
    rect,
    rectClip,
    rectTex,
    disc,
    discClip,
    discTex,
    skyGradient,
    belowView,
    isVisible,
    flushFlat: batch.flushFlat,
    flushTextures: batch.flushTextured,
    hasTexture: batch.hasTexture,
    drawnQuads: batch.drawnQuads,
    reset: batch.reset,
  };
}
