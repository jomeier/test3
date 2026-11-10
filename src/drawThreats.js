// Purpose: Draw the threats that fall from the sky: the jet fighter, the
// falling bomb with its warning markers and the explosion. The jets are drawn
// last so they stay readable in front of the level, and the warning markers
// show exactly where a bomb will hit.

import { hash } from "./prng.js";
import { BLAST_DURATION } from "./jets.js";
import { mix, WHITE } from "./painter.js";

// Jet fighter: a light body, dark wings and a flickering engine flame.
const JET_BODY_COLOUR = [0.8, 0.84, 0.9];
const JET_BODY_LIGHT_MIX = 0.12; // of white mixed into the top edge
const JET_DARK_COLOUR = [0.44, 0.49, 0.57];
const JET_COCKPIT_COLOUR = [0.2, 0.26, 0.34];
const JET_TRAIL_COLOUR = [0.55, 0.62, 0.7];
const JET_TRAIL_HEIGHT = 0.22;
const JET_TRAIL_HEIGHT_FACTOR = 0.35; // of the fuselage height
const JET_TRAIL_BASE = 3; // shortest exhaust trail
const JET_TRAIL_SWING = 2; // extra length added by the animation
const JET_TRAIL_SPEED = 3; // how fast the trail pulses
const JET_NOSE_LENGTH = 0.8;
const JET_NOSE_HEIGHT_FACTOR = 0.4; // of the fuselage height
const JET_NOSE_HEIGHT_OFFSET = 0.3; // measured up from the bottom of the body
const JET_WING_INSET = 0.2; // of the fuselage length
const JET_WING_HEIGHT = 0.55;
const JET_WING_LENGTH_FACTOR = 0.55; // of the fuselage length
const JET_WING_DROP = 0.55; // the wing sits under the fuselage
const JET_TAIL_WIDTH = 0.5;
const JET_TAIL_HEIGHT = 0.75;
const JET_COCKPIT_INSET = 0.6; // of the fuselage length
const JET_COCKPIT_LENGTH_FACTOR = 0.22; // of the fuselage length
const JET_COCKPIT_HEIGHT = 0.32;
const JET_COCKPIT_HEIGHT_FACTOR = 0.5; // of the fuselage height
const JET_FLAME_COLOUR = [0.95, 0.62, 0.3];
const JET_FLAME_BASE = 0.5; // shortest flame
const JET_FLAME_SWING = 0.4; // extra length added by the animation
const JET_FLAME_SPEED = 12; // how fast the flame flickers

// Falling bomb and its warning markers.
const WARNING_BLINK_SPEED = 8; // the markers flash this often per second
const WARNING_LINE_STEP = 0.8; // distance between two dashes of the drop line
const WARNING_LINE_WIDTH = 0.14;
const WARNING_LINE_HEIGHT = 0.4;
const WARNING_LINE_BRIGHT = [0.95, 0.45, 0.35];
const WARNING_LINE_DIM = [0.6, 0.3, 0.28];
const GROUND_MARKER_WIDTH = 2.2;
const GROUND_MARKER_HEIGHT = 0.22;
const GROUND_MARKER_BRIGHT = [0.92, 0.36, 0.3];
const GROUND_MARKER_DIM = [0.66, 0.26, 0.24];
const MARKER_CORE_WIDTH = 0.8;
const MARKER_CORE_HEIGHT = 0.3;
const MARKER_CORE_BRIGHT = [1, 0.55, 0.4];
const MARKER_CORE_DIM = [0.8, 0.4, 0.35];
const BOMB_BODY_COLOUR = [0.32, 0.34, 0.39];
const BOMB_BODY_TOP_COLOUR = [0.5, 0.52, 0.58];
const BOMB_FIN_COLOUR = [0.45, 0.47, 0.52];
const BOMB_FIN_WIDTH = 0.56;
const BOMB_FIN_HEIGHT = 0.28;
const BOMB_LIGHT_WIDTH = 0.2;
const BOMB_LIGHT_HEIGHT = 0.28;
const BOMB_LIGHT_SIDE = 0.1; // the fuse light is centred on the bomb
const BOMB_LIGHT_BRIGHT = [1, 0.7, 0.3];
const BOMB_LIGHT_DIM = [0.5, 0.35, 0.2];

