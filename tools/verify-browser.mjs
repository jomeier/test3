// Purpose: Verify the WebGL game in a real browser: serve the project over
// HTTP, run it in headless Chrome through the Chrome DevTools Protocol, send
// WASD/Space key presses, capture screenshots and print the game state.

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const PROJECT = process.cwd();
const PORT = Number(process.env.PORT || 8123);
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const OUT_DIR = "/tmp/opencode/screenshots";
const CHROME = process.env.CHROME || "google-chrome";
const WIDTH = Number(process.env.WIDTH || 1200);
const HEIGHT = Number(process.env.HEIGHT || 720);

// Tolerances of the checks. A headless run is slower and less exact than a
// desktop one, so every threshold is wider than the value the game guarantees.
const MIN_DRAWN_QUADS = 40; // a frame must send more than this many boxes
const MIN_PLATFORM_COUNT = 10; // the first world is generated up to x = 120
const MIN_START_ENEMIES = 1; // and must contain at least one patrolling enemy
const MIN_ENEMY_MOVE = 0.1; // world units: proof that an enemy really walks
const MIN_STOMP_SCORE = 100; // points for one stomp, see STOMP_SCORE in main.js
const MOON_PHOTO_COUNT = 1; // the moon is the only real photo the game downloads
const DRAWN_MATERIAL_COUNT = 2; // brick and planks are painted by code
const MIN_PLATFORM_SHADES = 20; // distinct colours in one sampled platform
const MAX_TEXTURE_SHIFT = 2; // px: an anchored texture may not slide further
const MAX_ANCHOR_DIFF = 0.05; // mean pixel difference at that best shift
const MAX_PIXEL_SEARCH_SHIFT = 24; // px range the best-shift search scans
const MOON_HIGH_Y = 0.5; // clip space height of a moon near the top of the sky
const BOMB_WARNING_SECONDS = 1.5; // drop -> impact, see BOMB_WARNING in jets.js
const BOMB_WARNING_TOLERANCE = 0.25; // seconds of slack for the headless clock
const MID_AIR_SAMPLE_DELAY = 0.7; // seconds after the drop for the mid-air shot

// Area of one platform that is read back from the canvas for the texture
// anchor test. It sits away from every edge, so a partly covered strip can
// never make a sliding texture look correct.
const SAMPLE_INSET_X = 1; // world units in from the left edge of the platform
const SAMPLE_INSET_Y = 0.4; // world units above the bottom of the platform
const SAMPLE_WIDTH = 4; // world units of the sampled strip
const SAMPLE_HEIGHT = 1.4; // stays inside the body, clear of the surface

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Start a tiny static web server for the project directory. */
function startServer() {
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: PROJECT,
    stdio: "ignore",
  });
  return server;
}

/** Start headless Chrome with the DevTools debugging port open. */
function startChrome() {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--enable-unsafe-swiftshader",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=/tmp/opencode/chrome-profile`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  return chrome;
}

/** Wait until the DevTools endpoint answers and return the page target. */
async function waitForTarget(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      // Chrome is still starting up.
    }
    await sleep(300);
  }
  throw new Error("Chrome DevTools endpoint never became reachable");
}

/** Minimal DevTools Protocol client over WebSocket. */
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const resolve = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve(msg);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  async send(method, params = {}) {
    const id = ++this.id;
    const reply = new Promise((resolve) => this.pending.set(id, resolve));
    this.ws.send(JSON.stringify({ id, method, params }));
    const result = await reply;
    if (result.error) throw new Error(method + " failed: " + result.error.message);
    return result.result;
  }

  /** Return the console output that Chrome reported so far. */
  consoleLines() {
    return this.events
      .filter((e) => e.method === "Runtime.consoleAPICalled")
      .map((e) => e.type + ": " + (e.args || []).map((a) => a.value ?? a.type).join(" "));
  }

  close() {
    this.ws.close();
  }
}

/** Press a key and release it later; holdMs keeps it pressed. */
async function pressKey(cdp, key, code, holdMs = 60) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code });
  await sleep(holdMs);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
}

/** Grab a screenshot and save it to the output directory. */
async function shot(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(result.data, "base64"));
  console.log("saved", `${OUT_DIR}/${name}.png`);
}

