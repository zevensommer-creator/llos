"use strict";

// Risk: mastery decisions are the only place where "learned" may be produced.
// Every path must be deterministic, schema-valid, revocable (supersedes chain),
// and never guess when evidence is insufficient or conflicted.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  decideMastery,
  toMasteryDecisionEvent,
  projectLearnerState,
  InMemoryEventStore,
} = require("../dist/index.js");

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CLAIM = "dlc.de.fsi-construction:claim/checkin_dialogue";
const POLICY_REF = "dlc.de.fsi-construction:policy/retention_transfer";
const GATE = { ref: POLICY_REF, version: "0.1.0", minimum_measurement_confidence: 0.8 };

const POLICY = {
  policy_ref: POLICY_REF,
  version: "0.1.0",
  gates: { minimum_measurement_confidence: 0.8 },
  session_requirements: {
    minimum_distinct_sessions: 2,
    minimum_independent_successes: 2,
    minimum_delayed_successes: 1,
    minimum_delay: "PT24H",
  },
  requires_transfer: false,
  requires_automatization: false,
  conflict_rules: {
    high_confidence_failure_threshold: 0.9,
    high_confidence_failures_before_lapse: 2,
    lapse_requires_distinct_sessions: true,
  },
  abstention_handling: "count_as_insufficient",
};

const COMPOSITION = {
  core_version: "0.2.0",
  dlc_ref: { id: "dlc.de.fsi-construction", version: "0.2.0", sha256: SHA },
  material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
  learning_ir_ref: { id: "ir.001", version: "0.2.0", sha256: SHA },
};

let seq = 0;

function observationEvent({ at, outcome = "success", confidence = 0.9, session = "session.001", assisted = false }) {
  seq += 1;
  return {
    schema_version: "0.2.0",
    event_id: `evt.mastery.${String(seq).padStart(4, "0")}`,
    event_type: "observation.recorded",
    occurred_at: at,
    learner_ref: "learner.alice",
    session_ref: session,
    mode: "learning",
    composition: COMPOSITION,
    idempotency_key: `idem.mastery.${seq}`,
    claim_ref: CLAIM,
    evidence_policy_ref: POLICY_REF,
    task: {
      task_ref: `task.${session}`,
      response_mode: "text",
      assistance: {
        hint_count: assisted ? 1 : 0,
        retry_count: 0,
        answer_revealed: false,
      },
    },
    observation: {
      observation_id: `obs.${seq}`,
      result_kind: "binary",
      outcome,
      measurement_confidence: confidence,
      evidence_group_id: `group.${seq}`,
      evaluator: { id: "eval.typed_answer", version: "0.1.0", kind: "rule" },
    },
  };
}

function storeWith(...events) {
  const store = new InMemoryEventStore();
  for (const e of events) store.append(e);
  return store;
}

function decide(events, overrides = {}) {
  const store = storeWith(...events);
  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  return decideMastery({
    events: store.events(),
    projection,
    policy: { ...POLICY, ...overrides.policy },
    now: overrides.now ?? "2026-08-16T12:00:00Z",
    ...(overrides.priorDecision ? { priorDecision: overrides.priorDecision } : {}),
  });
}

test("mastery: no evidence yields not_yet with a no_evidence reason", () => {
  const decision = decide([]);
  assert.equal(decision.status, "not_yet");
  assert.deepEqual(decision.reason_codes, ["no_evidence"]);
});

test("mastery: contradiction-dominated evidence yields uncertain, never a guess", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T10:00:00Z", outcome: "failure", confidence: 0.95 }),
    observationEvent({ at: "2026-08-14T10:05:00Z", outcome: "failure", confidence: 0.95 }),
    observationEvent({ at: "2026-08-14T10:10:00Z", outcome: "success", confidence: 0.9 }),
  ]);
  assert.equal(decision.status, "uncertain");
  assert.ok(decision.reason_codes.includes("conflict_detected"));
});

