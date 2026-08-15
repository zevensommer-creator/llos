"use strict";

// Risk: ASR text is the completeness evidence. Word-level edit distance must
// be exact and normalization must not destroy German graphemes that matter.

const { test } = require("node:test");
const assert = require("node:assert");
const { matchContent, normalizeGermanText } = require("../dist/index.js");

test("normalization lowercases, strips punctuation and keeps umlauts", () => {
  assert.equal(
    normalizeGermanText("Wir bieten Ihnen diesen Termin an."),
    "wir bieten ihnen diesen termin an",
  );
  assert.equal(normalizeGermanText("Schön! Grüße — (gut)"), "schön grüsse gut");
});

test("exact match is complete", () => {
  const match = matchContent(
    "Wir bieten Ihnen diesen Termin an.",
    "Wir bieten Ihnen diesen Termin an.",
  );
  assert.deepEqual(match, { completeness: 1, insertions: 0, deletions: 0, substitutions: 0 });
});

test("substitution is counted and lowers completeness", () => {
  const match = matchContent(
    "Wir bieten Ihnen diesen Termin an.",
    "Wir bieten Ihnen diesen Auftrag an.",
  );
  assert.equal(match.substitutions, 1);
  assert.equal(match.insertions, 0);
  assert.equal(match.deletions, 0);
  assert.equal(match.completeness, 0.833);
});

test("deleted reference word counts as deletion", () => {
  const match = matchContent(
    "Wir bieten Ihnen diesen Termin an.",
    "Wir bieten Ihnen Termin an.",
  );
  assert.equal(match.deletions, 1);
  assert.equal(match.completeness, 0.833);
});

test("inserted word counts as insertion without lowering completeness", () => {
  const match = matchContent(
    "Wir bieten Ihnen diesen Termin an.",
    "Wir bieten Ihnen diesen Termin jetzt an.",
  );
  assert.equal(match.insertions, 1);
  assert.equal(match.completeness, 1);
});

test("completely different text scores zero", () => {
  const match = matchContent("Wir bieten Ihnen diesen Termin an.", "Eins zwei drei");
  assert.equal(match.completeness, 0);
  assert.equal(match.substitutions, 3);
  assert.equal(match.insertions, 0);
  assert.equal(match.deletions, 3);
});

test("punctuation and case differences do not cost completeness", () => {
  const match = matchContent(
    "Wir bieten Ihnen diesen Termin an.",
    "wir bieten IHNEN diesen termin an!",
  );
  assert.equal(match.completeness, 1);
});
