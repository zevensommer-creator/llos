// P5 acceptance (BUILD_PLAN): E2E — 教师建班 → 生成邀请码 → 学生加入 →
// 分配参考 DLC → 完成训练 → 教师查看班级统计。全程走真实后端包
// （core/market/compiler），无 Mock；建班门禁与坏邀请码均有反例断言。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  InMemoryEventStore,
  SessionExecutor,
  ClassService,
  ClassError,
  ClassAssignmentService,
  ClassNoticeService,
  projectClassStats,
  grantCapabilityAs,
} from "@llos/core";
import { MarketService, dlcResourceRef } from "@llos/market";
import { runCompiler, contentHash } from "@llos/compiler";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let step = 0;
function pass(label) {
  step += 1;
  console.log(`  [${String(step).padStart(2)}] PASS  ${label}`);
}

console.log("P5 E2E: 教师建班 → 邀请码 → 学生加入 → 分配参考 DLC → 训练 → 班级统计\n");

// --- 基础设施 ---------------------------------------------------------------

const accounts = new InMemoryAccountStore();
const entitlements = new InMemoryEntitlementStore();
const events = new InMemoryEventStore();

const TEACHER = "teacher.p5";
accounts.createAccount(TEACHER, "teacher_verified");
assert.ok(accounts.hasCapability(TEACHER, "publish_dlc"), "verified teacher holds publish_dlc");
// create_class 是独立能力点（§2.1），经服务端重授权门授予（§2.4）。
const ADMIN = "admin.p5";
accounts.createAccount(ADMIN);
accounts.grant(ADMIN, "manage_users");
grantCapabilityAs(accounts, ADMIN, TEACHER, "create_class");
assert.ok(accounts.hasCapability(TEACHER, "create_class"), "teacher granted create_class via admin gate");
const STUDENT1 = "student.p5.a";
const STUDENT2 = "student.p5.b";
accounts.createAccount(STUDENT1);
accounts.createAccount(STUDENT2);

const classService = new ClassService({
  accountStore: accounts,
  entitlementStore: entitlements,
  clock: () => "2026-08-16T08:00:00Z",
});
const assignments = new ClassAssignmentService({
  classService,
  entitlementStore: entitlements,
  clock: () => "2026-08-16T08:00:00Z",
});
const market = new MarketService({
  accountStore: accounts,
  entitlementStore: entitlements,
  clock: () => "2026-08-16T08:00:00Z",
});

// --- 1. 门禁反例：无 create_class 能力不得建班 ------------------------------

assert.throws(
  () => classService.createClass(STUDENT1, { name: "学生私班" }),
  (e) => e instanceof ClassError && e.code === "create_class_capability_missing",
  "student cannot create a class",
);
pass("建班门禁：普通学习者建班被拒（create_class_capability_missing）");

// --- 2. 教师建班 + 学生 1 凭邀请码加入；坏码反例 ----------------------------

const klass = classService.createClass(TEACHER, {
  name: "德语 A1 班（P5 验收）",
  idGenerator: () => "p5",
});
assert.ok(classService.isMember(klass.class_id, TEACHER), "creator is the first member");

const invitation = classService.issueInvitation(TEACHER, klass.class_id, { maxUses: 2 });
assert.match(invitation.code, /^llos-class-/);

assert.throws(
  () => classService.redeemInvitation("llos-class-typo", STUDENT1),
  (e) => e instanceof ClassError && e.code === "unknown_class_invitation",
  "unknown code rejected",
);
const membership = classService.redeemInvitation(invitation.code, STUDENT1);
assert.equal(membership.account_id, STUDENT1);
pass(`建班与入班：${klass.class_id} 建成，学生 1 凭码加入（坏码被拒）`);

// --- 3. 教师发布参考 DLC（免费）并分配到班级 --------------------------------

