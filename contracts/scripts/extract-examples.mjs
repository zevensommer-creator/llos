import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const { validate } = require(join(pkgRoot, "dist", "index.js"));

const schemaDir = join(pkgRoot, "..", "docs", "contracts");
const outDir = join(pkgRoot, "..", "tests", "contracts", "fixtures");

const targets = [
  "material-request",
  "dlc-manifest",
  "learning-ir",
  "learning-claim",
  "learner-state-projection",
  "provider-descriptor",
  "pronunciation-assessment",
  "agent-work",
];

for (const name of targets) {
  const schema = JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), "utf8"));
  const example = (schema.examples ?? [])[0];
  if (!example) {
    console.log(`${name}: NO EXAMPLE`);
    continue;
  }
  const result = validate(name, example);
  if (result.valid) {
    mkdirSync(join(outDir, name), { recursive: true });
    writeFileSync(join(outDir, name, "valid_minimal.json"), JSON.stringify(example, null, 2) + "\n");
    console.log(`${name}: example validates, saved valid_minimal.json`);
  } else {
    console.log(`${name}: example INVALID`, JSON.stringify(result.errors.slice(0, 3)));
  }
}
