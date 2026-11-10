// Purpose: Guard the standalone build: every module in src must take part in
// the bundle, a dependency must be bundled before its importer, and the
// concatenated plain script must still be valid JavaScript.

import test from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";

import { resolveModules, stripModuleSyntax, bundleSources } from "../tools/build-standalone.mjs";

const ENTRY = "src/main.js";

/** Read a project file relative to this test, so the cwd does not matter. */
const readFile = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/** Every sibling module a source imports, as project paths. */
function importsOf(file, source) {
  return source
    .split("\n")
    .map((line) => /^\s*import\s+[^;]*?from\s+"(\.\/[^"]+)";\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => `src/${match[1].replace("./", "")}`);
}

test("the bundle holds every module that sits in src", () => {
  const bundle = resolveModules(ENTRY, readFile);
  const onDisk = readdirSync(new URL("../src/", import.meta.url)).map((file) => `src/${file}`);

  assert.deepEqual([...bundle].sort(), [...onDisk].sort(), "src and bundle must list the same files");
});

test("a dependency is bundled before the module that imports it", () => {
  const bundle = resolveModules(ENTRY, readFile);

  for (const [index, file] of bundle.entries()) {
    for (const dep of importsOf(file, readFile(file))) {
      assert.ok(bundle.indexOf(dep) !== -1, `${file} imports ${dep}, which is not bundled`);
      assert.ok(bundle.indexOf(dep) < index, `${file} must be bundled after ${dep}`);
    }
  }
});

test("the concatenated bundle is valid JavaScript", () => {
  const code = bundleSources(resolveModules(ENTRY, readFile), readFile);

  assert.ok(code.includes("function createWorld"), "the world generation is still part of the bundle");
  assert.ok(!/^\s*(import|export)/m.test(code), "no module syntax may survive the bundle");
  new Function(code); // throws when the concatenation would not run as a script
});

test("index.html keeps the marker the standalone build replaces", () => {
  const html = readFile("index.html");

  assert.ok(
    html.includes('<script type="module" src="src/main.js"></script>'),
    "index.html must keep the module marker for the build"
  );
});

test("stripModuleSyntax removes imports, re-exports and exports", () => {
  const stripped = stripModuleSyntax(
    'import { a } from "./a.js";\nexport { b } from "./b.js";\nexport const c = 1;\nexport function d() {}\n'
  );

  assert.ok(!stripped.includes("import"), "imports are gone");
  assert.ok(!stripped.includes("export"), "exports and re-exports are gone");
  assert.ok(stripped.includes("const c = 1"), "the values stay");
  assert.ok(stripped.includes("function d() {}"), "the functions stay");
});
