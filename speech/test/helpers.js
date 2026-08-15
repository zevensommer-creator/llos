"use strict";

const {
  GermanG2p,
  makeFakeAligner,
  makeFakeAnalyzer,
  makeFakeAsr,
  makeFakeVad,
} = require("../dist/index.js");

const REFERENCE_TEXT = "Wir bieten Ihnen diesen Termin an.";
const FIXED_CLOCK = () => "2026-08-16T09:00:00.000Z";

function makeAudio(overrides = {}) {
  return {
    uri: "artifact://audio/session.0001/utt.0001.wav",
    sha256: "a".repeat(64),
    media_type: "audio/wav",
    duration_ms: 2800,
    channel_count: 1,
    sample_rate_hz: 16000,
    ...overrides,
  };
}

function makeInput(overrides = {}) {
  return {
    audio: overrides.audio ?? makeAudio(),
    reference: {
      reference_type: "exact_text",
      text: overrides.reference_text ?? REFERENCE_TEXT,
    },
    language: overrides.language ?? "de-DE",
    mode: overrides.mode ?? "read_aloud",
    session_id: overrides.session_id ?? "session.0001",
    activity_id: overrides.activity_id ?? "activity.read-aloud.0001",
    learner_l1_group: overrides.learner_l1_group ?? "zh-CN",
    device_class: overrides.device_class ?? "consumer-headset",
  };
}

function makeEngine(overrides = {}) {
  return {
    analyzer:
      overrides.analyzer ??
      makeFakeAnalyzer({ snr_db: 24, clipping_ratio: 0 }),
    vad:
      overrides.vad ??
      makeFakeVad({ segments: [{ start_ms: 100, end_ms: 2700 }] }),
    asr:
      overrides.asr ??
      makeFakeAsr({
        hypotheses: [{ text: REFERENCE_TEXT, confidence: 0.94 }],
      }),
    g2p: overrides.g2p ?? new GermanG2p(),
    aligner:
      overrides.aligner ??
      makeFakeAligner({ coverage: 1, mean_confidence: 0.88 }),
  };
}

module.exports = {
  FIXED_CLOCK,
  REFERENCE_TEXT,
  makeAudio,
  makeEngine,
  makeInput,
};
