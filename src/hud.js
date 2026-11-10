// Purpose: Write the game numbers into the HTML HUD (score, lives, seed, ...),
// show the bomb warning and the game over overlay, and report which photo
// textures were loaded. index.html defines the elements by id.

const ALERT_TEXT = "Bomb incoming!"; // shown while a bomb is in the air
const CREDIT_SEPARATOR = " · ";

/** Find every HUD element the game writes to. */
export function findHudElements() {
  return {
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
}

/** Show the counters of the current run in the HUD bar. */
export function updateHud(hud, run, world, threats) {
  hud.score.textContent = String(run.score);
  hud.lives.textContent = String(Math.max(0, run.lives));
  hud.seed.textContent = String(world.seed);
  hud.enemies.textContent = String(run.stomps);
  hud.distance.textContent = String(run.farthest);
  hud.bombs.textContent = String(run.bombsDropped);
  hud.alert.textContent = threats && threats.bombs.length > 0 ? ALERT_TEXT : "";
}

/** Show a message in the centred overlay, for example "Game over". */
export function showOverlay(hud, text) {
  hud.overlay.textContent = text;
  hud.overlay.classList.remove("hidden");
}

/** Report how many photo textures really arrived and who made them. */
export function reportTextures(hud, textures) {
  const loaded = textures.filter((texture) => texture.ok).length;
  hud.status.textContent = "WebGL ready - " + loaded + " of " + textures.length + " photo textures";
  hud.credits.textContent = textures.map((texture) => texture.credit).join(CREDIT_SEPARATOR);
}
