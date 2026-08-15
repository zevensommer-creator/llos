"use strict";

// P7 expert mode: DLC-declared custom training modes are lowered to closed
// runtime primitives (spec §4.3). Risks: (1) mode templates only compose the
// restricted first-gen primitive set; (2) capture must be followed by evaluate
// (events are facts); (3) every stage chain must end in schedule (spaced
// repetition invariant); (4) extension payload must be sha256-bound and
// resolvable; (5) a custom mode's claim must be declared by the manifest.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  runCompiler,
  parseTrainingModes,
  loadTrainingModes,
  TRAINING_MODES_EXTENSION_KEY,
  CompilationError,
} = require("../dist/index.js");
const { validate } = require("@llos/contracts");
const { sha256Hex } = require("../dist/index.js");
const { loadFixtures, clone, makeSnapshot, baseOptions } = require("./helpers.js");

const MODES_URI = "artifact://dlc/dlc.de.fsi-construction/templates/training-modes";

function expertModesPayload() {
  return {
    modes: [
      {
        mode_ref: "mode.expert.dictation",
        claim_suffix: "checkin_dialogue",
        steps: [
          { primitive: "present", prompt_prefix: "Diktat: " },
          { primitive: "capture_text", timeout_ms: 45000, max_length: 300 },
          { primitive: "evaluate" },
          { primitive: "feedback" },
          { primitive: "schedule", interval: "PT12H" },
        ],
      },
      {
        mode_ref: "mode.expert.speak_drill",
        claim_suffix: "polite_request_construction",
        steps: [
          { primitive: "present" },
          { primitive: "capture_audio", timeout_ms: 30000, max_recording_ms: 12000 },
          { primitive: "evaluate" },
          { primitive: "feedback" },
          { primitive: "schedule" },
        ],
      },
    ],
    stage_modes: {
      "scenario.checkin": "mode.expert.dictation",
      "concept.polite-request": "mode.expert.speak_drill",
    },
  };
}

function withModesManifest(payload, { tamperHash = false } = {}) {
  const { manifest } = loadFixtures();
  const m = clone(manifest);
  const content = JSON.stringify(payload);
  m.extensions = {
    ...m.extensions,
    [TRAINING_MODES_EXTENSION_KEY]: {
      schema_id: TRAINING_MODES_EXTENSION_KEY,
      schema_version: "0.1.0",
      payload_ref: {
        uri: MODES_URI,
        sha256: tamperHash ? sha256Hex("tampered") : sha256Hex(content),
      },
    },
  };
  const check = validate("dlc-manifest", m);
  assert.equal(check.valid, true, JSON.stringify(check.errors));
  return { manifest: m, content };
}

function resolverWith(content, templateContent) {
  return (uri) => {
    if (uri === MODES_URI) return { content };
    if (uri.endsWith("templates/feedback-generic")) return { content: templateContent };
    return undefined;
  };
}

function compileWithModes(payload, opts = {}) {
  const { materialPack, templateContent } = loadFixtures();
  const { manifest, content } = withModesManifest(payload, opts);
  return runCompiler(
    { manifest, snapshot: makeSnapshot(materialPack), materialPack },
    {
      clock: () => "2026-08-16T00:00:00Z",
      seed: 0,
      templateResolver: resolverWith(content, templateContent),
    },
  );
}

test("expert mode: custom stages lower to template sequences, default stage untouched", () => {
  const { executable, pedagogical } = compileWithModes(expertModesPayload());
  const steps = executable.program.steps;

  const dictation = steps.filter((s) => s.step_id.startsWith("scenario.checkin."));
  assert.deepStrictEqual(
    dictation.map((s) => s.primitive),
    ["present", "capture_text", "evaluate", "feedback", "schedule"],
  );
  assert.match(dictation[0].present.prompt, /^Diktat: /);
  assert.strictEqual(dictation[1].capture.max_length, 300);
  assert.strictEqual(dictation[1].capture.timeout_ms, 45000);
  assert.strictEqual(dictation[4].schedule.interval, "PT12H");
  assert.strictEqual(dictation[0].display_mode_ref, "mode.expert.dictation");

  const speak = steps.filter((s) => s.step_id.startsWith("concept.polite-request."));
  assert.deepStrictEqual(
    speak.map((s) => s.primitive),
    ["present", "capture_audio", "evaluate", "feedback", "schedule"],
  );
  assert.strictEqual(speak[1].capture.max_recording_ms, 12000);

  // 未映射的 stage（valence.anbieten）保持内置默认链。
  const defaultStage = steps.filter((s) => s.step_id.startsWith("valence.anbieten."));
  assert.strictEqual(defaultStage[0].primitive, "present");
  assert.strictEqual(defaultStage[1].primitive, "capture_text");

  // pedagogical 层 mode_ref 反映专家映射；IR 全程过 schema。
  const plan = pedagogical.program.activity_plan;
  assert.strictEqual(
    plan.find((s) => s.stage_id === "scenario.checkin").mode_ref,
    "mode.expert.dictation",
  );
  assert.equal(validate("learning-ir", executable).valid, true);
  assert.equal(validate("learning-ir", pedagogical).valid, true);

  // 链完整：无悬挂 next。
  const ids = new Set(steps.map((s) => s.step_id));
  for (const s of steps) {
    if (s.next) assert.ok(ids.has(s.next), `dangling next ${s.next}`);
  }
  // 跨 stage 衔接点指到下一 stage 的 present。
  assert.ok(ids.has("valence.anbieten.present"));
  assert.strictEqual(dictation[4].next, "valence.anbieten.present");
});

