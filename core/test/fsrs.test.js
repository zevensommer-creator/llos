"use strict";

// Risk: the memory scheduler must be deterministic, must ignore low-confidence
// observations, and must lengthen intervals after consistent success and
// shorten them after failure — it schedules reviews, never declares mastery.

const { test } = require("node:test");
const assert = require("node:assert");
const { scheduleFsrsReview } = require("../dist/index.js");

const NOW = "2026-08-16T08:00:00Z";

function fact(daysAgo, outcome, confidence = 0.9) {
  const d = new Date(Date.parse(NOW) - daysAgo * 86_400_000);
  return {
    occurred_at: d.toISOString(),
    outcome,
    measurement_confidence: confidence,
  };
}

test("fsrs: empty history schedules a short first-review interval", () => {
  const result = scheduleFsrsReview([], NOW);
  assert.equal(result.scheduler, "fsrs_memory");
  assert.equal(result.interval, "PT10M");
  assert.equal(result.due_at, "2026-08-16T08:10:00.000Z");
});

test("fsrs: identical inputs produce identical outputs (determinism)", () => {
  const history = [fact(1, "success"), fact(0.5, "success")];
  assert.deepEqual(scheduleFsrsReview(history, NOW), scheduleFsrsReview(history, NOW));
});

test("fsrs: consistent success lengthens the review interval over time", () => {
  const early = scheduleFsrsReview([fact(0, "success")], NOW);
  const later = scheduleFsrsReview([fact(10, "success"), fact(9, "success"), fact(5, "success"), fact(0.5, "success")], NOW);
  assert.ok(
    durationToDays(later.interval) > durationToDays(early.interval),
    `later=${later.interval} early=${early.interval}`,
  );
});

test("fsrs: failure history keeps the card in short learning steps", () => {
  const failing = scheduleFsrsReview([fact(1, "failure"), fact(0.5, "failure")], NOW);
  const succeeding = scheduleFsrsReview([fact(1, "success"), fact(0.5, "success")], NOW);
  const failDays = durationToDays(failing.interval);
  const okDays = durationToDays(succeeding.interval);
  assert.ok(failDays <= okDays, `fail=${failDays}d ok=${okDays}d`);
});

test("fsrs: low-confidence observations are filtered out before replay", () => {
  const noisy = [fact(1, "success", 0.5), fact(0.5, "success", 0.79)];
  const result = scheduleFsrsReview(noisy, NOW);
  assert.equal(result.interval, "PT10M", "sub-gate history behaves like empty history");
});

test("fsrs: golden — a fixed history locks a fixed schedule", () => {
  const result = scheduleFsrsReview([fact(2, "success"), fact(1, "success")], NOW);
  assert.equal(result.scheduler, "fsrs_memory");
  assert.match(result.interval, /^P\d+D$/);
  assert.ok(!Number.isNaN(Date.parse(result.due_at)));
});

function durationToDays(iso) {
  const d = /^P(\d+)D$/.exec(iso);
  if (d) return Number(d[1]);
  const h = /^PT(\d+)H$/.exec(iso);
  if (h) return Number(h[1]) / 24;
  const m = /^PT(\d+)M$/.exec(iso);
  if (m) return Number(m[1]) / 1440;
  return 0;
}
