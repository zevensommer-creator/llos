"use strict";

// PronunciationAssessment -> LearningObservation -> observation.recorded
// events. The bridge is the only sanctioned path from speech evidence into
// the learning event stream: deterministic, schema-validated, claim-bound by
// the DLC, and never inventing facts from issues (spec §7, §8.3, §10).

const { test } = require("node:test");
const assert = require("node:assert");
const {
  toPronunciationObservations,
  toObservationRecordedEvents,
  mapAbstentionReason,
  InMemoryEventStore,
  projectLearnerState,
} = require("../dist/index.js");
const { assertValid } = require("@llos/contracts");

const SHA = "a".repeat(64);
const CLAIM_VQ = "dlc.de.fsi-construction:claim/vowel-quantity";
const CLAIM_PA = "dlc.de.fsi-construction:claim/phoneme-accuracy";
const POLICY_REF = "dlc.de.fsi-construction:policy/retention_transfer";

// Minimal assessment view: the bridge reads dimensions, abstentions,
// audio_ref and provenance only. Production assessments come from
// @llos/speech; the fixture keeps this package independent of it.
function assessmentFixture(overrides = {}) {
  return {
    schema_version: "0.2.0",
    assessment_id: "assessment.0001",
    session_id: "session.0001",
    activity_id: "activity.read-aloud.0001",
    created_at: "2026-08-16T09:00:00.000Z",
    language: "de-DE",
    mode: "read_aloud",
    status: "partial",
    audio_ref: {
      uri: "artifact://audio/session.0001/utt.0001.wav",
      sha256: SHA,
      media_type: "audio/wav",
    },
    dimensions: [
      {
        id: "phoneme_accuracy",
        status: "scored",
        score: 78,
        confidence: 0.86,
        evidence_refs: ["ev.gop.phone.1.1"],
      },
      {
        id: "vowel_quantity",
        status: "abstained",
        confidence: 0,
        evidence_refs: [],
        abstention_ref: "abs.vq.provider-failure",
      },
      {
        id: "word_stress",
        status: "abstained",
        confidence: 0,
        evidence_refs: [],
        abstention_ref: "abs.word-stress.stage0",
      },
      {
        id: "completeness",
        status: "scored",
        score: 100,
        confidence: 0.94,
        evidence_refs: ["ev.asr.confidence"],
      },
    ],
    abstentions: [
      {
        abstention_id: "abs.vq.provider-failure",
        scope: "dimension",
        target_ref: "vowel_quantity",
        reason_code: "provider_failure",
        message: "GOP scorer failed.",
      },
      {
        abstention_id: "abs.word-stress.stage0",
        scope: "dimension",
        target_ref: "word_stress",
        reason_code: "evidence_conflict",
        message: "Stage 0 has no stress model.",
      },
    ],
    provenance: { pipeline_version: "0.1.0", random_seed: 42 },
    ...overrides,
  };
}

function bridgeCtx(overrides = {}) {
  return {
    learner_ref: "learner.alice",
    session_ref: "session.0001",
    activity_ref: "activity.read-aloud.0001",
    observed_at: "2026-08-16T09:00:05.000Z",
    evidence_group_id: "group.utt.0001",
    claim_bindings: {
      phoneme_accuracy: CLAIM_PA,
      vowel_quantity: CLAIM_VQ,
    },
    material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
    assistance: {
      hint_count: 0,
      retry_count: 0,
      answer_revealed: false,
      assistance_level: "none",
    },
    ...overrides,
  };
}

function eventCtx(overrides = {}) {
  return {
    occurred_at: "2026-08-16T09:00:06.000Z",
    mode: "learning",
    composition: {
      core_version: "0.2.0",
      dlc_ref: { id: "dlc.de.fsi-construction", version: "0.2.0", sha256: SHA },
      material_snapshot_ref: { id: "snap.001", version: "1.0.0", sha256: SHA },
      learning_ir_ref: { id: "ir.001", version: "0.2.0", sha256: SHA },
    },
    evidence_policy_ref: POLICY_REF,
    task: {
      task_ref: "task.read-aloud-1",
      response_mode: "audio",
      assistance: { hint_count: 0, retry_count: 0, answer_revealed: false },
    },
    ...overrides,
  };
}

