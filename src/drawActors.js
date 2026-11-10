// Purpose: Draw the actors of the level: the patrolling enemies and the player.
// Both are built from a few boxes with a lighter top edge, and both animate
// their feet with the frame time so they look like they are walking.

// Enemies: purple blocks with one visible eye and two stepping feet.
const ENEMY_BODY_COLOUR = [0.52, 0.31, 0.66];
const ENEMY_TOP_COLOUR = [0.71, 0.45, 0.82];
const ENEMY_SQUASH_SHRINK = 0.7; // part of the height a fully squashed enemy loses
const ENEMY_SQUASH_HIDE_FACE = 0.9; // from this squash on, face and feet are gone
const ENEMY_EYE_SIZE = 0.3;
const ENEMY_EYE_COLOUR = [0.98, 0.96, 0.9];
const ENEMY_PUPIL_COLOUR = [0.1, 0.1, 0.12];
const ENEMY_PUPIL_SIZE = 0.14;
const ENEMY_PUPIL_INSET = 0.12; // pupil sits in the front corner of the eye
const ENEMY_EYE_HEIGHT_FACTOR = 0.45; // of the enemy height
const ENEMY_EYE_FRONT_MARGIN = 0.45; // measured from the front edge
const ENEMY_EYE_BACK_MARGIN = 0.15; // measured from the back edge
const ENEMY_LEG_COLOUR = [0.34, 0.2, 0.44];
const ENEMY_LEG_WIDTH = 0.25;
const ENEMY_LEG_HEIGHT = 0.2;
const ENEMY_LEG_SIDE_MARGIN = 0.1; // first foot is set in from the edge
const ENEMY_LEG_SWING = 0.25; // how far the feet lift
const ENEMY_STEP_SPEED = 6; // how fast the stepping animation runs

// Player: an orange body, a blue shirt and a face that looks where it runs.
const PLAYER_BODY_COLOUR = [0.92, 0.47, 0.33];
const PLAYER_TOP_COLOUR = [0.99, 0.55, 0.42];
const PLAYER_SHIRT_COLOUR = [0.23, 0.55, 0.86];
const PLAYER_SHIRT_HIGHLIGHT_COLOUR = [0.3, 0.68, 0.95];
const PLAYER_SHIRT_HEIGHT = 0.45;
const PLAYER_SHIRT_HIGHLIGHT_HEIGHT = 0.12;
const PLAYER_SHIRT_INSET = 0.05; // the shirt stops short of the body sides
const PLAYER_EYE_COLOUR = [0.98, 0.97, 0.93];
const PLAYER_EYE_WIDTH = 0.3;
const PLAYER_EYE_HEIGHT = 0.32;
const PLAYER_EYE_LIFT = 0.95; // below the head, in world units
const PLAYER_EYE_FRONT_MARGIN = 0.12;
const PLAYER_EYE_BACK_MARGIN = 0.42;
const PLAYER_PUPIL_COLOUR = [0.12, 0.14, 0.18];
const PLAYER_PUPIL_WIDTH = 0.13;
const PLAYER_PUPIL_HEIGHT = 0.16;
const PLAYER_PUPIL_INSET = 0.12;
const PLAYER_PUPIL_LIFT = 0.85;
const PLAYER_LEG_COLOUR = [0.7, 0.33, 0.25];
const PLAYER_LEG_WIDTH = 0.25;
const PLAYER_LEG_HEIGHT = 0.28;
const PLAYER_LEG_SIDE_MARGIN = 0.1;
const PLAYER_LEG_SWING = 0.28; // how far the stride lifts the feet
const PLAYER_STEP_SPEED = 9; // how fast the running animation runs
const PLAYER_AIRBORNE_LEG_LIFT = 0.1; // feet stay tucked while in the air
const PLAYER_ARM_COLOUR = [0.85, 0.4, 0.3];
const PLAYER_ARM_WIDTH = 0.2;
const PLAYER_ARM_HEIGHT = 0.45;
const PLAYER_ARM_SIDE_OFFSET = 0.2; // the arms stick out beside the body
const PLAYER_ARM_HEIGHT_FACTOR = 0.4; // of the body height

/**
 * Draw one patrolling enemy. A squashed enemy is flattened further every
 * frame until its face and feet disappear.
 */
