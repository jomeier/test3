// Purpose: Guard the constant names of the source: a constant that is used but
// never defined (for example after a half-applied rename) would only crash in
// the browser, so the whole module graph is checked here instead.

import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

import { checkConstants, unknownConstants } from "../tools/check-constants.mjs";

const readFile = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("every module uses only constants it knows", () => {
  assert.deepEqual(checkConstants(readFile), [], "no unknown constant names allowed");
});

test("the checker finds a constant that was renamed in one place only", () => {
  const files = {
    "src/a.js": "import { SHORT_NAME } from \"./b.js\";\nexport function go() { return SHORT_NAME + LONG_NAME; }\n",
    "src/b.js": "export const SHORT_NAME = 1;\n",
  };
  const read = (file) => files[file];

  const problems = unknownConstants(["src/b.js", "src/a.js"], read);

  assert.strictEqual(problems.length, 1, "one module has a problem");
  assert.deepEqual(problems[0].unknown, ["LONG_NAME"], "the missing name is reported");
});

test("property access and comments are not mistaken for constants", () => {
  const files = {
    "src/a.js": "// NOT_A_CONSTANT lives in a comment\nexport function go(gl) { return gl.SOME_SHADER; }\n",
  };
  const read = (file) => files[file];

  assert.deepEqual(unknownConstants(["src/a.js"], read), [], "no false alarms");
});
