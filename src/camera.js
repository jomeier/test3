// Purpose: Turn the world coordinates of the camera into WebGL clip space
// coordinates, keep the camera smoothly following the player and provide the
// shared "how far below the visible area" helper the background layers use.

export const VIEW_HEIGHT = 18; // world units visible vertically

// Default distance of a background base line below the bottom edge of the view.
// Towers and hills are drawn down to this line so they run off the screen
// instead of ending in mid-air.
export const OFFSCREEN_MARGIN = 40;

// Damping of the camera follow: a larger value snaps the camera harder.
const CAMERA_SMOOTHING = 6;

// How far the camera looks ahead of the player.
export const CAMERA_LEAD_X = 4;
export const CAMERA_LEAD_Y = 5;

// A new run starts with a wider lead so the player already sees the next
// platforms when the first frame is drawn.
export const START_CAMERA_LEAD_X = 6;

/** Compute the visible world width/height for a given canvas aspect ratio. */
export function computeView(aspect, height = VIEW_HEIGHT) {
  return { w: height * aspect, h: height };
}

/** Create a camera centred on the player. */
export function createCamera(x, y) {
  return { x, y };
}

/** Move the camera towards a target, with a critically damped follow. */
export function followCamera(cam, targetX, targetY, dt) {
  const blend = 1 - Math.exp(-CAMERA_SMOOTHING * dt);
  cam.x += (targetX - cam.x) * blend;
  cam.y += (targetY - cam.y) * blend;
  return cam;
}

/**
 * Convert a world point to WebGL clip space (-1..1) for the given camera
 * and view size. Used by the WebGL renderer for every quad vertex.
 */
export function worldToClip(x, y, cam, view) {
  return [((x - cam.x) * 2) / view.w, ((y - cam.y) * 2) / view.h];
}

/** Return true when a box is at least partly inside the camera view. */
export function inView(box, cam, view) {
  const left = cam.x - view.w / 2;
  const right = cam.x + view.w / 2;
  const bottom = cam.y - view.h / 2;
  const top = cam.y + view.h / 2;
  return box.x < right && box.x + box.w > left && box.y < top && box.y + box.h > bottom;
}

/**
 * World y that lies `margin` units below the bottom edge of the current view.
 * Background layers use it as their ground line, so every tower reaches past
 * the bottom of the screen for any camera position.
 */
export function belowBottom(cam, view, margin = OFFSCREEN_MARGIN) {
  return cam.y - view.h / 2 - margin;
}