test("mastery: learned regresses to lapsed after high-confidence failures across sessions", () => {
  const prior = { decision_id: "decision.prior", status: "learned" };
  const decision = decide(
    [
      observationEvent({ at: "2026-08-10T10:00:00Z", session: "session.a" }),
      observationEvent({ at: "2026-08-11T10:00:00Z", session: "session.b" }),
      observationEvent({ at: "2026-08-12T10:00:00Z", outcome: "failure", confidence: 0.95, session: "session.c" }),
      observationEvent({ at: "2026-08-12T11:00:00Z", outcome: "failure", confidence: 0.95, session: "session.d" }),
    ],
    { priorDecision: prior },
  );
  assert.equal(decision.status, "lapsed");
  assert.equal(decision.supersedes_decision_id, "decision.prior");
  assert.ok(decision.reason_codes.includes("high_confidence_failures"));
});

test("mastery: high-confidence failures without prior achievement stay not_yet, not lapsed", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-12T10:00:00Z", outcome: "failure", confidence: 0.95, session: "session.c" }),
    observationEvent({ at: "2026-08-12T11:00:00Z", outcome: "failure", confidence: 0.95, session: "session.d" }),
  ]);
  assert.equal(decision.status, "not_yet");
  assert.ok(decision.reason_codes.includes("never_achieved"));
});

test("mastery: single-session successes cannot satisfy multi-session requirement", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T10:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-14T10:30:00Z", session: "session.a" }),
  ]);
  assert.equal(decision.status, "not_yet");
  assert.ok(decision.reason_codes.includes("insufficient_distinct_sessions"));
});

test("mastery: assisted successes do not count toward independence", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T10:00:00Z", session: "session.a", assisted: true }),
    observationEvent({ at: "2026-08-14T10:30:00Z", session: "session.b", assisted: true }),
  ]);
  assert.equal(decision.status, "not_yet");
  assert.ok(decision.reason_codes.includes("insufficient_independent_successes"));
});

test("mastery: immediate criteria met but retention window pending yields provisional", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-16T08:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-16T09:00:00Z", session: "session.b" }),
  ]);
  assert.equal(decision.status, "provisional");
  assert.ok(decision.reason_codes.includes("immediate_criteria_met"));
  assert.ok(decision.reason_codes.includes("retention_pending"));
});

test("mastery: delayed success after the retention window yields learned", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T08:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-15T09:00:00Z", session: "session.b" }),
  ]);
  assert.equal(decision.status, "learned");
  assert.ok(decision.reason_codes.includes("retention_satisfied"));
});

test("mastery: retention_not_required shortens the path to learned", () => {
  const decision = decide(
    [
      observationEvent({ at: "2026-08-16T08:00:00Z", session: "session.a" }),
      observationEvent({ at: "2026-08-16T09:00:00Z", session: "session.b" }),
    ],
    { policy: { session_requirements: { ...POLICY.session_requirements, minimum_delayed_successes: 0 } } },
  );
  assert.equal(decision.status, "learned");
  assert.ok(decision.reason_codes.includes("retention_not_required"));
});

test("mastery: identical inputs produce identical decisions (determinism)", () => {
  const events = [
    observationEvent({ at: "2026-08-14T08:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-15T09:00:00Z", session: "session.b" }),
  ];
  assert.deepEqual(decide(events), decide(events));
});

test("mastery: decisions carry evidence refs and bind the policy version", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T08:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-15T09:00:00Z", session: "session.b" }),
  ]);
  assert.equal(decision.evidence_policy_ref, POLICY_REF);
  assert.equal(decision.evidence_policy_version, "0.1.0");
  assert.equal(decision.evidence_refs.length, 2);
  assert.ok(decision.projection_ref.startsWith("projection.learner.alice."));
});

test("mastery: decision event passes schema validation through the event store", () => {
  const decision = decide([
    observationEvent({ at: "2026-08-14T08:00:00Z", session: "session.a" }),
    observationEvent({ at: "2026-08-15T09:00:00Z", session: "session.b" }),
  ]);
  const event = toMasteryDecisionEvent(decision, {
    learner_ref: "learner.alice",
    session_ref: "session.judge",
    composition: COMPOSITION,
  }, 1);
  const store = new InMemoryEventStore();
  const stored = store.append(event);
  assert.equal(stored.event_type, "mastery.decision_made");
  assert.equal(stored.decision.status, "learned");
  assert.equal(stored.claim_ref, CLAIM);
});
