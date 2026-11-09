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
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(2500);

    await shot(cdp, "01-start");
    const start = await state(cdp);
    console.log("state at start:", start);

    // Run right, jump over a gap, then keep running and jumping.
    await pressKey(cdp, "d", "KeyD", 700);
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
      ["WebGL draws geometry", start.quads > 40],
      ["player stands on a platform", start.player && start.player.onGround],
      ["the player is inside the camera view", onScreen.onScreen],
      ["player can move", final.farthest > 0],
      ["world is generated", start.platforms > 10 && start.enemies > 0],
      ["enemies patrol", final.enemiesMoving.length > 0 && final.enemiesMoving.some((e, i) => Math.abs(e.x - (before.enemiesMoving[i]?.x ?? e.x)) > 0.1)],
      ["R regenerates the world", afterR.seed !== start.seed],
      ["stomping an enemy scores", stompState.stomps > 0 && stompState.score >= 100],
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
