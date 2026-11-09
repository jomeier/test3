// Purpose: Run the game physics - player gravity, jumping, platform collision
// and the enemy patrol movement - independent of rendering.

export const GRAVITY = 34;
export const JUMP_VELOCITY = 12;
export const RUN_SPEED = 8.5;
export const ACCEL = 70;
export const MAX_FALL = 28;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;

/** Return true when two axis-aligned boxes overlap. */
export function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Create the player box at a spawn position. */
export function createPlayer(x, y) {
  return {
    x,
    y,
    w: 1.1,
    h: 1.5,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    jumps: 0,
    face: 1,
  };
}

/**
 * Advance the player by dt seconds.
 * `input` is { left, right, jump }. Returns the player object.
 */
export function stepPlayer(p, platforms, dt, input) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (dir !== 0) {
    p.vx += dir * ACCEL * dt;
    if (p.vx > RUN_SPEED) p.vx = RUN_SPEED;
    if (p.vx < -RUN_SPEED) p.vx = -RUN_SPEED;
    p.face = dir;
  } else {
    p.vx *= Math.max(0, 1 - 14 * dt);
    if (Math.abs(p.vx) < 0.05) p.vx = 0;
  }

  // Jump with input buffering and coyote time, and shorter hops when the
  // jump key is released early (variable jump height).
  p.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - dt);

  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.jumps += 1;
  } else if (!input.jump && p.vy > JUMP_VELOCITY * 0.4) {
    p.vy = JUMP_VELOCITY * 0.4;
  }

  p.vy = Math.max(p.vy - GRAVITY * dt, -MAX_FALL);

  // Horizontal move, then push out of any platform side we entered.
  p.x += p.vx * dt;
  for (const plat of platforms) {
    if (!intersects(p, plat)) continue;
    if (p.vx > 0) p.x = plat.x - p.w;
    else if (p.vx < 0) p.x = plat.x + plat.w;
  }

  // Vertical move, then land on top of a platform or bump the head.
  const prevBottom = p.y;
  const prevTop = p.y + p.h;
  p.y += p.vy * dt;
  p.onGround = false;

  for (const plat of platforms) {
    if (p.x + p.w <= plat.x + 1e-4 || p.x >= plat.x + plat.w - 1e-4) continue;

    if (p.vy <= 0 && prevBottom >= plat.top - 1e-3 && p.y < plat.top) {
      p.y = plat.top;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy > 0 && prevTop <= plat.y + 1e-3 && p.y + p.h > plat.y) {
      p.y = plat.y - p.h;
      p.vy = 0;
    }
  }

  return p;
}

/** Move a patrolling enemy, turning around at the edges of its platform. */
export function stepEnemy(e, dt) {
  if (!e.alive) {
    e.squash = Math.min(1, e.squash + dt * 4);
    return;
  }
  e.x += e.dir * e.speed * dt;
  if (e.x <= e.left) {
    e.x = e.left;
    e.dir = 1;
  }
  if (e.x >= e.right) {
    e.x = e.right;
    e.dir = -1;
  }
}

/**
 * Resolve player vs enemy contact.
 * Returns "stomp" when the player lands on the enemy, "hit" when the player
 * touches it from the side, otherwise null.
 */
export function playerEnemyCollision(p, enemies) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (!intersects(p, e)) continue;

    const feetAboveMiddle = p.y > e.y + e.h * 0.4;
    if (p.vy <= 0 && feetAboveMiddle) {
      e.alive = false;
      p.y = e.y + e.h;
      p.vy = JUMP_VELOCITY * 0.7;
      return "stomp";
    }
    return "hit";
  }
  return null;
}
