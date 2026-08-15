import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tokens = JSON.parse(readFileSync(join(root, "tokens", "tokens.json"), "utf8"));

function cssVarName(path) {
  return `--llos-${path.join("-").replace(/_/g, "-")}`;
}

function collect(node, path, out) {
  for (const [key, value] of Object.entries(node)) {
    const next = [...path, key];
    if (value !== null && typeof value === "object") collect(value, next, out);
    else out.push([cssVarName(next), value]);
  }
}

const flat = [];
collect(tokens, [], flat);
const cssLines = flat
  .map(([name, value]) => `  ${name}: ${typeof value === "number" ? `${value}px` : value};`)
  .join("\n");
const css = `/* AUTO-GENERATED from tokens/tokens.json. DO NOT EDIT; rerun 'pnpm --filter @llos/design-tokens build'. */\n:root {\n${cssLines}\n}\n`;

function deepFreeze(node) {
  if (node !== null && typeof node === "object") {
    for (const value of Object.values(node)) deepFreeze(value);
  }
  return Object.freeze(node);
}
deepFreeze(tokens);

const js = `// AUTO-GENERATED from tokens/tokens.json. DO NOT EDIT; rerun 'pnpm --filter @llos/design-tokens build'.
"use strict";
function deepFreeze(node) {
  if (node !== null && typeof node === "object") {
    for (const value of Object.values(node)) deepFreeze(value);
  }
  return Object.freeze(node);
}
const tokens = ${JSON.stringify(tokens, null, 2)};
module.exports = deepFreeze(tokens);
`;

function tsType(node) {
  if (node !== null && typeof node === "object") {
    const fields = Object.entries(node)
      .map(([key, value]) => `  ${key}: ${tsType(value).replace(/\n/g, "\n  ")};`)
      .join("\n");
    return `{\n${fields}\n}`;
  }
  return typeof node === "number" ? String(node) : JSON.stringify(node);
}
const dts = `// AUTO-GENERATED from tokens/tokens.json. DO NOT EDIT; rerun 'pnpm --filter @llos/design-tokens build'.
declare const tokens: ${tsType(tokens)};
export = tokens;
`;

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "tokens.css"), css, "utf8");
writeFileSync(join(root, "dist", "tokens.js"), js, "utf8");
writeFileSync(join(root, "dist", "tokens.d.ts"), dts, "utf8");
console.log(`design-tokens: wrote ${flat.length} variables to dist/`);