export function drawEnemy(painter, enemy, cam, time) {
  const height = enemy.h * (1 - enemy.squash * ENEMY_SQUASH_SHRINK);
  painter.rect(enemy.x, enemy.y, enemy.w, height, ENEMY_BODY_COLOUR, cam, ENEMY_TOP_COLOUR);

  if (enemy.squash >= ENEMY_SQUASH_HIDE_FACE) return;

  const eyeY = enemy.y + height * ENEMY_EYE_HEIGHT_FACTOR;
  const eyeX = enemy.dir > 0 ? enemy.x + enemy.w - ENEMY_EYE_FRONT_MARGIN : enemy.x + ENEMY_EYE_BACK_MARGIN;
  painter.rect(eyeX, eyeY, ENEMY_EYE_SIZE, ENEMY_EYE_SIZE, ENEMY_EYE_COLOUR, cam);
  painter.rect(eyeX + ENEMY_PUPIL_INSET, eyeY + ENEMY_PUPIL_INSET, ENEMY_PUPIL_SIZE, ENEMY_PUPIL_SIZE, ENEMY_PUPIL_COLOUR, cam);

  const swing = ENEMY_LEG_SWING * Math.abs(Math.sin(time * ENEMY_STEP_SPEED + enemy.x));
  painter.rect(enemy.x + ENEMY_LEG_SIDE_MARGIN, enemy.y - swing * 0.5, ENEMY_LEG_WIDTH, ENEMY_LEG_HEIGHT, ENEMY_LEG_COLOUR, cam);
  painter.rect(enemy.x + enemy.w - ENEMY_LEG_SIDE_MARGIN - ENEMY_LEG_WIDTH, enemy.y - swing * 0.4, ENEMY_LEG_WIDTH, ENEMY_LEG_HEIGHT, ENEMY_LEG_COLOUR, cam);
}

/**
 * Draw the player: body, shirt, face, stepping legs and arms. The legs only
 * swing while the player stands on the ground.
 */
export function drawPlayer(painter, player, cam, time) {
  const { x, y, w, h } = player;

  painter.rect(x, y, w, h, PLAYER_BODY_COLOUR, cam, PLAYER_TOP_COLOUR);
  painter.rect(x + PLAYER_SHIRT_INSET, y + h - PLAYER_SHIRT_HEIGHT, w - PLAYER_SHIRT_INSET * 2, PLAYER_SHIRT_HEIGHT, PLAYER_SHIRT_COLOUR, cam);
  painter.rect(x + PLAYER_SHIRT_INSET, y + h - PLAYER_SHIRT_HEIGHT, w - PLAYER_SHIRT_INSET * 2, PLAYER_SHIRT_HIGHLIGHT_HEIGHT, PLAYER_SHIRT_HIGHLIGHT_COLOUR, cam);

  const eyeX = player.face > 0 ? x + PLAYER_EYE_FRONT_MARGIN : x + w - PLAYER_EYE_BACK_MARGIN;
  painter.rect(eyeX, y + h - PLAYER_EYE_LIFT, PLAYER_EYE_WIDTH, PLAYER_EYE_HEIGHT, PLAYER_EYE_COLOUR, cam);
  painter.rect(eyeX + PLAYER_PUPIL_INSET, y + h - PLAYER_PUPIL_LIFT, PLAYER_PUPIL_WIDTH, PLAYER_PUPIL_HEIGHT, PLAYER_PUPIL_COLOUR, cam);

  drawSteppingLegs(painter, player, cam, time);

  const armY = y + h * PLAYER_ARM_HEIGHT_FACTOR;
  painter.rect(x - PLAYER_ARM_SIDE_OFFSET, armY, PLAYER_ARM_WIDTH, PLAYER_ARM_HEIGHT, PLAYER_ARM_COLOUR, cam);
  painter.rect(x + w, armY, PLAYER_ARM_WIDTH, PLAYER_ARM_HEIGHT, PLAYER_ARM_COLOUR, cam);
}

/** Two feet that alternate with the frame time: running or tucked in air. */
function drawSteppingLegs(painter, player, cam, time) {
  const { x, y, w } = player;
  const stride = Math.abs(Math.sin(time * PLAYER_STEP_SPEED)) * PLAYER_LEG_SWING;
  const frontLift = player.onGround ? stride : PLAYER_AIRBORNE_LEG_LIFT;
  const backLift = player.onGround ? PLAYER_LEG_SWING - stride : PLAYER_AIRBORNE_LEG_LIFT;

  painter.rect(x + PLAYER_LEG_SIDE_MARGIN, y - frontLift, PLAYER_LEG_WIDTH, PLAYER_LEG_HEIGHT, PLAYER_LEG_COLOUR, cam);
  painter.rect(x + w - PLAYER_LEG_SIDE_MARGIN - PLAYER_LEG_WIDTH, y - backLift, PLAYER_LEG_WIDTH, PLAYER_LEG_HEIGHT, PLAYER_LEG_COLOUR, cam);
}
