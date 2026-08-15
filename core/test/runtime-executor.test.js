"use strict";

// Risk: the runtime executor must only produce registry event types, enforce
// session policy hard caps, and never leave a half-finished session in the
// stream. Every abnormal exit is a typed abort event, not a silent stop.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  SessionExecutor,
  ExecutorError,
  InMemoryEventStore,
  addInterval,
} = require("../dist/index.js");

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CLAIM = "dlc.de.fsi-construction:claim/checkin_dialogue";
const POLICY = "dlc.de.fsi-construction:policy/retention_transfer";

const COMPOSITION = {
  core_version: "0.2.0",
  dlc_ref: { id: "dlc.de.fsi-construction", version: "0.2.0", sha256: SHA },
  material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
  learning_ir_ref: { id: "ir.001", version: "0.2.0", sha256: SHA },
};

const META = { learner_ref: "learner.alice", session_ref: "session.run.001", composition: COMPOSITION };
const CLOCK_STEP = { now: "2026-08-16T08:00:00Z" };

function makeClock(times) {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
}

function step(stepId, primitive, extra = {}, next) {
  return { step_id: stepId, primitive, ...extra, ...(next !== undefined ? { next } : {}) };
}

function executableIr(steps, policy = {}) {
  return {
    schema_version: "0.2.0",
    ir_id: "ir.executable.test",
    ir_version: "0.2.0",
    ir_kind: "executable_session",
    language: "de-DE",
    created_at: "2026-08-16T00:00:00Z",
    compiler: { dlc_id: "dlc.de.fsi-construction", dlc_version: "0.2.0", runtime_version: "0.1.0" },
    source_refs: [{ uri: "artifact://materials/m/1.0.0", sha256: SHA, media_type: "application/json" }],
    random_seed: 0,
    claims: [
      {
        claim_ref: CLAIM,
        evidence_policy_ref: POLICY,
        evidence_policy_version: "0.1.0",
        descriptor: { display_name: "Check-in dialogue" },
      },
    ],
    program: {
      session_policy: {
        max_duration_ms: 600_000,
        max_provider_cost_usd: 1,
        max_iterations: 50,
        on_provider_failure: "skip_activity",
        ...policy,
      },
      entry_step_id: steps[0].step_id,
      steps,
      stop_conditions: [
        { fact: "session.elapsed_ms", operator: "gte", value: { kind: "int", int: 600_000 } },
      ],
    },
    provenance: { input_hashes: [SHA], passes: [], compiled_at: "2026-08-16T00:00:00Z" },
  };
}

function linearSteps() {
  return [
    step("s1", "present", { present: { prompt: "Übung: Hotel Check-in" }, claim_refs: [CLAIM] }, "s2"),
    step("s2", "capture_text", { capture: { timeout_ms: 30_000, max_length: 500 }, claim_refs: [CLAIM] }, "s3"),
    step("s3", "evaluate", {
      claim_refs: [CLAIM],
      evaluate: { evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" }, metric_ref: "dlc:metric/acc", minimum_measurement_confidence: 0.8 },
    }, "s4"),
    step("s4", "feedback", { claim_refs: [CLAIM], feedback: { template_ref: { uri: "artifact://dlc/t/1", sha256: SHA, media_type: "application/json" } } }, "s5"),
    step("s5", "schedule", { claim_refs: [CLAIM], schedule: { scheduler: "rule_based", interval: "PT24H" } }, "s6"),
    step("s6", "stop", { stop: { outcome: "success" } }),
  ];
}

function successEvaluator() {
  return { "eval.typed_answer": () => ({ result_kind: "binary", outcome: "success", measurement_confidence: 0.95 }) };
}

function makeExecutor(ir, depsOverrides = {}, meta = META, clockTimes = [CLOCK_STEP.now]) {
  const store = new InMemoryEventStore();
  const deps = {
    append: (e) => store.append(e),
    clock: makeClock(clockTimes),
    evaluators: successEvaluator(),
    ...depsOverrides,
  };
  return { executor: new SessionExecutor(ir, meta, deps), store };
}

test("executor: linear happy path emits the exact registry event sequence", () => {
  const { executor, store } = makeExecutor(executableIr(linearSteps()));
  const afterStart = executor.start();
  assert.equal(afterStart.status, "awaiting_input");
  assert.equal(afterStart.step_id, "s2");
  const done = executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA });
  assert.equal(done.status, "completed");
  assert.equal(done.outcome, "success");

  const types = store.events().map((e) => e.event_type);
  assert.deepEqual(types, [
    "learning.session_started",
    "activity.presented",
    "learner.response_submitted",
    "observation.recorded",
    "feedback.presented",
    "review.scheduled",
    "learning.session_completed",
  ]);
});

