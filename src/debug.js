// Purpose: Put the running game on window.__game so the headless browser checks
// in tools/verify-browser.mjs (and the developer console) can start a run,
// steer it and read back what is currently on screen.
// The hooks must keep their names and result shapes: every browser check that
// fails costs a whole verification run.

import { moonPosition } from "./moon.js";

const STOMP_DROP_HEIGHT = 3; // the test player is dropped this far above an enemy
const STOMP_FALL_SPEED = -6; // speed used while dropping onto it
const MIN_RECT_PIXELS = 1; // a pixel read-back may never be smaller than one pixel

/**
 * Install the window.__game object.
 * `api` is the small set of getters main.js offers: newGame, world, player,
 * threats, camera, view, canvas, gl, renderFrame, time, moonTime, setMoonPhase,
 * textures, run and quads.
 */
export function installDebugHooks(api) {
  window.__game = {
    newGame: api.newGame,
    /** Camera and view, so checks can prove the player is on screen. */
    camera: api.camera,
    view: api.view,
    /** Drop the player above a live enemy so the stomp rule can be checked. */
    debugStomp: () => dropOntoEnemy(api),
    /** Force a jet to appear on the next physics step. */
    spawnJet: () => launchJet(api),
    /** Where the moon currently is on its arc (clip space, -1..1). */
    moon: () => moonPosition(api.moonTime()),
    /** Start the moon arc at a chosen moment of the cycle. */
    setMoonPhase: (seconds) => {
      api.setMoonPhase(seconds);
      return moonPosition(seconds);
    },
    /** Which textures were really downloaded and which use the stand-in. */
    textures: api.textures,
    /** The seed the current world's materials were generated from. */
    materialSeed: api.materialSeed,
    /** One platform of the current world, for the pixel checks. */
    platform: (index) => {
      const world = api.world();
      return world ? world.platforms[index] : null;
    },
    readWorldRect: (x, y, w, h) => readWorldRect(api, x, y, w, h),
    state: () => readState(api),
  };
}

/**
 * Read the pixels of a world rectangle straight from the WebGL canvas.
 * Proves that a photo texture stays anchored to the world while the camera
 * moves, which a plain pixel diff of two screenshots cannot show.
 */
function readWorldRect(api, x, y, w, h) {
  const gl = api.gl();
  const canvas = api.canvas();
  const cam = api.camera();
  const view = api.view();

  // Redraw first: after a frame is presented the browser may reuse the
  // framebuffer, so readPixels only reliably sees the geometry just drawn.
  api.renderFrame();

  const left = ((x - cam.x) * 2) / view.w;
  const bottom = ((y - cam.y) * 2) / view.h;
  const right = ((x + w - cam.x) * 2) / view.w;
  const top = ((y + h - cam.y) * 2) / view.h;

  const px = Math.round(((left + 1) / 2) * canvas.width);
  const py = Math.round(((bottom + 1) / 2) * canvas.height);
  const pw = Math.max(MIN_RECT_PIXELS, Math.round(((right - left) / 2) * canvas.width));
  const ph = Math.max(MIN_RECT_PIXELS, Math.round(((top - bottom) / 2) * canvas.height));

  const pixels = new Uint8Array(pw * ph * 4);
  gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  return {
    px,
    py,
    pw,
    ph,
    cam: { x: cam.x, y: cam.y },
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    pixels: Array.from(pixels),
  };
}

/** Move the player above a live enemy so the next steps stomp it. */
function dropOntoEnemy(api) {
  const world = api.world();
  const player = api.player();
  if (!world || !player) return null;

  const enemy = world.enemies.find((e) => e.alive);
  if (!enemy) return null;

  player.x = enemy.x;
  player.y = enemy.y + STOMP_DROP_HEIGHT;
  player.vx = 0;
  player.vy = STOMP_FALL_SPEED;
  player.onGround = false;
  return enemy.x;
}

/** Ask the threat logic for a jet right now instead of after a few seconds. */
function launchJet(api) {
  const threats = api.threats();
  if (!threats) return null;

  threats.nextJet = api.time();
  return threats.nextJet;
}

/** Collect the counters and positions the checks compare against. */
function readState(api) {
  const world = api.world();
  const player = api.player();
  const threats = api.threats();
  const run = api.run();

  return {
    seed: world ? world.seed : null,
    time: api.time(),
    moon: moonPosition(api.moonTime()),
    platforms: world ? world.platforms.length : 0,
    enemies: world ? world.enemies.length : 0,
    stomps: run.stomps,
    score: run.score,
    lives: run.lives,
    farthest: run.farthest,
    jets: threats ? threats.jets.length : 0,
    bombsInAir: threats ? threats.bombs.length : 0,
    blasts: threats ? threats.blasts.length : 0,
    // Game seconds between the last drop and its explosion. Measured inside the
    // simulation, so the browser check does not have to poll this clock.
    warningDelay: threats ? threats.lastWarningDelay : null,
    bombsDropped: run.bombsDropped,
    textures: api.textures(),
    materialSeed: api.materialSeed(),
    player: player ? { x: player.x, y: player.y, vy: player.vy, onGround: player.onGround } : null,
    quads: api.quads(),
    enemiesMoving: world ? world.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, dir: e.dir })) : [],
  };
}
