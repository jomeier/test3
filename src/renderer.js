// Purpose: Render the game world with WebGL (raw WebGL 1, no libraries) by
// batching every visible box into a single triangle buffer per frame, and add
// procedural textures (grass, bricks, windows, bushes) for a richer look.

import { inView } from "./camera.js";
import { hash } from "./prng.js";

const MAX_QUADS = 15000;
const FLOATS_PER_VERTEX = 5; // x, y, r, g, b

const VERTEX_SOURCE = `
attribute vec2 pos;
attribute vec3 color;
varying vec3 vcolor;
void main() {
  vcolor = color;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vcolor;
void main() {
  gl_FragColor = vec4(vcolor, 1.0);
}`;

/** Blend two rgb colors, t = 0 returns a, t = 1 returns b. */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Create the WebGL renderer for a canvas.
 * Returns { resize, draw, gl }.
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const program = buildProgram(gl);
  gl.useProgram(program);
  const posLoc = gl.getAttribLocation(program, "pos");
  const colorLoc = gl.getAttribLocation(program, "color");

  const data = new Float32Array(MAX_QUADS * 6 * FLOATS_PER_VERTEX);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  let quads = 0;
  let count = 0; // number of floats written into `data`

  /** Set the canvas pixel size to its display size times the device scale. */
  function resize(cssWidth, cssHeight, scale) {
    canvas.width = Math.max(1, Math.round(cssWidth * scale));
    canvas.height = Math.max(1, Math.round(cssHeight * scale));
    // WebGL keeps the viewport from context creation, so update it after
    // changing the canvas size or only a small part of the canvas is drawn.
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** Append 6 vertices (2 triangles) to the batch. */
  function push(x1, y1, x2, y2, cBottom, cTop) {
    const corners = [
      [x1, y1, cBottom],
      [x2, y1, cBottom],
      [x1, y2, cTop],
      [x1, y2, cTop],
      [x2, y1, cBottom],
      [x2, y2, cTop],
    ];
    for (const c of corners) {
      data[count++] = c[0];
      data[count++] = c[1];
      data[count++] = c[2][0];
      data[count++] = c[2][1];
      data[count++] = c[2][2];
    }
    quads += 1;
  }

  /**
   * Draw a box given in world coordinates, using `cam` for the view transform
   * (a scaled camera is used for parallax layers).
   */
  function rect(x, y, w, h, color, cam, view, topColor) {
    if (quads >= MAX_QUADS) return;
    if (!inView({ x, y, w, h }, cam, view)) return;

    const x1 = ((x - cam.x) * 2) / view.w;
    const y1 = ((y - cam.y) * 2) / view.h;
    const x2 = ((x + w - cam.x) * 2) / view.w;
    const y2 = ((y + h - cam.y) * 2) / view.h;
    push(x1, y1, x2, y2, color, topColor || color);
  }

  /** Draw a box directly in clip space (-1..1) for the fixed sky layer. */
  function rectClip(x, y, w, h, color) {
    if (quads >= MAX_QUADS) return;
    push(x, y, x + w, y + h, color, color);
  }

  /** Draw the sky as one full-screen vertical gradient. */
  function background(topColor, bottomColor) {
    push(-1, -1, 1, 1, bottomColor, topColor);
  }

  /** Draw one city building with lit windows, used for the parallax skyline. */
  function drawBuilding(b, cam, view, near, time) {
    // Distant buildings are hazier and lighter, the ones in front are darker.
    const color = near ? [0.16, 0.21, 0.29] : [0.24, 0.31, 0.4];
    rect(b.x, b.y, b.w, b.h, color, cam, view);
    rect(b.x + b.w * 0.08, b.y + b.h, b.w * 0.84, 0.5, mix(color, [1, 1, 1], 0.1), cam, view);

    const cols = Math.max(1, Math.floor(b.w / 1.4));
    const rows = Math.max(1, Math.min(10, Math.floor(b.h / 1.7)));
    const litChance = near ? 0.6 : 0.3;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const base = hash(b.id * 97 + r, c);
        // A few windows blink over time so the city looks alive.
        const blink = base > 0.88 && Math.floor(time * 1.5 + b.id + r) % 2 === 0;
        const lit = base < litChance || blink;
        const windowColor = lit ? (near ? [0.93, 0.78, 0.38] : [0.62, 0.68, 0.55]) : mix(color, [0, 0, 0], 0.3);
        rect(b.x + 0.35 + c * 1.4, b.y + 0.5 + r * 1.7, 0.7, 0.9, windowColor, cam, view);
      }
    }

    if (near && hash(b.id, 17) > 0.6) {
      rect(b.x + b.w * 0.45, b.y + b.h + 0.5, 0.2, 1.8, [0.36, 0.42, 0.5], cam, view);
    }
    if (near && hash(b.id, 29) > 0.7) {
      rect(b.x - 0.6, b.y + b.h * 0.5, 0.6, 0.5, [0.3, 0.36, 0.44], cam, view); // side tower
    }
  }

  /** Draw a textured platform: grass blades on top, brick or plank body. */
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

    rect(plat.x, plat.y, plat.w, plat.h, body, cam, view, top);

    // Brick texture: mortar lines plus a few bricks in a slightly different shade.
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

  /** Render one frame of the scene. */
  function draw(scene) {
    quads = 0;
    count = 0;
    const { cam, view, world, player, enemies, time } = scene;

    background([0.09, 0.14, 0.26], [0.6, 0.76, 0.84]);

    // Fixed sky layer: stars and a moon.
    for (let i = 0; i < 42; i++) {
      const sx = -1 + (i * 0.049) % 2;
      const sy = 0.06 + ((i * 0.137) % 0.85);
      rectClip(sx, sy, 0.006, 0.006, [0.85, 0.9, 0.95]);
    }
    rectClip(-0.86, 0.5, 0.13, 0.13, [0.93, 0.95, 0.84]);

    // Far city skyline and distant hills (slow parallax).
    const farCam = { x: cam.x * 0.22, y: cam.y * 0.12 };
    for (const b of world.buildings) {
      if (b.layer === 0) drawBuilding(b, farCam, view, false, time);
    }
    for (const hill of world.hills) {
      rect(hill.x, hill.y, hill.w, hill.h * 0.5, [0.2, 0.28, 0.36], farCam, view);
    }

    // Nearer city layer (faster parallax than the far one).
    const midCam = { x: cam.x * 0.48, y: cam.y * 0.28 };
    for (const b of world.buildings) {
      if (b.layer === 1) drawBuilding(b, midCam, view, true, time);
    }

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

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    return quads;
  }

  return { resize, draw, gl };
}

/** Compile and link the vertex + fragment shaders into one program. */
function buildProgram(gl) {
  const program = gl.createProgram();
  const sources = [
    [VERTEX_SOURCE, gl.VERTEX_SHADER],
    [FRAGMENT_SOURCE, gl.FRAGMENT_SHADER],
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