test("executor: scheduled review carries due_at derived from the declared interval", () => {
  const { executor, store } = makeExecutor(executableIr(linearSteps()));
  executor.start();
  executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA });
  const review = store.events().find((e) => e.event_type === "review.scheduled");
  assert.equal(review.claim_ref, CLAIM);
  assert.equal(review.evidence_policy_ref, POLICY);
  assert.equal(review.review.scheduler, "rule_based");
  assert.equal(review.review.interval, "PT24H");
  assert.equal(review.review.due_at, "2026-08-17T08:00:00.000Z");
});

test("executor: same inputs produce a byte-identical event sequence (determinism)", () => {
  const run = () => {
    const { executor, store } = makeExecutor(executableIr(linearSteps()));
    executor.start();
    executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA });
    return store.events().map((e) => JSON.stringify(e));
  };
  assert.deepEqual(run(), run());
});

test("executor: observation binds the claim policy from the IR claims table", () => {
  const { executor, store } = makeExecutor(executableIr(linearSteps()));
  executor.start();
  executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA });
  const obs = store.events().find((e) => e.event_type === "observation.recorded");
  assert.equal(obs.claim_ref, CLAIM);
  assert.equal(obs.evidence_policy_ref, POLICY);
  assert.equal(obs.observation.outcome, "success");
  assert.equal(obs.observation.measurement_confidence, 0.95);
  assert.equal(obs.task.task_ref, "s2");
});

test("executor: abstaining evaluator records abstention, never a guessed outcome", () => {
  const { executor, store } = makeExecutor(executableIr(linearSteps()), {
    evaluators: {
      "eval.typed_answer": () => ({
        result_kind: "abstention",
        abstention_reason: "insufficient_evidence",
        measurement_confidence: 0.2,
      }),
    },
  });
  executor.start();
  executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA });
  const obs = store.events().find((e) => e.event_type === "observation.recorded");
  assert.equal(obs.observation.result_kind, "abstention");
  assert.equal(obs.observation.abstention_reason, "insufficient_evidence");
  assert.equal(obs.observation.outcome, undefined);
});

test("executor: capture step rejects missing input without touching the stream", () => {
  const { executor, store } = makeExecutor(executableIr(linearSteps()));
  executor.start();
  assert.throws(() => executor.advance(), (e) => e instanceof ExecutorError && e.code === "capture_input_missing");
  assert.equal(store.events().length, 2);
});

test("executor: input on a non-capture step is rejected as unexpected", () => {
  const ir = executableIr([
    step("s1", "present", { present: { prompt: "x" } }, "$complete"),
  ]);
  const { executor } = makeExecutor(ir);
  const done = executor.start();
  assert.equal(done.status, "completed");
  assert.throws(
    () => executor.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA }),
    (e) => e instanceof ExecutorError && e.code === "session_already_finished",
  );
});

test("executor: dangling next target aborts with dlc_compile_failed, never a silent stop", () => {
  const ir = executableIr([
    step("s1", "present", { present: { prompt: "x" } }, "s.ghost"),
  ]);
  const { executor, store } = makeExecutor(ir);
  assert.throws(() => executor.start(), (e) => e instanceof ExecutorError && e.code === "step_not_found");
  const types = store.events().map((e) => e.event_type);
  assert.deepEqual(types, ["learning.session_started", "activity.presented", "learning.session_aborted"]);
  const aborted = store.events().at(-1);
  assert.equal(aborted.abort_reason, "dlc_compile_failed");
});