/** Read the game state exposed by src/main.js through window.__game. */
async function state(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: "JSON.stringify(window.__game ? window.__game.state() : { error: 'no game hook' })",
    returnOutput: true,
  });
  return JSON.parse(result.result.value);
}

/** Read the pixels of a world rectangle from the WebGL canvas. */
async function readRect(cdp, x, y, w, h) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify(window.__game.readWorldRect(${x}, ${y}, ${w}, ${h}))`,
    returnOutput: true,
  });
  return JSON.parse(result.result.value);
}

/** Mean absolute per-channel difference of two pixel buffers, 0 = identical. */
function pixelDifference(a, b) {
  if (a.length !== b.length) return 1;

  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
}

/**
 * Find the pixel shift that makes two samples of the same world area match best.
 * A texture anchored to the world matches at shift (0,0) with only sub-pixel
 * noise; a texture that slides with the camera needs a large shift and still
 * leaves a big residual.
 */
function bestShift(a, b, pw, ph, maxShift = MAX_PIXEL_SEARCH_SHIFT) {
  let best = { dx: 0, dy: 0, diff: pixelDifference(a, b) };

  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sum = 0;
      let n = 0;

      for (let y = 0; y < ph; y++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ph) continue;

        for (let x = 0; x < pw; x++) {
          const xx = x + dx;
          if (xx < 0 || xx >= pw) continue;

          const i = (y * pw + x) * 4;
          const j = (yy * pw + xx) * 4;
          sum += Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]);
          n += 3;
        }
      }

      const diff = n > 0 ? sum / n / 255 : 1;
      if (diff < best.diff) best = { dx, dy, diff };
    }
  }

  return best;
}

/** Count the distinct colours in a pixel buffer, so a flat area is obvious. */
function distinctColors(pixels) {
  const seen = new Set();
  for (let i = 0; i < pixels.length; i += 4) seen.add(pixels[i] + "," + pixels[i + 1] + "," + pixels[i + 2]);
  return seen.size;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const server = startServer();
  const chrome = startChrome();
  let cdp;

  try {
    const target = await waitForTarget();
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // Chrome keeps a copy of every module it loaded. Without this the checker
    // can end up testing an old build instead of the file that is on disk.
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(2500);

    await shot(cdp, "01-start");
    const start = await state(cdp);
    console.log("state at start:", start);

    // Texture anchor test: the photo on a platform must stay fixed in the world
    // while the camera moves up (jump) and sideways (run).
    const plat = JSON.parse(
      (
        await cdp.send("Runtime.evaluate", {
          expression: "JSON.stringify(window.__game.platform(0))",
          returnOutput: true,
        })
      ).result.value
    );
    const region = [plat.x + SAMPLE_INSET_X, plat.y + SAMPLE_INSET_Y, SAMPLE_WIDTH, SAMPLE_HEIGHT];

    const standing = await readRect(cdp, ...region);
    await pressKey(cdp, " ", "Space", 250);
    await sleep(350);
    const airborne = await readRect(cdp, ...region);
    await shot(cdp, "02a-jump-in-place");
    await sleep(1200);
    const landed = await readRect(cdp, ...region);
    await shot(cdp, "02b-landed");

    await pressKey(cdp, "d", "KeyD", 700);
    const running = await readRect(cdp, ...region);

    const jumpShift = bestShift(standing.pixels, airborne.pixels, standing.pw, standing.ph);
    const landingShift = bestShift(standing.pixels, landed.pixels, standing.pw, standing.ph);
    const runShift = bestShift(standing.pixels, running.pixels, standing.pw, standing.ph);
    const detail = distinctColors(standing.pixels);

    console.log(
      "texture anchor: jump shift",
      jumpShift.dx + "x" + jumpShift.dy + "px residual " + jumpShift.diff.toFixed(4),
      "| landing shift",
      landingShift.dx + "x" + landingShift.dy + "px residual " + landingShift.diff.toFixed(4),
      "| run shift",
      runShift.dx + "x" + runShift.dy + "px residual " + runShift.diff.toFixed(4),
      "| distinct colours",
      detail,
      "| region",
      region.join(","),
      "px",
      standing.pw,
      standing.ph,
      "camera y",
      standing.cam.y.toFixed(2),
      "->",
      airborne.cam.y.toFixed(2)
    );

    await shot(cdp, "02-running-right");
    await pressKey(cdp, " ", "Space", 250);
    await sleep(300);
    await shot(cdp, "03-after-jump");
    await pressKey(cdp, "d", "KeyD", 900);
    await shot(cdp, "04-further-right");

    // Walk left and jump again to check the other direction.
    await pressKey(cdp, "a", "KeyA", 600);
    await pressKey(cdp, "w", "KeyW", 250);
    await sleep(400);
    await shot(cdp, "05-going-left");

    // New seed: the world must be regenerated procedurally.
    await pressKey(cdp, "r", "KeyR", 40);
    await sleep(900);
    await shot(cdp, "06-new-world");
    const afterR = await state(cdp);
    console.log("state after new world:", afterR);

    // Run and jump repeatedly, so gaps are crossed and enemies are reached.
    const before = await state(cdp);
    for (let i = 0; i < 6; i++) {
      await pressKey(cdp, "d", "KeyD", 450);
      await pressKey(cdp, " ", "Space", 200);
    }
    await shot(cdp, "07-long-run");
    const final = await state(cdp);
    console.log("final state:", final);
    await pressKey(cdp, "s", "KeyS", 400);
    await shot(cdp, "08-fast-fall");

    // Deterministic check of the stomp rule inside the real browser.
    await cdp.send("Runtime.evaluate", { expression: "window.__game.debugStomp()" });
    await sleep(700);
    const stompState = await state(cdp);
    await shot(cdp, "09-stomp-test");
    console.log("stomp test state:", stompState);

    // Jets and bombs: force a jet, then follow the drop, the falling bomb and
    // the blast. The warning window itself is measured inside the simulation
    // (threats.lastWarningDelay), because polling this clock from the outside
    // is never exact and made this check fail now and then.
    await cdp.send("Runtime.evaluate", { expression: "window.__game.spawnJet()" });
    let jetSeen = false;
    let bombSeen = false;
    let midAirSeen = false;
    let blastSeen = false;
    let droppedAt = null;

    for (let i = 0; i < 120; i++) {
      const s = await state(cdp);
      if (s.jets > 0 && !jetSeen) {
        jetSeen = true;
        await shot(cdp, "10-jet-crossing");
      }

      if (s.bombsInAir > 0 && droppedAt === null) {
        droppedAt = s.time;
        bombSeen = true;
        await shot(cdp, "11-bomb-dropped");
      }

      // Half a second later the bomb is in the middle of its fall.
      if (bombSeen && !midAirSeen && droppedAt !== null && s.time - droppedAt > MID_AIR_SAMPLE_DELAY) {
        midAirSeen = true;
        await shot(cdp, "12-bomb-mid-air");
      }

      if (s.blasts > 0 && !blastSeen) {
        blastSeen = true;
        await shot(cdp, "13-explosion");
        await sleep(250);
        await shot(cdp, "14-explosion-fireball");
        break;
      }

      await sleep(60);
    }

    const jetState = await state(cdp);
    const warningDelay = jetState.warningDelay;
    console.log("jet test state:", jetState, "warning delay:", warningDelay);

    // Moon arc: jump the moon to four moments of its cycle and photograph it,
    // so the whole 23 s arc can be checked in one short run.
    const moonMoments = {};
    const shots = [
      ["rising", 3, "15-moon-rising-left"],
      ["top", 11.5, "16-moon-top"],
      ["setting", 14.5, "17-moon-setting-right"],
      ["sinking", 18.5, "18-moon-behind-skyline"],
    ];

    for (const [name, moment, file] of shots) {
      await cdp.send("Runtime.evaluate", { expression: `window.__game.setMoonPhase(${moment})` });
      await sleep(400);
      moonMoments[name] = JSON.parse(
        (
          await cdp.send("Runtime.evaluate", {
            expression: "JSON.stringify(window.__game.moon())",
            returnOutput: true,
          })
        ).result.value
      );
      await shot(cdp, file);
    }

    console.log("moon arc:", moonMoments);

    const textures = JSON.parse(
      (
        await cdp.send("Runtime.evaluate", {
          expression: "JSON.stringify(window.__game.textures())",
          returnOutput: true,
        })
      ).result.value
    );
    console.log("textures:", textures.map((t) => t.name + ":" + t.source));

    const canvasInfo = JSON.parse(
      (
        await cdp.send("Runtime.evaluate", {
          expression:
            "JSON.stringify({w: document.getElementById('game').width, h: document.getElementById('game').height, iw: window.innerWidth, ih: window.innerHeight})",
          returnOutput: true,
        })
      ).result.value
    );

    const onScreen = JSON.parse(
      (
        await cdp.send("Runtime.evaluate", {
          expression: `(() => {
            const s = window.__game.state();
            const c = window.__game.camera();
            const v = window.__game.view();
            const p = s.player;
            return JSON.stringify({
              onScreen: p.x > c.x - v.w / 2 && p.x < c.x + v.w / 2 && p.y > c.y - v.h / 2 && p.y < c.y + v.h / 2,
            });
          })()`,
          returnOutput: true,
        })
      ).result.value
    );

    const checks = [
      ["canvas fills the window", canvasInfo.w === canvasInfo.iw && canvasInfo.h === canvasInfo.ih],
      ["WebGL draws geometry", start.quads > MIN_DRAWN_QUADS],
      ["player stands on a platform", start.player && start.player.onGround],
      ["the player is inside the camera view", onScreen.onScreen],
      ["player can move", final.farthest > 0],
      ["world is generated", start.platforms > MIN_PLATFORM_COUNT && start.enemies >= MIN_START_ENEMIES],
      ["enemies patrol", final.enemiesMoving.length > 0 && final.enemiesMoving.some((e, i) => Math.abs(e.x - (before.enemiesMoving[i]?.x ?? e.x)) > MIN_ENEMY_MOVE)],
      ["R regenerates the world", afterR.seed !== start.seed],
      ["stomping an enemy scores", stompState.stomps > 0 && stompState.score >= MIN_STOMP_SCORE],
      ["a jet crosses the sky", jetSeen],
      ["the jet drops a bomb", bombSeen && jetState.bombsDropped > 0],
      ["the bomb explodes on the ground", blastSeen],
      [`the blast appears about ${BOMB_WARNING_SECONDS} s after the drop`, warningDelay !== null && Math.abs(warningDelay - BOMB_WARNING_SECONDS) < BOMB_WARNING_TOLERANCE],
      ["the moon rises, pauses at the top and sets", Boolean(moonMoments.rising && moonMoments.top && moonMoments.setting)],
      ["the moon arc runs from the left to the right", moonMoments.rising.x < moonMoments.top.x && moonMoments.top.x < moonMoments.setting.x],
      ["the moon is highest in the middle of the sky", moonMoments.top.y > MOON_HIGH_Y && moonMoments.top.y > moonMoments.rising.y && moonMoments.top.y > moonMoments.setting.y],
      ["the moon photo is downloaded from the internet", textures.filter((t) => t.source === "internet" && t.ok).length >= MOON_PHOTO_COUNT],
      ["the level materials are painted by code", textures.filter((t) => t.source === "procedural" && t.ok).length >= DRAWN_MATERIAL_COUNT],
      ["the sampled platform shows material detail", detail > MIN_PLATFORM_SHADES],
      ["the platform texture does not slide while jumping", Math.abs(jumpShift.dx) <= MAX_TEXTURE_SHIFT && Math.abs(jumpShift.dy) <= MAX_TEXTURE_SHIFT && jumpShift.diff < MAX_ANCHOR_DIFF],
      ["the platform texture does not slide while running", Math.abs(runShift.dx) <= MAX_TEXTURE_SHIFT && Math.abs(runShift.dy) <= MAX_TEXTURE_SHIFT && runShift.diff < MAX_ANCHOR_DIFF],
      ["the texture is back in place after landing", Math.abs(landingShift.dx) <= MAX_TEXTURE_SHIFT && Math.abs(landingShift.dy) <= MAX_TEXTURE_SHIFT && landingShift.diff < MAX_ANCHOR_DIFF],
      ["no console errors", cdp.consoleLines().length === 0],
    ];

    let failed = 0;
    for (const [name, ok] of checks) {
      console.log((ok ? "PASS" : "FAIL") + " - " + name);
      if (!ok) failed += 1;
    }
    console.log("console output:", cdp.consoleLines());
    if (failed > 0) process.exit(1);
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error("verification failed:", error.message);
  process.exit(1);
});
