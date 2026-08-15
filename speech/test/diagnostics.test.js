"use strict";

// Four German specialists (spec §10.1) plus generic substitution, tested at
// the per-phone diagnoser level. Invariant under test: a confirmed issue
// always carries two independent evidence channels; a single channel only
// yields "suspected"; conflicting channels yield an abstention.

const { test } = require("node:test");
const assert = require("node:assert");
const { diagnose, GERMAN_PROFILE } = require("../dist/index.js");

const T = GERMAN_PROFILE.diagnostics;

function phoneCase(overrides = {}) {
  return diagnose(
    {
      phone_id: overrides.phone_id ?? "phone.1.1",
      word_id: "word.1",
      word: overrides.word ?? "bieten",
      phoneIndex: overrides.phoneIndex ?? 1,
      phoneCount: overrides.phoneCount ?? 5,
      phone: {
        phone_id: overrides.phone_id ?? "phone.1.1",
        expected: overrides.expected ?? "iː",
        start_ms: 100,
        end_ms: 210,
        confidence: 0.9,
      },
      g2pPhone: { symbol: overrides.expected ?? "iː" },
      gop: overrides.gop,
      vowel: overrides.vowel,
      articulationRate: 12,
      wordConfidence: overrides.wordConfidence ?? 0.9,
    },
    T,
  );
}

const gop = (posterior, competitors, confidence = 0.9) => ({
  phone_id: "phone.1.1",
  posterior,
  competitors: competitors ?? [],
  confidence,
});

const vowel = (duration_ms, f2_hz = 1850) => ({
  phone_id: "phone.1.1",
  duration_ms,
  f1_hz: 320,
  f2_hz,
  f0_hz: 128,
  intensity_db: 66,
});

test("vowel quantity: shortened long vowel confirmed with dual evidence", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.3, [{ phone: "ɪ", posterior: 0.65 }]),
    vowel: vowel(60),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "confirmed");
  assert.equal(result.issue.category, "vowel_quantity");
  assert.equal(result.issue.feedback_key, "de.vowel_quantity.lengthen_and_hold_quality");
  assert.equal(result.issue.pedagogical_priority, 80);
  assert.deepEqual(result.issue.channels.sort(), ["duration", "gop"]);
  assert.ok(result.issue.confidence >= T.issue_confirm_confidence);
});

test("vowel quantity: duration evidence alone is only suspected", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.93),
    vowel: vowel(58),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "suspected");
  assert.deepEqual(result.issue.channels, ["duration"]);
});

test("vowel quantity: GOP and duration in conflict abstain", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.3, [{ phone: "ɪ", posterior: 0.65 }]),
    vowel: vowel(112),
  });
  assert.equal(result.status, "uncertain");
  assert.equal(result.abstention.reason_code, "evidence_conflict");
});

test("vowel quantity: correct long vowel is acceptable", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.95),
    vowel: vowel(115),
  });
  assert.equal(result.status, "acceptable");
});

test("front rounded vowel: ü realized as unrounded i confirmed with formant + GOP", () => {
  const result = phoneCase({
    word: "müde",
    expected: "yː",
    gop: gop(0.28, [{ phone: "iː", posterior: 0.66 }]),
    vowel: vowel(108, 2160),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "confirmed");
  assert.equal(result.issue.category, "front_rounded_vowel");
  assert.equal(result.issue.feedback_key, "de.front_rounded_vowel.round_and_protrude");
  assert.deepEqual(result.issue.channels.sort(), ["formant", "gop"]);
});

test("front rounded vowel: missing formants leave only suspected", () => {
  const result = phoneCase({
    word: "müde",
    expected: "yː",
    gop: gop(0.28, [{ phone: "iː", posterior: 0.66 }]),
    vowel: { ...vowel(108, null) },
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "suspected");
});

test("front rounded vowel: ambiguous F2 with weak GOP must not confirm", () => {
  const result = phoneCase({
    word: "müde",
    expected: "yː",
    gop: gop(0.55, [{ phone: "iː", posterior: 0.56 }]),
    vowel: vowel(108, 2020),
  });
  if (result.status === "issue") {
    assert.notEqual(result.issue.status, "confirmed");
  } else {
    assert.equal(result.status, "acceptable");
  }
});

test("ich-laut: nicht pronounced isch is a suspected substitution", () => {
  const result = phoneCase({
    word: "nicht",
    expected: "ç",
    phoneIndex: 2,
    phoneCount: 4,
    gop: gop(0.25, [{ phone: "ʃ", posterior: 0.72 }]),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "suspected");
  assert.equal(result.issue.category, "ich_ach_laut");
  assert.equal(result.issue.feedback_key, "de.ich_ach_laut.no_sh");
});

test("ich-laut: China variant is acceptable via the variant layer", () => {
  const result = phoneCase({
    word: "china",
    expected: "ç",
    phoneIndex: 0,
    phoneCount: 4,
    gop: gop(0.3, [{ phone: "x", posterior: 0.7 }]),
  });
  assert.equal(result.status, "acceptable");
  assert.equal(result.variant_note, "word_initial_ch_variant");
});

test("final devoicing: voiced final stop is a suspected issue", () => {
  const result = phoneCase({
    word: "tag",
    expected: "k",
    phoneIndex: 2,
    phoneCount: 3,
    gop: gop(0.25, [{ phone: "g", posterior: 0.71 }]),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "suspected");
  assert.equal(result.issue.category, "final_devoicing");
  assert.equal(result.issue.feedback_key, "de.final_devoicing.unvoice_final_stop");
});

test("generic substitution outside the specialist sets stays suspected", () => {
  const result = phoneCase({
    word: "das",
    expected: "s",
    phoneIndex: 2,
    phoneCount: 3,
    gop: gop(0.2, [{ phone: "z", posterior: 0.75 }]),
  });
  assert.equal(result.status, "issue");
  assert.equal(result.issue.status, "suspected");
  assert.equal(result.issue.category, "phoneme_substitution");
});

test("low GOP scorer confidence abstains instead of guessing", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.3, [{ phone: "ɪ", posterior: 0.65 }], 0.5),
    vowel: vowel(60),
  });
  assert.equal(result.status, "uncertain");
  assert.equal(result.abstention.reason_code, "evidence_conflict");
});

test("low word alignment confidence abstains on the whole phone", () => {
  const result = phoneCase({
    expected: "iː",
    gop: gop(0.3, [{ phone: "ɪ", posterior: 0.65 }]),
    vowel: vowel(60),
    wordConfidence: 0.6,
  });
  assert.equal(result.status, "uncertain");
  assert.equal(result.abstention.reason_code, "alignment_low_confidence");
});

test("diagnose is deterministic", () => {
  const overrides = {
    word: "müde",
    expected: "yː",
    gop: gop(0.28, [{ phone: "iː", posterior: 0.66 }]),
    vowel: vowel(108, 2160),
  };
  assert.deepEqual(phoneCase(overrides), phoneCase(overrides));
});