test("executor: max_iterations hard cap aborts with budget_exhausted on remediation loops", () => {
  const loop = [
    step("s1", "present", { present: { prompt: "x" } }, "s2"),
    step("s2", "branch", {
      branch: {
        cases: [
          { when: { fact: "observation.outcome", operator: "eq", value: { kind: "string", string: "success" } }, target: "s3" },
        ],
        fallback_target: "s1",
      },
    }, "s3"),
    step("s3", "stop", { stop: { outcome: "success" } }),
  ];
  const { executor, store } = makeExecutor(executableIr(loop, { max_iterations: 4 }));
  const final = executor.start();
  assert.equal(final.status, "aborted");
  assert.equal(final.abort_reason, "budget_exhausted");
  assert.equal(store.events().at(-1).event_type, "learning.session_aborted");
});

test("executor: max_duration_ms aborts with timeout when the clock outruns the session", () => {
  const ir = executableIr(linearSteps(), { max_duration_ms: 60_000 });
  const { executor, store } = makeExecutor(ir, {}, META, [
    "2026-08-16T08:00:00Z",
    "2026-08-16T08:00:10Z",
    "2026-08-16T08:01:10Z",
  ]);
  const final = executor.start();
  assert.equal(final.status, "aborted");
  assert.equal(final.abort_reason, "timeout");
  assert.equal(store.events().at(-1).event_type, "learning.session_aborted");
});

test("executor: branch routes remediation on failure and skips it on success", () => {
  const branchSteps = () => [
    step("s1", "present", { present: { prompt: "x" }, claim_refs: [CLAIM] }, "s2"),
    step("s2", "capture_text", { capture: { timeout_ms: 30_000 }, claim_refs: [CLAIM] }, "s3"),
    step("s3", "evaluate", {
      claim_refs: [CLAIM],
      evaluate: { evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" } },
    }, "s4"),
    step("s4", "branch", {
      branch: {
        cases: [
          { when: { fact: "observation.outcome", operator: "eq", value: { kind: "string", string: "success" } }, target: "s6" },
        ],
        fallback_target: "s5",
      },
    }),
    step("s5", "feedback", { claim_refs: [CLAIM], feedback: { template_ref: { uri: "artifact://dlc/t/1", sha256: SHA, media_type: "application/json" } } }, "s6"),
    step("s6", "stop", { stop: { outcome: "success" } }),
  ];

  const failing = { "eval.typed_answer": () => ({ result_kind: "binary", outcome: "failure", measurement_confidence: 0.9 }) };
  const { executor: exFail, store: stFail } = makeExecutor(executableIr(branchSteps()), { evaluators: failing });
  exFail.start();
  assert.equal(exFail.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA }).status, "completed");
  assert.ok(stFail.events().some((e) => e.event_type === "feedback.presented"), "failure path passes remediation feedback");

  const { executor: exOk, store: stOk } = makeExecutor(executableIr(branchSteps()));
  exOk.start();
  assert.equal(exOk.advance({ payload_ref: "artifact://responses/1", payload_sha256: SHA }).status, "completed");
  assert.ok(!stOk.events().some((e) => e.event_type === "feedback.presented"), "success path skips remediation");
});

test("executor: required capability failure with stop_session aborts with provider_unavailable", () => {
  const ir = executableIr([
    step("s1", "invoke_capability", {
      claim_refs: [CLAIM],
      capability: { capability: "grammar.feedback", required: true, on_failure: "stop_session" },
    }, "s2"),
    step("s2", "stop", { stop: { outcome: "success" } }),
  ]);
  const { executor, store } = makeExecutor(ir, { capabilityRunner: () => ({ ok: false }) });
  assert.throws(() => executor.start(), (e) => e instanceof ExecutorError);
  assert.equal(store.events().at(-1).event_type, "learning.session_aborted");
  assert.equal(store.events().at(-1).abort_reason, "provider_unavailable");
});

