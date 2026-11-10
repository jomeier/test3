// Purpose: Draw the playable level itself: the ground and floating platforms
// with their brick or plank surface, the walkable top edge, the grass on top of
// ground blocks and the scenery props. The material pictures come from
// textures.js and are tiled on a grid of whole world units, so a joint always
// lands on a block edge; if a picture is missing, a pattern computed from the
// block coordinates is drawn instead.

import { hash } from "./prng.js";
import { mix, WHITE, BLACK } from "./painter.js";

// The starting pillar: a stone wall of ashlar blocks with a mortar joint around
// every block. The blocks are drawn, not textured, so the pillar reads as solid
// stone and stays different from the brick of the level.
const WALL_MORTAR_COLOUR = [0.26, 0.29, 0.35];
const WALL_STONE_COLOURS = [[0.37, 0.4, 0.47], [0.33, 0.36, 0.43], [0.3, 0.33, 0.4]];
const WALL_STONE_TOP_MIX = 0.08; // of white mixed into the top edge of one block
const WALL_COURSE_HEIGHT = 1; // one row of stone blocks
const WALL_BLOCK_WIDTH = 0.75; // one block, the pillar is two blocks wide
const WALL_JOINT = 0.07; // mortar thickness around a block
const WALL_STAGGER = [0, 0.5]; // every other row is shifted by half a block

// Bodies and top surfaces of the two platform kinds: ground is thick and green,
// a floating platform is thin and warm, so the player sees the difference.
const GROUND_BODY_COLOUR = [0.31, 0.4, 0.32];
const GROUND_TOP_COLOUR = [0.41, 0.76, 0.44];
const FLOAT_BODY_COLOUR = [0.55, 0.49, 0.42];
const FLOAT_TOP_COLOUR = [0.86, 0.78, 0.58];

// Material pictures from textures.js. One tile covers this many world units, and
// the module inside the picture divides that number: the brick pattern has a
// joint every half unit, the planks have a gap every half unit. Because every
// platform surface sits on a whole world unit, a joint always lands exactly on
// the edge of a block and the picture never looks cut.
const BRICK_TEXTURE_NAME = "brick";
const WOOD_TEXTURE_NAME = "wood";
const BRICK_TILE = 4; // world units per brick tile
const WOOD_TILE = 2; // world units per plank tile

// Colour the material picture is mixed toward (see PHOTO_TINT_AMOUNT in
// shaders.js). These are the material colours themselves, so the brick stays a
// warm red and the planks stay a warm tan instead of taking the block colour.
const BRICK_TEXTURE_TINT = [0.4, 0.28, 0.24];
const WOOD_TEXTURE_TINT = [0.45, 0.31, 0.18];

// Repetition breaker: every platform shifts its material tint by up to this
// share toward white or black, so two neighbouring blocks never look identical.
const PLATFORM_TINT_MIX = 0.22;

// Fallback brick pattern, used when the material picture is missing: mortar
// lines plus a few bricks in a slightly lighter shade.
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

// Shading that gives a block its depth: a lighter strip along the walkable
// surface, a thin contact shadow right under it and a darker band at the bottom
// of the block, so a flat box reads as a solid that is lit from above.
const TOP_EDGE_HEIGHT = 0.35;
const CONTACT_SHADOW_HEIGHT = 0.12; // directly under the surface strip
const CONTACT_SHADOW_MIX = 0.16; // of black mixed into the surface colour
const BOTTOM_SHADE_HEIGHT = 0.3;
const BOTTOM_SHADE_MIX = 0.2; // of black mixed into the body colour

// Grass on the walkable surface: two tone blades of different height, plus the
// occasional flower, so the surface line is not an even row of sticks.
const GRASS_BLADES_PER_UNIT = 3; // blades per world unit of width
const GRASS_SIDE_MARGIN = 0.15; // the first blade is set in from the edge
const GRASS_JITTER = 0.3; // random shift so the blades are not a fence
const GRASS_MIN_HEIGHT = 0.16;
const GRASS_GROWTH = 0.45; // extra height taken by the random part
const GRASS_TALL_CHANCE = 0.12; // share of blades that grow clearly higher
const GRASS_TALL_FACTOR = 1.5; // height of those blades
const GRASS_WIDTH = 0.11;
const GRASS_TIP_PART = 0.4; // part of the blade that carries the lighter tone
const GRASS_DARK_COLOUR = [0.16, 0.42, 0.26];
const GRASS_LIGHT_COLOUR = [0.36, 0.68, 0.4];
const GRASS_DARK_MIX = 0.55; // of the dark blade colour mixed into the surface
const GRASS_LIGHT_MIX = 0.35; // of the light blade colour mixed into the surface

