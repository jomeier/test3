# Rewriting a file from a remembered version loses committed work

- Date: 2026-11-10
- Status: verified
- Source: refactor of `src/world.js`, command `git show HEAD:src/world.js`

## Context

The whole file was replaced with the `write` tool while named constants were
added. Earlier reads of the same file were used as the starting point.

## Error / Hurdle

One earlier read showed content that never existed in the repository (extra
helper functions, different constants). Rewriting from it would have deleted
committed behaviour and the tests would still have looked green.

## Solution

Take the base from git, not from the conversation, and prove the result is
identical with a data diff:

```bash
git show HEAD:src/world.js > /tmp/opencode/base/src/world.js
node /tmp/opencode/base/compare.mjs   # same seeds, deep compare of the output
# seed 1234 identical: 17 platforms, 3 enemies, 19 decor, 10 hills, 21 buildings
```

## Golden Rule

Before rewriting a whole file, print the committed version with
`git show HEAD:<path>` and afterwards compare old and new output for the same
seed - never trust an old read of the file.
