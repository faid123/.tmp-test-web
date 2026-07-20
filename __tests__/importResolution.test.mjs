// __tests__/importResolution.test.mjs
//
// Static guard that every relative module reference in the repo resolves to a
// file that actually exists ON DISK IN THIS CHECKOUT. Jest only loads the
// modules the suite imports, and webpack only validates the viewer bundle —
// the other pages ship raw ESM that nothing verifies until a browser 404s.
// This test exists because both recent breakages were exactly that class:
// a module committed everywhere except git (mergeInstructions.js), and a
// repo-wide folder reorganization touching ~50 specifiers.
//
// Checks:
//   - static `from "..."`, dynamic `import("...")`, and `jest.mock("...")`
//     relative specifiers in src/**/*.js and __tests__/*.mjs
//   - relative <script src="..."> in index.html and src/pages/**/*.html,
//     resolving `${basePath}` templates against the repo root
//   - specifiers must be exact paths (extension included): the pages load raw
//     ESM, and a browser — unlike webpack — cannot resolve `./foo` to foo.js

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = process.cwd();

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// Drop full-line comments (// and JSDoc *) so specifiers quoted in prose —
// e.g. the annotationTeethModel note in jawStructRoundTrip.test.mjs — don't
// register as imports.
function codeLines(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|jest\.mock\s*\(\s*)["'](\.\.?\/[^"']+)["']/g;

function brokenImportsIn(files) {
  const broken = [];
  for (const file of files) {
    const text = codeLines(readFileSync(file, "utf8"));
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (!existsSync(resolve(dirname(file), spec))) {
        broken.push(`${file.replace(ROOT + "/", "")} -> ${spec}`);
      }
    }
  }
  return broken;
}

test("every relative import in src/ resolves to an existing file", () => {
  const files = walk(join(ROOT, "src"), [".js"]);
  expect(files.length).toBeGreaterThan(40); // the walker actually found the tree
  expect(brokenImportsIn(files)).toEqual([]);
});

test("every relative import and jest.mock in __tests__/ resolves", () => {
  expect(brokenImportsIn(walk(join(ROOT, "__tests__"), [".mjs"]))).toEqual([]);
});

test("every relative <script src> in the HTML pages resolves", () => {
  const htmlFiles = [join(ROOT, "index.html"), ...walk(join(ROOT, "src"), [".html"])];
  const broken = [];
  for (const file of htmlFiles) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/src="([^"]+\.js)"/g)) {
      const spec = match[1];
      if (spec.startsWith("http")) continue; // CDN
      const target = spec.includes("${basePath}")
        ? join(ROOT, spec.replace(/^.*\$\{basePath\}\//, "")) // basePath = deploy root
        : resolve(dirname(file), spec);
      if (!existsSync(target)) {
        broken.push(`${file.replace(ROOT + "/", "")} -> ${spec}`);
      }
    }
  }
  expect(htmlFiles.length).toBeGreaterThan(5);
  expect(broken).toEqual([]);
});
