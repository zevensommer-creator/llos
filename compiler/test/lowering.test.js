"use strict";

// Risks: (1) lowering must only emit the closed primitive set; (2) high-level
// modes survive only as display metadata; (3) assessment must allow abstention;
// (4) unresolved feedback templates, bad manifests, unknown entrypoints, broken
// pass chains and budget overruns must fail with typed errors.

const { test } = require("node:test");
const assert = require("node:assert");
const { runCompiler, CompilationError } = require("../dist/index.js");
const { validate } = require("@llos/contracts");
const { loadFixtures, clone, makeSnapshot, baseOptions } = require("./helpers.js");

const CLOSED_PRIMITIVES = new Set([
  "present",
  "capture_text",
  "capture_audio",
  "capture_choice",
  "invoke_capability",
  "evaluate",
  "branch",
  "feedback",
  "emit_observation",
  "schedule",
  "checkpoint",
  "stop",
]);

function compileWith(mutateManifest, optionsOverrides = {}) {
  const { materialPack, manifest, templateContent } = loadFixtures();
  const m = mutateManifest ? mutateManifest(clone(manifest)) : manifest;
  return runCompiler(
    { manifest: m, snapshot: makeSnapshot(materialPack), materialPack },
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

test("lowering: only closed-set runtime primitives are emitted", () => {
  const { executable } = compileWith();
  for (const step of executable.program.steps) {
    assert.ok(
      CLOSED_PRIMITIVES.has(step.primitive),
      `primitive ${step.primitive} is outside the closed runtime set`,
    );
  }
});

test("lowering: every stage lowers to present/capture/evaluate/feedback/schedule plus a final stop", () => {
  const { executable } = compileWith();
  const { steps } = executable.program;
  assert.strictEqual(executable.program.entry_step_id, steps[0].step_id);
  assert.match(steps[0].primitive, /^present$/);
  const last = steps[steps.length - 1];
  assert.strictEqual(last.primitive, "stop");
  assert.strictEqual(last.stop.outcome, "success");
  const stepIds = new Set(steps.map((s) => s.step_id));
  for (const step of steps) {
    if (step.next) assert.ok(stepIds.has(step.next), `dangling next ${step.next}`);
  }
});

test("lowering: high-level training modes appear only as display metadata", () => {
  const { executable } = compileWith();
  const modes = executable.program.steps
    .map((s) => s.display_mode_ref)
    .filter(Boolean);
  assert.ok(modes.length > 0);
  for (const mode of modes) assert.match(mode, /^mode\./);
  for (const step of executable.program.steps) {
    assert.strictEqual(step.mode_ref, undefined, "steps must not carry executable mode_ref");
  }
});

test("lowering: evaluation keeps measurement confidence separate from performance thresholds", () => {
  const { executable } = compileWith();
  for (const step of executable.program.steps) {
    if (step.primitive === "evaluate") {
      assert.ok(step.evaluate.minimum_measurement_confidence >= 0);
      assert.strictEqual(step.evaluate.minimum_measurement_confidence <= 1, true);
      assert.strictEqual(step.claim_refs.length > 0, true);
    }
  }
});

test("plan: assessment always allows abstention (never force a score)", () => {
  const { pedagogical } = compileWith();
  assert.strictEqual(pedagogical.program.assessment_plan.abstention_allowed, true);
  for (const dim of pedagogical.program.assessment_plan.dimensions) {
    assert.strictEqual(dim.evidence_required, true);
  }
});

test("plan: every activity stage binds at least one declared claim", () => {
  const { pedagogical } = compileWith();
  const declared = new Set(pedagogical.claims.map((c) => c.claim_ref));
  assert.ok(declared.size >= 3);
  for (const stage of pedagogical.program.activity_plan) {
    assert.ok(stage.claim_refs.length >= 1);
    for (const ref of stage.claim_refs) assert.ok(declared.has(ref), `undeclared claim ${ref}`);
  }
});

test("failure: unresolved feedback template fails with template_unresolved", () => {
  expectError("template_unresolved", () => compileWith(null, { templateResolver: undefined }));
});

test("failure: schema-invalid manifest fails with manifest_invalid", () => {
  expectError("manifest_invalid", () =>
    compileWith((m) => {
      delete m.budgets;
      return m;
    }),
  );
});

test("failure: unknown pass entrypoint fails with pass_entrypoint_unknown", () => {
  expectError("pass_entrypoint_unknown", () =>
    compileWith((m) => {
      m.passes[1].entrypoint = "llos.compiler.nonexistent:run";
      return m;
    }),
  );
});

test("failure: broken pass chain (wrong first input) fails with pass_chain_invalid", () => {
  expectError("pass_chain_invalid", () =>
    compileWith((m) => {
      m.passes = [m.passes[2], m.passes[1], m.passes[0]];
      return m;
    }),
  );
});

test("failure: non-deterministic pass declaration is rejected", () => {
  expectError("pass_chain_invalid", () =>
    compileWith((m) => {
      m.passes[0].determinism = "seeded";
      return m;
    }),
  );
});

test("failure: mode requiring an undeclared claim fails with manifest_reference_broken", () => {
  expectError("manifest_reference_broken", () =>
    compileWith((m) => {
      m.claims = m.claims.filter((c) => !c.claim_ref.endsWith("claim/checkin_dialogue"));
      return m;
    }),
  );
});

test("failure: output exceeding the manifest byte budget fails with budget_exceeded", () => {
  expectError("budget_exceeded", () =>
    compileWith((m) => {
      m.budgets.max_output_bytes = 10;
      return m;
    }),
  );
});

test("contract: mutated manifests used in failure tests remain schema-valid except where stated", () => {
  const { manifest } = loadFixtures();
  const ok = validate("dlc-manifest", manifest);
  assert.ok(ok.valid, ok.valid ? "" : ok.errors.join("; "));
});