test("scored dimensions become scalar observations with performance and measurement confidence separated", () => {
  const observations = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const scalar = observations.find((o) => o.observation_id.includes("phoneme_accuracy"));

  assert.equal(scalar.result_kind, "scalar");
  assert.equal(scalar.value, 78);
  assert.equal(scalar.measurement_confidence, 0.86);
  assert.equal(scalar.claim_ref, CLAIM_PA);
  assert.equal(scalar.metric_ref, "speech:metric/phoneme_accuracy");
  assert.equal(scalar.evidence_group_id, "group.utt.0001");
  assert.equal(scalar.response_ref.uri, "artifact://audio/session.0001/utt.0001.wav");
  assert.equal(scalar.evaluator.id, "speech.pipeline.pronunciation");
  assert.equal(scalar.evaluator.version, "0.1.0");
  assert.ok(scalar.evidence_artifact_ref.sha256);
  assertValid("learning-observation", scalar);
});

test("abstained dimensions become explicit abstentions with mapped reasons", () => {
  const observations = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const abstained = observations.find((o) => o.observation_id.includes("vowel_quantity"));

  assert.equal(abstained.result_kind, "abstention");
  assert.equal(abstained.abstention_reason, "insufficient_evidence");
  assert.equal(abstained.claim_ref, CLAIM_VQ);
  assert.equal(abstained.measurement_confidence, undefined);
  assertValid("learning-observation", abstained);
});

test("dimensions without a claim binding are skipped; the DLC owns claims", () => {
  const observations = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const ids = observations.map((o) => o.observation_id);
  assert.equal(observations.length, 2);
  assert.ok(!ids.some((id) => id.includes("word_stress")));
  assert.ok(!ids.some((id) => id.includes("completeness")));
});

test("every abstention reason code maps into the closed contract enum", () => {
  const cases = {
    audio_quality: "audio_quality_low",
    insufficient_speech: "audio_quality_low",
    asr_disagreement: "reference_mismatch_too_large",
    alignment_failed: "alignment_failed",
    alignment_low_confidence: "alignment_failed",
    acceptable_variant_ambiguous: "evaluator_uncertain",
    out_of_calibration_domain: "uncalibrated_domain",
    unsupported_language_feature: "uncalibrated_domain",
    evidence_conflict: "scorer_conflict",
    provider_failure: "insufficient_evidence",
    invented_future_code: "insufficient_evidence",
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(mapAbstentionReason(input), expected, input);
  }
});

test("observations wrap into schema-valid observation.recorded events and replay is idempotent", () => {
  const observations = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const events = toObservationRecordedEvents(observations, eventCtx());

  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.event_type, "observation.recorded");
    assert.equal(event.mode, "learning");
    assert.ok(event.claim_ref);
    // Learner/session context lives on the event, never inline in the payload.
    assert.equal(event.observation.learner_ref, undefined);
    assert.equal(event.observation.claim_ref, undefined);
  }

  const store = new InMemoryEventStore();
  store.append(events[0]);
  store.append(events[1]);
  assert.equal(store.events().length, 2);
  // Replaying the same observation dedupes via idempotency key.
  store.append(events[0]);
  assert.equal(store.events().length, 2);
});

test("bridged events flow through the reducer without hand-written payloads", () => {
  const observations = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const events = toObservationRecordedEvents(observations, eventCtx());
  const store = new InMemoryEventStore();
  for (const event of events) store.append(event);

  const projection = projectLearnerState(
    store.events(),
    "learner.alice",
    CLAIM_PA,
    { ref: POLICY_REF, version: "0.1.0", minimum_measurement_confidence: 0.8 },
  );
  assert.equal(projection.evidence_counts.valid, 1);
  assert.equal(projection.evidence_counts.abstained, 0);

  const abstainedProjection = projectLearnerState(
    store.events(),
    "learner.alice",
    CLAIM_VQ,
    { ref: POLICY_REF, version: "0.1.0", minimum_measurement_confidence: 0.8 },
  );
  assert.equal(abstainedProjection.evidence_counts.valid, 0);
  assert.equal(abstainedProjection.evidence_counts.abstained, 1);
  assert.equal(abstainedProjection.evidence_state, "insufficient");
});

test("the bridge is deterministic for identical input", () => {
  const a = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  const b = toPronunciationObservations(assessmentFixture(), bridgeCtx());
  assert.deepEqual(a, b);
  assert.deepEqual(
    toObservationRecordedEvents(a, eventCtx()),
    toObservationRecordedEvents(b, eventCtx()),
  );
});
