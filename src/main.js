// Purpose: Run the jump-and-run game loop: read keyboard input, advance the
// physics, regenerate the world as the player moves, draw with WebGL and
// update the HUD.

import { createWorld, ensureWorld, deathY } from "./world.js";
import { createPlayer, stepPlayer, stepEnemy, playerEnemyCollision } from "./physics.js";
import { createCamera, computeView, followCamera } from "./camera.js";
import { createRenderer } from "./renderer.js";
import { createThreats, stepThreats } from "./jets.js";
import { loadTextures } from "./textures.js";
import { moonPosition } from "./moon.js";

const canvas = document.getElementById("game");
const hud = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  seed: document.getElementById("seed"),
  enemies: document.getElementById("enemies"),
  distance: document.getElementById("distance"),
  bombs: document.getElementById("bombs"),
  status: document.getElementById("status"),
  alert: document.getElementById("alert"),
  credits: document.getElementById("credits"),
  overlay: document.getElementById("overlay"),
};

const STEP = 1 / 120; // fixed physics sub-step for stable collisions

const keys = new Set();
let renderer;
let world;
let player;
let camera;
let view;
let threats;
let lives = 3;
let score = 0;
let stomps = 0;
let bombs = 0;
let farthest = 0;
let time = 0;
let accumulator = 0;
let lastFrame = 0;
let lastQuads = 0;
let gameOver = false;
let textureInfo = []; // name and source of every texture the renderer has
let moonOffset = 0; // lets the checks start the moon arc at a chosen moment

/** Start (or restart) a run with a given seed. */
function newGame(seed) {
  world = createWorld(seed);
  player = createPlayer(world.spawn.x, world.spawn.y);
  camera = createCamera(world.spawn.x + 6, world.spawn.y + 5);
  threats = createThreats(seed);
  lives = 3;
  score = 0;
  stomps = 0;
  bombs = 0;
  farthest = 0;
  gameOver = false;
  hud.overlay.classList.add("hidden");
  updateHud();
}

/** Put the player back at the spawn point after a fall or a hit. */
function respawn() {
  lives -= 1;
  player.x = world.spawn.x;
  player.y = world.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  camera.x = world.spawn.x + 4;
  camera.y = world.spawn.y + 5;

  if (lives <= 0) {
    gameOver = true;
    hud.overlay.textContent = "Game over - press R for a new world";
    hud.overlay.classList.remove("hidden");
  }
  updateHud();
}

/** Read the pressed keys into the input object used by the physics. */
function readInput() {
  return {
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
    jump: keys.has(" ") || keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
  };
}

/** Advance the simulation by dt seconds. */
function update(dt) {
  time += dt;

  // The world is generated lazily as the player moves to the right.
  ensureWorld(world, player.x + 60);

  const input = readInput();
  stepPlayer(player, world.platforms, dt, input);
  if (input.down && !player.onGround) player.vy -= 24 * dt;

  for (const enemy of world.enemies) stepEnemy(enemy, dt);

  const hit = playerEnemyCollision(player, world.enemies);
  if (hit === "stomp") {
    stomps += 1;
    score += 100;
  } else if (hit === "hit") {
    respawn();
  }

  // Jets cross the sky and drop bombs; the blast kills enemies and can hit the
  // player, which costs a life just like touching an enemy.
  const events = stepThreats(threats, world, player, dt, time);
  if (events.bombDropped) bombs += 1;
  if (events.enemiesKilled) score += events.enemiesKilled * 50;
  if (events.playerHit) respawn();

  if (player.y < deathY(world)) respawn();

  farthest = Math.max(farthest, Math.floor(player.x));
  score += 0; // distance is tracked separately
  followCamera(camera, player.x + 4, player.y + 5, dt);
  updateHud();
}

/** Refresh the HUD numbers. */
function updateHud() {
  hud.score.textContent = String(score);
  hud.lives.textContent = String(Math.max(0, lives));
  hud.seed.textContent = String(world.seed);
  hud.enemies.textContent = String(stomps);
  hud.distance.textContent = String(farthest);
  hud.bombs.textContent = String(bombs);
  // Warn the player while a bomb is in the air.
  hud.alert.textContent = threats && threats.bombs.length > 0 ? "Bomb incoming!" : "";
}

/** Fit the canvas and the view rectangle to the window size. */
function resize() {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  renderer.resize(window.innerWidth, window.innerHeight, scale);
  view = computeView(canvas.width / canvas.height);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}

/** Draw the current scene with WebGL and return the number of quads sent. */
function renderFrame() {
  lastQuads = renderer.draw({
    cam: camera,
    view,
    world,
    player,
    enemies: world.enemies,
    threats,
    time,
    moonTime: time + moonOffset,
  });
  return lastQuads;
}

