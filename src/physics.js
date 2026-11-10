// Purpose: Run the game physics - player gravity, jumping, platform collision
// and the enemy patrol movement - independent of rendering.
// Every tuning value is a named constant here, so the game feel can be changed
// in one place without touching the maths.

// Core movement tuning.
export const GRAVITY = 34; // downward acceleration, world units per second^2
export const JUMP_VELOCITY = 12; // starting speed of a full jump
export const RUN_SPEED = 8.5; // top horizontal speed while running
export const ACCEL = 70; // how fast the player reaches RUN_SPEED
export const MAX_FALL = 28; // terminal falling speed
export const COYOTE_TIME = 0.1; // seconds a jump is still allowed after leaving a ledge
export const JUMP_BUFFER = 0.12; // seconds an early jump key press is remembered

// Smaller tuning details.
const AIR_DRAG = 14; // slows the player down when no key is held
const STOP_VELOCITY = 0.05; // below this the player is considered standing still
const FAST_FALL_ACCEL = 24; // extra downward pull while the down key is held
const SHORT_HOP_FACTOR = 0.4; // jump is cut to this speed when the key is released
const STOMP_BOUNCE_FACTOR = 0.7; // bounce after stomping an enemy, of JUMP_VELOCITY
const STOMP_MIN_FEET_FACTOR = 0.4; // part of the enemy height the feet must be above
const DEFEAT_SQUASH_RATE = 4; // per second: how fast a squashed enemy flattens
const PLAYER_WIDTH = 1.1;
const PLAYER_HEIGHT = 1.5;

// Collision tolerances: without them a box that exactly touches a platform edge
// would be treated as an overlap and the player would catch on every seam.
const SIDE_TOUCH_EPSILON = 1e-4;
const LANDING_EPSILON = 1e-3;

/** Return true when two axis-aligned boxes overlap. */
export function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Create the player box at a spawn position. */
export function createPlayer(x, y) {
  return {
    x,
    y,
    w: PLAYER_WIDTH,
    h: PLAYER_HEIGHT,
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
 * `input` is { left, right, jump, down } and returns the player object.
 */
export function stepPlayer(p, platforms, dt, input) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (dir !== 0) {
    p.vx += dir * ACCEL * dt;
    if (p.vx > RUN_SPEED) p.vx = RUN_SPEED;
    if (p.vx < -RUN_SPEED) p.vx = -RUN_SPEED;
    p.face = dir;
  } else {
    p.vx *= Math.max(0, 1 - AIR_DRAG * dt);
    if (Math.abs(p.vx) < STOP_VELOCITY) p.vx = 0;
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
  } else if (!input.jump && p.vy > JUMP_VELOCITY * SHORT_HOP_FACTOR) {
    p.vy = JUMP_VELOCITY * SHORT_HOP_FACTOR;
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
    if (p.x + p.w <= plat.x + SIDE_TOUCH_EPSILON || p.x >= plat.x + plat.w - SIDE_TOUCH_EPSILON) continue;

    if (p.vy <= 0 && prevBottom >= plat.top - LANDING_EPSILON && p.y < plat.top) {
      p.y = plat.top;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy > 0 && prevTop <= plat.y + LANDING_EPSILON && p.y + p.h > plat.y) {
      p.y = plat.y - p.h;
      p.vy = 0;
    }
  }

  // The down key makes the player drop faster. It is applied after the move so
  // the extra speed only takes effect in the next step, exactly as before.
  if (input.down && !p.onGround) p.vy -= FAST_FALL_ACCEL * dt;

  return p;
}

/** Move a patrolling enemy, turning around at the edges of its platform. */
export function stepEnemy(e, dt) {
  if (!e.alive) {
    e.squash = Math.min(1, e.squash + dt * DEFEAT_SQUASH_RATE);
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

    const feetAboveMiddle = p.y > e.y + e.h * STOMP_MIN_FEET_FACTOR;
    if (p.vy <= 0 && feetAboveMiddle) {
      e.alive = false;
      p.y = e.y + e.h;
      p.vy = JUMP_VELOCITY * STOMP_BOUNCE_FACTOR;
      return "stomp";
    }
    return "hit";
  }
  return null;
}
