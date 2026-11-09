# Photo textures slide when uv comes from clip space

- Date: 2026-11-10
- Status: verified
- Source: `src/renderer.js` (`rectTex`, `textureUV`), task "the texture should
  not move if I jump"

## Context

Brick and wood photos were mapped onto platforms with a `scale` of world units
per tile. The pattern visibly crawled over the platform while the player jumped.

## Error / Hurdle

The v coordinate was built from the clip-space box:

```js
pushTex(x1, y1, x2, y2, x / scale, -y1 / scale, (x + w) / scale, -y2 / scale);
```

`y1` and `y2` contain the camera, so every camera move rescaled and shifted the
image inside the box.

## Solution

Compute uv only from world coordinates, never from the camera:

```js
export function textureUV(x, y, w, h, scale) {
  return { u1: x / scale, v1: -y / scale, u2: (x + w) / scale, v2: -(y + h) / scale };
}
```

The clip positions still follow the camera; only uv stays in world space.

## Golden Rule

In a textured quad, position vertices come from the camera, uv values come only
from world coordinates - never mix the two.
