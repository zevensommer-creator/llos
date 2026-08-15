"use strict";

// Acceptable variant layer (spec §10.3): variants that standard German admits
// must never become corrections, regardless of scorer output.

const { test } = require("node:test");
const assert = require("node:assert");
const {
  classifyVariant,
  isFinalDevoicingContext,
  phonePositionInWord,
  referenceVowelDurationMs,
} = require("../dist/index.js");

test("r realizations are acceptable across all standard variants", () => {
  for (const [expected, observed] of [
    ["ʁ", "ɐ"],
    ["ʁ", "r"],
    ["ɐ", "ʁ"],
    ["r", "ʁ"],
  ]) {
    const verdict = classifyVariant({
      word: "wir",
      expected,
      observed,
      position: "word_internal",
    });
    assert.equal(verdict.acceptable, true, `${expected} -> ${observed}`);
  }
});

test("word-initial ch before back vowel is an acceptable variant (China)", () => {
  const verdict = classifyVariant({
    word: "china",
    expected: "ç",
    observed: "x",
    position: "word_initial",
  });
  assert.equal(verdict.acceptable, true);
  assert.equal(verdict.note, "word_initial_ch_variant");
});

test("word-internal ich-laut replacement is NOT an acceptable variant", () => {
  const verdict = classifyVariant({
    word: "nicht",
    expected: "ç",
    observed: "x",
    position: "word_internal",
  });
  assert.equal(verdict.acceptable, false);
});

test("final -ig may surface as [k] in southern standard", () => {
  const verdict = classifyVariant({
    word: "zwanzig",
    expected: "ç",
    observed: "k",
    position: "word_final",
  });
  assert.equal(verdict.acceptable, true);
  assert.equal(verdict.note, "final_ig_variant");

  const sh = classifyVariant({
    word: "zwanzig",
    expected: "ç",
    observed: "ʃ",
    position: "word_final",
  });
  assert.equal(sh.acceptable, false, "final -ig as [ʃ] is never acceptable");
});

test("final -er schwa and [ɐ] are interchangeable", () => {
  for (const [expected, observed] of [
    ["ɐ", "ə"],
    ["ə", "ɐ"],
  ]) {
    const verdict = classifyVariant({
      word: "zimmer",
      expected,
      observed,
      position: "word_final",
    });
    assert.equal(verdict.acceptable, true, `${expected} -> ${observed}`);
  }
});

test("identical or missing observation is trivially acceptable", () => {
  assert.equal(
    classifyVariant({ word: "tag", expected: "k", position: "word_final" }).acceptable,
    true,
  );
  assert.equal(
    classifyVariant({
      word: "tag",
      expected: "k",
      observed: "k",
      position: "word_final",
    }).acceptable,
    true,
  );
});

test("final devoicing context is detected from the written form", () => {
  assert.equal(isFinalDevoicingContext("tag", "k", "word_final"), true);
  assert.equal(isFinalDevoicingContext("mund", "t", "word_final"), true);
  assert.equal(isFinalDevoicingContext("dieb", "p", "word_final"), true);
  assert.equal(isFinalDevoicingContext("tag", "k", "word_internal"), false);
  assert.equal(isFinalDevoicingContext("tas", "s", "word_final"), false);
  assert.equal(isFinalDevoicingContext("tisch", "ʃ", "word_final"), false);
});

test("phone position maps to initial/internal/final", () => {
  assert.equal(phonePositionInWord(0, 3), "word_initial");
  assert.equal(phonePositionInWord(1, 3), "word_internal");
  assert.equal(phonePositionInWord(2, 3), "word_final");
  assert.equal(phonePositionInWord(0, 1), "word_initial");
});

test("reference vowel duration scales with articulation rate", () => {
  const atReference = referenceVowelDurationMs("long", 12);
  assert.equal(atReference, 110);
  const faster = referenceVowelDurationMs("long", 18);
  assert.ok(faster < atReference, "faster speaker shortens reference duration");
  const shortBaseline = referenceVowelDurationMs("short", 12);
  assert.equal(shortBaseline, 65);
});
