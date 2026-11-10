// Purpose: Draw the fixed sky of the scene: the vertical gradient, the stars,
// the slowly drifting clouds and the moon on its arc. Nothing here moves with
// the camera, which is what makes the sky read as infinitely far away.

import { MOON_RADIUS, moonPosition, moonTint } from "./moon.js";
import { mix, WHITE } from "./painter.js";

// Sky gradient: dark blue at the top, pale near the horizon.
const SKY_TOP_COLOUR = [0.09, 0.14, 0.26];
const SKY_BOTTOM_COLOUR = [0.6, 0.76, 0.84];

// Stars are placed by a fixed formula instead of being stored, so the sky is
// the same in every run and costs no memory.
const STAR_COUNT = 42;
const STAR_STEP_X = 0.049; // horizontal distance between two stars
const STAR_STEP_Y = 0.137; // vertical distance between two stars
const STAR_WRAP_X = 2; // clip space width the star field is repeated over
const STAR_WRAP_Y = 0.85; // clip space height the star field is repeated over
const STAR_BOTTOM = 0.06; // stars start above the horizon, not at its edge
const STAR_SIZE = 0.006; // one star is a tiny square
const STAR_COLOUR = [0.85, 0.9, 0.95];

// Clouds drift with the frame time and wrap around the screen.
const CLOUD_COUNT = 6;
const CLOUD_STEP_X = 0.42; // horizontal distance between two clouds
const CLOUD_STEP_Y = 0.31; // vertical distance between two clouds
const CLOUD_WRAP_X = 2.4; // width of the drift before a cloud starts again
const CLOUD_WRAP_Y = 0.62; // height the cloud band is repeated over
const CLOUD_BOTTOM = 0.16; // lowest cloud in clip space
const CLOUD_LEFT_EDGE = -1.2; // a wrapped cloud enters just outside the screen
const CLOUD_DRIFT_SPEED = 0.012; // clip space per second: barely noticeable
const CLOUD_ALPHA = 0.55; // clouds stay translucent
const CLOUD_HAZE_COLOUR = [0.4, 0.5, 0.6];
const CLOUD_CORE_COLOUR = [0.45, 0.55, 0.65];
const CLOUD_SHADE_COLOUR = [0.38, 0.47, 0.57];

// One cloud is a stack of thin haze strips; the offsets keep them overlapping.
const CLOUD_STRIPS = [
  { x: 0, y: 0, w: 0.42, h: 0.035, colour: CLOUD_HAZE_COLOUR },
  { x: 0.08, y: 0.035, w: 0.24, h: 0.03, colour: CLOUD_CORE_COLOUR },
  { x: 0.05, y: -0.02, w: 0.14, h: 0.02, colour: CLOUD_SHADE_COLOUR },
];

// The moon is a photo disc plus a soft halo that lights the sky around it.
const MOON_HALO_FACTOR = 1.9; // the halo is wider than the disc
const MOON_HALO_LIGHT = 0.3; // how much white is mixed into the halo
const MOON_HALO_ALPHA = 0.16; // halo strength when the moon stands low
const MOON_HALO_GAIN = 0.1; // extra halo strength at full altitude

/** Paint the sky gradient and the stars on top of it. */
export function drawSky(painter) {
  painter.skyGradient(SKY_TOP_COLOUR, SKY_BOTTOM_COLOUR);

  for (let star = 0; star < STAR_COUNT; star++) {
    const x = -1 + ((star * STAR_STEP_X) % STAR_WRAP_X);
    const y = STAR_BOTTOM + ((star * STAR_STEP_Y) % STAR_WRAP_Y);
    painter.rectClip(x, y, STAR_SIZE, STAR_SIZE, STAR_COLOUR);
  }
}

/** Draw the thin drifting haze strips. */
export function drawClouds(painter, time) {
  for (let cloud = 0; cloud < CLOUD_COUNT; cloud++) {
    const x = ((cloud * CLOUD_STEP_X + time * CLOUD_DRIFT_SPEED) % CLOUD_WRAP_X) + CLOUD_LEFT_EDGE;
    const y = CLOUD_BOTTOM + ((cloud * CLOUD_STEP_Y) % CLOUD_WRAP_Y);

    for (const strip of CLOUD_STRIPS) {
      painter.rectClip(x + strip.x, y + strip.y, strip.w, strip.h, strip.colour, CLOUD_ALPHA);
    }
  }
}

/**
 * Draw the moon: a soft halo plus the photo disc, or a flat disc when the
 * photo is missing. Called before the skyline so towers can hide the moon
 * while it rises and sets.
 */
export function drawMoon(painter, time) {
  const moon = moonPosition(time);
  const tint = moonTint(moon.altitude);
  const haloAlpha = MOON_HALO_ALPHA + MOON_HALO_GAIN * moon.altitude;

  painter.discClip(moon.x, moon.y, MOON_RADIUS * MOON_HALO_FACTOR, mix(tint, WHITE, MOON_HALO_LIGHT), haloAlpha);

  if (painter.hasTexture("moon")) {
    painter.discTex(moon.x, moon.y, MOON_RADIUS, tint, "moon");
  } else {
    painter.discClip(moon.x, moon.y, MOON_RADIUS, tint);
  }
}
