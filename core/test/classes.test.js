const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  ClassService,
  ClassError,
  classEntitlementSource,
} = require("../dist/index.js");

const NOW = "2026-08-16T10:00:00Z";

function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  const classes = new ClassService({
    accountStore: accounts,
    entitlementStore: entitlements,
    clock: () => NOW,
  });
  accounts.createAccount("teacher.1");
  accounts.grant("teacher.1", "create_class");
  accounts.createAccount("student.1");
  accounts.createAccount("student.2");
  accounts.createAccount("student.3");
  return { accounts, entitlements, classes };
}

function expectClassError(fn, code) {
  assert.throws(
    fn,
    (e) => e instanceof ClassError && e.code === code,
    `expected ClassError ${code}`,
  );
}

test("createClass requires the create_class capability (gate counter-example)", () => {
  const { classes } = setup();
  expectClassError(
    () => classes.createClass("student.1", { name: "德语 A1" }),
    "create_class_capability_missing",
  );
});

test("createClass validates input, records creator as first member", () => {
  const { classes } = setup();
  expectClassError(
    () => classes.createClass("teacher.1", { name: "   " }),
    "invalid_class_input",
  );
  const record = classes.createClass("teacher.1", {
    name: " 德语 A1 精读班 ",
    description: "  发音与替换训练 ",
    idGenerator: () => "de-a1",
  });
  assert.equal(record.class_id, "class.de-a1");
  assert.equal(record.name, "德语 A1 精读班");
  assert.equal(record.description, "发音与替换训练");
  assert.equal(record.creator_id, "teacher.1");
  assert.equal(record.archived, false);
  assert.ok(classes.isMember("class.de-a1", "teacher.1"), "creator is a member");
  assert.deepEqual(
    classes.classesFor("teacher.1").map((c) => c.class_id),
    ["class.de-a1"],
  );
});

test("updateClass and archiveClass are creator-only; archived classes freeze", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  expectClassError(
    () => classes.updateClass("student.1", record.class_id, { name: "改名" }),
    "not_class_creator",
  );
  expectClassError(
    () => classes.updateClass("teacher.1", record.class_id, { name: "  " }),
    "invalid_class_input",
  );
  const renamed = classes.updateClass("teacher.1", record.class_id, {
    name: "德语 A1（春季）",
    description: "",
  });
  assert.equal(renamed.name, "德语 A1（春季）");
  assert.equal(renamed.description, undefined, "empty description clears");

  expectClassError(() => classes.archiveClass("student.1", record.class_id), "not_class_creator");
  const archived = classes.archiveClass("teacher.1", record.class_id);
  assert.equal(archived.archived, true);
  assert.equal(classes.archiveClass("teacher.1", record.class_id).archived, true, "idempotent");
  expectClassError(
    () => classes.updateClass("teacher.1", record.class_id, { name: "再改" }),
    "class_archived",
  );
});

test("invitation lifecycle: issue is creator-only, codes are namespaced", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  expectClassError(
    () => classes.issueInvitation("student.1", record.class_id),
    "not_class_creator",
  );
  expectClassError(
    () => classes.issueInvitation("teacher.1", record.class_id, { maxUses: 0 }),
    "invalid_class_input",
  );
  const invitation = classes.issueInvitation("teacher.1", record.class_id, {
    maxUses: 2,
    codeGenerator: () => "abc",
  });
  assert.equal(invitation.code, "llos-class-abc");
  assert.equal(invitation.class_id, record.class_id);
  assert.equal(invitation.max_uses, 2);
  assert.equal(invitation.uses, 0);
});

test("redeemInvitation joins the class and consumes a use", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id, { maxUses: 2 });

  const membership = classes.redeemInvitation(invitation.code, "student.1");
  assert.equal(membership.class_id, record.class_id);
  assert.equal(membership.account_id, "student.1");
  assert.equal(membership.joined_at, NOW);
  assert.equal(classes.getInvitation(invitation.code).uses, 1);
  assert.ok(classes.isMember(record.class_id, "student.1"));
});

test("redeem is idempotent for members and does not consume a use", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id, { maxUses: 1 });
  classes.redeemInvitation(invitation.code, "student.1");
  classes.redeemInvitation(invitation.code, "student.1");
  assert.equal(classes.getInvitation(invitation.code).uses, 1, "no double consumption");
});

test("redeem gates: join_class capability, revoked, exhausted, unknown, archived", () => {
  const { classes, accounts } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id, { maxUses: 1 });

  accounts.revoke("student.1", "join_class");
  expectClassError(
    () => classes.redeemInvitation(invitation.code, "student.1"),
    "join_class_capability_missing",
  );
  accounts.grant("student.1", "join_class");

  expectClassError(
    () => classes.redeemInvitation("llos-class-nope", "student.1"),
    "unknown_class_invitation",
  );

  const revoked = classes.issueInvitation("teacher.1", record.class_id, {
    codeGenerator: () => "rev",
  });
  expectClassError(() => classes.revokeInvitation(revoked.code, "student.1"), "not_class_invitation_issuer");
  classes.revokeInvitation(revoked.code, "teacher.1");
  expectClassError(
    () => classes.redeemInvitation(revoked.code, "student.1"),
    "class_invitation_revoked",
  );

  classes.redeemInvitation(invitation.code, "student.1");
  expectClassError(
    () => classes.redeemInvitation(invitation.code, "student.2"),
    "class_invitation_exhausted",
  );

  classes.archiveClass("teacher.1", record.class_id);
  const lateInvite = classes.getInvitation(invitation.code);
  assert.equal(lateInvite.revoked, false);
  expectClassError(
    () => classes.redeemInvitation(invitation.code, "student.2"),
    "class_archived",
  );
  expectClassError(
    () => classes.issueInvitation("teacher.1", record.class_id),
    "class_archived",
  );
});