// Explosion: smoke, flame and a hot core, all round and growing.
const BLAST_START_SCALE = 0.4; // size at the moment of the blast
const BLAST_GROWTH = 0.6; // extra size at the end of the blast
const BLAST_LIFT_FACTOR = 0.6; // the fireball centre sits above the ground
const SCORCH_HEIGHT = 0.18; // dark mark on the ground the bomb hit
const SCORCH_COLOUR = [0.2, 0.22, 0.26];
const SMOKE_COLOUR = [0.35, 0.33, 0.32];
const FLAME_COLOUR = [0.92, 0.45, 0.22];
const FLAME_SIZE_FACTOR = 0.72; // of the smoke radius
const CORE_COLOUR = [1, 0.9, 0.55];
const CORE_SIZE_FACTOR = 0.4; // of the smoke radius
const FRAGMENT_COUNT = 6; // pieces thrown to each side
const FRAGMENT_SIZE = 0.25;
const FRAGMENT_SPREAD_BASE = 0.6; // of the blast radius
const FRAGMENT_SPREAD_EXTRA = 0.8; // random part of the throw distance
const FRAGMENT_RISE = 1.2; // fragments drift upwards as the blast ages
const FRAGMENT_RISE_BACK = 1.5; // the pieces behind rise a little further

/** Draw a jet fighter crossing the sky, nose pointed in its travel direction. */
export function drawJet(painter, jet, cam, time) {
  const front = jet.dir > 0 ? jet.x + jet.w : jet.x;
  const back = jet.dir > 0 ? jet.x : jet.x + jet.w;

  // Exhaust trail behind the aircraft.
  const trailLength = JET_TRAIL_BASE + JET_TRAIL_SWING * Math.abs(Math.sin(time * JET_TRAIL_SPEED + jet.id));
  const trailX = jet.dir > 0 ? back - trailLength : back;
  painter.rect(trailX, jet.y + jet.h * JET_TRAIL_HEIGHT_FACTOR, trailLength, JET_TRAIL_HEIGHT, JET_TRAIL_COLOUR, cam);

  // Fuselage, nose cone, wing and tail fin.
  painter.rect(jet.x, jet.y, jet.w, jet.h, JET_BODY_COLOUR, cam, mix(JET_BODY_COLOUR, WHITE, JET_BODY_LIGHT_MIX));
  painter.rect(jet.dir > 0 ? front : front - JET_NOSE_LENGTH, jet.y + jet.h * JET_NOSE_HEIGHT_OFFSET, JET_NOSE_LENGTH, jet.h * JET_NOSE_HEIGHT_FACTOR, JET_BODY_COLOUR, cam);
  painter.rect(jet.x + jet.w * JET_WING_INSET, jet.y - JET_WING_DROP, jet.w * JET_WING_LENGTH_FACTOR, JET_WING_HEIGHT, JET_DARK_COLOUR, cam);
  painter.rect(jet.dir > 0 ? back : back - JET_TAIL_WIDTH, jet.y + jet.h, JET_TAIL_WIDTH, JET_TAIL_HEIGHT, JET_DARK_COLOUR, cam);
  painter.rect(jet.x + jet.w * JET_COCKPIT_INSET, jet.y + jet.h * JET_COCKPIT_HEIGHT_FACTOR, jet.w * JET_COCKPIT_LENGTH_FACTOR, JET_COCKPIT_HEIGHT, JET_COCKPIT_COLOUR, cam);

  // Flickering engine flame at the rear.
  const flameLength = JET_FLAME_BASE + JET_FLAME_SWING * Math.abs(Math.sin(time * JET_FLAME_SPEED + jet.id));
  painter.rect(jet.dir > 0 ? back - flameLength : back, jet.y + jet.h * JET_NOSE_HEIGHT_OFFSET, flameLength, jet.h * JET_NOSE_HEIGHT_FACTOR, JET_FLAME_COLOUR, cam);
}

