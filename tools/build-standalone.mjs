// Purpose: Build a single self-contained HTML file from index.html and the src
// modules, so the game can also be opened by double-clicking the file without a
// web server (Chrome refuses ES modules on file:// URLs). The list of modules is
// read from the import statements, so a new module can never be forgotten.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ENTRY = "src/main.js";
const HTML_MARKER = '<script type="module" src="src/main.js"></script>';

// An import must fit on one line, see assertOneLineImports().
const IMPORT_LINE = /^import\s+[^;]*?from\s+"(\.\/[^"]+)";$/;

/**
 * Collect every module that the entry imports (directly or indirectly).
 * Dependencies are listed before the module that uses them, so the plain
 * script in standalone.html defines a helper before it is first referenced.
 */
export function resolveModules(entry, readFile) {
  const ordered = [];
  const done = new Set();
  const stack = new Set();

  function visit(file) {
    if (done.has(file)) return;
    if (stack.has(file)) throw new Error(`Import cycle at ${file}`);
    stack.add(file);

    const source = readFile(file);
    assertOneLineImports(file, source);
    for (const line of source.split("\n")) {
      const match = IMPORT_LINE.exec(line.trim());
      if (match) visit(siblingOf(file, match[1]));
    }

    stack.delete(file);
    done.add(file);
    ordered.push(file);
  }

  visit(entry);
  return ordered;
}

/** Resolve "./world.js" as imported by "src/main.js" to "src/world.js". */
function siblingOf(file, spec) {
  const folder = file.replace(/\/[^/]*$/, "");
  return (folder ? folder + "/" : "") + spec.replace(/^\.\//, "");
}

/** Fail the build when an import spans several lines: it would not be found. */
function assertOneLineImports(file, source) {
  for (const line of source.split("\n")) {
    const text = line.trim();
    if (text.startsWith("import ") && !text.endsWith(";")) {
      throw new Error(`${file}: import must stay on one line -> ${text}`);
    }
  }
}

/** Remove ES module syntax so the code can run as one plain script. */
export function stripModuleSyntax(source) {
  return source
    .replace(/^import[^;]*;$/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*from[^;]*;$/gm, "")
    .replace(/^export\s+/gm, "");
}

/** Join the modules into one script body, in dependency order. */
export function bundleSources(modules, readFile) {
  return modules.map((file) => `/* ---- ${file} ---- */\n${stripModuleSyntax(readFile(file))}`).join("\n");
}

/** Build standalone.html from index.html and the module graph. */
export function build() {
  const readFile = (file) => readFileSync(file, "utf8");
  const modules = resolveModules(ENTRY, readFile);
  const code = bundleSources(modules, readFile);
  const html = readFile("index.html").replace(HTML_MARKER, `<script>\n${code}\n</script>`);

  writeFileSync("standalone.html", html);
  console.log("built standalone.html from index.html +", modules.length, "modules");
  return modules;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) build();
