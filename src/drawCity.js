// Purpose: Draw the city skyline and the hills behind the playable level.
// Each layer is moved by a scaled camera instead of scaled world data, which is
// what makes it read as distance (see design-guidelines/background-parallax.md).

import { hash } from "./prng.js";
import { mix, WHITE, BLACK } from "./painter.js";
import { SKYLINE_FAR_LAYER, SKYLINE_NEAR_LAYER } from "./world.js";

// Parallax factors: the smaller the factor, the slower a layer moves, so the
// eye reads the order as distance. The vertical factors stay smaller than the
// horizontal ones because the player mostly runs sideways: strong vertical
// shifts would make the buildings slide up and down and distract from the
// platforms.
const PARALLAX_FAR_X = 0.22;
const PARALLAX_FAR_Y = 0.12;
const PARALLAX_NEAR_X = 0.48;
const PARALLAX_NEAR_Y = 0.28;

// Distant buildings are hazier and lighter, the ones in front are darker:
// depth is expressed by value, not by blur.
const FAR_BUILDING_COLOUR = [0.24, 0.31, 0.4];
const NEAR_BUILDING_COLOUR = [0.16, 0.21, 0.29];
const FAR_HILL_COLOUR = [0.2, 0.28, 0.36];

// The lighter roof edge that makes a tower look like a lit solid.
const ROOF_EDGE_INSET = 0.08; // the edge does not reach the wall corners
const ROOF_EDGE_WIDTH = 0.84; // of the building width
const ROOF_EDGE_HEIGHT = 0.5;
const ROOF_EDGE_LIGHT = 0.1; // of white mixed into the wall colour

// Window grid. Rows are counted from the roof downwards because the roof is
// the only fixed reference of a tower.
const WINDOW_STEP_X = 1.4; // distance between two window columns
const WINDOW_STEP_Y = 1.7; // distance between two window rows
const WINDOW_WIDTH = 0.7;
const WINDOW_HEIGHT = 0.9;
const WINDOW_SIDE_MARGIN = 0.35; // first window is set in from the wall
const WINDOW_ROOF_GAP = 1.2; // first row sits below the roof
const MAX_WINDOW_ROWS = 16; // a tower is never drawn with more rows
const WINDOW_HASH_COLUMN = 97; // mixes the building id into the window pattern

// Lit windows: the near layer has more light on, and a few windows blink over
// time so the city looks alive.
const LIT_CHANCE_NEAR = 0.6;
const LIT_CHANCE_FAR = 0.3;
const BLINK_HASH_MIN = 0.88; // share of windows that may blink
const BLINK_SPEED = 1.5; // how often the blinking windows swap
const LIT_COLOUR_NEAR = [0.93, 0.78, 0.38];
const LIT_COLOUR_FAR = [0.62, 0.68, 0.55];
const DARK_WINDOW_MIX = 0.3; // unlit windows are darker than the wall

// Roof additions of the near layer only. The two salts keep the mast and the
// wing of one building from appearing together.
const ANTENNA_HASH_SALT = 17;
const ANTENNA_HASH_MIN = 0.6; // building id hash above which a mast appears
const ANTENNA_X_FACTOR = 0.45; // of the building width
const ANTENNA_WIDTH = 0.2;
const ANTENNA_HEIGHT = 1.8;
const ANTENNA_COLOUR = [0.36, 0.42, 0.5];
const SIDE_TOWER_HASH_SALT = 29;
const SIDE_TOWER_HASH_MIN = 0.7; // building id hash above which a wing appears
const SIDE_TOWER_WIDTH = 0.6;
const SIDE_TOWER_HEIGHT = 0.5;
const SIDE_TOWER_HEIGHT_FACTOR = 0.5; // of the building height, measured down
const SIDE_TOWER_COLOUR = [0.3, 0.36, 0.44];

/**
 * Draw the far city layer and the hills in front of it. The hills use the same
 * slow camera as the far towers, so both layers move at one speed.
 */
export function drawFarLayer(painter, world, cam, time) {
  const farCam = { x: cam.x * PARALLAX_FAR_X, y: cam.y * PARALLAX_FAR_Y };

  for (const building of world.buildings) {
    if (building.layer === SKYLINE_FAR_LAYER) drawBuilding(painter, building, farCam, false, time);
  }
  for (const hill of world.hills) {
    drawHill(painter, hill, farCam);
  }
}

