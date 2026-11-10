// Purpose: Draw the playable level itself: the ground and floating platforms
// with their brick or plank surface, the walkable top edge, the grass on top of
// ground blocks and the scenery props. A platform shows a real photo when
// textures.js delivered one, otherwise a pattern is computed from its own
// coordinates, which keeps the world data small and the look reproducible.

import { hash } from "./prng.js";
import { mix, WHITE, BLACK } from "./painter.js";

// The starting wall: a stone pillar with a mortar seam in every block row.
const WALL_BODY_COLOUR = [0.33, 0.36, 0.43];
const WALL_SEAM_COLOUR = [0.26, 0.29, 0.35];
const WALL_SEAM_THICKNESS = 0.12;
const WALL_SEAM_OFFSET = 0.35; // the seam sits inside a row, not on its edge

// Bodies and top surfaces of the two platform kinds: ground is thick and green,
// a floating platform is thin and warm, so the player sees the difference.
const GROUND_BODY_COLOUR = [0.31, 0.4, 0.32];
const GROUND_TOP_COLOUR = [0.41, 0.76, 0.44];
const FLOAT_BODY_COLOUR = [0.55, 0.49, 0.42];
const FLOAT_TOP_COLOUR = [0.86, 0.78, 0.58];

// Photo textures: one brick photo covers three world units; the wood planks are
// smaller because the planks themselves are smaller.
const BRICK_TEXTURE_NAME = "brick";
const WOOD_TEXTURE_NAME = "wood";
const BRICK_TILE = 3; // world units per photo tile
const WOOD_TILE = 2;

// One thin mortar line keeps the brick photo connected to the look of the game
// without hiding the photograph.
const PHOTO_SEAM_LIFT = 0.5; // measured down from the top of the block
const PHOTO_SEAM_THICKNESS = 0.1;
const PHOTO_SEAM_MIX = 0.2; // of black mixed into the body colour

// Fallback brick pattern, used when the photo is missing: mortar lines plus a
// few bricks in a slightly lighter shade.
const BRICK_MORTAR_MIX = 0.22; // of black mixed into the body colour
const BRICK_MODULE = 1; // one brick row is one world unit tall
const BRICK_ROW_SEAM_OFFSET = 0.9; // the seam sits near the top of a row
const BRICK_SEAM_THICKNESS = 0.1;
const BRICK_SEAM_HEIGHT = 0.9;
const BRICK_ROW_OFFSET = 0.5; // every other row is shifted by half a brick
const BRICK_SEAM_EDGE_GUARD = 0.05; // no vertical seam right at the edge
const BRICK_SHADE_CHANCE = 0.28; // share of bricks that get a lighter shade
const BRICK_SHADE_INSET_X = 0.1;
const BRICK_SHADE_INSET_Y = 0.12;
const BRICK_SHADE_WIDTH = 0.8;
const BRICK_SHADE_HEIGHT = 0.72;
const BRICK_SHADE_LIGHT_MIX = 0.07; // of white mixed into the body colour

// The lighter strip along the walkable surface that makes a block look lit.
const TOP_EDGE_HEIGHT = 0.35;

// Grass on the walkable surface.
const GRASS_BLADES_PER_UNIT = 2; // blades per world unit of width
const GRASS_SIDE_MARGIN = 0.2; // the first blade is set in from the edge
const GRASS_STEP = 0.5; // distance between two blades
const GRASS_JITTER = 0.25; // random shift so the blades are not a fence
const GRASS_MIN_HEIGHT = 0.15;
const GRASS_GROWTH = 0.4; // extra height taken by the random part
const GRASS_WIDTH = 0.1;
const GRASS_BLADE_COLOUR = [0.18, 0.44, 0.28];
const GRASS_BLADE_MIX = 0.4; // of the blade colour mixed into the surface

// One world coordinate scaled by this factor seeds every per-brick and
// per-blade decision, so the pattern is stable for a platform.
const COORD_HASH_SCALE = 10;

