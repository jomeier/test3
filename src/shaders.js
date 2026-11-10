// Purpose: Hold the shader sources of the two WebGL 1 programs and compile
// them: one program for flat coloured boxes, one for boxes covered by a real
// photo. The values that define how a photo is blended are named here.

// 0 keeps the photo as it is, 1 replaces it by the flat game colour. 0.35 lets
// the photo stay readable while it still matches the palette of the game.
const PHOTO_TINT_AMOUNT = 0.35;

// A textured quad covers its whole square unless the disc mask is switched on.
// With the mask: DISC_EDGE is the radius of the circle in uv space, and the
// edge fades out between DISC_SOFT_EDGE and DISC_EDGE.
const DISC_EDGE = 0.5;
const DISC_SOFT_EDGE = 0.42;

// Flat program: colour and alpha per vertex.
export const FLAT_VERTEX_SOURCE = `
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

export const FLAT_FRAGMENT_SOURCE = `
precision mediump float;
varying vec3 vcolor;
varying float valpha;
void main() {
  gl_FragColor = vec4(vcolor, valpha);
}`;

// Textured program: photo coordinates plus the tint colour of the object.
export const TEXTURED_VERTEX_SOURCE = `
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

export const TEXTURED_FRAGMENT_SOURCE = `
precision mediump float;
varying vec2 vuv;
varying vec3 vcolor;
uniform sampler2D tex;
uniform float disc;
void main() {
  vec4 photo = texture2D(tex, vuv);
  vec3 color = mix(photo.rgb, vcolor, ${PHOTO_TINT_AMOUNT});
  float mask = 1.0;
  if (disc > 0.5) {
    float d = distance(vuv, vec2(0.5, 0.5));
    mask = smoothstep(${DISC_EDGE}, ${DISC_SOFT_EDGE}, d);
  }
  gl_FragColor = vec4(color, photo.a * mask);
}`;

/**
 * Compile and link one vertex plus fragment pair into a program.
 * A shader failure throws with the compiler log: a silent failure would only
 * show up as a black canvas.
 */
export function buildProgram(gl, vertexSource, fragmentSource) {
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