/** Draw the nearer city layer, which moves faster than the far one. */
export function drawNearLayer(painter, world, cam, time) {
  const nearCam = { x: cam.x * PARALLAX_NEAR_X, y: cam.y * PARALLAX_NEAR_Y };

  for (const building of world.buildings) {
    if (building.layer === SKYLINE_NEAR_LAYER) drawBuilding(painter, building, nearCam, true, time);
  }
}

/**
 * Draw one tower. `building.y` is the ground line of its lot, but the tower is
 * drawn down past the bottom of the screen so it never looks cut off in
 * mid-air, whatever the camera does.
 */
function drawBuilding(painter, building, cam, isNear, time) {
  const wallColour = isNear ? NEAR_BUILDING_COLOUR : FAR_BUILDING_COLOUR;
  const roof = building.y + building.h;
  const base = painter.belowView(cam);

  painter.rect(building.x, base, building.w, roof - base, wallColour, cam);
  painter.rect(building.x + building.w * ROOF_EDGE_INSET, roof, building.w * ROOF_EDGE_WIDTH, ROOF_EDGE_HEIGHT, mix(wallColour, WHITE, ROOF_EDGE_LIGHT), cam);

  drawWindows(painter, building, cam, isNear, time, wallColour, roof, base);
  drawRoofAdditions(painter, building, cam, isNear, roof);
}

/** Light the window grid of a tower, counted from the roof downwards. */
function drawWindows(painter, building, cam, isNear, time, wallColour, roof, base) {
  const columns = Math.max(1, Math.floor(building.w / WINDOW_STEP_X));
  // Rows below the view are dropped by the visibility test inside rect(), so
  // drawing the full grid costs nothing.
  const rows = Math.max(1, Math.min(MAX_WINDOW_ROWS, Math.floor((roof - base) / WINDOW_STEP_Y)));
  const litChance = isNear ? LIT_CHANCE_NEAR : LIT_CHANCE_FAR;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const pattern = hash(building.id * WINDOW_HASH_COLUMN + row, column);
      const blinking = pattern > BLINK_HASH_MIN && Math.floor(time * BLINK_SPEED + building.id + row) % 2 === 0;
      const isLit = pattern < litChance || blinking;

      const windowColour = isLit
        ? (isNear ? LIT_COLOUR_NEAR : LIT_COLOUR_FAR)
        : mix(wallColour, BLACK, DARK_WINDOW_MIX);

      painter.rect(
        building.x + WINDOW_SIDE_MARGIN + column * WINDOW_STEP_X,
        roof - WINDOW_ROOF_GAP - row * WINDOW_STEP_Y,
        WINDOW_WIDTH,
        WINDOW_HEIGHT,
        windowColour,
        cam
      );
    }
  }
}

/** Add a mast or a side wing to some of the near towers. */
function drawRoofAdditions(painter, building, cam, isNear, roof) {
  if (!isNear) return;

  if (hash(building.id, 17) > ANTENNA_HASH_MIN) {
    painter.rect(building.x + building.w * ANTENNA_X_FACTOR, roof + ROOF_EDGE_HEIGHT, ANTENNA_WIDTH, ANTENNA_HEIGHT, ANTENNA_COLOUR, cam);
  }
  if (hash(building.id, 29) > SIDE_TOWER_HASH_MIN) {
    painter.rect(
      building.x - SIDE_TOWER_WIDTH,
      roof - building.h * SIDE_TOWER_HEIGHT_FACTOR,
      SIDE_TOWER_WIDTH,
      SIDE_TOWER_HEIGHT,
      SIDE_TOWER_COLOUR,
      cam
    );
  }
}

/** Draw one background hill as a plain block that runs off the screen. */
function drawHill(painter, hill, cam) {
  const base = painter.belowView(cam);
  const peak = hill.y + hill.h * 0.5; // only the lower half of a hill shows
  painter.rect(hill.x, base, hill.w, peak - base, FAR_HILL_COLOUR, cam);
}
