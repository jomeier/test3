# Chrome serves cached ES modules to headless checks

- Date: 2026-11-10
- Status: verified
- Source: seamless-texture task, `tools/verify-browser.mjs`, commit `255b732`

## Context

`tools/verify-browser.mjs` drives headless Chrome over the DevTools protocol
and reads `window.__game.textures()` to check which texture sources the game
loaded. The same Chrome profile is reused for every run.

## Error / Hurdle

After rewriting `src/textures.js` so brick and wood became procedural, the
checker still reported `textures: [ 'moon:internet', 'brick:internet',
'wood:internet' ]` and failed. The page under test was a cached module copy
from an earlier run, not the file on disk, so the run judged an old build.

## Solution

Enable the Network domain and turn the cache off before navigating:

```js
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
```

After that the same run reported `brick:procedural` and `wood:procedural`.

## Golden Rule

In every CDP verification script, send `Network.setCacheDisabled` with
`cacheDisabled: true` right after `Runtime.enable` and before `Page.navigate`.
