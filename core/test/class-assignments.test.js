const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  ClassService,
  ClassAssignmentService,
  ClassError,
  AssignmentError,
  classEntitlementSource,
} = require("../dist/index.js");

const NOW = "2026-08-16T10:00:00Z";
const FREE_LISTING = {
  listing_id: "listing.dlc.free-german",
  dlc_id: "dlc.free-german",
  pricing_model: "free",
  publisher_id: "teacher.other",
};
const PAID_LISTING = {
  listing_id: "listing.dlc.paid-grammar",
  dlc_id: "dlc.paid-grammar",
  pricing_model: "subscription",
  publisher_id: "teacher.other",
};

function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  const classService = new ClassService({
    accountStore: accounts,
    entitlementStore: entitlements,
    clock: () => NOW,
  });
  const assignments = new ClassAssignmentService({
    classService,
    entitlementStore: entitlements,
    clock: () => NOW,
  });
  accounts.createAccount("teacher.1");
  accounts.grant("teacher.1", "create_class");
  accounts.createAccount("student.1");
  accounts.createAccount("student.2");
  const klass = classService.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  classService.redeemInvitation(
    classService.issueInvitation("teacher.1", klass.class_id).code,
    "student.1",
  );
  return { accounts, entitlements, classService, assignments, klass };
}

function expectError(fn, code) {
  assert.throws(fn, (e) => (e instanceof ClassError || e instanceof AssignmentError) && e.code === code);
}

function completedEvent(learner, dlcId, at, sessionRef = `s.${learner}.${dlcId}`) {
  return {
    event_type: "learning.session_completed",
    learner_ref: learner,
    session_ref: sessionRef,
    occurred_at: at,
    mode: "learning",
    composition: { dlc_ref: { id: dlcId } },
  };
}

test("assigning a free listing grants class-channel entitlements to all members", () => {
  const { assignments, entitlements, klass } = setup();
  const assignment = assignments.assign("teacher.1", klass.class_id, FREE_LISTING);

  assert.equal(assignment.mode, "auto_free");
  assert.equal(assignment.entitlements_granted, true);
  assert.equal(assignment.sequence, 1);
  const at = "2026-08-16T12:00:00Z";
  for (const member of ["teacher.1", "student.1"]) {
    assert.ok(entitlements.has(member, "dlc/dlc.free-german", at), `${member} granted`);
    assert.equal(
      entitlements.get(member, "dlc/dlc.free-german").source,
      classEntitlementSource(klass.class_id),
    );
  }
});

test("a member joining later is caught up with already-assigned free DLCs", () => {
  const { classService, entitlements, assignments, klass } = setup();
  assignments.assign("teacher.1", klass.class_id, FREE_LISTING);

  classService.redeemInvitation(
    classService.issueInvitation("teacher.1", klass.class_id).code,
    "student.2",
  );
  assert.ok(
    entitlements.has("student.2", "dlc/dlc.free-german", "2026-08-16T12:00:00Z"),
    "late joiner receives the assignment",
  );
});

test("the creator's own paid listing is auto-free for the class (§4.2)", () => {
  const { assignments, entitlements, klass } = setup();
  const ownListing = { ...PAID_LISTING, publisher_id: "teacher.1" };
  const assignment = assignments.assign("teacher.1", klass.class_id, ownListing);

  assert.equal(assignment.mode, "auto_free", "creator-owned paid listing behaves as free");
  assert.ok(entitlements.has("student.1", "dlc/dlc.paid-grammar", NOW));
});

test("someone else's paid listing records a C-scheme mode and grants nothing", () => {
  const { assignments, entitlements, klass } = setup();
  const recommended = assignments.assign("teacher.1", klass.class_id, PAID_LISTING);
  assert.equal(recommended.mode, "recommend_self_purchase", "default C-scheme mode");
  assert.equal(recommended.entitlements_granted, false);
  assert.ok(!entitlements.has("student.1", "dlc/dlc.paid-grammar", NOW));

  const purchased = assignments.assign("teacher.1", klass.class_id, PAID_LISTING, {
    paidMode: "teacher_purchase",
  });
  assert.equal(purchased.mode, "teacher_purchase");
  assert.ok(!entitlements.has("student.1", "dlc/dlc.paid-grammar", NOW), "P8 activates purchases");
});

