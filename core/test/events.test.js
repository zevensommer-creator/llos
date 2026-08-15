const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryEventStore,
  EventAppendError,
  projectLearnerState,
} = require("../dist/index.js");
const { assertValid } = require("@llos/contracts");

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CLAIM = "dlc.de.fsi-construction:claim/vowel_quantity";
const POLICY_REF = "dlc.de.fsi-construction:policy/retention_transfer";
const GATE = {
  ref: POLICY_REF,
  version: "0.1.0",
  minimum_measurement_confidence: 0.8,
};

let counter = 0;

function baseEvent(overrides = {}) {
  counter += 1;
  return {
    schema_version: "0.2.0",
    event_id: `evt.test.${String(counter).padStart(4, "0")}`,
    event_type: "learning.session_started",
    occurred_at: `2026-08-15T10:0${Math.min(counter, 9)}:00Z`,
    learner_ref: "learner.alice",
    session_ref: "session.001",
    mode: "learning",
    composition: {
      core_version: "0.2.0",
      dlc_ref: { id: "dlc.de.fsi-construction", version: "0.2.0", sha256: SHA },
      material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
      learning_ir_ref: { id: "ir.001", version: "0.2.0", sha256: SHA },
    },
    idempotency_key: `idem.test.${counter}`,
    ...overrides,
  };
}

function observationEvent(overrides = {}) {
  return baseEvent({
    event_type: "observation.recorded",
    claim_ref: CLAIM,
    evidence_policy_ref: POLICY_REF,
    task: {
      task_ref: "task.read-aloud-1",
      response_mode: "audio",
      assistance: { hint_count: 0, retry_count: 0, answer_revealed: false },
    },
    observation: {
      observation_id: `obs.${counter}`,
      result_kind: "binary",
      outcome: "success",
      measurement_confidence: 0.9,
      evidence_group_id: `group.${counter}`,
      evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" },
    },
    ...overrides,
  });
}

test("store appends valid events, assigns sequence_no, freezes the record", () => {
  const store = new InMemoryEventStore();
  const stored = store.append(baseEvent());
  assert.equal(stored.sequence_no, 1);
  assert.ok(Object.isFrozen(stored));
  const second = store.append(baseEvent());
  assert.equal(second.sequence_no, 2);
  assert.equal(store.events().length, 2);
});

test("store rejects schema-invalid events with a typed error", () => {
  const store = new InMemoryEventStore();
  const bad = baseEvent({ event_type: "learning.invented_event" });
  assert.throws(() => store.append(bad), (e) => e instanceof EventAppendError && e.code === "schema_invalid");
});

test("chat-mode activity never enters the learning event stream", () => {
  const store = new InMemoryEventStore();
  const chat = baseEvent({ mode: "chat" });
  assert.throws(() => store.append(chat), (e) => e.code === "schema_invalid");
});

test("idempotency_key dedupes retries without duplicating the log", () => {
  const store = new InMemoryEventStore();
  const first = store.append(baseEvent({ idempotency_key: "idem.retry.1" }));
  const retry = store.append(baseEvent({ idempotency_key: "idem.retry.1", observation: undefined }));
  assert.equal(retry, first);
  assert.equal(store.events().length, 1);
});

test("reused event_id with a different idempotency_key is rejected", () => {
  const store = new InMemoryEventStore();
  store.append(baseEvent({ event_id: "evt.same", idempotency_key: "idem.a" }));
  assert.throws(
    () => store.append(baseEvent({ event_id: "evt.same", idempotency_key: "idem.b" })),
    (e) => e instanceof EventAppendError && e.code === "duplicate_event_id",
  );
});

test("reducer projects evidence counts, coverage, independence and diversity", () => {
  const store = new InMemoryEventStore();
  store.append(baseEvent({ session_ref: "session.001", claim_ref: CLAIM }));
  store.append(observationEvent({ observation: { observation_id: "obs.1", result_kind: "binary", outcome: "success", measurement_confidence: 0.9, evidence_group_id: "g.1", evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" } } }));
  store.append(observationEvent({
    session_ref: "session.002",
    task: { task_ref: "task.read-aloud-2", response_mode: "audio", assistance: { hint_count: 1, retry_count: 0, answer_revealed: false } },
    observation: { observation_id: "obs.2", result_kind: "binary", outcome: "failure", measurement_confidence: 0.95, evidence_group_id: "g.2", evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" } },
  }));

  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  assertValid("learner-state-projection", projection);

  assert.equal(projection.claim_ref, CLAIM);
  assert.equal(projection.evidence_state, "supported");
  assert.deepEqual(projection.evidence_counts, {
    valid: 2, supporting: 1, contradicting: 1, abstained: 0, below_confidence_gate: 0,
  });
  assert.equal(projection.session_coverage.distinct_sessions, 2);
  assert.equal(projection.diversity.distinct_tasks, 2);
  assert.equal(projection.diversity.distinct_material_snapshots, 1);
  assert.deepEqual(projection.independence, { unassisted: 1, hinted: 1, retried: 0, answer_revealed: 0 });
});

test("abstentions never count as support or contradiction", () => {
  const store = new InMemoryEventStore();
  store.append(observationEvent({
    observation: {
      observation_id: "obs.1", result_kind: "abstention", abstention_reason: "audio_quality_low",
      evidence_group_id: "g.1", evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" },
    },
  }));
  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  assert.equal(projection.evidence_counts.abstained, 1);
  assert.equal(projection.evidence_counts.supporting, 0);
  assert.equal(projection.evidence_counts.contradicting, 0);
  assert.equal(projection.evidence_state, "insufficient");
});

test("observations below the policy confidence gate are excluded from valid evidence", () => {
  const store = new InMemoryEventStore();
  store.append(observationEvent({
    observation: { observation_id: "obs.1", result_kind: "binary", outcome: "success", measurement_confidence: 0.5, evidence_group_id: "g.1", evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" } },
  }));
  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  assert.equal(projection.evidence_counts.below_confidence_gate, 1);
  assert.equal(projection.evidence_counts.valid, 0);
  assert.equal(projection.evidence_state, "insufficient");
});

test("no observations at all projects no_evidence", () => {
  const store = new InMemoryEventStore();
  store.append(baseEvent({ claim_ref: CLAIM }));
  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  assert.equal(projection.evidence_state, "no_evidence");
});

test("replaying the same stream reproduces the projection field-for-field", () => {
  const store = new InMemoryEventStore();
  store.append(baseEvent({ claim_ref: CLAIM }));
  store.append(observationEvent());
  store.append(observationEvent({
    observation: { observation_id: "obs.2", result_kind: "binary", outcome: "failure", measurement_confidence: 0.85, evidence_group_id: "g.2", evaluator: { id: "speech.gop-german", version: "0.2.0", kind: "rule" } },
  }));
  const first = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  const second = projectLearnerState([...store.events()], "learner.alice", CLAIM, GATE);
  assert.deepEqual(first, second);
  assert.equal(first.reducer.input_hash, second.reducer.input_hash);
});

test("events for a different learner or claim are excluded", () => {
  const store = new InMemoryEventStore();
  store.append(observationEvent({ learner_ref: "learner.bob" }));
  const projection = projectLearnerState(store.events(), "learner.alice", CLAIM, GATE);
  assert.equal(projection.evidence_state, "no_evidence");
});
