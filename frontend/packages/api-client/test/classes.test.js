const { test } = require("node:test");
const assert = require("node:assert");
const { MockApiClient, resetMockClasses } = require("../dist/index.js");

function setup(account = "teacher") {
  resetMockClasses();
  return new MockApiClient({ account });
}

test("learner without create_class cannot create a class (server-side gate)", async () => {
  const learner = setup("learner");
  const outcome = await learner.createClass("我的班");
  assert.equal(outcome.status, "permission_denied");
  assert.equal(outcome.required_capability, "create_class");
});

test("teacher creates a class and appears as creator-member", async () => {
  const teacher = setup("teacher");
  const outcome = await teacher.createClass(" 德语 B1 精读 ", "每周两次跟读");
  assert.equal(outcome.status, "created");
  assert.equal(outcome.class.name, "德语 B1 精读");
  assert.equal(outcome.class.member_count, 1);
  assert.equal(outcome.class.is_creator, true);

  const mine = await teacher.listMyClasses();
  assert.equal(mine.length, 2, "seed class + new class");
  assert.ok(mine.some((c) => c.name === "德语 B1 精读"));
});

test("empty class name is rejected typed", async () => {
  const teacher = setup("teacher");
  const outcome = await teacher.createClass("   ");
  assert.equal(outcome.status, "invalid_name");
});

test("invitation roundtrip: issue → join → already_member → bad code", async () => {
  const teacher = setup("teacher");
  const { class: created } = await teacher.createClass("A1 晚班");
  const invitation = await teacher.issueClassInvitation(created.class_id, 2);
  assert.match(invitation.code, /^llos-class-/);
  assert.equal(invitation.max_uses, 2);

  const learner = new MockApiClient({ account: "learner" });
  const bad = await learner.joinClass("llos-class-nope");
  assert.equal(bad.status, "invalid_code");

  const joined = await learner.joinClass(invitation.code);
  assert.equal(joined.status, "joined");
  const again = await learner.joinClass(invitation.code);
  assert.equal(again.status, "already_member");

  const detail = await learner.getClassDetail(created.class_id);
  assert.equal(detail.members.length, 2);
  assert.ok(detail.members.some((m) => m.display_name.includes("小夏")));

  const outsider = await new MockApiClient({ account: "learner" }).getClassDetail("class.mock.a1");
  assert.notEqual(outsider, null, "learner is a member of the seed class");
});

test("non-creator cannot issue invitations or post notices", async () => {
  const teacher = setup("teacher");
  const learner = new MockApiClient({ account: "learner" });
  assert.equal(await learner.issueClassInvitation("class.mock.a1"), null);
  const posted = await learner.postClassNotice("class.mock.a1", "学生不能发");
  assert.equal(posted.status, "not_creator");
});

test("teacher assigns free DLC (auto_free) and own paid DLC (§4.2)", async () => {
  const teacher = setup("teacher");
  const { class: created } = await teacher.createClass("B1 班");

  const free = await teacher.assignDlc(created.class_id, "dlc.fsi-german-a1", {
    sequence: 1,
    dueAt: "2026-09-01T00:00:00Z",
  });
  assert.equal(free.status, "assigned");
  assert.equal(free.assignment.mode, "auto_free");
  assert.equal(free.assignment.entitlements_granted, true);
  assert.equal(free.assignment.due_at, "2026-09-01T00:00:00Z");

  // dlc.german-b1-grammar 是订阅制，publisher 为"王老师（已认证）"= Mock 教师 → §4.2 自动免费
  const ownPaid = await teacher.assignDlc(created.class_id, "dlc.german-b1-grammar");
  assert.equal(ownPaid.assignment.mode, "auto_free", "creator-owned paid listing is auto-free");

  // 法语入门是他人付费内容 → C 方案仅记录，不发授权
  const others = await teacher.assignDlc(created.class_id, "dlc.french-start");
  assert.equal(others.assignment.mode, "recommend_self_purchase");
  assert.equal(others.assignment.entitlements_granted, false);

  const detail = await teacher.getClassDetail(created.class_id);
  assert.equal(detail.assignments.length, 3);

  const unknown = await teacher.assignDlc(created.class_id, "dlc.never-exists");
  assert.equal(unknown.status, "invalid_input");

  const learner = new MockApiClient({ account: "learner" });
  const denied = await learner.assignDlc(created.class_id, "dlc.fsi-german-a1");
  assert.equal(denied.status, "not_creator");
});

