# Wikimedia thumbnail URLs return 400

- Date: 2026-11-10
- Status: verified
- Source: `src/textures.js`, curl check

## Context

The game downloads three real photos (moon, brick wall, wood planks) from
Wikimedia Commons at runtime and scales them down to 512x512 in the browser.

## Error / Hurdle

The convenient sized thumbnail form

```text
https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Phase-180.jpg/512px-Phase-180.jpg
```

answered `400`, so the texture silently fell back to the procedural pattern.

## Solution

Use the original file and crop in the browser:

```text
https://upload.wikimedia.org/wikipedia/commons/0/01/Phase-180.jpg
```

```js
const img = new Image();
img.onload = () => { /* centre-crop to 512x512 with a canvas */ };
```

## Golden Rule

Request the Commons original (`/commons/<hash>/<file>`) and resize it yourself;
the `/thumb/.../512px-...` form is not reliably reachable.
