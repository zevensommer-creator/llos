"use strict";

// Risk: invalid, tampered, or unaccepted material must never enter compilation.
// Every failure is a typed CompilationError — never a silent pass-through.

const { test } = require("node:test");
const assert = require("node:assert");
const { runCompiler, CompilationError, contentHash } = require("../dist/index.js");
const { validate } = require("@llos/contracts");
const { loadFixtures, clone, makeSnapshot, baseOptions } = require("./helpers.js");

function attempt(manifest, pack, optionsOverrides = {}) {
  const { templateContent } = loadFixtures();
  return runCompiler(
    { manifest, snapshot: makeSnapshot(pack), materialPack: pack },
    baseOptions(templateContent, optionsOverrides),
  );
}

function expectError(code, fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof CompilationError, `expected CompilationError, got ${err}`);
    assert.strictEqual(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`expected CompilationError ${code}, but compilation succeeded`);
}

test("material gate: tampered pack content is rejected by hash mismatch", () => {
  const { manifest, materialPack, templateContent } = loadFixtures();
  const snapshot = makeSnapshot(materialPack);
  const tampered = clone(materialPack);
  tampered.display_name = "geänderte Bezeichnung";
  expectError("material_hash_mismatch", () =>
    runCompiler({ manifest, snapshot, materialPack: tampered }, baseOptions(templateContent)),
  );
});

test("material gate: schema-invalid pack is rejected even with a consistent hash", () => {
  const { manifest, materialPack } = loadFixtures();
  const broken = clone(materialPack);
  delete broken.display_name;
  const snapshot = makeSnapshot(broken);
  const { templateContent } = loadFixtures();
  expectError("material_schema_invalid", () =>
    runCompiler(
      { manifest, snapshot, materialPack: broken },
      baseOptions(templateContent),
    ),
  );
});

test("material gate: pack schema version outside the DLC accepted set is rejected", () => {
  const { manifest, materialPack } = loadFixtures();
  const manifestOld = clone(manifest);
  manifestOld.accepted_material_schemas = [
    "urn:language-learning-platform:schema:material-pack:0.2.0",
  ];
  assert.ok(validate("dlc-manifest", manifestOld).valid, "mutated manifest must stay schema-valid");
  expectError("material_version_rejected", () => attempt(manifestOld, materialPack));
});

test("material gate: unsupported language is rejected", () => {
  const { manifest, materialPack } = loadFixtures();
  const french = clone(materialPack);
  french.languages = ["fr-FR"];
  const snapshot = makeSnapshot(french);
  const { templateContent } = loadFixtures();
  expectError("language_unsupported", () =>
    runCompiler({ manifest, snapshot, materialPack: french }, baseOptions(templateContent)),
  );
});

test("material gate: dangling frame asset_refs are rejected", () => {
  const { manifest, materialPack } = loadFixtures();
  const dangling = clone(materialPack);
  dangling.semantic_frames[0].asset_refs = ["asset.does-not-exist"];
  const snapshot = makeSnapshot(dangling);
  const { templateContent } = loadFixtures();
  expectError("material_reference_broken", () =>
    runCompiler({ manifest, snapshot, materialPack: dangling }, baseOptions(templateContent)),
  );
});

test("material gate: annotation targeting an unknown object is rejected", () => {
  const { manifest, materialPack } = loadFixtures();
  const dangling = clone(materialPack);
  dangling.annotations = [
    {
      id: "ann.orphan",
      target_ref: "frame.ghost",
      annotation_type: "construction",
      value: { kind: "string", string: "…" },
      provenance: { method: "human", created_at: "2026-08-16T00:00:00Z" },
    },
  ];
  const snapshot = makeSnapshot(dangling);
  const { templateContent } = loadFixtures();
  expectError("material_reference_broken", () =>
    runCompiler({ manifest, snapshot, materialPack: dangling }, baseOptions(templateContent)),
  );
});

test("material gate: fact referencing an undeclared lexical candidate is rejected", () => {
  const { manifest, materialPack } = loadFixtures();
  const dangling = clone(materialPack);
  dangling.semantic_frames[0].facts.push({
    subject: "guest",
    predicate: "verb",
    object: { kind: "ref", ref: "lex.ghost" },
  });
  const snapshot = makeSnapshot(dangling);
  const { templateContent } = loadFixtures();
  expectError("material_reference_broken", () =>
    runCompiler({ manifest, snapshot, materialPack: dangling }, baseOptions(templateContent)),
  );
});

test("material gate: snapshot itself stays schema-valid in the harness", () => {
  const { materialPack } = loadFixtures();
  const snapshot = makeSnapshot(materialPack);
  const v = validate("material-snapshot", snapshot);
  assert.ok(v.valid, v.valid ? "" : v.errors.join("; "));
  assert.strictEqual(snapshot.content_sha256, contentHash(materialPack));
});