// Flowers that stand in the grass now and then. They are separate from the
// flower prop of the scenery, which stands on its own on a platform.
const GRASS_FLOWER_CHANCE = 0.06; // share of blade spots that become a flower
const GRASS_FLOWER_STEM_HEIGHT = 0.3;
const GRASS_FLOWER_STEM_WIDTH = 0.06;
const GRASS_FLOWER_HEAD_SIZE = 0.2;
const GRASS_FLOWER_HEAD_COLOURS = [[0.9, 0.5, 0.58], [0.95, 0.85, 0.42], [0.62, 0.66, 0.92]];
const GRASS_FLOWER_CORE_SIZE = 0.09;
const GRASS_FLOWER_CORE_COLOUR = [0.98, 0.93, 0.55];

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
 * Draw one platform: the material picture when it is loaded, otherwise the
 * procedural pattern, then the depth shading, the walkable surface and the
 * grass of a ground block.
 */
export function drawPlatform(painter, platform, cam) {
  if (platform.kind === "wall") {
    drawStonePillar(painter, platform, cam);
    return;
  }

  const isGround = platform.kind === "ground";
  const body = isGround ? GROUND_BODY_COLOUR : FLOAT_BODY_COLOUR;
  const surface = isGround ? GROUND_TOP_COLOUR : FLOAT_TOP_COLOUR;

  // The material picture is one textured quad and is flushed right away, so the
  // flat details that follow always end up on top of it. The tint of each
  // platform is nudged a little by its own position: the same tile then shows
  // up twice in a row with a different lightness, which breaks the repeat the
  // eye would otherwise find.
  const picture = painter.rectTex(
    platform.x,
    platform.y,
    platform.w,
    platform.h,
    platformTint(isGround, platform),
    cam,
    isGround ? BRICK_TEXTURE_NAME : WOOD_TEXTURE_NAME,
    isGround ? BRICK_TILE : WOOD_TILE
  );
  painter.flushTextures();

  if (!picture) drawBrickPattern(painter, platform, cam, body);

  drawBlockShading(painter, platform, cam, body, surface);

  if (isGround) drawGrass(painter, platform, cam, surface);
}

/**
 * Material colour of one platform: the base tint shifted lighter or darker by
 * the platform position. The shift is picked from whole world units, so it is
 * stable while the player runs and never changes mid-block.
 */
function platformTint(isGround, platform) {
  const base = isGround ? BRICK_TEXTURE_TINT : WOOD_TEXTURE_TINT;
  const jitter = hash(Math.round(platform.x * COORD_HASH_SCALE), Math.round(platform.y * COORD_HASH_SCALE)) - 0.5;

  return jitter > 0 ? mix(base, WHITE, jitter * PLATFORM_TINT_MIX) : mix(base, BLACK, -jitter * PLATFORM_TINT_MIX);
}

/**
 * Light the block: a darker band at its bottom, the lighter strip along the
 * walkable surface and a thin contact shadow under that strip.
 */
function drawBlockShading(painter, platform, cam, body, surface) {
  painter.rect(platform.x, platform.y, platform.w, BOTTOM_SHADE_HEIGHT, mix(body, BLACK, BOTTOM_SHADE_MIX), cam);
  painter.rect(platform.x, platform.top - TOP_EDGE_HEIGHT, platform.w, TOP_EDGE_HEIGHT, surface, cam);
  painter.rect(
    platform.x,
    platform.top - TOP_EDGE_HEIGHT - CONTACT_SHADOW_HEIGHT,
    platform.w,
    CONTACT_SHADOW_HEIGHT,
    mix(surface, BLACK, CONTACT_SHADOW_MIX),
    cam
  );
}

/**
 * Draw the tall stone pillar that stops the player at the left edge: rows of
 * ashlar blocks with a mortar joint all around each block, every other row
 * shifted by half a block.
 */
