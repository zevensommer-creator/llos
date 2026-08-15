"use strict";

// Risk: the quality gate is the pipeline's first abstention source.
// Every threshold must map to an explicit flag and verdict — no silent passes.

const { test } = require("node:test");
const assert = require("node:assert");
const { evaluateAudioQuality } = require("../dist/index.js");
const { GERMAN_PROFILE } = require("../dist/index.js");
const { makeAudio } = require("./helpers.js");

const thresholds = GERMAN_PROFILE.thresholds;

function gate({ audio, measurements, vad }) {
  return evaluateAudioQuality(
    audio ?? makeAudio(),
    measurements ?? { snr_db: 24, clipping_ratio: 0, extra_quality_flags: [] },
    vad ?? { segments: [{ start_ms: 0, end_ms: 2600 }], speech_duration_ms: 2600, silence_ratio: 0.07, uncertain: false },
    thresholds,
  );
}

test("clean audio passes with no flags", () => {
  const result = gate({});
  assert.equal(result.verdict, "passed");
  assert.equal(result.quality.status, "passed");
  assert.equal(result.quality.quality_flags, undefined);
  assert.equal(result.has_speech, true);
});

test("low SNR rejects with low_snr flag", () => {
  const result = gate({ measurements: { snr_db: 8, clipping_ratio: 0, extra_quality_flags: [] } });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("low_snr"));
});

test("clipping rejects with clipping flag", () => {
  const result = gate({ measurements: { snr_db: 24, clipping_ratio: 0.2, extra_quality_flags: [] } });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("clipping"));
});

test("missing speech rejects with too_short and reports no speech", () => {
  const result = gate({
    vad: { segments: [], speech_duration_ms: 0, silence_ratio: 1, uncertain: false },
  });
  assert.equal(result.verdict, "rejected");
  assert.equal(result.has_speech, false);
  assert.ok(result.quality.quality_flags.includes("too_short"));
});

test("excessive silence rejects via vad_uncertain", () => {
  const result = gate({
    vad: { segments: [{ start_ms: 0, end_ms: 1200 }], speech_duration_ms: 1200, silence_ratio: 0.85, uncertain: false },
  });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("vad_uncertain"));
});

test("overlong speech degrades but is not rejected", () => {
  const result = gate({
    vad: {
      segments: [{ start_ms: 0, end_ms: 40000 }],
      speech_duration_ms: 40000,
      silence_ratio: 0,
      uncertain: false,
    },
  });
  assert.equal(result.verdict, "degraded");
  assert.ok(result.quality.quality_flags.includes("too_long"));
});

test("stereo recording rejects with unsupported_format", () => {
  const result = gate({ audio: makeAudio({ channel_count: 2 }) });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("unsupported_format"));
});

test("low sample rate rejects with unsupported_format", () => {
  const result = gate({ audio: makeAudio({ sample_rate_hz: 8000 }) });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("unsupported_format"));
});

test("external detector flags propagate to rejection", () => {
  const result = gate({
    measurements: { snr_db: 24, clipping_ratio: 0, extra_quality_flags: ["multiple_speakers"] },
  });
  assert.equal(result.verdict, "rejected");
  assert.ok(result.quality.quality_flags.includes("multiple_speakers"));
});

test("null SNR does not trigger low_snr", () => {
  const result = gate({
    measurements: { snr_db: null, clipping_ratio: 0, extra_quality_flags: [] },
  });
  assert.equal(result.verdict, "passed");
});
