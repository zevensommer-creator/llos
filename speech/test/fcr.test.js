"use strict";

// False correction rate harness (spec §13.2): high-confidence corrections
// must have FCR <= 5%. Corrections = "confirmed" issues only; "suspected"
// is surfaced with uncertainty and never counts as an automatic correction.

const { test } = require("node:test");
const assert = require("node:assert");
const { diagnose, GERMAN_PROFILE, assessPronunciation } = require("../dist/index.js");
const { FIXED_CLOCK, makeFullEngine, makeInput } = require("./helpers.js");

const T = GERMAN_PROFILE.diagnostics;

function runCase(expected, word, phoneIndex, phoneCount, gop, vowel) {
  const phone_id = `phone.fcr.${expected}.${word}`;
  return diagnose(
    {
      phone_id,
      word_id: "word.1",
      word,
      phoneIndex,
      phoneCount,
      phone: { phone_id, expected, start_ms: 100, end_ms: 210, confidence: 0.9 },
      g2pPhone: { symbol: expected },
      gop: gop ? { phone_id, ...gop } : undefined,
      vowel: vowel ? { phone_id, ...vowel } : undefined,
      articulationRate: 12,
      wordConfidence: 0.9,
    },
    T,
  );
}

const CORPUS = [
  {
    name: "true: ü realized as i (dual evidence)",
    label: true,
    run: () =>
      runCase(
        "yː",
        "müde",
        1,
        3,
        { posterior: 0.28, competitors: [{ phone: "iː", posterior: 0.66 }], confidence: 0.9 },
        { duration_ms: 108, f1_hz: 320, f2_hz: 2160, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "true: bieten long i shortened (dual evidence)",
    label: true,
    run: () =>
      runCase(
        "iː",
        "bieten",
        1,
        5,
        { posterior: 0.3, competitors: [{ phone: "ɪ", posterior: 0.65 }], confidence: 0.9 },
        { duration_ms: 60, f1_hz: 300, f2_hz: 2200, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "true: Staat long a shortened (dual evidence)",
    label: true,
    run: () =>
      runCase(
        "aː",
        "staat",
        1,
        4,
        { posterior: 0.3, competitors: [{ phone: "a", posterior: 0.66 }], confidence: 0.9 },
        { duration_ms: 55, f1_hz: 700, f2_hz: 1200, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "true: ö realized as e (dual evidence)",
    label: true,
    run: () =>
      runCase(
        "øː",
        "schön",
        1,
        3,
        { posterior: 0.28, competitors: [{ phone: "eː", posterior: 0.67 }], confidence: 0.9 },
        { duration_ms: 105, f1_hz: 330, f2_hz: 2170, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "true: nicht as isch (single evidence)",
    label: true,
    run: () =>
      runCase(
        "ç",
        "nicht",
        2,
        4,
        { posterior: 0.25, competitors: [{ phone: "ʃ", posterior: 0.72 }], confidence: 0.9 },
        undefined,
      ),
  },
  {
    name: "false: China word-initial ch variant",
    label: false,
    run: () =>
      runCase(
        "ç",
        "china",
        0,
        4,
        { posterior: 0.3, competitors: [{ phone: "x", posterior: 0.7 }], confidence: 0.9 },
        undefined,
      ),
  },
  {
    name: "false: borderline ü with ambiguous formant and weak margin",
    label: false,
    run: () =>
      runCase(
        "yː",
        "müde",
        1,
        3,
        { posterior: 0.55, competitors: [{ phone: "iː", posterior: 0.56 }], confidence: 0.9 },
        { duration_ms: 108, f1_hz: 320, f2_hz: 2020, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "false: clean long vowel",
    label: false,
    run: () =>
      runCase(
        "iː",
        "bieten",
        1,
        5,
        { posterior: 0.95, competitors: [], confidence: 0.93 },
        { duration_ms: 112, f1_hz: 300, f2_hz: 2200, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "false: clean consonant",
    label: false,
    run: () =>
      runCase(
        "t",
        "termin",
        0,
        6,
        { posterior: 0.96, competitors: [], confidence: 0.93 },
        undefined,
      ),
  },
  {
    name: "false: slow speaker lengthens a short vowel, GOP clean",
    label: false,
    run: () =>
      runCase(
        "ɪ",
        "bitten",
        1,
        5,
        { posterior: 0.94, competitors: [], confidence: 0.93 },
        { duration_ms: 128, f1_hz: 400, f2_hz: 2000, f0_hz: 128, intensity_db: 66 },
      ),
  },
  {
    name: "false: acceptable r vocalization",
    label: false,
    run: () =>
      runCase(
        "ʁ",
        "wir",
        1,
        3,
        { posterior: 0.35, competitors: [{ phone: "ɐ", posterior: 0.6 }], confidence: 0.9 },
        undefined,
      ),
  },
  {
    name: "false: final devoicing with sub-threshold competitor",
    label: false,
    run: () =>
      runCase(
        "k",
        "tag",
        2,
        3,
        { posterior: 0.3, competitors: [{ phone: "g", posterior: 0.58 }], confidence: 0.9 },
        undefined,
      ),
  },
];

test("false correction rate on the labeled corpus is <= 5%", () => {
  const results = CORPUS.map((entry) => ({ ...entry, result: entry.run() }));

  const confirmed = results.filter((r) => r.result.status === "issue" && r.result.issue.status === "confirmed");
  const falseConfirmed = confirmed.filter((r) => !r.label);

  const fcr = confirmed.length > 0 ? falseConfirmed.length / confirmed.length : 0;
  assert.ok(
    fcr <= 0.05,
    `FCR ${fcr} exceeds the 5% gate (${falseConfirmed.length}/${confirmed.length}): ${falseConfirmed.map((r) => r.name).join("; ")}`,
  );
});

test("recall floor: at least four true issues are confirmed (no abstain-everything cop-out)", () => {
  const results = CORPUS.map((entry) => ({ ...entry, result: entry.run() }));
  const trueConfirmed = results.filter(
    (r) => r.label && r.result.status === "issue" && r.result.issue.status === "confirmed",
  );
  assert.ok(
    trueConfirmed.length >= 4,
    `only ${trueConfirmed.length} true issues confirmed`,
  );
});

test("invariant: every confirmed issue has two channels and confidence >= gate", () => {
  for (const entry of CORPUS) {
    const result = entry.run();
    if (result.status === "issue" && result.issue.status === "confirmed") {
      assert.ok(
        result.issue.channels.length >= 2,
        `${entry.name}: confirmed with single channel`,
      );
      assert.ok(
        result.issue.confidence >= T.issue_confirm_confidence,
        `${entry.name}: confirmed below confidence gate`,
      );
    }
  }
});

test("E2E: clean audio through the full engine produces zero corrections", () => {
  const assessment = assessPronunciation(
    makeInput(),
    makeFullEngine(),
    { clock: FIXED_CLOCK, seed: 42 },
  );
  const corrections = assessment.issues.filter((issue) => issue.status === "confirmed");
  assert.equal(corrections.length, 0);
});
