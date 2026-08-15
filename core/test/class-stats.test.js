const { test } = require("node:test");
const assert = require("node:assert");
const { projectClassStats } = require("../dist/index.js");

function event(type, learner, dlcId, at, sessionRef, extra = {}) {
  return {
    event_type: type,
    learner_ref: learner,
    session_ref: sessionRef,
    occurred_at: at,
    mode: "learning",
    composition: { dlc_ref: { id: dlcId } },
    ...extra,
  };
}

function observation(learner, dlcId, claimRef, outcome, at) {
  return event("observation.recorded", learner, dlcId, at, `s.${learner}.${claimRef}`, {
    claim_ref: claimRef,
    evidence_policy_ref: "policy/x",
    observation: {
      result_kind: "binary",
      outcome,
      measurement_confidence: 0.9,
    },
  });
}

const ASSIGNMENTS = [
  { assignment_id: "a1", dlc_id: "dlc.alpha" },
  { assignment_id: "a2", dlc_id: "dlc.beta", due_at: "2026-08-20T00:00:00Z" },
];

function baseInput(events, now = "2026-08-25T00:00:00Z") {
  return {
    class_id: "class.c1",
    member_ids: ["student.1", "student.2"],
    assignments: ASSIGNMENTS,
    events,
    now,
  };
}

test("member progress: completion, on-time vs late, untouched DLCs", () => {
  const events = [
    event("learning.session_started", "student.1", "dlc.alpha", "2026-08-16T09:00:00Z", "s1"),
    event("learning.session_completed", "student.1", "dlc.alpha", "2026-08-16T09:30:00Z", "s1"),
    // late completion of dlc.beta (due 08-20, done 08-22)
    event("learning.session_started", "student.1", "dlc.beta", "2026-08-22T09:00:00Z", "s2"),
    event("learning.session_completed", "student.1", "dlc.beta", "2026-08-22T09:40:00Z", "s2"),
    // student.2 on time for beta, never touched alpha
    event("learning.session_completed", "student.2", "dlc.beta", "2026-08-18T10:00:00Z", "s3"),
  ];
  const stats = projectClassStats(baseInput(events));

  const s1 = stats.members.find((m) => m.account_id === "student.1");
  assert.equal(s1.completed_count, 2);
  const alpha = s1.dlcs.find((d) => d.dlc_id === "dlc.alpha");
  assert.equal(alpha.completed, true);
  assert.equal(alpha.on_time, null, "no due date → on_time stays null");
  assert.equal(alpha.training_ms, 30 * 60 * 1000, "duration pairs started/completed");
  const beta = s1.dlcs.find((d) => d.dlc_id === "dlc.beta");
  assert.equal(beta.completed, true);
  assert.equal(beta.on_time, false, "completed after due date is late, not locked out");

  const s2 = stats.members.find((m) => m.account_id === "student.2");
  assert.equal(s2.dlcs.find((d) => d.dlc_id === "dlc.alpha").completed, false);
  assert.equal(s2.dlcs.find((d) => d.dlc_id === "dlc.beta").on_time, true);
});

test("aborted sessions never count as completions or duration", () => {
  const events = [
    event("learning.session_started", "student.1", "dlc.alpha", "2026-08-16T09:00:00Z", "s1"),
    event("learning.session_aborted", "student.1", "dlc.alpha", "2026-08-16T09:10:00Z", "s1", {
      abort_reason: "learner_exit",
    }),
  ];
  const stats = projectClassStats(baseInput(events));
  const alpha = stats.members[0].dlcs[0];
  assert.equal(alpha.completed, false);
  assert.equal(alpha.sessions_started, 1);
  assert.equal(alpha.training_ms, 0);
});

test("summary rates and active-member counting", () => {
  const events = [
    event("learning.session_completed", "student.1", "dlc.alpha", "2026-08-16T09:00:00Z", "s1"),
    event("learning.session_completed", "student.1", "dlc.beta", "2026-08-19T09:00:00Z", "s2"),
    event("learning.session_completed", "student.2", "dlc.beta", "2026-08-19T09:00:00Z", "s3"),
  ];
  const stats = projectClassStats(baseInput(events));
  assert.equal(stats.summary.members_total, 2);
  assert.equal(stats.summary.members_active, 2);
  assert.equal(stats.summary.completions_total, 3);
  // on-time: student.1 alpha (no due → not on_time true), beta 08-19 ≤ 08-20 on time,
  // student.2 beta on time. on_time counts only due-dated completions.
  assert.equal(stats.summary.completions_on_time, 2);
  assert.equal(stats.summary.completion_rate_overall, 0.75);
  assert.equal(stats.summary.completion_rate_on_time, 0.5);
});

test("empty class or no assignments yields null rates, not guesses", () => {
  const stats = projectClassStats({
    class_id: "class.c1",
    member_ids: ["student.1"],
    assignments: [],
    events: [],
    now: "2026-08-25T00:00:00Z",
  });
  assert.equal(stats.summary.completion_rate_overall, null);
  assert.equal(stats.summary.completion_rate_on_time, null);
  assert.deepEqual(stats.weak_spots, []);
});

test("weak spots: conflicted and low-success claims ranked, healthy claims excluded", () => {
  const events = [
    // conflicted: 1 support vs 3 contradictions across two members
    observation("student.1", "dlc.alpha", "claim/vowel_length", "success", "2026-08-16T09:00:00Z"),
    observation("student.2", "dlc.alpha", "claim/vowel_length", "failure", "2026-08-16T09:00:00Z"),
    observation("student.1", "dlc.alpha", "claim/vowel_length", "failure", "2026-08-17T09:00:00Z"),
    observation("student.2", "dlc.alpha", "claim/vowel_length", "failure", "2026-08-17T09:00:00Z"),
    // low success: 1/3
    observation("student.1", "dlc.beta", "claim/ich_ach", "success", "2026-08-16T09:00:00Z"),
    observation("student.1", "dlc.beta", "claim/ich_ach", "failure", "2026-08-17T09:00:00Z"),
    observation("student.2", "dlc.beta", "claim/ich_ach", "failure", "2026-08-17T09:00:00Z"),
    // healthy: all success → must not appear
    observation("student.1", "dlc.alpha", "claim/healthy", "success", "2026-08-16T09:00:00Z"),
    observation("student.2", "dlc.alpha", "claim/healthy", "success", "2026-08-17T09:00:00Z"),
    // outside assigned DLCs → ignored entirely
    observation("student.1", "dlc.other", "claim/foreign", "failure", "2026-08-16T09:00:00Z"),
  ];
  const spots = projectClassStats(baseInput(events)).weak_spots;
  assert.deepEqual(
    spots.map((s) => s.claim_ref),
    ["claim/vowel_length", "claim/ich_ach"],
  );
  assert.equal(spots[0].members_affected, 2);
  assert.ok(spots[0].reasons.includes("conflicted_evidence"));
  assert.ok(spots[1].reasons.includes("low_success_rate"));
});

test("projection is deterministic for the same input", () => {
  const events = [
    event("learning.session_completed", "student.1", "dlc.alpha", "2026-08-16T09:00:00Z", "s1"),
    observation("student.2", "dlc.beta", "claim/x", "failure", "2026-08-16T09:00:00Z"),
  ];
  const first = projectClassStats(baseInput(events));
  const second = projectClassStats(baseInput(events));
  assert.deepEqual(first, second);
});
