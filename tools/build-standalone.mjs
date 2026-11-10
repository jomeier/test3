// Purpose: Build a single self-contained HTML file from index.html and the src
// modules, so the game can also be opened by double-clicking the file without a
// web server (Chrome refuses ES modules on file:// URLs).
// The list of modules is read from the import statements, so a module that is
// added later can never be forgotten.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENTRY_MODULE = "src/main.js";
const MODULE_TAG = '<script type="module" src="src/main.js"></script>';

// An import must fit on one line, see assertOneLineImports().
const IMPORT_LINE = /^import\s+[^;]*?from\s+"(\.\/[^"]+)";$/;

/**
 * List every module the entry uses, directly or indirectly, ordered so that a
 * module always comes before the modules that use it.
 */
export function resolveModules(entry, readFile) {
  const ordered = [];
  const done = new Set();
  const waiting = new Set();

  function visit(file) {
    if (done.has(file)) return;
    if (waiting.has(file)) throw new Error(`Import cycle at ${file}`);
    waiting.add(file);

    const source = readFile(file);
    assertOneLineImports(file, source);
    for (const line of source.split("\n")) {
      const match = IMPORT_LINE.exec(line.trim());
      if (match) visit(joinModule(file, match[1]));
    }

    waiting.delete(file);
    done.add(file);
    ordered.push(file);
  }

  visit(entry);
  return ordered;
}

/** Resolve "./world.js" as imported by "src/main.js" to "src/world.js". */
function joinModule(file, name) {
  const folder = file.replace(/\/[^/]*$/, "");
  return (folder ? folder + "/" : "") + name.replace(/^\.\//, "");
}

/** Fail the build when an import spans several lines: it would not be found. */
function assertOneLineImports(file, source) {
  for (const line of source.split("\n")) {
    const text = line.trim();
    if (text.startsWith("import ") && !text.endsWith(";")) {
      throw new Error(`${file}: an import must stay on one line -> ${text}`);
    }
  }
}

/**
 * Remove the ES module syntax so the code can run as one plain script.
 * A re-export line is dropped whole, otherwise only the keyword would go away
 * and the rest of the line would be invalid.
 */
export function stripModuleSyntax(source) {
  return source
    .replace(/^import\s+[^;]*;$/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*from\s*"[^"]*"\s*;$/gm, "")
    .replace(/^export\s+/gm, "");
}

/** Join the modules into one script body, in dependency order. */
export function bundleSources(modules, readFile) {
  return modules.map((file) => `/* ---- ${file} ---- */\n${stripModuleSyntax(readFile(file))}`).join("\n");
}

/** Build standalone.html from index.html and the module graph. */
export function build() {
  const readFile = (file) => readFileSync(file, "utf8");
  const modules = resolveModules(ENTRY_MODULE, readFile);
  const code = bundleSources(modules, readFile);
  const output = readFile("index.html").replace(MODULE_TAG, `<script>\n${code}\n</script>`);

  writeFileSync("standalone.html", output);
  console.log("built standalone.html from index.html +", modules.length, "modules");
  return modules;
}

// Run only when this file is started directly, so the tests can import it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
