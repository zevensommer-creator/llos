"use strict";

// Risk: G2P output defines the expected phones that alignment scores against.
// Lexicon words must carry stress and vowel length; rule fallback must be
// marked uncertain — it never silently poses as ground truth.

const { test } = require("node:test");
const assert = require("node:assert");
const { GermanG2p } = require("../dist/index.js");

const g2p = new GermanG2p();

function word(text) {
  return g2p.toPronunciation(text).words[0];
}

test("lexicon word resolves with phones and stress", () => {
  const bieten = word("bieten");
  assert.equal(bieten.from_lexicon, true);
  assert.equal(bieten.uncertain, undefined);
  assert.deepEqual(bieten.phones.map((p) => p.symbol), ["b", "iː", "t", "ə", "n"]);
  assert.equal(bieten.stress_syllable, 1);
});

test("lexicon marks vowel quantity for later diagnosis", () => {
  const bieten = word("bieten");
  const long = bieten.phones.find((p) => p.symbol === "iː");
  assert.equal(long.length_class, "long");
  const bitte = word("bitte");
  const short = bitte.phones.find((p) => p.symbol === "ɪ");
  assert.equal(short.length_class, "short");
});

test("lexicon stress is per entry, not positional guess", () => {
  assert.equal(word("termin").stress_syllable, 2);
  assert.equal(word("hotel").stress_syllable, 2);
  assert.equal(word("reservierung").stress_syllable, 3);
});

test("front rounded vowels carry long class from lexicon", () => {
  const schön = word("schön");
  const øː = schön.phones.find((p) => p.symbol === "øː");
  assert.equal(øː.length_class, "long");
});

test("rule fallback applies ich-laut after front vowels", () => {
  const möchte = word("möchte");
  assert.equal(möchte.from_lexicon, false);
  assert.equal(möchte.uncertain, true);
  assert.deepEqual(möchte.phones.map((p) => p.symbol), ["m", "øː", "ç", "t", "ə"]);
});

test("rule fallback applies ach-laut after back vowels", () => {
  const kuchen = word("kuchen");
  const symbols = kuchen.phones.map((p) => p.symbol);
  assert.deepEqual(symbols, ["k", "ʊ", "x", "ə", "n"]);
});

test("rule fallback applies final devoicing", () => {
  const rad = word("rad");
  const symbols = rad.phones.map((p) => p.symbol);
  assert.deepEqual(symbols, ["ʁ", "aː", "t"]);
});

test("rule fallback shortens vowels before consonant clusters", () => {
  const nacht = word("nacht");
  const symbols = nacht.phones.map((p) => p.symbol);
  assert.deepEqual(symbols, ["n", "a", "x", "t"]);
});

test("rule fallback marks uncertain and never sets stress", () => {
  const unknown = word("xylophonstadt");
  assert.equal(unknown.uncertain, true);
  assert.equal(unknown.stress_syllable, undefined);
});

test("graph artifact is stable for identical input", () => {
  const a = g2p.toPronunciation("wir bieten");
  const b = g2p.toPronunciation("wir bieten");
  assert.deepEqual(a, b);
  assert.equal(a.graph_ref.sha256, b.graph_ref.sha256);
});
