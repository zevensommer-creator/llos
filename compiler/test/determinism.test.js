"use strict";

// Risk: compilation must be deterministic — same inputs, same clock, same seed
// must yield byte-identical IR; different seeds must yield different IR ids.

const { test } = require("node:test");
const assert = require("node:assert");
const { runCompiler, canonicalJson, contentHash } = require("../dist/index.js");
const { loadFixtures, makeSnapshot, baseOptions } = require("./helpers.js");

function compileWith(optionsOverrides) {
  const { materialPack, manifest, templateContent } = loadFixtures();
  return runCompiler(
    { manifest, snapshot: makeSnapshot(materialPack), materialPack },
    baseOptions(templateContent, optionsOverrides),
  );
}

test("determinism: identical inputs and clock produce identical IRs (both kinds)", () => {
  const a = compileWith();
  const b = compileWith();
  assert.deepStrictEqual(a.pedagogical, b.pedagogical);
  assert.deepStrictEqual(a.executable, b.executable);
  assert.strictEqual(
    contentHash(a.executable),
    contentHash(b.executable),
  );
});

test("determinism: changing the seed changes pedagogical ir_id but not structure shape", () => {
  const zero = compileWith({ seed: 0 });
  const one = compileWith({ seed: 1 });
  assert.notStrictEqual(zero.pedagogical.ir_id, one.pedagogical.ir_id);
  assert.strictEqual(
    zero.pedagogical.program.activity_plan.length,
    one.pedagogical.program.activity_plan.length,
  );
});

test("determinism: different clock timestamps change created_at only", () => {
  const a = compileWith({ clock: () => "2026-08-16T00:00:00Z" });
  const b = compileWith({ clock: () => "2026-08-17T00:00:00Z" });
  assert.notStrictEqual(a.pedagogical.created_at, b.pedagogical.created_at);
  assert.strictEqual(a.pedagogical.ir_id, b.pedagogical.ir_id);
  assert.strictEqual(
    a.executable.program.steps.length,
    b.executable.program.steps.length,
  );
});

test("determinism: canonical JSON is order-insensitive for the same content", () => {
  const { materialPack } = loadFixtures();
  const shuffled = {};
  for (const key of Object.keys(materialPack).reverse()) shuffled[key] = materialPack[key];
  assert.strictEqual(canonicalJson(materialPack), canonicalJson(shuffled));
});
