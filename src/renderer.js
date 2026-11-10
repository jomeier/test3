// Purpose: Draw one frame of the game with WebGL. This module creates the
// context, the two quad batches and the painter, then calls the drawing modules
// in the order that makes the picture correct: sky, skyline, level, actors,
// threats. It never changes the game state, it only reads it.

import { createBatch } from "./batch.js";
import { createPainter, textureUV, texturedQuad } from "./painter.js";
import { drawSky, drawClouds, drawMoon } from "./drawSky.js";
import { drawFarLayer, drawNearLayer } from "./drawCity.js";
import { drawPlatform, drawDecor } from "./drawLevel.js";
import { drawEnemy, drawPlayer } from "./drawActors.js";
import { drawJet, drawBomb, drawBlast } from "./drawThreats.js";

// belowBottom lives in camera.js and the texture helpers in painter.js. They
// stay reachable from here because that is where the tests look for them.
export { belowBottom } from "./camera.js";
export { textureUV, texturedQuad } from "./painter.js";

/**
 * Create the WebGL renderer for a canvas.
 * Returns { resize, draw, setTextures, gl }.
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const batch = createBatch(gl);
  const painter = createPainter(batch, canvas);

  /** Set the canvas pixel size to its display size times the device scale. */
  function resize(cssWidth, cssHeight, scale) {
    canvas.width = Math.max(1, Math.round(cssWidth * scale));
    canvas.height = Math.max(1, Math.round(cssHeight * scale));
    // WebGL keeps the viewport from context creation, so update it after
    // changing the canvas size or only a small part of the canvas is drawn.
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** Upload the RGBA pixel buffers of the loaded textures to the GPU. */
  function setTextures(list) {
    return batch.uploadTextures(list);
  }

  /**
   * Render one frame of the scene and return the number of quads sent to the
   * GPU. The drawing order below is the painting order: whatever is drawn last
   * ends up on top.
   */
  function draw(scene) {
    const { cam, view, world, player, enemies, threats, time } = scene;
    const moonTime = scene.moonTime === undefined ? time : scene.moonTime;

    painter.beginFrame(view);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Fixed sky: gradient, stars and the moon. The moon is drawn before the
    // city so the skyline can hide it while it rises and sets.
    drawSky(painter);
    drawMoon(painter, moonTime);
    painter.flushFlat();
    painter.flushTextures();

    // Background layers, each moved by its own slow camera.
    drawClouds(painter, time);
    drawFarLayer(painter, world, cam, time);
    drawNearLayer(painter, world, cam, time);

    // The skyline sits behind the level, so it must reach the GPU first.
    painter.flushFlat();

    for (const platform of world.platforms) drawPlatform(painter, platform, cam);
    for (const decor of world.decor) drawDecor(painter, decor, cam);

    for (const enemy of enemies) {
      if (painter.isVisible(enemy, cam)) drawEnemy(painter, enemy, cam, time);
    }
    if (player) drawPlayer(painter, player, cam, time);

    // Jets, falling bombs and explosions are drawn last so they sit on top of
    // the level and stay readable against the sky.
    if (threats) {
      for (const jet of threats.jets) drawJet(painter, jet, cam, time);
      for (const bomb of threats.bombs) drawBomb(painter, bomb, cam, time);
      for (const blast of threats.blasts) drawBlast(painter, blast, cam, time);
    }

    painter.flushFlat();
    return painter.drawnQuads();
  }

  return { resize, draw, setTextures, gl };
}
