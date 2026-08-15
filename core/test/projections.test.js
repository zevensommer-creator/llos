"use strict";

// Risk: projections are rebuildable caches, never facts. Learning curves bucket
// deterministically, weak-spot ranking is explainable and stable, and the
// difficulty hint never invents a tier without decisions to back it.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  projectLearningCurve,
  rankWeakSpots,
  projectAdaptiveDifficulty,
} = require("../dist/index.js");

const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CLAIM_A = "dlc.de.fsi-construction:claim/checkin_dialogue";
const CLAIM_B = "dlc.de.fsi-construction:claim/verb_valence_dative";
const CLAIM_C = "dlc.de.fsi-construction:claim/polite_request_construction";
const POLICY_REF = "dlc.de.fsi-construction:policy/retention_transfer";
const GATE = { ref: POLICY_REF, version: "0.1.0", minimum_measurement_confidence: 0.8 };

const COMPOSITION = {
  core_version: "0.2.0",
  dlc_ref: { id: "dlc.de.fsi-construction", version: "0.2.0", sha256: SHA },
  material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
  learning_ir_ref: { id: "ir.001", version: "0.2.0", sha256: SHA },
};

let seq = 0;

function obs({ at, claim = CLAIM_A, outcome = "success", confidence = 0.9, session = "session.001" }) {
  seq += 1;
  return {
    schema_version: "0.2.0",
    event_id: `evt.proj.${String(seq).padStart(4, "0")}`,
    event_type: "observation.recorded",
    occurred_at: at,
    learner_ref: "learner.alice",
    session_ref: session,
    mode: "learning",
    composition: COMPOSITION,
    idempotency_key: `idem.proj.${seq}`,
    claim_ref: claim,
    evidence_policy_ref: POLICY_REF,
    task: { task_ref: `task.${seq}`, response_mode: "text", assistance: { hint_count: 0, retry_count: 0, answer_revealed: false } },
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

function review({ at, claim, dueAt }) {
  seq += 1;
  return {
    schema_version: "0.2.0",
    event_id: `evt.rev.${String(seq).padStart(4, "0")}`,
    event_type: "review.scheduled",
    occurred_at: at,
    learner_ref: "learner.alice",
    session_ref: "session.001",
    mode: "learning",
    composition: COMPOSITION,
    idempotency_key: `idem.rev.${seq}`,
    claim_ref: claim,
    evidence_policy_ref: POLICY_REF,
    review: { due_at: dueAt, interval: "P1D", scheduler: "fsrs_memory" },
  };
}

test("curve: buckets observations by UTC day with valid-only rates", () => {
  const curve = projectLearningCurve(
    [
      obs({ at: "2026-08-14T08:00:00Z" }),
      obs({ at: "2026-08-14T09:00:00Z", outcome: "failure" }),
      obs({ at: "2026-08-14T10:00:00Z", confidence: 0.3 }),
      obs({ at: "2026-08-15T08:00:00Z" }),
    ],
    "learner.alice",
    CLAIM_A,
    0.8,
  );
  assert.equal(curve.points.length, 2);
  const [d1, d2] = curve.points;
  assert.equal(d1.date, "2026-08-14");
  assert.equal(d1.observations, 3);
  assert.equal(d1.valid, 2);
  assert.equal(d1.success_rate, 0.5);
  assert.equal(d2.date, "2026-08-15");
  assert.equal(d2.success_rate, 1);
});

test("curve: days with only sub-gate observations report null rates, not guesses", () => {
  const curve = projectLearningCurve(
    [obs({ at: "2026-08-14T08:00:00Z", confidence: 0.2 })],
    "learner.alice",
    CLAIM_A,
    0.8,
  );
  assert.equal(curve.points[0].valid, 0);
  assert.equal(curve.points[0].success_rate, null);
  assert.equal(curve.points[0].mean_confidence, null);
});

test("curve: empty history yields no points", () => {
  const curve = projectLearningCurve([], "learner.alice", CLAIM_A, 0.8);
  assert.deepEqual(curve.points, []);
});

test("weak spots: conflicted evidence outranks no evidence, then insufficient", () => {
  const events = [
    obs({ at: "2026-08-14T08:00:00Z", claim: CLAIM_A, outcome: "failure" }),
    obs({ at: "2026-08-14T09:00:00Z", claim: CLAIM_A, outcome: "failure" }),
    obs({ at: "2026-08-14T08:00:00Z", claim: CLAIM_B, confidence: 0.3 }),
    obs({ at: "2026-08-14T08:00:00Z", claim: CLAIM_C }),
  ];
  const ranked = rankWeakSpots(events, "learner.alice", [
    { claim_ref: CLAIM_A, gate: GATE },
    { claim_ref: CLAIM_B, gate: GATE },
    { claim_ref: CLAIM_C, gate: GATE },
  ], "2026-08-16T12:00:00Z");
  assert.equal(ranked[0].claim_ref, CLAIM_A);
  assert.equal(ranked[0].evidence_state, "conflicted");
  assert.ok(ranked[0].reasons.includes("conflicted_evidence"));
  assert.equal(ranked[1].claim_ref, CLAIM_B);
  assert.equal(ranked[1].evidence_state, "insufficient");
});

test("weak spots: overdue reviews boost priority with an explainable reason", () => {
  const events = [
    obs({ at: "2026-08-14T08:00:00Z", claim: CLAIM_A }),
    review({ at: "2026-08-15T08:00:00Z", claim: CLAIM_A, dueAt: "2026-08-15T20:00:00Z" }),
    obs({ at: "2026-08-14T08:00:00Z", claim: CLAIM_B }),
    review({ at: "2026-08-15T08:00:00Z", claim: CLAIM_B, dueAt: "2026-08-30T20:00:00Z" }),
  ];
  const ranked = rankWeakSpots(events, "learner.alice", [
    { claim_ref: CLAIM_A, gate: GATE },
    { claim_ref: CLAIM_B, gate: GATE },
  ], "2026-08-16T12:00:00Z");
  const a = ranked.find((w) => w.claim_ref === CLAIM_A);
  assert.equal(a.overdue_review, true);
  assert.ok(a.reasons.includes("overdue_review"));
  const b = ranked.find((w) => w.claim_ref === CLAIM_B);
  assert.equal(b.overdue_review, false);
  assert.ok(a.priority_score > b.priority_score);
});

test("weak spots: equal scores fall back to a stable claim_ref ordering", () => {
  const ranked = rankWeakSpots([], "learner.alice", [
    { claim_ref: CLAIM_C, gate: GATE },
    { claim_ref: CLAIM_A, gate: GATE },
    { claim_ref: CLAIM_B, gate: GATE },
  ], "2026-08-16T12:00:00Z");
  assert.deepEqual(
    ranked.map((w) => w.claim_ref),
    [CLAIM_A, CLAIM_B, CLAIM_C].sort(),
  );
  assert.deepEqual(ranked.map((w) => w.rank), [1, 2, 3]);
});

test("difficulty: majority learned escalates, majority unstable de-escalates", () => {
  assert.deepEqual(
    projectAdaptiveDifficulty([
      { claim_ref: CLAIM_A, status: "learned" },
      { claim_ref: CLAIM_B, status: "learned" },
      { claim_ref: CLAIM_C, status: "provisional" },
    ]),
    { tier: "harder", reasons: ["majority_learned"] },
  );
  assert.deepEqual(
    projectAdaptiveDifficulty([
      { claim_ref: CLAIM_A, status: "not_yet" },
      { claim_ref: CLAIM_B, status: "lapsed" },
      { claim_ref: CLAIM_C, status: "learned" },
    ]),
    { tier: "easier", reasons: ["majority_unstable"] },
  );
});

test("difficulty: mixed evidence holds; empty decisions hold with a reason", () => {
  assert.deepEqual(
    projectAdaptiveDifficulty([
      { claim_ref: CLAIM_A, status: "learned" },
      { claim_ref: CLAIM_B, status: "not_yet" },
      { claim_ref: CLAIM_C, status: "provisional" },
    ]),
    { tier: "hold", reasons: ["mixed_evidence"] },
  );
  assert.deepEqual(projectAdaptiveDifficulty([]), { tier: "hold", reasons: ["no_decisions"] });
});
