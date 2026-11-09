# Game time freezes when the run is over

- Date: 2026-11-10
- Status: verified
- Source: `src/main.js` (`setMoonPhase` hook), `tools/verify-browser.mjs`

## Context

The headless checks needed to screenshot the moon at fixed moments of its
10 s rise / 3 s hold / 10 s set arc.

## Error / Hurdle

`time` is only advanced inside `if (!gameOver)`, so waiting real seconds does
not move the moon once the player has died (or while the game is paused), and
the sampled moon position stayed at the same arc value.

## Solution

Expose a hook that sets the phase directly instead of relying on wall clock:

```js
setMoonPhase: (seconds) => {
  moonOffset = seconds - time;
  return moonPosition(seconds);
}
```

```js
await cdp.send("Runtime.evaluate", { expression: "window.__game.setMoonPhase(5)" });
```

## Golden Rule

For time-based visual checks, drive the clock through a hook such as
`setMoonPhase(t)` rather than sleeping, because game time stops on game over.
