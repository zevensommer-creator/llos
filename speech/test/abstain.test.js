"use strict";

// Risk: abstention is a correctness feature, not an error path. Every §8.3
// condition must map to a schema-valid abstained/failed assessment with an
// explicit reason code — the pipeline must never guess.

const { test } = require("node:test");
const assert = require("node:assert");
const { validate } = require("@llos/contracts");
const {
  makeFakeAligner,
  makeFakeAnalyzer,
  makeFakeAsr,
  makeFakeVad,
} = require("../dist/index.js");
const { assessPronunciation } = require("../dist/index.js");
const { FIXED_CLOCK, makeAudio, makeEngine, makeInput } = require("./helpers.js");

const OPTIONS = { clock: FIXED_CLOCK, seed: 42 };

function assessWith(engineOverrides, inputOverrides = {}) {
  return assessPronunciation(
    makeInput(inputOverrides),
    makeEngine(engineOverrides),
    OPTIONS,
  );
}

function assertSchemaValid(assessment) {
  const result = validate("pronunciation-assessment", assessment);
  assert.equal(result.valid, true, result.valid ? "" : result.errors.join("; "));
}

test("unsupported language abstains with unsupported_language_feature", () => {
  const assessment = assessWith({}, { language: "sw-KE" });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "unsupported_language_feature");
  assert.equal(assessment.recognition.status, "not_run");
  assert.equal(assessment.alignment.status, "not_applicable");
  assert.equal(assessment.words.length, 0);
  assert.equal(assessment.calibration.domain_status, "unknown");
  assertSchemaValid(assessment);
});

test("open speech mode abstains for German profile v0.1.0", () => {
  const assessment = assessWith({}, { mode: "open_speech" });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "unsupported_language_feature");
  assertSchemaValid(assessment);
});

test("no speech detected abstains with insufficient_speech", () => {
  const assessment = assessWith({
    vad: makeFakeVad({ segments: [] }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "insufficient_speech");
  assertSchemaValid(assessment);
});

test("rejected audio quality abstains with audio_quality and evidence", () => {
  const assessment = assessWith({
    analyzer: makeFakeAnalyzer({ snr_db: 6, clipping_ratio: 0 }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.audio_quality.status, "rejected");
  const abstention = assessment.abstentions[0];
  assert.equal(abstention.reason_code, "audio_quality");
  assert.ok(abstention.evidence_refs.includes("ev.quality.snr"));
  assert.equal(assessment.issues.length, 0);
  assertSchemaValid(assessment);
});

test("ASR text diverging from reference abstains with asr_disagreement", () => {
  const assessment = assessWith({
    asr: makeFakeAsr({ hypotheses: [{ text: "Eins zwei drei vier fünf", confidence: 0.9 }] }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "asr_disagreement");
  assert.equal(assessment.issues.length, 0);
  assertSchemaValid(assessment);
});

test("ASR engine failure returns failed with retryable diagnostics", () => {
  const assessment = assessWith({
    asr: makeFakeAsr({ status: "failed" }),
  });
  assert.equal(assessment.status, "failed");
  assert.ok(assessment.diagnostics.length >= 1);
  assert.equal(assessment.diagnostics[0].retryable, true);
  assert.equal(assessment.recognition.status, "failed");
  assert.equal(assessment.issues.length, 0);
  assertSchemaValid(assessment);
});

test("forced alignment failure abstains with alignment_failed", () => {
  const assessment = assessWith({
    aligner: makeFakeAligner({ status: "failed", failure_code: "MFA_NO_ALIGNMENT" }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "alignment_failed");
  assert.equal(assessment.words.length, 0);
  assertSchemaValid(assessment);
});

test("low alignment coverage abstains with alignment_low_confidence", () => {
  const assessment = assessWith({
    aligner: makeFakeAligner({ coverage: 0.5, mean_confidence: 0.9 }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "alignment_low_confidence");
  assertSchemaValid(assessment);
});

test("low alignment mean confidence abstains with alignment_low_confidence", () => {
  const assessment = assessWith({
    aligner: makeFakeAligner({ coverage: 1, mean_confidence: 0.3 }),
  });
  assert.equal(assessment.status, "abstained");
  assert.equal(assessment.abstentions[0].reason_code, "alignment_low_confidence");
  assertSchemaValid(assessment);
});

test("degraded audio continues instead of abstaining", () => {
  const assessment = assessWith({
    vad: makeFakeVad({
      segments: [{ start_ms: 0, end_ms: 31000 }],
    }),
    analyzer: makeFakeAnalyzer({ snr_db: 24, clipping_ratio: 0 }),
  });
  assert.notEqual(assessment.status, "abstained");
  assert.equal(assessment.audio_quality.status, "degraded");
});

test("every abstained dimension references an abstention id", () => {
  const assessment = assessWith({
    analyzer: makeFakeAnalyzer({ snr_db: 6, clipping_ratio: 0 }),
  });
  const ids = new Set(assessment.abstentions.map((a) => a.abstention_id));
  for (const dimension of assessment.dimensions) {
    assert.equal(dimension.status, "abstained");
    assert.ok(ids.has(dimension.abstention_ref));
  }
});