// Scenery colours. Every prop is decoration only and never part of a collision.
const BUSH_COLOUR = [0.28, 0.58, 0.4];
const BUSH_TOP_COLOUR = [0.4, 0.72, 0.5];
const BUSH_LIGHT_COLOUR = [0.43, 0.76, 0.52];
const BUSH_LEAF_COLOUR = [0.2, 0.44, 0.33];
const BUSH_LEAF_SIZE = 0.14;
const TREE_TRUNK_COLOUR = [0.38, 0.29, 0.22];
const TREE_CANOPY_COLOUR = [0.33, 0.6, 0.43];
const TREE_CANOPY_LIGHT_COLOUR = [0.45, 0.72, 0.52];
const TREE_LEAF_COLOUR = [0.22, 0.45, 0.35];
const TREE_LEAF_SIZE = 0.16;
const FLOWER_STEM_COLOUR = [0.3, 0.55, 0.4];
const FLOWER_HEAD_COLOUR = [0.86, 0.5, 0.6];
const FLOWER_HEAD_TOP_COLOUR = [0.95, 0.66, 0.72];
const FLOWER_CORE_COLOUR = [0.98, 0.86, 0.4];
const ROCK_COLOUR = [0.49, 0.51, 0.55];
const ROCK_TOP_COLOUR = [0.58, 0.6, 0.64];
const ROCK_SHADE_COLOUR = [0.42, 0.44, 0.48];
const LAMP_POLE_COLOUR = [0.3, 0.33, 0.38];
const LAMP_POLE_WIDTH = 0.16;
const LAMP_GLOW_COLOUR = [0.95, 0.85, 0.45];
const LAMP_GLOW_TOP_COLOUR = [1, 0.95, 0.65];
const LAMP_GLOW_WIDTH = 0.76;
const LAMP_GLOW_HEIGHT = 0.5;
const LAMP_GLOW_SIDE_OFFSET = 0.3; // the lamp head hangs over the pole
const LAMP_GLOW_TOP_LIFT = 0.5; // height of the head above the top of the pole
const LAMP_HOUSING_COLOUR = [0.62, 0.56, 0.4];
const LAMP_HOUSING_WIDTH = 1.16;
const LAMP_HOUSING_HEIGHT = 0.4;
const LAMP_HOUSING_SIDE_OFFSET = 0.5;
const LAMP_HOUSING_TOP_LIFT = 0.9; // height of the housing above the top

/**
 * Draw one platform: the photo body when the texture arrived, otherwise the
 * procedural pattern, then the top edge and the grass of walkable ground.
 */
export function drawPlatform(painter, platform, cam) {
  if (platform.kind === "wall") {
    drawWall(painter, platform, cam);
    return;
  }

  const isGround = platform.kind === "ground";
  const body = isGround ? GROUND_BODY_COLOUR : FLOAT_BODY_COLOUR;
  const surface = isGround ? GROUND_TOP_COLOUR : FLOAT_TOP_COLOUR;

  // The photo is one textured quad and is flushed right away, so the flat
  // details that follow always end up on top of it.
  const photo = painter.rectTex(
    platform.x,
    platform.y,
    platform.w,
    platform.h,
    body,
    cam,
    isGround ? BRICK_TEXTURE_NAME : WOOD_TEXTURE_NAME,
    isGround ? BRICK_TILE : WOOD_TILE
  );
  painter.flushTextures();

  if (photo) {
    painter.rect(
      platform.x,
      platform.y + platform.h - PHOTO_SEAM_LIFT,
      platform.w,
      PHOTO_SEAM_THICKNESS,
      mix(body, BLACK, PHOTO_SEAM_MIX),
      cam
    );
  } else {
    drawBrickPattern(painter, platform, cam, body);
  }

  painter.rect(platform.x, platform.top - TOP_EDGE_HEIGHT, platform.w, TOP_EDGE_HEIGHT, surface, cam);

  if (isGround) drawGrass(painter, platform, cam, surface);
}

/** Draw the tall stone pillar that stops the player at the left edge. */
function drawWall(painter, platform, cam) {
  painter.rect(platform.x, platform.y, platform.w, platform.h, WALL_BODY_COLOUR, cam);

  for (let row = 0; row < Math.floor(platform.h); row++) {
    painter.rect(platform.x, platform.y + row + WALL_SEAM_OFFSET, platform.w, WALL_SEAM_THICKNESS, WALL_SEAM_COLOUR, cam);
  }
}

/** Mortar lines and a few lighter bricks, all derived from the coordinates. */
function drawBrickPattern(painter, platform, cam, body) {
  const mortar = mix(body, BLACK, BRICK_MORTAR_MIX);
  const columns = Math.floor(platform.w / BRICK_MODULE);
  const rows = Math.floor(platform.h / BRICK_MODULE);

  for (let row = 0; row < rows; row++) {
    const rowY = platform.y + row * BRICK_MODULE;
    painter.rect(platform.x, rowY + BRICK_ROW_SEAM_OFFSET, platform.w, BRICK_SEAM_THICKNESS, mortar, cam);

    const shift = row % 2 === 0 ? 0 : BRICK_ROW_OFFSET;
    for (let column = 0; column <= columns; column++) {
      const seamX = platform.x + column * BRICK_MODULE + shift;
      if (seamX < platform.x + platform.w - BRICK_SEAM_EDGE_GUARD) {
        painter.rect(seamX, rowY, BRICK_SEAM_THICKNESS, BRICK_SEAM_HEIGHT, mortar, cam);
      }
    }

    for (let column = 0; column < columns; column++) {
      const pattern = hash(
        Math.round(platform.x * COORD_HASH_SCALE) + column,
        Math.round(platform.y * COORD_HASH_SCALE) + row
      );
      if (pattern < BRICK_SHADE_CHANCE) {
        painter.rect(
          platform.x + column * BRICK_MODULE + shift + BRICK_SHADE_INSET_X,
          rowY + BRICK_SHADE_INSET_Y,
          BRICK_SHADE_WIDTH,
          BRICK_SHADE_HEIGHT,
          mix(body, WHITE, BRICK_SHADE_LIGHT_MIX),
          cam
        );
      }
    }
  }
}

