// Purpose: Run the jump-and-run game loop: read keyboard input, advance the
// physics, regenerate the world as the player moves, draw with WebGL and
// update the HUD.

import { createWorld, ensureWorld, deathY } from "./world.js";
import { createPlayer, stepPlayer, stepEnemy, playerEnemyCollision } from "./physics.js";
import { createCamera, computeView, followCamera } from "./camera.js";
import { createRenderer } from "./renderer.js";

const canvas = document.getElementById("game");
const hud = {
  score: document.getElementById("score"),
  lives: document.getElementById("lives"),
  seed: document.getElementById("seed"),
  enemies: document.getElementById("enemies"),
  distance: document.getElementById("distance"),
  status: document.getElementById("status"),
  overlay: document.getElementById("overlay"),
};

const STEP = 1 / 120; // fixed physics sub-step for stable collisions

const keys = new Set();
let renderer;
let world;
let player;
let camera;
let view;
let lives = 3;
let score = 0;
let stomps = 0;
let farthest = 0;
let time = 0;
let accumulator = 0;
let lastFrame = 0;
let lastQuads = 0;
let gameOver = false;

/** Start (or restart) a run with a given seed. */
function newGame(seed) {
  world = createWorld(seed);
  player = createPlayer(world.spawn.x, world.spawn.y);
  camera = createCamera(world.spawn.x + 6, world.spawn.y + 5);
  lives = 3;
  score = 0;
  stomps = 0;
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
}

/** Fit the canvas and the view rectangle to the window size. */
function resize() {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  renderer.resize(window.innerWidth, window.innerHeight, scale);
  view = computeView(canvas.width / canvas.height);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
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

  lastQuads = renderer.draw({ cam: camera, view, world, player, enemies: world.enemies, time });
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

try {
  renderer = createRenderer(canvas);
  resize();
  const fromUrl = new URLSearchParams(window.location.search).get("seed");
  newGame(fromUrl ? Number(fromUrl) : 1234);
  hud.status.textContent = "WebGL ready";
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
  state: () => ({
    seed: world ? world.seed : null,
    platforms: world ? world.platforms.length : 0,
    enemies: world ? world.enemies.length : 0,
    stomps,
    score,
    lives,
    farthest,
    player: player ? { x: player.x, y: player.y, vy: player.vy, onGround: player.onGround } : null,
    quads: lastQuads,
    enemiesMoving: world ? world.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, dir: e.dir })) : [],
  }),
};
