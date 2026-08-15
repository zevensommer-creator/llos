"use strict";

// Golden test: locks the compiler's Learning IR output for the reference
// material pack + reference DLC. Regenerate with: UPDATE_GOLDEN=1 pnpm --filter @llos/compiler test

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { runCompiler } = require("../dist/index.js");
const { validate } = require("@llos/contracts");
const { loadFixtures, makeSnapshot, baseOptions } = require("./helpers.js");

const GOLDEN_DIR = path.join(__dirname, "golden");

function compile() {
  const { materialPack, manifest, templateContent } = loadFixtures();
  return runCompiler(
    { manifest, snapshot: makeSnapshot(materialPack), materialPack },
    baseOptions(templateContent),
  );
}

function readOrUpdate(name, actual) {
  const file = path.join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("golden: reference pack + reference DLC produce the locked pedagogical IR", () => {
  const result = compile();
  assert.ok(result.pedagogical, "pedagogical IR missing");
  const golden = readOrUpdate("expected-pedagogical-ir.json", result.pedagogical);
  assert.deepStrictEqual(result.pedagogical, golden);
});

test("golden: pedagogical IR validates against learning-ir 0.2.0", () => {
  const v = validate("learning-ir", compile().pedagogical);
  assert.ok(v.valid, v.valid ? "" : v.errors.join("; "));
});

test("golden: reference pack + reference DLC produce the locked executable session IR", () => {
  const result = compile();
  assert.ok(result.executable, "executable IR missing");
  const golden = readOrUpdate("expected-executable-ir.json", result.executable);
  assert.deepStrictEqual(result.executable, golden);
});

test("golden: executable IR validates against learning-ir 0.2.0", () => {
  const v = validate("learning-ir", compile().executable);
  assert.ok(v.valid, v.valid ? "" : v.errors.join("; "));
});