test("executor: optional capability failure degrades and the session continues", () => {
  const ir = executableIr([
    step("s1", "invoke_capability", {
      claim_refs: [CLAIM],
      capability: { capability: "grammar.feedback", required: false, on_failure: "skip" },
    }, "s2"),
    step("s2", "stop", { stop: { outcome: "success" } }),
  ]);
  const { executor, store } = makeExecutor(ir, { capabilityRunner: () => ({ ok: false }) });
  const final = executor.start();
  assert.equal(final.status, "completed");
  assert.equal(store.events().at(-1).event_type, "learning.session_completed");
});

test("executor: fsrs_memory schedule delegates to the injected scheduler", () => {
  const ir = executableIr([
    step("s1", "schedule", {
      claim_refs: [CLAIM],
      schedule: { scheduler: "fsrs_memory" },
    }, "s2"),
    step("s2", "stop", { stop: { outcome: "success" } }),
  ]);
  const { executor, store } = makeExecutor(ir, {
    fsrsScheduler: (claimRef, now) => ({
      due_at: "2026-08-23T08:00:00.000Z",
      interval: "P7D",
    }),
  });
  const final = executor.start();
  assert.equal(final.status, "completed");
  const review = store.events().find((e) => e.event_type === "review.scheduled");
  assert.equal(review.review.scheduler, "fsrs_memory");
  assert.equal(review.review.interval, "P7D");
});

test("executor: fsrs_memory without a scheduler aborts instead of inventing a date", () => {
  const ir = executableIr([
    step("s1", "schedule", { claim_refs: [CLAIM], schedule: { scheduler: "fsrs_memory" } }, "s2"),
    step("s2", "stop", { stop: { outcome: "success" } }),
  ]);
  const { executor, store } = makeExecutor(ir);
  assert.throws(() => executor.start(), (e) => e instanceof ExecutorError && e.code === "scheduler_unavailable");
  assert.equal(store.events().at(-1).abort_reason, "dlc_compile_failed");
});

test("executor: unregistered evaluator aborts with dlc_compile_failed", () => {
  const ir = executableIr([
    step("s1", "evaluate", {
      claim_refs: [CLAIM],
      evaluate: { evaluator: { id: "eval.ghost", version: "0.1.0", kind: "rule" } },
    }, "s2"),
    step("s2", "stop", { stop: { outcome: "success" } }),
  ]);
  const { executor, store } = makeExecutor(ir);
  assert.throws(() => executor.start(), (e) => e instanceof ExecutorError && e.code === "evaluator_unavailable");
  assert.equal(store.events().at(-1).abort_reason, "dlc_compile_failed");
});

test("executor: non-executable IR is rejected at construction", () => {
  const ir = executableIr(linearSteps());
  ir.ir_kind = "pedagogical";
  assert.throws(
    () => makeExecutor(ir),
    (e) => e instanceof ExecutorError && e.code === "ir_not_executable",
  );
});

test("executor: $complete sentinel finishes the session without a stop primitive", () => {
  const ir = executableIr([step("s1", "present", { present: { prompt: "x" } }, "$complete")]);
  const { executor, store } = makeExecutor(ir);
  const final = executor.start();
  assert.equal(final.status, "completed");
  assert.equal(store.events().at(-1).event_type, "learning.session_completed");
});

test("executor: addInterval parses ISO durations the runtime accepts", () => {
  assert.equal(addInterval("2026-08-16T08:00:00Z", "PT24H"), "2026-08-17T08:00:00.000Z");
  assert.equal(addInterval("2026-08-16T08:00:00Z", "P3DT12H"), "2026-08-19T20:00:00.000Z");
  assert.equal(addInterval("2026-08-16T08:00:00Z", "PT90M"), "2026-08-16T09:30:00.000Z");
});
