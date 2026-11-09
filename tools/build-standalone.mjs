// Purpose: Build a single self-contained HTML file from index.html and the
// src modules, so the game can also be opened by double-clicking the file
// without a web server (Chrome refuses ES modules on file:// URLs).

import { readFileSync, writeFileSync } from "node:fs";

const MODULES = ["prng.js", "world.js", "physics.js", "camera.js", "renderer.js", "main.js"];

/** Remove ES module syntax so the code can run as one plain script. */
function stripModuleSyntax(source) {
  return source
    .replace(/^import[^;]*;$/gm, "")
    .replace(/^export\s+/gm, "");
}

function build() {
  const html = readFileSync("index.html", "utf8");
  const code = MODULES.map((file) => {
    const source = stripModuleSyntax(readFileSync(`src/${file}`, "utf8"));
    return `/* ---- src/${file} ---- */\n${source}`;
  }).join("\n");

  const output = html.replace(
    '<script type="module" src="src/main.js"></script>',
    `<script>\n${code}\n</script>`
  );

  writeFileSync("standalone.html", output);
  console.log("built standalone.html from index.html +", MODULES.length, "modules");
}

build();