test("re-assigning the same listing updates in place instead of duplicating", () => {
  const { assignments, klass } = setup();
  const first = assignments.assign("teacher.1", klass.class_id, FREE_LISTING, { sequence: 5 });
  const second = assignments.assign("teacher.1", klass.class_id, FREE_LISTING, {
    dueAt: "2026-09-01T00:00:00Z",
  });
  assert.equal(assignments.assignmentsFor(klass.class_id).length, 1);
  assert.equal(second.assignment_id, first.assignment_id);
  assert.equal(second.sequence, 5, "sequence preserved when not re-specified");
  assert.equal(second.due_at, "2026-09-01T00:00:00Z");
  assert.equal(second.assigned_at, first.assigned_at);
});

test("sequence auto-increments in assignment order", () => {
  const { assignments, klass } = setup();
  const other = { ...FREE_LISTING, listing_id: "listing.dlc.other", dlc_id: "dlc.other" };
  assignments.assign("teacher.1", klass.class_id, FREE_LISTING);
  assignments.assign("teacher.1", klass.class_id, other);
  const ordered = assignments.assignmentsFor(klass.class_id).map((a) => a.sequence);
  assert.deepEqual(ordered, [1, 2]);
});

test("prerequisite order: an assignment unlocks only after earlier ones complete (§5.5)", () => {
  const { assignments, klass } = setup();
  const later = { ...FREE_LISTING, listing_id: "listing.dlc.later", dlc_id: "dlc.later" };
  assignments.assign("teacher.1", klass.class_id, FREE_LISTING);
  assignments.assign("teacher.1", klass.class_id, later);

  const events = [completedEvent("student.1", "dlc.some-unrelated", NOW)];
  let states = assignments.unlockStateFor(klass.class_id, "student.1", events);
  assert.equal(states[0].unlocked, true, "first in sequence always unlocked");
  assert.equal(states[1].unlocked, false, "second blocked before first completes");
  assert.deepEqual(states[1].blocked_by, [states[0].assignment_id]);
  assert.equal(states[0].completed, false);

  const done = [...events, completedEvent("student.1", "dlc.free-german", NOW)];
  states = assignments.unlockStateFor(klass.class_id, "student.1", done);
  assert.equal(states[1].unlocked, true, "unlocks after the prerequisite completes");
  assert.equal(states[0].completed, true);
});

test("unlock state never revokes or grants entitlements (learning rights not locked)", () => {
  const { assignments, entitlements, klass } = setup();
  assignments.assign("teacher.1", klass.class_id, FREE_LISTING);
  assignments.unlockStateFor(klass.class_id, "student.1", []);
  assert.ok(entitlements.has("student.1", "dlc/dlc.free-german", NOW), "entitlement intact");
});

test("unlock state requires class membership", () => {
  const { assignments, klass } = setup();
  expectError(
    () => assignments.unlockStateFor(klass.class_id, "student.2", []),
    "not_class_member",
  );
});

test("unassign revokes the class channel for that resource only", () => {
  const { classService, entitlements, assignments, klass } = setup();
  // student.2 acquires the DLC personally BEFORE joining the class (§5.4).
  classService.redeemInvitation(
    classService.issueInvitation("teacher.1", klass.class_id, { maxUses: 5 }).code,
    "student.2",
  );
  entitlements.grant("student.2", "dlc/dlc.free-german", NOW);
  const later = { ...FREE_LISTING, listing_id: "listing.dlc.later", dlc_id: "dlc.later" };
  assignments.assign("teacher.1", klass.class_id, FREE_LISTING);
  assignments.assign("teacher.1", klass.class_id, later);

  assignments.unassign("teacher.1", klass.class_id, FREE_LISTING.listing_id);
  const at = "2026-08-16T12:00:00Z";
  assert.ok(!entitlements.has("student.1", "dlc/dlc.free-german", at), "class grant revoked");
  assert.ok(
    entitlements.has("student.2", "dlc/dlc.free-german", at),
    "personal grant of the same resource survives (§5.4)",
  );
  assert.ok(entitlements.has("student.1", "dlc/dlc.later", at), "other assignment survives");
  assert.ok(entitlements.has("student.2", "dlc/dlc.later", at), "other member's grants survive");
  assert.equal(assignments.assignmentsFor(klass.class_id).length, 1);
});

test("unassign on an unknown listing fails typed", () => {
  const { assignments, klass } = setup();
  expectError(
    () => assignments.unassign("teacher.1", klass.class_id, "listing.dlc.never"),
    "assignment_not_found",
  );
});

test("assignment gates: only the creator of an active class may assign", () => {
  const { classService, assignments, klass } = setup();
  expectError(() => assignments.assign("student.1", klass.class_id, FREE_LISTING), "not_class_creator");
  classService.archiveClass("teacher.1", klass.class_id);
  expectError(() => assignments.assign("teacher.1", klass.class_id, FREE_LISTING), "class_archived");
});
