// Purpose: Compute where the moon sits in the sky. It rises on the left in an
// arc, stands still for a moment at the top centre, then sets on the right,
// and starts again. Pure maths, so the path can be tested without a browser.

export const MOON_RISE = 10; // seconds to climb from the left horizon to the top
export const MOON_HOLD = 3; // seconds the moon stays at the highest point
export const MOON_SET = 10; // seconds to sink down to the right horizon
export const MOON_CYCLE = MOON_RISE + MOON_HOLD + MOON_SET;

export const MOON_RADIUS = 0.1; // half width of the disc in clip space (-1..1)

const HORIZON = -1.1; // clip-space height where the moon is fully off screen
const TOP = 0.72; // clip-space height at the highest point (below the HUD bar)
const LEFT = -1.2; // clip-space x of the rising moon
const RIGHT = 1.2; // clip-space x of the setting moon

/**
 * Position of the moon centre in clip space at a given time.
 * Returns { x, y, altitude, phase } with altitude 0 at the horizon and 1 at the
 * top, so the renderer can dim the moon near the horizon.
 */
export function moonPosition(time) {
  const cycle = ((time % MOON_CYCLE) + MOON_CYCLE) % MOON_CYCLE;

  if (cycle < MOON_RISE) {
    // Rising: 2t - t^2 is steep at the start and flattens as it reaches the top.
    const t = cycle / MOON_RISE;
    const altitude = 2 * t - t * t;
    return { x: LEFT + (0 - LEFT) * t, y: HORIZON + (TOP - HORIZON) * altitude, altitude, phase: "rise" };
  }

  if (cycle < MOON_RISE + MOON_HOLD) {
    return { x: 0, y: TOP, altitude: 1, phase: "high" };
  }

  // Setting: mirror image of the rise, so the arc is symmetric.
  const t = (cycle - MOON_RISE - MOON_HOLD) / MOON_SET;
  const altitude = 1 - t * t;
  return { x: RIGHT * t, y: HORIZON + (TOP - HORIZON) * altitude, altitude, phase: "set" };
}

/**
 * Colour of the moon for a given altitude: warm and dim near the horizon,
 * bright and pale when it is high in the sky.
 */
export function moonTint(altitude) {
  const t = Math.max(0, Math.min(1, altitude));
  return [0.62 + 0.38 * t, 0.52 + 0.44 * t, 0.42 + 0.52 * t];
}
