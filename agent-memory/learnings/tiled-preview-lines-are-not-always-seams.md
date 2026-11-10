# Preview lines in a tiled texture are not always a seam

- Date: 2026-11-11
- Status: verified
- Source: generated-materials task, `src/textures.js`, `src/seamless.js`

## Context

A generated wood-plank tile was dumped twice side by side (`tools/dump-
textures.mjs`) to check the tiling border. The preview showed a long straight
vertical line near the tile border and looked like a seam.

## Error / Hurdle

The line was not a seam: it was the butt joint of the planks, a deliberate
pattern feature that happened to land near the border for that seed. Judging
seamlessness by eye misleads, because features and seams look the same in a
preview.

## Solution

Measure instead: mean luma jump across the tile border versus the mean jump of
a normal neighbour pixel step.

```bash
node -e '... edge = mean |lum(x=0) - lum(x=size-1)| per row
             step = mean |lum(x) - lum(x+1)|            ...'
# wood: border 4.31  avg step 4.51  ratio 0.95  -> seamless (ratio ~ 1)
```

A ratio near 1 means the border is as ordinary as any other pixel pair.

## Golden Rule

Prove seamlessness with the ratio "border luma jump / average neighbour jump"
(aim for ~1.0); never judge it by looking at a preview line.
