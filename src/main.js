// Purpose: Run the jump-and-run game loop: read keyboard input, advance the
// physics, regenerate the world as the player moves, draw with WebGL and update
// the HUD. This file only connects the modules; all rules live in world.js,
// physics.js, jets.js and moon.js, all drawing in the renderer modules.

import { createWorld, ensureWorld, deathY } from "./world.js";
import { createPlayer, stepPlayer, stepEnemy, playerEnemyCollision } from "./physics.js";
import { createCamera, computeView, followCamera, CAMERA_LEAD_X, CAMERA_LEAD_Y, START_CAMERA_LEAD_X } from "./camera.js";
import { createRenderer } from "./renderer.js";
import { createThreats, stepThreats } from "./jets.js";
import { loadTextures } from "./textures.js";
import { findHudElements, updateHud, showOverlay, reportTextures } from "./hud.js";
import { createKeyboard } from "./input.js";
import { installDebugHooks } from "./debug.js";

// Loop timing.
const PHYSICS_STEP = 1 / 120; // fixed sub-step for stable collisions
const MAX_FRAME_TIME = 0.05; // a longer pause (lag) is not simulated

// Run setup.
const START_LIVES = 3;
const START_SEED = 1234; // seed used when the URL carries none
const RANDOM_SEED_RANGE = 0xffffffff; // full 32 bit span for a new world
const WORLD_AHEAD = 60; // generate this many units before the player
const PIXEL_RATIO_LIMIT = 2; // more pixels than this buy nothing on any screen

// Scoring.
const STOMP_SCORE = 100;
const ENEMY_KILL_SCORE = 50;

const GAME_OVER_TEXT = "Game over - press R for a new world";
const WEBGL_READY_TEXT = "WebGL ready";
const WEBGL_BROKEN_TEXT = "This browser cannot render WebGL.";

const canvas = document.getElementById("game");
const hud = findHudElements();

let renderer;
let world;
let player;
let camera;
let view;
let threats;
let run = { lives: START_LIVES, score: 0, stomps: 0, bombsDropped: 0, farthest: 0 };
let time = 0;
let accumulator = 0;
let lastFrame = 0;
let lastQuads = 0;
let gameOver = false;
let textureInfo = []; // name and source of every texture the renderer has
let moonOffset = 0; // lets the checks start the moon arc at a chosen moment

const keyboard = createKeyboard(() => newGame(randomSeed()));

/** Start (or restart) a run with a given seed. */
function newGame(seed) {
  world = createWorld(seed);
  player = createPlayer(world.spawn.x, world.spawn.y);
  camera = createCamera(world.spawn.x + START_CAMERA_LEAD_X, world.spawn.y + CAMERA_LEAD_Y);
  threats = createThreats(seed);
  run = { lives: START_LIVES, score: 0, stomps: 0, bombsDropped: 0, farthest: 0 };
  gameOver = false;
  hud.overlay.classList.add("hidden");
  updateHud(hud, run, world, threats);
}

/** Put the player back at the spawn point after a fall or a hit. */
function respawn() {
  run.lives -= 1;
  player.x = world.spawn.x;
  player.y = world.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  camera.x = world.spawn.x + CAMERA_LEAD_X;
  camera.y = world.spawn.y + CAMERA_LEAD_Y;

  if (run.lives <= 0) {
    gameOver = true;
    showOverlay(hud, GAME_OVER_TEXT);
  }
  updateHud(hud, run, world, threats);
}

/** Advance the simulation by dt seconds. */
function update(dt) {
  time += dt;

  // The world is generated lazily as the player moves to the right.
  ensureWorld(world, player.x + WORLD_AHEAD);

  const input = keyboard.readInput();
  stepPlayer(player, world.platforms, dt, input);

  for (const enemy of world.enemies) stepEnemy(enemy, dt);

  const hit = playerEnemyCollision(player, world.enemies);
  if (hit === "stomp") {
    run.stomps += 1;
    run.score += STOMP_SCORE;
  } else if (hit === "hit") {
    respawn();
  }

  // Jets cross the sky and drop bombs; the blast kills enemies and can hit the
  // player, which costs a life just like touching an enemy.
  const events = stepThreats(threats, world, player, dt, time);
  if (events.bombDropped) run.bombsDropped += 1;
  if (events.enemiesKilled) run.score += events.enemiesKilled * ENEMY_KILL_SCORE;
  if (events.playerHit) respawn();

  if (player.y < deathY(world)) respawn();

  run.farthest = Math.max(run.farthest, Math.floor(player.x));
  followCamera(camera, player.x + CAMERA_LEAD_X, player.y + CAMERA_LEAD_Y, dt);
  updateHud(hud, run, world, threats);
}

/** Fit the canvas and the view rectangle to the window size. */
function resize() {
  const scale = Math.min(PIXEL_RATIO_LIMIT, window.devicePixelRatio || 1);
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

/** Animation loop: fixed physics steps, then one draw per frame. */
function loop(now) {
  const frameTime = Math.min(MAX_FRAME_TIME, (now - lastFrame) / 1000);
  lastFrame = now;

  // After a game over the clock stops: the moon and the bombs stay where they
  // are, so a screenshot check of the last frame stays meaningful.
  if (!gameOver) {
    accumulator += frameTime;
    while (accumulator >= PHYSICS_STEP) {
      update(PHYSICS_STEP);
      accumulator -= PHYSICS_STEP;
    }
  }

  renderFrame();
  requestAnimationFrame(loop);
}

/** Download the photo textures and hand them to the renderer. */
function loadTextureSet() {
  loadTextures().then((textures) => {
    renderer.setTextures(textures);
    textureInfo = textures.map((texture) => ({ name: texture.name, source: texture.source, credit: texture.credit, ok: texture.ok }));
    reportTextures(hud, textures);
  });
}

/** Read the seed from ?seed=... in the address, otherwise use the default. */
function seedFromUrl() {
  const fromUrl = new URLSearchParams(window.location.search).get("seed");
  return fromUrl ? Number(fromUrl) : START_SEED;
}

/** A fresh seed for a new world started with the R key. */
function randomSeed() {
  return (Math.random() * RANDOM_SEED_RANGE) >>> 0;
}

/** Boot the game and report a missing WebGL support in the HUD. */
function start() {
  try {
    renderer = createRenderer(canvas);
    resize();
    newGame(seedFromUrl());
    hud.status.textContent = WEBGL_READY_TEXT;
    loadTextureSet();
    requestAnimationFrame(loop);
  } catch (error) {
    hud.status.textContent = "Error: " + error.message;
    showOverlay(hud, WEBGL_BROKEN_TEXT);
  }
}

window.addEventListener("resize", resize);
start();

// Verification hooks used by the headless browser checks and the console.
installDebugHooks({
  newGame,
  world: () => world,
  player: () => player,
  threats: () => threats,
  camera: () => camera,
  view: () => view,
  canvas: () => canvas,
  gl: () => renderer.gl,
  renderFrame,
  time: () => time,
  moonTime: () => time + moonOffset,
  setMoonPhase: (seconds) => {
    moonOffset = seconds - time;
  },
  textures: () => textureInfo,
  run: () => run,
  quads: () => lastQuads,
});