/** The grass blades standing on the walkable surface of a ground block. */
function drawGrass(painter, platform, cam, surface) {
  const bladeCount = Math.floor(platform.w * GRASS_BLADES_PER_UNIT);
  const bladeColour = mix(surface, GRASS_BLADE_COLOUR, GRASS_BLADE_MIX);

  for (let blade = 0; blade < bladeCount; blade++) {
    const x =
      platform.x + GRASS_SIDE_MARGIN + blade * GRASS_STEP + hash(blade, Math.round(platform.top * COORD_HASH_SCALE)) * GRASS_JITTER;
    if (x > platform.x + platform.w - GRASS_SIDE_MARGIN) break;

    const height = GRASS_MIN_HEIGHT + hash(blade, Math.round(platform.y * COORD_HASH_SCALE)) * GRASS_GROWTH;
    painter.rect(x, platform.top, GRASS_WIDTH, height, bladeColour, cam);
  }
}

/** Draw scenery: bush, tree, flower, rock or street lamp. */
export function drawDecor(painter, decor, cam) {
  const { x, y, w, h } = decor;

  if (decor.type === "bush") {
    painter.rect(x, y, w, h, BUSH_COLOUR, cam, BUSH_TOP_COLOUR);
    painter.rect(x + w * 0.18, y + h * 0.6, w * 0.64, h * 0.4, BUSH_LIGHT_COLOUR, cam);
    painter.rect(x + w * 0.1, y + h * 0.15, BUSH_LEAF_SIZE, BUSH_LEAF_SIZE, BUSH_LEAF_COLOUR, cam);
    painter.rect(x + w * 0.6, y + h * 0.35, BUSH_LEAF_SIZE, BUSH_LEAF_SIZE, BUSH_LEAF_COLOUR, cam);
  } else if (decor.type === "tree") {
    painter.rect(x, y, w, h, TREE_TRUNK_COLOUR, cam);
    painter.rect(x - w * 0.6, y + h * 0.55, w * 2.2, h * 0.45, TREE_CANOPY_COLOUR, cam);
    painter.rect(x - w * 0.3, y + h * 0.7, w * 1.2, h * 0.25, TREE_CANOPY_LIGHT_COLOUR, cam);
    painter.rect(x - w * 0.5, y + h * 0.6, TREE_LEAF_SIZE, TREE_LEAF_SIZE, TREE_LEAF_COLOUR, cam);
  } else if (decor.type === "flower") {
    painter.rect(x + w * 0.4, y, w * 0.2, h, FLOWER_STEM_COLOUR, cam);
    painter.rect(x, y + h * 0.55, w, h * 0.45, FLOWER_HEAD_COLOUR, cam, FLOWER_HEAD_TOP_COLOUR);
    painter.rect(x + w * 0.35, y + h * 0.7, w * 0.3, h * 0.2, FLOWER_CORE_COLOUR, cam);
  } else if (decor.type === "rock") {
    painter.rect(x, y, w, h, ROCK_COLOUR, cam, ROCK_TOP_COLOUR);
    painter.rect(x + w * 0.2, y + h * 0.3, w * 0.3, h * 0.3, ROCK_SHADE_COLOUR, cam);
  } else if (decor.type === "lamp") {
    drawStreetLamp(painter, decor, cam);
  }
}

/** A street lamp: the pole, the glowing head and its dark housing. */
function drawStreetLamp(painter, decor, cam) {
  const { x, y, h } = decor;

  painter.rect(x, y, LAMP_POLE_WIDTH, h, LAMP_POLE_COLOUR, cam);
  painter.rect(x - LAMP_GLOW_SIDE_OFFSET, y + h - LAMP_GLOW_TOP_LIFT, LAMP_GLOW_WIDTH, LAMP_GLOW_HEIGHT, LAMP_GLOW_COLOUR, cam, LAMP_GLOW_TOP_COLOUR);
  painter.rect(x - LAMP_HOUSING_SIDE_OFFSET, y + h - LAMP_HOUSING_TOP_LIFT, LAMP_HOUSING_WIDTH, LAMP_HOUSING_HEIGHT, LAMP_HOUSING_COLOUR, cam);
}
