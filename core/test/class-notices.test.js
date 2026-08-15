const { test } = require("node:test");
const assert = require("node:assert");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  ClassService,
  ClassNoticeService,
  ClassError,
} = require("../dist/index.js");

function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  const classService = new ClassService({
    accountStore: accounts,
    entitlementStore: entitlements,
    clock: () => "2026-08-16T10:00:00Z",
  });
  let n = 0;
  const notices = new ClassNoticeService({
    classService,
    clock: () => `2026-08-16T1${n++}:00:00Z`,
    idGenerator: () => `n${n}`,
  });
  accounts.createAccount("teacher.1");
  accounts.grant("teacher.1", "create_class");
  accounts.createAccount("student.1");
  const klass = classService.createClass("teacher.1", { name: "德语 A1", idGenerator: () => "c1" });
  classService.redeemInvitation(
    classService.issueInvitation("teacher.1", klass.class_id).code,
    "student.1",
  );
  return { classService, notices, klass };
}

test("only the class creator can post notices", () => {
  const { notices, klass } = setup();
  assert.throws(
    () => notices.post("student.1", klass.class_id, "大家好"),
    (e) => e instanceof ClassError && e.code === "not_class_creator",
  );
  assert.throws(
    () => notices.post("teacher.1", klass.class_id, "   "),
    (e) => e instanceof ClassError && e.code === "invalid_class_input",
  );
  const notice = notices.post("teacher.1", klass.class_id, "  本周完成第 3 课  ");
  assert.equal(notice.text, "本周完成第 3 课");
  assert.equal(notice.author_id, "teacher.1");
});

test("notices are members-only and newest first", () => {
  const { notices, klass } = setup();
  notices.post("teacher.1", klass.class_id, "第一条");
  notices.post("teacher.1", klass.class_id, "第二条");
  const list = notices.noticesFor(klass.class_id, "student.1");
  assert.deepEqual(list.map((notice) => notice.text), ["第二条", "第一条"]);
  assert.throws(
    () => notices.noticesFor(klass.class_id, "student.9"),
    (e) => e instanceof ClassError && e.code === "not_class_member",
  );
});

test("archived classes accept no new notices", () => {
  const { classService, notices, klass } = setup();
  classService.archiveClass("teacher.1", klass.class_id);
  assert.throws(
    () => notices.post("teacher.1", klass.class_id, "还有吗"),
    (e) => e instanceof ClassError && e.code === "class_archived",
  );
});