const manifest = JSON.parse(read("dlc_reference/dlc.de.fsi-construction.json"));
const materialPack = JSON.parse(read("materials/reference/de-hotel-checkin.json"));
const manifestSha = contentHash(manifest);
const listing = market.publish(TEACHER, {
  dlc_ref: { dlc_id: manifest.dlc_id, version: manifest.version, sha256: manifestSha },
  title: "FSI 德语构造训练（班级版）",
  summary: "基于 de-hotel-checkin 参考素材的班级分配训练。",
  language: "de",
  difficulty: "A1",
  pricing: { model: "free" },
});

// due date already past: §5.5 — deadlines never lock learning, only mark late.
const assignmentA = assignments.assign(TEACHER, klass.class_id, {
  listing_id: listing.listing_id,
  dlc_id: manifest.dlc_id,
  pricing_model: "free",
  publisher_id: TEACHER,
}, { sequence: 1, dueAt: "2026-08-15T00:00:00Z" });
assert.equal(assignmentA.mode, "auto_free");

const resource = dlcResourceRef(manifest.dlc_id);
assert.ok(
  entitlements.has(STUDENT1, resource, "2026-08-16T09:00:00Z"),
  "member 1 entitled through the class channel",
);
pass(`分配：参考 DLC 已分配（sequence 1，due 已过期），学生 1 经 class 渠道获得授权`);

// --- 4. 学生 2 分配后加入 → 后加入补发；先修顺序反例 ------------------------

classService.redeemInvitation(invitation.code, STUDENT2);
assert.ok(
  entitlements.has(STUDENT2, resource, "2026-08-16T09:00:00Z"),
  "late joiner caught up",
);

const assignmentB = assignments.assign(TEACHER, klass.class_id, {
  listing_id: `${listing.listing_id}#seq2`,
  dlc_id: manifest.dlc_id,
  pricing_model: "free",
  publisher_id: TEACHER,
}, { sequence: 2 });
assert.equal(assignments.assignmentsFor(klass.class_id).length, 2);

const blocked = assignments.unlockStateFor(klass.class_id, STUDENT2, events.events());
assert.equal(blocked[1].unlocked, false, "sequence 2 blocked for untrained student");
assert.deepEqual(blocked[1].blocked_by, [assignmentA.assignment_id]);
pass("后加入补发：学生 2 加入即获得已分配 DLC；先修顺序：未完成第 1 项 → 第 2 项 blocked（仅呈现门）");

// --- 5. 学生 1 完成训练（compiler + Core runtime，真实事件流） --------------

const templateContent = read("dlc_reference/templates/feedback-generic.json");
const materialSha = contentHash(materialPack);
const snapshot = {
  schema_version: "0.2.1",
  snapshot_id: "snap.p5.de-hotel-checkin.001",
  source: "stored",
  material_ref: {
    uri: `artifact://materials/${materialPack.pack_id}/${materialPack.version}`,
    sha256: materialSha,
    media_type: "application/json",
    schema_id: "material-pack",
    schema_version: "0.2.1",
  },
  content_sha256: materialSha,
  schema_validation: { status: "valid", schema_id: "material-pack", schema_version: "0.2.1" },
  quality_checks: { status: "passed", checks: [] },
  created_at: "2026-08-16T00:00:00Z",
  lifecycle: "active",
};
const { executable } = runCompiler(
  { manifest, snapshot, materialPack },
  {
    clock: () => "2026-08-16T00:00:00Z",
    seed: 7,
    templateResolver: (uri) =>
      uri.endsWith("feedback-generic") ? { content: templateContent } : undefined,
  },
);
function composition(sessionRef) {
  return {
    core_version: "0.2.0",
    dlc_ref: { id: manifest.dlc_id, version: manifest.version, sha256: manifestSha },
    material_snapshot_ref: { id: snapshot.snapshot_id, version: "1.0.0", sha256: materialSha },
    learning_ir_ref: { id: executable.ir_id, version: "0.2.0", sha256: contentHash(executable) },
  };
}
function runTraining(learner, sessionRef, dayIso) {
  let appended = 0;
  const executor = new SessionExecutor(
    executable,
    { learner_ref: learner, session_ref: sessionRef, composition: composition(sessionRef) },
    {
      append: (e) => {
        appended += 1;
        events.append(e);
      },
      clock: () => new Date(Date.parse(dayIso) + appended * 10_000).toISOString(),
      evaluators: {
        "eval.typed_answer": () => ({
          result_kind: "binary",
          outcome: "success",
          measurement_confidence: 0.92,
        }),
      },
      fsrsScheduler: () => undefined,
    },
  );
  let state = executor.start();
  while (state.status === "awaiting_input") {
    state = executor.advance({
      payload_ref: `artifact://responses/${sessionRef}/${state.step_id}`,
      payload_sha256: materialSha,
    });
  }
  return state;
}

