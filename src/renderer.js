// Purpose: Render the game world with WebGL (raw WebGL 1, no libraries) by
// batching every visible box into a single triangle buffer per frame, add
// procedural detail (grass, mortar lines, windows, bushes) and draw the few
// real photo textures (moon, brick, wood) that src/textures.js loads.

import { inView, belowBottom, OFFSCREEN_MARGIN } from "./camera.js";
import { hash } from "./prng.js";
import { BLAST_DURATION } from "./jets.js";
import { MOON_RADIUS, moonPosition, moonTint } from "./moon.js";

// belowBottom owns the skyline base line. It stays reachable from this module
// because that is where the tests and the design notes look for it.
export { belowBottom };

const MAX_QUADS = 15000;
const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a

const MAX_TEX_QUADS = 4000;
const TEX_FLOATS_PER_VERTEX = 7; // x, y, u, v, r, g, b

const VERTEX_SOURCE = `
attribute vec2 pos;
attribute vec3 color;
attribute float alpha;
varying vec3 vcolor;
varying float valpha;
void main() {
  vcolor = color;
  valpha = alpha;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vcolor;
varying float valpha;
void main() {
  gl_FragColor = vec4(vcolor, valpha);
}`;

const TEX_VERTEX_SOURCE = `
attribute vec2 pos;
attribute vec2 uv;
attribute vec3 color;
varying vec2 vuv;
varying vec3 vcolor;
void main() {
  vuv = uv;
  vcolor = color;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

// A photo is multiplied into the flat game colour, so a texture never clashes
// with the palette. `disc` turns a quad into a circle with a soft edge.
const TEX_FRAGMENT_SOURCE = `
precision mediump float;
varying vec2 vuv;
varying vec3 vcolor;
uniform sampler2D tex;
uniform float disc;
void main() {
  vec4 photo = texture2D(tex, vuv);
  vec3 color = mix(photo.rgb, vcolor, 0.35);
  float mask = 1.0;
  if (disc > 0.5) {
    float d = distance(vuv, vec2(0.5, 0.5));
    mask = smoothstep(0.5, 0.42, d);
  }
  gl_FragColor = vec4(color, photo.a * mask);
}`;

/** Blend two rgb colors, t = 0 returns a, t = 1 returns b. */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Texture coordinates for a world box.
 * `scale` is the number of world units one photo tile covers. The uv values may
 * only depend on the world position, never on the camera, otherwise the photo
 * slides over the platform every time the camera moves (for example when the
 * player jumps). World y grows upwards while row 0 of the image is at the top,
 * so v is negated.
 */
export function textureUV(x, y, w, h, scale) {
  return {
    u1: x / scale,
    v1: -y / scale,
    u2: (x + w) / scale,
    v2: -(y + h) / scale,
  };
}

/**
 * Build the six vertices of one textured quad in clip space:
 * [x, y, u, v] per vertex, two triangles covering the box.
 * The clip positions follow the camera, the uv values follow the world only.
 */
export function texturedQuad(x, y, w, h, cam, view, scale) {
  const uv = textureUV(x, y, w, h, scale);
  const x1 = ((x - cam.x) * 2) / view.w;
  const y1 = ((y - cam.y) * 2) / view.h;
  const x2 = ((x + w - cam.x) * 2) / view.w;
  const y2 = ((y + h - cam.y) * 2) / view.h;

  return [
    [x1, y1, uv.u1, uv.v1],
    [x2, y1, uv.u2, uv.v1],
    [x1, y2, uv.u1, uv.v2],
    [x1, y2, uv.u1, uv.v2],
    [x2, y1, uv.u2, uv.v1],
    [x2, y2, uv.u2, uv.v2],
  ];
}

/**
 * Create the WebGL renderer for a canvas.
 * Returns { resize, draw, setTextures, gl }.
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const program = buildProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
  gl.useProgram(program);
  const posLoc = gl.getAttribLocation(program, "pos");
  const colorLoc = gl.getAttribLocation(program, "color");
  const alphaLoc = gl.getAttribLocation(program, "alpha");

  const texProgram = buildProgram(gl, TEX_VERTEX_SOURCE, TEX_FRAGMENT_SOURCE);
  const texPosLoc = gl.getAttribLocation(texProgram, "pos");
  const texUvLoc = gl.getAttribLocation(texProgram, "uv");
  const texColorLoc = gl.getAttribLocation(texProgram, "color");
  const texSampler = gl.getUniformLocation(texProgram, "tex");
  const texDisc = gl.getUniformLocation(texProgram, "disc");

  // Overlapping quads (glow, clouds, the moon) blend instead of hiding each other.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const data = new Float32Array(MAX_QUADS * 6 * FLOATS_PER_VERTEX);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  const texData = new Float32Array(MAX_TEX_QUADS * 6 * TEX_FLOATS_PER_VERTEX);
  const texBuffer = gl.createBuffer();

  const textures = new Map(); // texture name -> WebGL texture
  let texName = null; // texture of the batch currently being collected
  let discMask = false; // the current textured batch is a circular disc

  let quads = 0;
  let count = 0; // number of floats written into `data`
  let texQuads = 0;
  let texCount = 0; // number of floats written into `texData`
  let drawnQuads = 0; // quads actually sent to the GPU this frame

  /** Upload and draw the flat quads collected so far. */
  function flushFlat() {
    if (quads === 0) return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(colorLoc);
    gl.enableVertexAttribArray(alphaLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
    gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 5 * 4);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);

    drawnQuads += quads;
    quads = 0;
    count = 0;
  }

  /** Upload and draw the textured quads that use the same photo. */
  function flushTex() {
    if (texQuads === 0) return;

    gl.useProgram(texProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texData.subarray(0, texCount), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(texPosLoc);
    gl.enableVertexAttribArray(texUvLoc);
    gl.enableVertexAttribArray(texColorLoc);
    gl.vertexAttribPointer(texPosLoc, 2, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 0);
    gl.vertexAttribPointer(texUvLoc, 2, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 2 * 4);
    gl.vertexAttribPointer(texColorLoc, 3, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 4 * 4);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.get(texName));
    gl.uniform1i(texSampler, 0);
    gl.uniform1f(texDisc, discMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, texQuads * 6);

    drawnQuads += texQuads;
    texQuads = 0;
    texCount = 0;
  }

  /** Set the canvas pixel size to its display size times the device scale. */
  function resize(cssWidth, cssHeight, scale) {
    canvas.width = Math.max(1, Math.round(cssWidth * scale));
    canvas.height = Math.max(1, Math.round(cssHeight * scale));
    // WebGL keeps the viewport from context creation, so update it after
    // changing the canvas size or only a small part of the canvas is drawn.
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** Upload the RGBA pixel buffers of the loaded textures to the GPU. */
  function setTextures(list) {
    for (const item of list) {
      if (!item.pixels) continue;

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        item.size,
        item.size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        item.pixels
      );
      // 512 is a power of two, so tiling with REPEAT is allowed in WebGL 1.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      textures.set(item.name, texture);
    }
    return [...textures.keys()];
  }

  /** Append 6 vertices (2 triangles) to the flat batch. */
  function push(x1, y1, x2, y2, cBottom, cTop, alpha = 1) {
    const corners = [
      [x1, y1, cBottom, alpha],
      [x2, y1, cBottom, alpha],
      [x1, y2, cTop, alpha],
      [x1, y2, cTop, alpha],
      [x2, y1, cBottom, alpha],
      [x2, y2, cTop, alpha],
    ];
    for (const c of corners) {
      data[count++] = c[0];
      data[count++] = c[1];
      data[count++] = c[2][0];
      data[count++] = c[2][1];
      data[count++] = c[2][2];
      data[count++] = c[3];
    }
    quads += 1;
  }

  /** Append 6 vertices (2 triangles) to the textured batch. */
  function pushTexQuad(verts, color) {
    for (const v of verts) {
      texData[texCount++] = v[0];
      texData[texCount++] = v[1];
      texData[texCount++] = v[2];
      texData[texCount++] = v[3];
      texData[texCount++] = color[0];
      texData[texCount++] = color[1];
      texData[texCount++] = color[2];
    }
    texQuads += 1;
  }

  /**
   * Draw a box given in world coordinates, using `cam` for the view transform
   * (a scaled camera is used for parallax layers).
   */
  function rect(x, y, w, h, color, cam, view, topColor, alpha = 1) {
    if (quads >= MAX_QUADS) return;
    if (!inView({ x, y, w, h }, cam, view)) return;

    const x1 = ((x - cam.x) * 2) / view.w;
    const y1 = ((y - cam.y) * 2) / view.h;
    const x2 = ((x + w - cam.x) * 2) / view.w;
    const y2 = ((y + h - cam.y) * 2) / view.h;
    push(x1, y1, x2, y2, color, topColor || color, alpha);
  }

  /** Draw a box directly in clip space (-1..1) for the fixed sky layer. */
  function rectClip(x, y, w, h, color, alpha = 1) {
    if (quads >= MAX_QUADS) return;
    push(x, y, x + w, y + h, color, color, alpha);
  }

  /**
   * Draw a box with a real photo texture. `scale` is the number of world units
   * one texture tile covers. Returns false when the texture is not loaded, so
   * the caller can fall back to a flat colour.
   */
  function rectTex(x, y, w, h, tint, cam, view, name, scale) {
    if (!textures.has(name) || quads >= MAX_QUADS) return false;
    if (!inView({ x, y, w, h }, cam, view)) return false;

    // A batch can only carry one texture, so switch by flushing the old one.
    if (texQuads >= MAX_TEX_QUADS || (texName !== null && texName !== name)) flushTex();
    texName = name;
    discMask = false;

    // The clip positions move with the camera, the uv values stay in world
    // space, so the photo never slides when the player jumps.
    pushTexQuad(texturedQuad(x, y, w, h, cam, view, scale), tint);
    return true;
  }

  /** Draw one photo-textured circle in clip space with a soft edge. */
  function discTex(cx, cy, radius, tint, name) {
    if (!textures.has(name) || texQuads >= MAX_TEX_QUADS) return;
    if (texQuads > 0 && texName !== name) flushTex();

    texName = name;
    discMask = true;

    // A square in clip space is stretched on a wide screen, so the height is
    // multiplied by the aspect ratio to keep the disc round on the display.
    const aspect = canvas.width / canvas.height;
    pushTexQuad(
      [
        [cx - radius, cy - radius * aspect, 0, 1],
        [cx + radius, cy - radius * aspect, 1, 1],
        [cx - radius, cy + radius * aspect, 0, 0],
        [cx - radius, cy + radius * aspect, 0, 0],
        [cx + radius, cy - radius * aspect, 1, 1],
        [cx + radius, cy + radius * aspect, 1, 0],
      ],
      tint
    );
  }

  /**
   * Approximate a round circle in clip space with a stack of thin boxes.
   * A clip-space square is stretched on a wide screen, so the vertical radius
   * is the horizontal one times the aspect ratio to end up round on display.
   */
  function discClip(cx, cy, radius, color, alpha = 1) {
    if (radius <= 0.01) return;
    const aspect = canvas.width / canvas.height;
    const halfY = radius * aspect;
    const rows = 24;
    const rowH = (2 * halfY) / rows;

    for (let i = 0; i < rows; i++) {
      const dy = -halfY + (i + 0.5) * rowH;
      const t = dy / halfY;
      const half = radius * Math.sqrt(Math.max(0, 1 - t * t));
      rectClip(cx - half, cy + dy - rowH / 2, half * 2, rowH, color, alpha);
    }
  }

  /** Draw the sky as one full-screen vertical gradient. */
  function background(topColor, bottomColor) {
    push(-1, -1, 1, 1, bottomColor, topColor, 1);
  }

  /**
   * Draw one city building of the parallax skyline.
   * `b.y` is the ground line of the lot, the tower is drawn down past the
   * bottom of the screen so it never looks cut off in mid-air.
   */
  function drawBuilding(b, cam, view, near, time) {
    // Distant buildings are hazier and lighter, the ones in front are darker.
    const color = near ? [0.16, 0.21, 0.29] : [0.24, 0.31, 0.4];
    const top = b.y + b.h;
    const base = belowBottom(cam, view);

    rect(b.x, base, b.w, top - base, color, cam, view);
    rect(b.x + b.w * 0.08, top, b.w * 0.84, 0.5, mix(color, [1, 1, 1], 0.1), cam, view);

    const cols = Math.max(1, Math.floor(b.w / 1.4));
    // Rows are counted from the roof downwards; rows below the view are dropped
    // by the visibility test inside rect(), so they cost nothing.
    const rows = Math.max(1, Math.min(16, Math.floor((top - base) / 1.7)));
    const litChance = near ? 0.6 : 0.3;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const seed = hash(b.id * 97 + r, c);
        // A few windows blink over time so the city looks alive.
        const blink = seed > 0.88 && Math.floor(time * 1.5 + b.id + r) % 2 === 0;
        const lit = seed < litChance || blink;
        const windowColor = lit ? (near ? [0.93, 0.78, 0.38] : [0.62, 0.68, 0.55]) : mix(color, [0, 0, 0], 0.3);
        rect(b.x + 0.35 + c * 1.4, top - 1.2 - r * 1.7, 0.7, 0.9, windowColor, cam, view);
      }
    }

    if (near && hash(b.id, 17) > 0.6) {
      rect(b.x + b.w * 0.45, top + 0.5, 0.2, 1.8, [0.36, 0.42, 0.5], cam, view);
    }
    if (near && hash(b.id, 29) > 0.7) {
      rect(b.x - 0.6, top - b.h * 0.5, 0.6, 0.5, [0.3, 0.36, 0.44], cam, view); // side tower
    }
  }

  /** Draw one platform: a photo body when the texture is loaded, otherwise a
   * procedural brick or plank pattern. */
  function drawPlatform(plat, cam, view) {
    if (plat.kind === "wall") {
      rect(plat.x, plat.y, plat.w, plat.h, [0.33, 0.36, 0.43], cam, view);
      for (let cy = 0; cy < Math.floor(plat.h); cy++) {
        rect(plat.x, plat.y + cy + 0.35, plat.w, 0.12, [0.26, 0.29, 0.35], cam, view);
      }
      return;
    }

    const body = plat.kind === "ground" ? [0.31, 0.4, 0.32] : [0.55, 0.49, 0.42];
    const top = plat.kind === "ground" ? [0.41, 0.76, 0.44] : [0.86, 0.78, 0.58];

    // The real photo (brick for ground, wood for floating platforms) is drawn
    // as one textured quad and flushed immediately, so the flat details that
    // follow always end up on top of it.
    const photo = rectTex(
      plat.x,
      plat.y,
      plat.w,
      plat.h,
      body,
      cam,
      view,
      plat.kind === "ground" ? "brick" : "wood",
      plat.kind === "ground" ? 3 : 2
    );
    flushTex();

    if (photo) {
      // One thin mortar line keeps the brick photo connected to the game's own
      // look without hiding the photograph.
      rect(plat.x, plat.y + plat.h - 0.5, plat.w, 0.1, mix(body, [0, 0, 0], 0.2), cam, view);
    } else {
      // Procedural brick texture: mortar lines plus a few bricks in a slightly
      // different shade.
      const mortar = mix(body, [0, 0, 0], 0.22);
      const columns = Math.floor(plat.w);
      const rows = Math.floor(plat.h);

      for (let cy = 0; cy < rows; cy++) {
        rect(plat.x, plat.y + cy + 0.9, plat.w, 0.1, mortar, cam, view);
        const offset = cy % 2 === 0 ? 0 : 0.5;
        for (let cx = 0; cx <= columns; cx++) {
          const bx = plat.x + cx + offset;
          if (bx < plat.x + plat.w - 0.05) rect(bx, plat.y + cy, 0.1, 0.9, mortar, cam, view);
        }
        for (let cx = 0; cx < columns; cx++) {
          if (hash(Math.round(plat.x * 10) + cx, Math.round(plat.y * 10) + cy) < 0.28) {
            rect(plat.x + cx + offset + 0.1, plat.y + cy + 0.12, 0.8, 0.72, mix(body, [1, 1, 1], 0.07), cam, view);
          }
        }
      }
    }

    rect(plat.x, plat.top - 0.35, plat.w, 0.35, top, cam, view);

    // Grass blades and small flowers on the walkable surface.
    if (plat.kind === "ground") {
      for (let i = 0; i < Math.floor(plat.w * 2); i++) {
        const gx = plat.x + 0.2 + i * 0.5 + hash(i, Math.round(plat.top * 10)) * 0.25;
        if (gx > plat.x + plat.w - 0.2) break;
        const hgt = 0.15 + hash(i, Math.round(plat.y * 10)) * 0.4;
        rect(gx, plat.top, 0.1, hgt, mix(top, [0.18, 0.44, 0.28], 0.4), cam, view);
      }
    }
  }

  /** Draw scenery: bush, tree, flower, rock or street lamp. */
  function drawDecor(d, cam, view) {
    if (d.type === "bush") {
      rect(d.x, d.y, d.w, d.h, [0.28, 0.58, 0.4], cam, view, [0.4, 0.72, 0.5]);
      rect(d.x + d.w * 0.18, d.y + d.h * 0.6, d.w * 0.64, d.h * 0.4, [0.43, 0.76, 0.52], cam, view);
      rect(d.x + d.w * 0.1, d.y + d.h * 0.15, 0.14, 0.14, [0.2, 0.44, 0.33], cam, view);
      rect(d.x + d.w * 0.6, d.y + d.h * 0.35, 0.14, 0.14, [0.2, 0.44, 0.33], cam, view);
    } else if (d.type === "tree") {
      rect(d.x, d.y, d.w, d.h, [0.38, 0.29, 0.22], cam, view);
      rect(d.x - d.w * 0.6, d.y + d.h * 0.55, d.w * 2.2, d.h * 0.45, [0.33, 0.6, 0.43], cam, view);
      rect(d.x - d.w * 0.3, d.y + d.h * 0.7, d.w * 1.2, d.h * 0.25, [0.45, 0.72, 0.52], cam, view);
      rect(d.x - d.w * 0.5, d.y + d.h * 0.6, 0.16, 0.16, [0.22, 0.45, 0.35], cam, view);
    } else if (d.type === "flower") {
      rect(d.x + d.w * 0.4, d.y, d.w * 0.2, d.h, [0.3, 0.55, 0.4], cam, view);
      rect(d.x, d.y + d.h * 0.55, d.w, d.h * 0.45, [0.86, 0.5, 0.6], cam, view, [0.95, 0.66, 0.72]);
      rect(d.x + d.w * 0.35, d.y + d.h * 0.7, d.w * 0.3, d.h * 0.2, [0.98, 0.86, 0.4], cam, view);
    } else if (d.type === "rock") {
      rect(d.x, d.y, d.w, d.h, [0.49, 0.51, 0.55], cam, view, [0.58, 0.6, 0.64]);
      rect(d.x + d.w * 0.2, d.y + d.h * 0.3, d.w * 0.3, d.h * 0.3, [0.42, 0.44, 0.48], cam, view);
    } else if (d.type === "lamp") {
      rect(d.x, d.y, 0.16, d.h, [0.3, 0.33, 0.38], cam, view);
      rect(d.x - 0.3, d.y + d.h - 0.5, 0.76, 0.5, [0.95, 0.85, 0.45], cam, view, [1, 0.95, 0.65]);
      rect(d.x - 0.5, d.y + d.h - 0.9, 1.16, 0.4, [0.62, 0.56, 0.4], cam, view);
    }
  }

  /** Approximate a filled disc with a stack of thin rectangles. */
  function disc(cx, cy, r, color, cam, view) {
    if (r <= 0.05) return;
    const rows = 9;
    const rowH = (2 * r) / rows;

    for (let i = 0; i < rows; i++) {
      const dy = -r + (i + 0.5) * rowH;
      const half = r * Math.sqrt(Math.max(0, 1 - (dy / r) * (dy / r)));
      rect(cx - half, cy + dy - rowH / 2, half * 2, rowH, color, cam, view);
    }
  }

  /** Draw a jet fighter crossing the sky, nose pointed in its travel direction. */
  function drawJet(jet, cam, view, time) {
    const body = [0.8, 0.84, 0.9];
    const dark = [0.44, 0.49, 0.57];
    const front = jet.dir > 0 ? jet.x + jet.w : jet.x;
    const back = jet.dir > 0 ? jet.x : jet.x + jet.w;

    // Exhaust trail behind the aircraft.
    const trail = 3 + 2 * Math.abs(Math.sin(time * 3 + jet.id));
    rect(jet.dir > 0 ? back - trail : back, jet.y + jet.h * 0.35, trail, 0.22, [0.55, 0.62, 0.7], cam, view);

    // Fuselage, nose cone, wing and tail fin.
    rect(jet.x, jet.y, jet.w, jet.h, body, cam, view, mix(body, [1, 1, 1], 0.12));
    rect(jet.dir > 0 ? front : front - 0.8, jet.y + jet.h * 0.3, 0.8, jet.h * 0.4, body, cam, view);
    rect(jet.x + jet.w * 0.2, jet.y - 0.55, jet.w * 0.55, 0.55, dark, cam, view);
    rect(jet.dir > 0 ? back : back - 0.5, jet.y + jet.h, 0.5, 0.75, dark, cam, view);
    rect(jet.x + jet.w * 0.6, jet.y + jet.h * 0.5, jet.w * 0.22, 0.32, [0.2, 0.26, 0.34], cam, view);

    // Flickering engine flame at the rear.
    const flame = 0.5 + 0.4 * Math.abs(Math.sin(time * 12 + jet.id));
    rect(jet.dir > 0 ? back - flame : back, jet.y + jet.h * 0.3, flame, jet.h * 0.4, [0.95, 0.62, 0.3], cam, view);
  }

  /** Draw a falling bomb, its dashed drop line and the blinking ground marker. */
  function drawBomb(bomb, cam, view, time) {
    // Every other frame the warning flashes, so the player sees it clearly.
    const blink = Math.floor(time * 8) % 2 === 0;

    if (bomb.targetY !== null) {
      // Dashed line showing exactly where the bomb will land.
      const lineColor = blink ? [0.95, 0.45, 0.35] : [0.6, 0.3, 0.28];
      for (let y = bomb.targetY; y < bomb.y; y += 0.8) {
        rect(bomb.x - 0.07, y, 0.14, 0.4, lineColor, cam, view);
      }

      // Danger marker on the ground: a wide bar with a bright core above it.
      rect(bomb.x - 1.1, bomb.targetY, 2.2, 0.22, blink ? [0.92, 0.36, 0.3] : [0.66, 0.26, 0.24], cam, view);
      rect(bomb.x - 0.4, bomb.targetY + 0.22, 0.8, 0.3, blink ? [1, 0.55, 0.4] : [0.8, 0.4, 0.35], cam, view);
    }

    // The bomb itself: dark body, fins, blinking fuse light.
    rect(bomb.x - bomb.w / 2, bomb.y, bomb.w, bomb.h, [0.32, 0.34, 0.39], cam, view, [0.5, 0.52, 0.58]);
    rect(bomb.x - 0.28, bomb.y + bomb.h, 0.56, 0.28, [0.45, 0.47, 0.52], cam, view);
    rect(bomb.x - 0.1, bomb.y + bomb.h + 0.28, 0.2, 0.28, blink ? [1, 0.7, 0.3] : [0.5, 0.35, 0.2], cam, view);
  }

  /** Draw an explosion: a growing fireball with a bright core and dark smoke. */
  function drawBlast(blast, cam, view, time) {
    const age = Math.min(1, (time - blast.start) / (blast.duration || BLAST_DURATION));
    const r = blast.radius * (0.4 + 0.6 * age);
    const center = blast.y + r * 0.6;

    // Scorch mark on the solid ground the bomb hit.
    rect(blast.x - r, blast.y, r * 2, 0.18, [0.2, 0.22, 0.26], cam, view);

    disc(blast.x, center, r, [0.35, 0.33, 0.32], cam, view); // smoke
    disc(blast.x, center, r * 0.72, [0.92, 0.45, 0.22], cam, view); // flame
    disc(blast.x, center, r * 0.4, [1, 0.9, 0.55], cam, view); // hot core

    // Fragments flung sideways; hash keeps them scattered but stable.
    for (let i = 0; i < 6; i++) {
      const spread = r * (0.6 + hash(Math.round(blast.x * 10), i) * 0.8);
      rect(blast.x + spread, center + age * 1.2, 0.25, 0.25, [0.35, 0.33, 0.32], cam, view);
      rect(blast.x - spread, center + age * 1.5, 0.25, 0.25, [0.35, 0.33, 0.32], cam, view);
    }
  }

  /** Draw the moon: a soft halo and the photo disc on its arc across the sky. */
  function drawMoon(time) {
    const moon = moonPosition(time);
    const tint = moonTint(moon.altitude);

    // The halo is a big half-transparent disc, so the moon lights the sky.
    discClip(moon.x, moon.y, MOON_RADIUS * 1.9, mix(tint, [1, 1, 1], 0.3), 0.16 + 0.1 * moon.altitude);

    if (textures.has("moon")) {
      discTex(moon.x, moon.y, MOON_RADIUS, tint, "moon");
    } else {
      discClip(moon.x, moon.y, MOON_RADIUS, tint);
    }
  }

  /** Render one frame of the scene. */
  function draw(scene) {
    quads = 0;
    count = 0;
    texQuads = 0;
    texCount = 0;
    texName = null;
    drawnQuads = 0;
    const { cam, view, world, player, enemies, threats, time, moonTime } = scene;

    gl.clear(gl.COLOR_BUFFER_BIT);

    background([0.09, 0.14, 0.26], [0.6, 0.76, 0.84]);

    // Fixed sky layer: the stars never move with the camera.
    for (let i = 0; i < 42; i++) {
      const sx = -1 + (i * 0.049) % 2;
      const sy = 0.06 + ((i * 0.137) % 0.85);
      rectClip(sx, sy, 0.006, 0.006, [0.85, 0.9, 0.95]);
    }

    // The moon is drawn before the city, so the skyline can hide it while it
    // rises and sets.
    drawMoon(moonTime === undefined ? time : moonTime);
    flushFlat();
    flushTex();

    // Slow drifting clouds: thin haze strips with a lighter core.
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 0.42 + time * 0.012) % 2.4) - 1.2;
      const cy = 0.16 + ((i * 0.31) % 0.62);
      rectClip(cx, cy, 0.42, 0.035, [0.4, 0.5, 0.6], 0.55);
      rectClip(cx + 0.08, cy + 0.035, 0.24, 0.03, [0.45, 0.55, 0.65], 0.55);
      rectClip(cx + 0.05, cy - 0.02, 0.14, 0.02, [0.38, 0.47, 0.57], 0.55);
    }

    // Far city skyline and distant hills (slow parallax).
    const farCam = { x: cam.x * 0.22, y: cam.y * 0.12 };
    const farBase = belowBottom(farCam, view);
    for (const b of world.buildings) {
      if (b.layer === 0) drawBuilding(b, farCam, view, false, time);
    }
    for (const hill of world.hills) {
      rect(hill.x, farBase, hill.w, hill.y + hill.h * 0.5 - farBase, [0.2, 0.28, 0.36], farCam, view);
    }

    // Nearer city layer (faster parallax than the far one).
    const midCam = { x: cam.x * 0.48, y: cam.y * 0.28 };
    for (const b of world.buildings) {
      if (b.layer === 1) drawBuilding(b, midCam, view, true, time);
    }

    // The skyline sits behind the level, so it must reach the GPU first.
    flushFlat();

    // Platforms with texture.
    for (const plat of world.platforms) drawPlatform(plat, cam, view);

    // Scenery on the platforms.
    for (const d of world.decor) drawDecor(d, cam, view);

    // Patrolling enemies: purple blocks with eyes and animated legs.
    for (const e of enemies) {
      if (!inView({ x: e.x, y: e.y, w: e.w, h: e.h }, cam, view)) continue;
      const h = e.h * (1 - e.squash * 0.7);
      rect(e.x, e.y, e.w, h, [0.52, 0.31, 0.66], cam, view, [0.71, 0.45, 0.82]);

      if (e.squash < 0.9) {
        const eyeY = e.y + h * 0.45;
        const eyeX = e.dir > 0 ? e.x + e.w - 0.45 : e.x + 0.15;
        rect(eyeX, eyeY, 0.3, 0.3, [0.98, 0.96, 0.9], cam, view);
        rect(eyeX + 0.12, eyeY + 0.12, 0.14, 0.14, [0.1, 0.1, 0.12], cam, view);

        const leg = 0.25 * Math.abs(Math.sin(time * 6 + e.x));
        rect(e.x + 0.1, e.y - leg * 0.5, 0.25, 0.2, [0.34, 0.2, 0.44], cam, view);
        rect(e.x + e.w - 0.35, e.y - leg * 0.4, 0.25, 0.2, [0.34, 0.2, 0.44], cam, view);
      }
    }

    // The player character.
    if (player) {
      const p = player;
      rect(p.x, p.y, p.w, p.h, [0.92, 0.47, 0.33], cam, view, [0.99, 0.55, 0.42]);
      rect(p.x + 0.05, p.y + p.h - 0.45, p.w - 0.1, 0.45, [0.23, 0.55, 0.86], cam, view);
      rect(p.x + 0.05, p.y + p.h - 0.45, p.w - 0.1, 0.12, [0.3, 0.68, 0.95], cam, view);

      const eyeX = p.face > 0 ? p.x + 0.12 : p.x + p.w - 0.42;
      rect(eyeX, p.y + p.h - 0.95, 0.3, 0.32, [0.98, 0.97, 0.93], cam, view);
      rect(eyeX + 0.12, p.y + p.h - 0.85, 0.13, 0.16, [0.12, 0.14, 0.18], cam, view);

      const swing = Math.abs(Math.sin(time * 9)) * 0.28;
      rect(p.x + 0.1, p.y - (p.onGround ? swing : 0.1), 0.25, 0.28, [0.7, 0.33, 0.25], cam, view);
      rect(p.x + p.w - 0.35, p.y - (p.onGround ? 0.28 - swing : 0.1), 0.25, 0.28, [0.7, 0.33, 0.25], cam, view);
      rect(p.x - 0.2, p.y + p.h * 0.4, 0.2, 0.45, [0.85, 0.4, 0.3], cam, view);
      rect(p.x + p.w, p.y + p.h * 0.4, 0.2, 0.45, [0.85, 0.4, 0.3], cam, view);
    }

    // Jets, falling bombs and explosions are drawn last so they sit on top of
    // the level and stay readable against the sky.
    if (threats) {
      for (const jet of threats.jets) drawJet(jet, cam, view, time);
      for (const bomb of threats.bombs) drawBomb(bomb, cam, view, time);
      for (const blast of threats.blasts) drawBlast(blast, cam, view, time);
    }

    flushFlat();
    return drawnQuads;
  }

  return { resize, draw, setTextures, gl };
}

/** Compile and link one vertex + fragment shader pair into a program. */
function buildProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const sources = [
    [vertexSource, gl.VERTEX_SHADER],
    [fragmentSource, gl.FRAGMENT_SHADER],
  ];

  for (const [source, type] of sources) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
    }
    gl.attachShader(program, shader);
  }

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Shader link error: " + gl.getProgramInfoLog(program));
  }
  return program;
}