function drawStonePillar(painter, platform, cam) {
  painter.rect(platform.x, platform.y, platform.w, platform.h, WALL_MORTAR_COLOUR, cam);

  const courses = Math.floor(platform.h / WALL_COURSE_HEIGHT);
  for (let row = 0; row < courses; row++) {
    const baseY = platform.y + row * WALL_COURSE_HEIGHT;
    const shift = WALL_STAGGER[row % WALL_STAGGER.length] * WALL_BLOCK_WIDTH;

    for (let column = -1; column * WALL_BLOCK_WIDTH < platform.w + shift; column++) {
      const left = Math.max(platform.x, platform.x + column * WALL_BLOCK_WIDTH + shift) + WALL_JOINT;
      const right = Math.min(platform.x + platform.w, platform.x + (column + 1) * WALL_BLOCK_WIDTH + shift) - WALL_JOINT;
      if (right <= left) continue;

      const stone = WALL_STONE_COLOURS[Math.floor(hash(row * 3 + 1, column * 5 + 7) * WALL_STONE_COLOURS.length)];
      painter.rect(left, baseY + WALL_JOINT, right - left, WALL_COURSE_HEIGHT - WALL_JOINT * 2, stone, cam, mix(stone, WHITE, WALL_STONE_TOP_MIX));
    }
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

/** The grass blades and flowers standing on the walkable surface of a block. */
function drawGrass(painter, platform, cam, surface) {
  const bladeCount = Math.floor(platform.w * GRASS_BLADES_PER_UNIT);
  const step = 1 / GRASS_BLADES_PER_UNIT;

  for (let blade = 0; blade < bladeCount; blade++) {
    const spot = hash(blade, Math.round(platform.top * COORD_HASH_SCALE));
    const x = platform.x + GRASS_SIDE_MARGIN + blade * step + spot * GRASS_JITTER;
    if (x > platform.x + platform.w - GRASS_SIDE_MARGIN) break;

    const shape = hash(blade + 17, Math.round(platform.y * COORD_HASH_SCALE));
    if (shape < GRASS_FLOWER_CHANCE) {
      drawGrassFlower(painter, x, surface, platform.top, cam, hash(blade + 31, Math.round(platform.top * COORD_HASH_SCALE)));
      continue;
    }

    const isLight = spot > 0.5;
    const bladeColour = mixBlade(surface, isLight, GRASS_DARK_MIX, GRASS_LIGHT_MIX);
    const tipColour = mixBlade(surface, isLight, GRASS_DARK_MIX * 0.6, GRASS_LIGHT_MIX * 0.6);
    const tall = spot > 1 - GRASS_TALL_CHANCE ? GRASS_TALL_FACTOR : 1;
    const height = (GRASS_MIN_HEIGHT + shape * GRASS_GROWTH) * tall;

    painter.rect(x, platform.top, GRASS_WIDTH, height, bladeColour, cam);
    // The upper part of the blade is lighter, which is what makes single blades
    // readable against the surface strip.
    painter.rect(x, platform.top + height * (1 - GRASS_TIP_PART), GRASS_WIDTH, height * GRASS_TIP_PART, tipColour, cam);
  }
}

/** One grass blade colour: a light or a dark green mixed into the surface. */
function mixBlade(surface, isLight, darkMix, lightMix) {
  return mix(surface, isLight ? GRASS_LIGHT_COLOUR : GRASS_DARK_COLOUR, isLight ? lightMix : darkMix);
}

/** A small flower in the grass: thin stem, coloured head, bright core. */
function drawGrassFlower(painter, x, surface, top, cam, colourPick) {
  const centre = x + GRASS_WIDTH / 2;
  const head = GRASS_FLOWER_HEAD_COLOURS[Math.floor(colourPick * GRASS_FLOWER_HEAD_COLOURS.length) % GRASS_FLOWER_HEAD_COLOURS.length];

  painter.rect(centre - GRASS_FLOWER_STEM_WIDTH / 2, top, GRASS_FLOWER_STEM_WIDTH, GRASS_FLOWER_STEM_HEIGHT, mix(surface, GRASS_DARK_COLOUR, GRASS_DARK_MIX), cam);
  painter.rect(centre - GRASS_FLOWER_HEAD_SIZE / 2, top + GRASS_FLOWER_STEM_HEIGHT, GRASS_FLOWER_HEAD_SIZE, GRASS_FLOWER_HEAD_SIZE, head, cam);
  painter.rect(
    centre - GRASS_FLOWER_CORE_SIZE / 2,
    top + GRASS_FLOWER_STEM_HEIGHT + (GRASS_FLOWER_HEAD_SIZE - GRASS_FLOWER_CORE_SIZE) / 2,
    GRASS_FLOWER_CORE_SIZE,
    GRASS_FLOWER_CORE_SIZE,
    GRASS_FLOWER_CORE_COLOUR,
    cam
  );
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