/** Draw a falling bomb, its dashed drop line and the blinking ground marker. */
export function drawBomb(painter, bomb, cam, time) {
  // Every other frame the warning flashes, so the player sees it clearly.
  const isBright = Math.floor(time * WARNING_BLINK_SPEED) % 2 === 0;

  if (bomb.targetY !== null) drawBombWarning(painter, bomb, cam, isBright);

  // The bomb itself: dark body, fins and a blinking fuse light.
  painter.rect(bomb.x - bomb.w / 2, bomb.y, bomb.w, bomb.h, BOMB_BODY_COLOUR, cam, BOMB_BODY_TOP_COLOUR);
  painter.rect(bomb.x - BOMB_FIN_WIDTH / 2, bomb.y + bomb.h, BOMB_FIN_WIDTH, BOMB_FIN_HEIGHT, BOMB_FIN_COLOUR, cam);
  const lightY = bomb.y + bomb.h + BOMB_FIN_HEIGHT;
  painter.rect(bomb.x - BOMB_LIGHT_SIDE, lightY, BOMB_LIGHT_WIDTH, BOMB_LIGHT_HEIGHT, isBright ? BOMB_LIGHT_BRIGHT : BOMB_LIGHT_DIM, cam);
}

/** Mark the drop line and the exact spot on the ground that will be hit. */
function drawBombWarning(painter, bomb, cam, isBright) {
  const lineColour = isBright ? WARNING_LINE_BRIGHT : WARNING_LINE_DIM;
  for (let y = bomb.targetY; y < bomb.y; y += WARNING_LINE_STEP) {
    painter.rect(bomb.x - WARNING_LINE_WIDTH / 2, y, WARNING_LINE_WIDTH, WARNING_LINE_HEIGHT, lineColour, cam);
  }

  // Danger marker on the ground: a wide bar with a bright core above it.
  const markerColour = isBright ? GROUND_MARKER_BRIGHT : GROUND_MARKER_DIM;
  painter.rect(bomb.x - GROUND_MARKER_WIDTH / 2, bomb.targetY, GROUND_MARKER_WIDTH, GROUND_MARKER_HEIGHT, markerColour, cam);

  const coreColour = isBright ? MARKER_CORE_BRIGHT : MARKER_CORE_DIM;
  painter.rect(bomb.x - MARKER_CORE_WIDTH / 2, bomb.targetY + GROUND_MARKER_HEIGHT, MARKER_CORE_WIDTH, MARKER_CORE_HEIGHT, coreColour, cam);
}

/** Draw an explosion: a growing fireball with a bright core and dark smoke. */
export function drawBlast(painter, blast, cam, time) {
  const duration = blast.duration || BLAST_DURATION;
  const age = Math.min(1, (time - blast.start) / duration);
  const radius = blast.radius * (BLAST_START_SCALE + BLAST_GROWTH * age);
  const centreY = blast.y + radius * BLAST_LIFT_FACTOR;

  // Scorch mark on the solid ground the bomb hit.
  painter.rect(blast.x - radius, blast.y, radius * 2, SCORCH_HEIGHT, SCORCH_COLOUR, cam);

  painter.disc(blast.x, centreY, radius, SMOKE_COLOUR, cam);
  painter.disc(blast.x, centreY, radius * FLAME_SIZE_FACTOR, FLAME_COLOUR, cam);
  painter.disc(blast.x, centreY, radius * CORE_SIZE_FACTOR, CORE_COLOUR, cam);

  drawBlastFragments(painter, blast, cam, age, radius, centreY);
}

/** Debris thrown to both sides; the hash keeps the scatter stable per blast. */
function drawBlastFragments(painter, blast, cam, age, radius, centreY) {
  for (let piece = 0; piece < FRAGMENT_COUNT; piece++) {
    const spread = radius * (FRAGMENT_SPREAD_BASE + hash(Math.round(blast.x * 10), piece) * FRAGMENT_SPREAD_EXTRA);
    painter.rect(blast.x + spread, centreY + age * FRAGMENT_RISE, FRAGMENT_SIZE, FRAGMENT_SIZE, SMOKE_COLOUR, cam);
    painter.rect(blast.x - spread, centreY + age * FRAGMENT_RISE_BACK, FRAGMENT_SIZE, FRAGMENT_SIZE, SMOKE_COLOUR, cam);
  }
}