test("multi-use invitation admits up to maxUses students", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id, { maxUses: 2 });
  classes.redeemInvitation(invitation.code, "student.1");
  classes.redeemInvitation(invitation.code, "student.2");
  expectClassError(
    () => classes.redeemInvitation(invitation.code, "student.3"),
    "class_invitation_exhausted",
  );
  assert.equal(classes.members(record.class_id).length, 3, "creator + 2 students");
});

test("a student can belong to multiple classes at once", () => {
  const { classes } = setup();
  const a = classes.createClass("teacher.1", { name: "班 A", idGenerator: () => "a" });
  const b = classes.createClass("teacher.1", { name: "班 B", idGenerator: () => "b" });
  const invA = classes.issueInvitation("teacher.1", a.class_id);
  const invB = classes.issueInvitation("teacher.1", b.class_id);
  classes.redeemInvitation(invA.code, "student.1");
  classes.redeemInvitation(invB.code, "student.1");
  assert.deepEqual(
    classes.classesFor("student.1").map((c) => c.class_id),
    ["class.a", "class.b"],
  );
});

test("removeMember is creator-only and never removes the creator", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id);
  classes.redeemInvitation(invitation.code, "student.1");

  expectClassError(
    () => classes.removeMember("student.2", record.class_id, "student.1"),
    "not_class_creator",
  );
  expectClassError(
    () => classes.removeMember("teacher.1", record.class_id, "teacher.1"),
    "cannot_remove_creator",
  );
  expectClassError(
    () => classes.removeMember("teacher.1", record.class_id, "student.2"),
    "not_class_member",
  );

  classes.removeMember("teacher.1", record.class_id, "student.1");
  assert.ok(!classes.isMember(record.class_id, "student.1"));
});

test("leaving/removal revokes only class-channel entitlements (§5.4)", () => {
  const { classes, entitlements } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id);
  classes.redeemInvitation(invitation.code, "student.1");

  const source = classEntitlementSource(record.class_id);
  entitlements.grant("student.1", "dlc/personal-paid", "2026-08-16T09:00:00Z");
  entitlements.grant("student.1", "dlc/class-assigned", "2026-08-16T09:00:00Z", undefined, source);

  classes.leaveClass("student.1", record.class_id);
  const at = "2026-08-16T12:00:00Z";
  assert.ok(entitlements.has("student.1", "dlc/personal-paid", at), "personal grant survives");
  assert.ok(!entitlements.has("student.1", "dlc/class-assigned", at), "class grant revoked");
  assert.ok(!classes.isMember(record.class_id, "student.1"));
});

test("removal by the teacher applies the same §5.4 revocation semantics", () => {
  const { classes, entitlements } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  const invitation = classes.issueInvitation("teacher.1", record.class_id);
  classes.redeemInvitation(invitation.code, "student.1");
  entitlements.grant("student.1", "dlc/x", "2026-08-16T09:00:00Z", undefined, classEntitlementSource(record.class_id));

  classes.removeMember("teacher.1", record.class_id, "student.1");
  assert.ok(!entitlements.has("student.1", "dlc/x", "2026-08-16T12:00:00Z"));
});

test("creator cannot leave; leave requires membership", () => {
  const { classes } = setup();
  const record = classes.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  expectClassError(() => classes.leaveClass("teacher.1", record.class_id), "cannot_remove_creator");
  expectClassError(() => classes.leaveClass("student.1", record.class_id), "not_class_member");
});

test("leaving one class keeps other classes' grants intact", () => {
  const { classes, entitlements } = setup();
  const a = classes.createClass("teacher.1", { name: "班 A", idGenerator: () => "a" });
  const b = classes.createClass("teacher.1", { name: "班 B", idGenerator: () => "b" });
  classes.redeemInvitation(classes.issueInvitation("teacher.1", a.class_id).code, "student.1");
  classes.redeemInvitation(classes.issueInvitation("teacher.1", b.class_id).code, "student.1");
  entitlements.grant("student.1", "dlc/from-a", "2026-08-16T09:00:00Z", undefined, classEntitlementSource(a.class_id));
  entitlements.grant("student.1", "dlc/from-b", "2026-08-16T09:00:00Z", undefined, classEntitlementSource(b.class_id));

  classes.leaveClass("student.1", a.class_id);
  const at = "2026-08-16T12:00:00Z";
  assert.ok(!entitlements.has("student.1", "dlc/from-a", at));
  assert.ok(entitlements.has("student.1", "dlc/from-b", at), "class B grant untouched");
  assert.deepEqual(classes.classesFor("student.1").map((c) => c.class_id), ["class.b"]);
});