test("re-assigning the same DLC updates in place", async () => {
  const teacher = setup("teacher");
  const { class: created } = await teacher.createClass("C1 班");
  await teacher.assignDlc(created.class_id, "dlc.fsi-german-a1", { sequence: 3 });
  const again = await teacher.assignDlc(created.class_id, "dlc.fsi-german-a1", {
    dueAt: "2026-09-10T00:00:00Z",
  });
  assert.equal(again.status, "assigned");
  const detail = await teacher.getClassDetail(created.class_id);
  assert.equal(detail.assignments.length, 1);
  assert.equal(detail.assignments[0].sequence, 3, "sequence preserved");
  assert.equal(detail.assignments[0].due_at, "2026-09-10T00:00:00Z");
});

test("notices post and appear newest-first for members", async () => {
  const teacher = setup("teacher");
  const posted = await teacher.postClassNotice("class.mock.a1", "  明天 8 点直播纠音  ");
  assert.equal(posted.status, "posted");
  assert.equal(posted.notice.text, "明天 8 点直播纠音");

  const empty = await teacher.postClassNotice("class.mock.a1", "  ");
  assert.equal(empty.status, "invalid_text");

  const learner = new MockApiClient({ account: "learner" });
  const detail = await learner.getClassDetail("class.mock.a1");
  assert.ok(detail.notices.length >= 2);
  assert.ok(detail.notices.some((n) => n.text === "明天 8 点直播纠音"));
});

test("unlock state: seed class has seq 2 unlocked after seq 1 completed", async () => {
  const learner = setup("learner");
  const states = await learner.loadClassUnlockState("class.mock.a1");
  assert.equal(states.length, 2);
  assert.equal(states[0].completed, true, "seed: learner finished seq 1");
  assert.equal(states[1].unlocked, true, "seq 2 unlocked after prerequisite");
  assert.equal(states[1].completed, false);
});

test("unlock state: fresh class blocks seq 2 before seq 1 completes", async () => {
  const teacher = setup("teacher");
  const { class: created } = await teacher.createClass("顺序测试班");
  await teacher.assignDlc(created.class_id, "dlc.fsi-german-a1", { sequence: 1 });
  await teacher.assignDlc(created.class_id, "dlc.de-hotel-survival", { sequence: 2 });

  const invitation = await teacher.issueClassInvitation(created.class_id);
  const learner = new MockApiClient({ account: "learner" });
  await learner.joinClass(invitation.code);

  const states = await learner.loadClassUnlockState(created.class_id);
  assert.equal(states[0].unlocked, true, "seq 1 always unlocked");
  assert.equal(states[1].unlocked, false, "seq 2 blocked");
  assert.deepEqual([...states[1].blocked_by], [states[0].assignment_id]);
});

test("stats are creator-only and aggregate members", async () => {
  const teacher = setup("teacher");
  const stats = await teacher.loadClassStats("class.mock.a1");
  assert.equal(stats.members_total, 3);
  assert.equal(stats.assignments_total, 2);
  assert.equal(stats.completions_total, 2, "learner + student-a finished seq 1");
  assert.equal(stats.completion_rate_overall, 0.333, "2/6 rounded to 3 decimals");
  const xia = stats.per_member.find((m) => m.account_id === "account.mock.learner");
  assert.equal(xia.completed_count, 1);
  assert.equal(xia.training_minutes, 42);
  assert.equal(stats.weak_spots.length, 1);

  const learner = new MockApiClient({ account: "learner" });
  assert.equal(await learner.loadClassStats("class.mock.a1"), null, "not the creator");
});
