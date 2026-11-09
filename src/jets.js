// Purpose: Handle the jet fighters that cross the sky every few seconds and
// drop a bomb over the player - spawning, the drop, the fall and the explosion
// when a bomb hits solid ground. Pure maths, so it can be tested without a
// browser.

import { GRAVITY } from "./physics.js";
import { makeRng, range } from "./prng.js";

export const FIRST_JET = 4; // seconds before the first jet appears
export const JET_MIN_GAP = 4; // shortest pause between two jets
export const JET_MAX_GAP = 8; // longest pause between two jets
export const JET_HEIGHT = 9; // flying height above the player
export const JET_SPAWN_DISTANCE = 20; // how far off screen a jet enters
export const JET_W = 3.4;
export const JET_H = 1.1;
export const BOMB_WARNING = 1.5; // seconds between the drop and the impact
export const BLAST_RADIUS = 3.2; // how far the explosion reaches
export const BLAST_DURATION = 0.6; // how long the fireball is drawn
export const MIN_DROP = 4; // smallest distance a bomb is made to fall

/** Create the threat state (jets, bombs, explosions) for one run. */
export function createThreats(seed) {
  return {
    rng: makeRng((seed ^ 0x9e3779b9) >>> 0),
    nextId: 0,
    nextJet: FIRST_JET,
    jets: [],
    bombs: [],
    blasts: [],
  };
}

/**
 * Highest platform surface directly below (x, fromY), or null when there is no
 * ground under that column - then the bomb falls into the void.
 */
export function surfaceBelow(world, x, fromY) {
  let best = null;
  for (const plat of world.platforms) {
    if (x < plat.x || x > plat.x + plat.w) continue;
    if (plat.top >= fromY) continue;
    if (best === null || plat.top > best) best = plat.top;
  }
  return best;
}

/**
 * Advance jets, bombs and explosions by dt seconds.
 * Returns events so the caller can react: jetSpawned, bombDropped, exploded,
 * playerHit, enemiesKilled.
 */
export function stepThreats(threats, world, player, dt, time) {
  const events = {
    jetSpawned: false,
    bombDropped: false,
    exploded: 0,
    playerHit: false,
    enemiesKilled: 0,
  };

  // A new jet appears every few seconds, from the left or from the right.
  if (time >= threats.nextJet) {
    const dir = threats.rng() < 0.5 ? 1 : -1;
    threats.jets.push({
      id: threats.nextId++,
      x: player.x - dir * JET_SPAWN_DISTANCE,
      y: player.y + JET_HEIGHT,
      dir,
      speed: range(threats.rng, 13, 18),
      w: JET_W,
      h: JET_H,
      dropped: false,
    });
    threats.nextJet = time + range(threats.rng, JET_MIN_GAP, JET_MAX_GAP);
    events.jetSpawned = true;
  }

  for (const jet of threats.jets) {
    jet.x += jet.dir * jet.speed * dt;

    // The bomb is released the moment the jet is exactly above the player, so
    // the player can see it coming and has BOMB_WARNING seconds to escape.
    if (!jet.dropped) {
      const jetCenter = jet.x + jet.w / 2;
      const playerCenter = player.x + player.w / 2;
      if (Math.abs(jetCenter - playerCenter) < 0.9) {
        const targetY = surfaceBelow(world, jetCenter, jet.y);
        // The fall is measured from the jet, so it may pass through the player
        // or the decor on the way down; only the blast itself is dangerous.
        const drop = targetY === null ? MIN_DROP : jet.y - targetY;
        // Gravity is picked so the bomb reaches the ground after exactly
        // BOMB_WARNING seconds, which keeps the warning window predictable.
        // Very short drops use MIN_DROP so the bomb never floats unnaturally.
        threats.bombs.push({
          id: jet.id,
          x: jetCenter,
          y: jet.y,
          vy: 0,
          g: (2 * Math.max(MIN_DROP, drop)) / (BOMB_WARNING * BOMB_WARNING),
          targetY,
          w: 0.55,
          h: 0.8,
          droppedAt: time,
        });
        jet.dropped = true;
        events.bombDropped = true;
      }
    }
  }

  // Remove jets that have flown out of the world.
  threats.jets = threats.jets.filter((jet) => Math.abs(jet.x - player.x) < 45);

  // Bombs fall straight down and explode on the first solid surface.
  for (const bomb of threats.bombs) {
    bomb.vy -= bomb.g * dt;
    bomb.y += bomb.vy * dt;

    if (bomb.targetY !== null && bomb.y <= bomb.targetY) {
      bomb.y = bomb.targetY;
      explode(threats, world, player, bomb, time, events);
      bomb.dead = true;
    } else if (bomb.y < world.lowestTop - 30) {
      bomb.dead = true; // fell into the void without a blast
    }
  }
  threats.bombs = threats.bombs.filter((b) => !b.dead);

  // Explosions fade out after BLAST_DURATION seconds.
  threats.blasts = threats.blasts.filter((blast) => time - blast.start < blast.duration);

  return events;
}

/**
 * Create the fireball and damage everything inside the blast radius.
 * Exported so the tests can call it directly.
 */
export function explode(threats, world, player, bomb, time, events) {
  threats.blasts.push({
    x: bomb.x,
    y: bomb.targetY,
    start: time,
    radius: BLAST_RADIUS,
    duration: BLAST_DURATION,
  });
  events.exploded += 1;

  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  if (distance(px, py, bomb.x, bomb.y) <= BLAST_RADIUS) events.playerHit = true;

  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    if (distance(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, bomb.x, bomb.y) <= BLAST_RADIUS) {
      enemy.alive = false;
      enemy.squash = 1;
      events.enemiesKilled += 1;
    }
  }
}

/** Distance between two points. */
function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
