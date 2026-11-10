// Purpose: Collect every box of a frame in two big Float32Array buffers and
// hand each buffer to the GPU with one drawArrays call: a batch for flat
// coloured quads and a batch for quads covered by a photo texture.
// At most one draw call per program per frame, which is what keeps the frame
// time low (see agent-memory/design-guidelines/architecture.md).

import { TEXTURED_FRAGMENT_SOURCE, TEXTURED_VERTEX_SOURCE, FLAT_FRAGMENT_SOURCE, FLAT_VERTEX_SOURCE, buildProgram } from "./shaders.js";

// Batch sizes: a frame never needs more than this many boxes; anything past
// the limit is dropped instead of growing the buffer.
export const MAX_FLAT_QUADS = 15000;
export const MAX_TEXTURE_QUADS = 4000;

const FLAT_FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a
const TEXTURE_FLOATS_PER_VERTEX = 7; // x, y, u, v, r, g, b
const VERTICES_PER_BOX = 6; // two triangles
const FLOAT_BYTES = 4; // one WebGL float

/**
 * Create the two batches and compile the programs that read them.
 * Returns the batching API used by the painter primitives.
 */
export function createBatch(gl) {
  const flatProgram = buildProgram(gl, FLAT_VERTEX_SOURCE, FLAT_FRAGMENT_SOURCE);
  const texturedProgram = buildProgram(gl, TEXTURED_VERTEX_SOURCE, TEXTURED_FRAGMENT_SOURCE);

  // Attribute layout of the flat program.
  const flatPos = gl.getAttribLocation(flatProgram, "pos");
  const flatColor = gl.getAttribLocation(flatProgram, "color");
  const flatAlpha = gl.getAttribLocation(flatProgram, "alpha");
  const flatStride = FLAT_FLOATS_PER_VERTEX * FLOAT_BYTES;

  // Attribute layout of the textured program.
  const texPos = gl.getAttribLocation(texturedProgram, "pos");
  const texUv = gl.getAttribLocation(texturedProgram, "uv");
  const texColor = gl.getAttribLocation(texturedProgram, "color");
  const texSampler = gl.getUniformLocation(texturedProgram, "tex");
  const texDisc = gl.getUniformLocation(texturedProgram, "disc");
  const texStride = TEXTURE_FLOATS_PER_VERTEX * FLOAT_BYTES;

  // Overlapping quads (glow, clouds, the moon) blend instead of hiding each
  // other, so a translucent box may sit on top of another one.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const flatBuffer = gl.createBuffer();
  const texBuffer = gl.createBuffer();
  const flatData = new Float32Array(MAX_FLAT_QUADS * VERTICES_PER_BOX * FLAT_FLOATS_PER_VERTEX);
  const texData = new Float32Array(MAX_TEXTURE_QUADS * VERTICES_PER_BOX * TEXTURE_FLOATS_PER_VERTEX);

  const textures = new Map(); // texture name -> WebGL texture
  let textureName = null; // photo of the textured batch being collected
  let discMask = false; // the current textured batch is a round disc

  let flatQuads = 0;
  let flatCount = 0; // floats written into flatData
  let texQuads = 0;
  let texCount = 0; // floats written into texData
  let drawnQuads = 0; // quads actually sent to the GPU this frame

  /** Append one flat box as two triangles; top and bottom may differ in colour. */
  function addFlatQuad(x1, y1, x2, y2, bottomColor, topColor, alpha = 1) {
    const corners = [
      [x1, y1, bottomColor, alpha],
      [x2, y1, bottomColor, alpha],
      [x1, y2, topColor, alpha],
      [x1, y2, topColor, alpha],
      [x2, y1, bottomColor, alpha],
      [x2, y2, topColor, alpha],
    ];

    for (const [x, y, color, cornerAlpha] of corners) {
      flatData[flatCount++] = x;
      flatData[flatCount++] = y;
      flatData[flatCount++] = color[0];
      flatData[flatCount++] = color[1];
      flatData[flatCount++] = color[2];
      flatData[flatCount++] = cornerAlpha;
    }
    flatQuads += 1;
  }

  /** Append one textured box as two triangles, [x, y, u, v] per vertex. */
  function addTexturedQuad(verts, tintColor) {
    for (const [x, y, u, v] of verts) {
      texData[texCount++] = x;
      texData[texCount++] = y;
      texData[texCount++] = u;
      texData[texCount++] = v;
      texData[texCount++] = tintColor[0];
      texData[texCount++] = tintColor[1];
      texData[texCount++] = tintColor[2];
    }
    texQuads += 1;
  }

  /** Upload and draw the flat quads collected so far. */
  function flushFlat() {
    if (flatQuads === 0) return;

    gl.useProgram(flatProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, flatBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatData.subarray(0, flatCount), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(flatPos);
    gl.enableVertexAttribArray(flatColor);
    gl.enableVertexAttribArray(flatAlpha);
    gl.vertexAttribPointer(flatPos, 2, gl.FLOAT, false, flatStride, 0);
    gl.vertexAttribPointer(flatColor, 3, gl.FLOAT, false, flatStride, 2 * FLOAT_BYTES);
    gl.vertexAttribPointer(flatAlpha, 1, gl.FLOAT, false, flatStride, 5 * FLOAT_BYTES);
    gl.drawArrays(gl.TRIANGLES, 0, flatQuads * VERTICES_PER_BOX);

    drawnQuads += flatQuads;
    flatQuads = 0;
    flatCount = 0;
  }

  /** Upload and draw the textured quads that share one photo. */
  function flushTextured() {
    if (texQuads === 0) return;

    gl.useProgram(texturedProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texData.subarray(0, texCount), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(texPos);
    gl.enableVertexAttribArray(texUv);
    gl.enableVertexAttribArray(texColor);
    gl.vertexAttribPointer(texPos, 2, gl.FLOAT, false, texStride, 0);
    gl.vertexAttribPointer(texUv, 2, gl.FLOAT, false, texStride, 2 * FLOAT_BYTES);
    gl.vertexAttribPointer(texColor, 3, gl.FLOAT, false, texStride, 4 * FLOAT_BYTES);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.get(textureName));
    gl.uniform1i(texSampler, 0);
    gl.uniform1f(texDisc, discMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, texQuads * VERTICES_PER_BOX);

    drawnQuads += texQuads;
    texQuads = 0;
    texCount = 0;
  }

  /** Forget everything collected so far; called at the start of each frame. */
  function reset() {
    flatQuads = 0;
    flatCount = 0;
    texQuads = 0;
    texCount = 0;
    textureName = null;
    discMask = false;
    drawnQuads = 0;
  }

  /**
   * Switch the textured batch to another photo.
   * A batch can only carry one picture, so the old one is drawn first.
   * Returns false when the picture is not loaded, so the caller can fall back
   * to a flat colour.
   */
  function useTexture(name, asDisc) {
    if (!textures.has(name)) return false;
    if (texQuads >= MAX_TEXTURE_QUADS || (textureName !== null && textureName !== name)) flushTextured();

    textureName = name;
    discMask = asDisc;
    return true;
  }

  return {
    addFlatQuad,
    addTexturedQuad,
    flushFlat,
    flushTextured,
    useTexture,
    reset,
    flatQuads: () => flatQuads,
    textureQuads: () => texQuads,
    drawnQuads: () => drawnQuads,
    hasTexture: (name) => textures.has(name),
    uploadTextures: (list) => uploadTextures(gl, textures, list),
    capacity: () => ({ flat: MAX_FLAT_QUADS, textured: MAX_TEXTURE_QUADS }),
  };
}

/**
 * Upload one RGBA pixel buffer as a tiling WebGL texture and remember it by
 * name. The size is a power of two, which WebGL 1 requires for REPEAT.
 */
function uploadTextures(gl, textures, list) {
  for (const item of list) {
    if (!item.pixels) continue;

    // Repainting a material replaces its GPU texture; without deleting the old
    // one, pressing R many times would leak a texture per material and run.
    const previous = textures.get(item.name);
    if (previous) gl.deleteTexture(previous);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, item.size, item.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, item.pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    textures.set(item.name, texture);
  }

  return [...textures.keys()];
}
