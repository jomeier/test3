// Purpose: Turn the world coordinates of the camera into WebGL clip space
// coordinates and keep the camera smoothly following the player.

export const VIEW_HEIGHT = 18; // world units visible vertically

/** Compute the visible world width/height for a given canvas aspect ratio. */
export function computeView(aspect, height = VIEW_HEIGHT) {
  return { w: height * aspect, h: height };
}

/** Move the camera towards a target, with a critically damped follow. */
export function followCamera(cam, targetX, targetY, dt) {
  const k = 1 - Math.exp(-6 * dt);
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;
  return cam;
}

/** Create a camera centred on the player. */
export function createCamera(x, y) {
  return { x, y };
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