/** Main animation loop. */
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!gameOver) {
    accumulator += dt;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
  }

  renderFrame();
  requestAnimationFrame(loop);
}

/** Handle key presses for gameplay and world regeneration. */
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") {
    newGame((Math.random() * 0xffffffff) >>> 0);
    return;
  }
  keys.add(key);
  if ([" ", "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("resize", resize);

/** Download the photo textures and hand them to the renderer. */
function loadTextureSet() {
  loadTextures().then((textures) => {
    renderer.setTextures(textures);
    textureInfo = textures.map((t) => ({ name: t.name, source: t.source, credit: t.credit }));

    const real = textures.filter((t) => t.ok).length;
    hud.status.textContent = "WebGL ready - " + real + " of " + textures.length + " photo textures";
    hud.credits.textContent = textures.map((t) => t.credit).join(" · ");
  });
}

try {
  renderer = createRenderer(canvas);
  resize();
  const fromUrl = new URLSearchParams(window.location.search).get("seed");
  newGame(fromUrl ? Number(fromUrl) : 1234);
  hud.status.textContent = "WebGL ready";
  loadTextureSet();
  requestAnimationFrame(loop);
} catch (error) {
  hud.status.textContent = "Error: " + error.message;
  hud.overlay.textContent = "This browser cannot render WebGL.";
  hud.overlay.classList.remove("hidden");
}

// Verification hooks used by the headless browser checks and the console.
window.__game = {
  newGame,
  /** Expose the camera and view so checks can verify the player is on screen. */
  camera: () => camera,
  view: () => view,
  /** Drop the player above a live enemy so the stomp rule can be checked. */
  debugStomp: () => {
    if (!world) return null;
    const enemy = world.enemies.find((e) => e.alive);
    if (!enemy) return null;
    player.x = enemy.x;
    player.y = enemy.y + 3;
    player.vx = 0;
    player.vy = -6;
    player.onGround = false;
    return enemy.x;
  },
  /** Force a jet to appear on the next physics step (used by the browser checks). */
  spawnJet: () => {
    if (!threats) return null;
    threats.nextJet = time;
    return threats.nextJet;
  },
  /** Where the moon currently is on its arc (clip space, -1..1). */
  moon: () => moonPosition(time + moonOffset),
  /** Start the moon arc at a chosen moment of the cycle (used by the checks). */
  setMoonPhase: (seconds) => {
    moonOffset = seconds - time;
    return moonPosition(seconds);
  },
  /** Which textures were really downloaded and which use the stand-in. */
  textures: () => textureInfo,
  /** One platform of the current world, for the pixel checks. */
  platform: (index) => (world ? world.platforms[index] : null),
  /**
   * Read the pixels of a world rectangle straight from the WebGL canvas.
   * Used by the browser checks to prove that a texture stays anchored to the
   * world while the camera moves.
   */
  readWorldRect: (x, y, w, h) => {
    const gl = renderer.gl;

    // Redraw first: after a frame is presented the browser may reuse the
    // framebuffer, so readPixels only reliably sees the geometry just drawn.
    renderFrame();

    const x1 = ((x - camera.x) * 2) / view.w;
    const y1 = ((y - camera.y) * 2) / view.h;
    const x2 = ((x + w - camera.x) * 2) / view.w;
    const y2 = ((y + h - camera.y) * 2) / view.h;

    const px = Math.round(((x1 + 1) / 2) * canvas.width);
    const py = Math.round(((y1 + 1) / 2) * canvas.height);
    const pw = Math.max(1, Math.round(((x2 - x1) / 2) * canvas.width));
    const ph = Math.max(1, Math.round(((y2 - y1) / 2) * canvas.height));

    const pixels = new Uint8Array(pw * ph * 4);
    gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    return { px, py, pw, ph, cam: { x: camera.x, y: camera.y }, canvasWidth: canvas.width, canvasHeight: canvas.height, pixels: Array.from(pixels) };
  },
  state: () => ({
    seed: world ? world.seed : null,
    time,
    moon: moonPosition(time + moonOffset),
    platforms: world ? world.platforms.length : 0,
    enemies: world ? world.enemies.length : 0,
    stomps,
    score,
    lives,
    farthest,
    jets: threats ? threats.jets.length : 0,
    bombsInAir: threats ? threats.bombs.length : 0,
    blasts: threats ? threats.blasts.length : 0,
    bombsDropped: bombs,
    textures: textureInfo,
    player: player ? { x: player.x, y: player.y, vy: player.vy, onGround: player.onGround } : null,
    quads: lastQuads,
    enemiesMoving: world ? world.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, dir: e.dir })) : [],
  }),
};