test("expert mode: emitted steps stay inside the closed runtime primitive set", () => {
  const { executable } = compileWithModes(expertModesPayload());
  const CLOSED = new Set([
    "present", "capture_text", "capture_audio", "capture_choice",
    "invoke_capability", "evaluate", "branch", "feedback",
    "emit_observation", "schedule", "checkpoint", "stop",
  ]);
  for (const s of executable.program.steps) {
    assert.ok(CLOSED.has(s.primitive), `primitive ${s.primitive} outside closed set`);
  }
});

test("expert mode guards: sequences must open with present and close with schedule", () => {
  const bad = expertModesPayload();
  bad.modes[0].steps = [
    { primitive: "capture_text" },
    { primitive: "evaluate" },
    { primitive: "feedback" },
    { primitive: "schedule" },
  ];
  assert.throws(() => parseTrainingModes(bad), (e) => e.code === "training_modes_invalid");
});

test("expert mode guards: exactly one capture, immediately followed by evaluate", () => {
  const twoCaptures = expertModesPayload();
  twoCaptures.modes[0].steps = [
    { primitive: "present" },
    { primitive: "capture_text" },
    { primitive: "capture_audio" },
    { primitive: "evaluate" },
    { primitive: "feedback" },
    { primitive: "schedule" },
  ];
  assert.throws(() => parseTrainingModes(twoCaptures), /恰好包含一个学员作答步骤/);

  const noEvaluate = expertModesPayload();
  noEvaluate.modes[0].steps = [
    { primitive: "present" },
    { primitive: "capture_text" },
    { primitive: "feedback" },
    { primitive: "schedule" },
  ];
  assert.throws(() => parseTrainingModes(noEvaluate), /作答步骤之后必须紧跟评估/);
});

test("expert mode guards: stage_modes must reference a declared mode", () => {
  const bad = expertModesPayload();
  bad.stage_modes["valence.anbieten"] = "mode.ghost";
  assert.throws(() => parseTrainingModes(bad), /未定义的训练模式/);
});

test("expert mode: extension payload is sha256-bound; tampering fails compilation", () => {
  assert.throws(
    () => compileWithModes(expertModesPayload(), { tamperHash: true }),
    (e) => e instanceof CompilationError && e.code === "training_modes_hash_mismatch",
  );
});

test("expert mode: unresolvable payload resource fails with a typed error", () => {
  const { materialPack, templateContent } = loadFixtures();
  const { manifest } = withModesManifest(expertModesPayload());
  const { manifest: manifestNoExt } = loadFixtures();
  const untouched = clone(manifestNoExt);
  assert.equal(loadTrainingModes(untouched, (uri) => undefined), undefined);

  assert.throws(
    () =>
      runCompiler(
        { manifest, snapshot: makeSnapshot(materialPack), materialPack },
        {
          clock: () => "2026-08-16T00:00:00Z",
          seed: 0,
          templateResolver: (uri) =>
            uri.endsWith("feedback-generic") ? { content: templateContent } : undefined,
        },
      ),
    (e) => e instanceof CompilationError && e.code === "training_modes_unresolved",
  );
});

test("expert mode: a custom mode teaching an undeclared claim is rejected", () => {
  const payload = expertModesPayload();
  payload.modes[0].claim_suffix = "claim_that_manifest_never_declared";
  assert.throws(
    () => compileWithModes(payload),
    (e) => e instanceof CompilationError && e.code === "manifest_reference_broken",
  );
});
