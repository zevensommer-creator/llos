"use strict";

// Risk: the assessment is the ABI surface to Core. Happy path must be
// schema-valid, deterministic, and must NOT abstain at assessment scope for
// clean audio (false abstention is as harmful as false correction).

const { test } = require("node:test");
const assert = require("node:assert");
const { validate } = require("@llos/contracts");
const { assessPronunciation } = require("../dist/index.js");
const { FIXED_CLOCK, makeEngine, makeInput } = require("./helpers.js");

const OPTIONS = { clock: FIXED_CLOCK, seed: 42 };

test("clean audio produces a partial assessment, never an assessment-level abstention", () => {
  const assessment = assessPronunciation(makeInput(), makeEngine(), OPTIONS);

  assert.equal(assessment.status, "partial");
  assert.equal(assessment.language, "de-DE");
  assert.equal(assessment.mode, "read_aloud");
  assert.equal(assessment.audio_quality.status, "passed");
  assert.equal(assessment.recognition.status, "completed");
  assert.equal(assessment.recognition.content_match.completeness, 1);
  assert.equal(assessment.alignment.status, "completed");
  assert.equal(assessment.alignment.coverage, 1);

  const assessmentScope = assessment.abstentions.filter((a) => a.scope === "assessment");
  assert.equal(assessmentScope.length, 0);
  assert.equal(assessment.issues.length, 0);

  const gop = assessment.dimensions.find((d) => d.id === "phoneme_accuracy");
  assert.equal(gop.status, "abstained");
  assert.ok(gop.abstention_ref);

  const completeness = assessment.dimensions.find((d) => d.id === "completeness");
  assert.equal(completeness.status, "scored");
  assert.equal(completeness.score, 100);
  assert.ok(completeness.evidence_refs.length >= 1);
});

test("words and phones are aligned and honestly uncertain", () => {
  const assessment = assessPronunciation(makeInput(), makeEngine(), OPTIONS);

  assert.equal(assessment.words.length, 6);
  const first = assessment.words[0];
  assert.equal(first.text, "wir");
  assert.ok(first.interval.end_ms > first.interval.start_ms);
  assert.ok(first.phones.length >= 2);
  for (const word of assessment.words) {
    for (const phone of word.phones) {
      assert.equal(phone.status, "uncertain");
      assert.equal(phone.issue_refs, undefined);
    }
    assert.deepEqual(word.issue_refs, []);
  }
});

test("provenance, calibration and component versions are populated", () => {
  const assessment = assessPronunciation(makeInput(), makeEngine(), OPTIONS);

  assert.match(assessment.provenance.input_sha256, /^[a-f0-9]{64}$/);
  assert.equal(assessment.provenance.pipeline_version, "0.1.0");
  assert.equal(assessment.provenance.random_seed, 42);
  assert.equal(assessment.calibration.language_profile_id, "language-profile.de-DE");
  assert.equal(assessment.calibration.domain_status, "in_domain");
  assert.equal(assessment.calibration.learner_l1_group, "zh-CN");
  assert.ok(assessment.component_versions.length >= 5);
  const roles = new Set(assessment.component_versions.map((c) => c.role));
  for (const expected of ["vad", "asr", "g2p", "alignment", "calibration"]) {
    assert.ok(roles.has(expected), `missing component role ${expected}`);
  }
});

test("assessment is schema-valid", () => {
  const assessment = assessPronunciation(makeInput(), makeEngine(), OPTIONS);
  const result = validate("pronunciation-assessment", assessment);
  assert.equal(result.valid, true, result.valid ? "" : result.errors.join("; "));
});

test("deterministic: identical input and seed produce identical output", () => {
  const a = assessPronunciation(makeInput(), makeEngine(), OPTIONS);
  const b = assessPronunciation(makeInput(), makeEngine(), OPTIONS);
  assert.deepEqual(a, b);
});

test("different seed changes the assessment id but not the evidence", () => {
  const a = assessPronunciation(makeInput(), makeEngine(), OPTIONS);
  const b = assessPronunciation(makeInput(), makeEngine(), { clock: FIXED_CLOCK, seed: 7 });
  assert.notEqual(a.assessment_id, b.assessment_id);
  assert.equal(a.evidence.length, b.evidence.length);
  assert.equal(a.words.length, b.words.length);
});

test("shadowing mode is supported for text-dependent reference", () => {
  const assessment = assessPronunciation(
    makeInput({ mode: "shadowing" }),
    makeEngine(),
    OPTIONS,
  );
  assert.equal(assessment.status, "partial");
});