const trained = runTraining(STUDENT1, "session.p5.a.day1", "2026-08-16T09:30:00Z");
assert.equal(trained.status, "completed", "training completes");

const unlocked = assignments.unlockStateFor(klass.class_id, STUDENT1, events.events());
assert.equal(unlocked[0].completed, true, "sequence 1 completed by student 1");
assert.equal(unlocked[1].unlocked, true, "sequence 2 unlocked after prerequisite completes");
assert.ok(
  entitlements.has(STUDENT2, resource, "2026-08-17T00:00:00Z"),
  "unlock gating never revokes entitlements",
);
const eventCount = events.events().length;
assert.ok(eventCount > 0, "learning events appended (Core is the only writer)");
pass(`完成训练：学生 1 会话 completed（${eventCount} 条真实学习事件），先修第 2 项自动解锁`);

// --- 6. 教师通知：发布 + 学生可读 -------------------------------------------

const notices = new ClassNoticeService({
  classService,
  clock: () => "2026-08-16T10:00:00Z",
});
const notice = notices.post(TEACHER, klass.class_id, "本周日前完成第 1 项训练");
const board = notices.noticesFor(klass.class_id, STUDENT1);
assert.equal(board.length, 1);
assert.equal(board[0].text, notice.text);
pass("班级通知：教师发布，成员学生 1 可读");

// --- 7. 教师查看班级统计（Core 投影，前端只读） ------------------------------

const stats = projectClassStats({
  class_id: klass.class_id,
  member_ids: classService.members(klass.class_id).map((m) => m.account_id),
  assignments: assignments.assignmentsFor(klass.class_id).map((a) => ({
    assignment_id: a.assignment_id,
    dlc_id: a.dlc_id,
    due_at: a.due_at,
  })),
  events: events.events(),
  now: "2026-08-17T00:00:00Z",
});

assert.equal(stats.summary.members_total, 3, "creator + 2 students");
assert.equal(stats.summary.assignments_total, 2);
const s1 = stats.members.find((m) => m.account_id === STUDENT1);
// A、B 是同一 DLC 的两次 sequence：学生 1 完成训练后两个 assignment 均计完成。
assert.equal(s1.completed_count, 2, "student 1 completed both assignments (same dlc)");
const alpha = s1.dlcs[0];
assert.equal(alpha.completed, true);
assert.equal(alpha.on_time, false, "due 08-15, finished 08-16 → late but still completed (§5.5)");
assert.ok(alpha.training_ms > 0, "duration aggregated from real event pairs");
assert.equal(stats.summary.completions_total, 2, "only student 1 completed");
assert.equal(stats.weak_spots.length, 0, "all-success observations → no weak spots (no guessing)");
pass(`班级统计：完成度/逾期/时长聚合自真实事件（完成率 ${stats.summary.completion_rate_overall}），薄弱点为空不猜测`);

console.log(`\nP5 E2E PASS — ${step}/7 步全部通过：建班 → 邀请码入班（含补发）→ 分配 → 训练 → 先修解锁 → 通知 → 统计。`);
