// Purpose: Find constant names that are used in a src module but defined
// nowhere. This happens when a constant is renamed in one place only, and a
// wrong constant name is a runtime crash in the browser, so it is checked here.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { resolveModules } from "./build-standalone.mjs";

const ENTRY = "src/main.js";

// Upper case names with an underscore are treated as constants.
const CONSTANT_NAME = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/** Every top level name a module defines or imports itself. */
function ownNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/^(?:export\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^import\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) names.add(part.trim().split(/\s+as\s+/).pop());
  }
  return names;
}

/** The constants a module exports for others to import. */
function exportedConstants(source) {
  return [...source.matchAll(/^export\s+(?:const|let)\s+([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)/gm)].map((match) => match[1]);
}

/** Names a source uses, with comments and property accesses removed. */
function usedNames(source) {
  const code = source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\.\s*[A-Za-z_$][\w$]*/g, "");
  return [...new Set(code.match(CONSTANT_NAME) || [])];
}

/**
 * Report the constant names a module uses but neither defines, imports nor
 * inherits from the module graph.
 */
export function unknownConstants(modules, readFile) {
  const exportedByModule = new Map(modules.map((file) => [file, exportedConstants(readFile(file))]));
  const problems = [];

  for (const file of modules) {
    const source = readFile(file);
    const known = ownNames(source);
    for (const match of source.matchAll(/^import\s*\{[^}]*\}\s*from\s+"(\.\/[^"]+)"/gm)) {
      const imported = modules.find((name) => name.endsWith(match[1].slice(2)));
      for (const name of exportedByModule.get(imported) ?? []) known.add(name);
    }

    const unknown = usedNames(source).filter((name) => !known.has(name));
    if (unknown.length > 0) problems.push({ file, unknown });
  }

  return problems;
}

/** Check the whole module graph of the entry module. */
export function checkConstants(readFile = (file) => readFileSync(file, "utf8")) {
  return unknownConstants(resolveModules(ENTRY, readFile), readFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkConstants();

  for (const problem of problems) console.log(problem.file + " -> " + problem.unknown.join(", "));
  console.log(problems.length === 0 ? "all constant names resolve" : problems.length + " module(s) use unknown constants");
  process.exitCode = problems.length === 0 ? 0 : 1;
}
