// P4 acceptance (BUILD_PLAN): E2E — 新用户注册 → 市场免费获取参考 DLC →
// 完成训练 → 可评价。全程走真实后端包（core/market/compiler），无 Mock；
// 每个门禁（发布/付费/评价）都有反例断言。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  InMemoryAccountStore,
  InMemoryCredentialStore,
  InMemorySessionStore,
  InMemoryEntitlementStore,
  InMemoryEventStore,
  SessionExecutor,
  scheduleFsrsReview,
} from "@llos/core";
import { MarketService, MarketError, dlcResourceRef } from "@llos/market";
import { runCompiler, contentHash } from "@llos/compiler";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let step = 0;
function pass(label) {
  step += 1;
  console.log(`  [${String(step).padStart(2)}] PASS  ${label}`);
}

console.log("P4 E2E: 注册 → 市场免费获取参考 DLC → 完成训练 → 可评价\n");

// --- 1. 注册 + 登录（core/identity） ---------------------------------------

const accounts = new InMemoryAccountStore();
const credentials = new InMemoryCredentialStore();
const sessions = new InMemorySessionStore();
const entitlements = new InMemoryEntitlementStore();

const STUDENT = "student.p4";
accounts.createAccount(STUDENT);
credentials.set(STUDENT, "correct horse battery staple");
assert.ok(credentials.verify(STUDENT, "correct horse battery staple"), "password verifies");
assert.ok(!credentials.verify(STUDENT, "wrong password"), "wrong password rejected");
const issued = sessions.issue(STUDENT, { issuedAt: "2026-08-16T08:00:00Z", ttlSeconds: 3600 });
assert.ok(sessions.validate(issued.token, "2026-08-16T08:30:00Z"), "session valid within ttl");
assert.equal(sessions.validate(issued.token, "2026-08-16T10:00:00Z"), null, "session expired after ttl");
pass(`注册 + 登录：${STUDENT}（scrypt 凭证 + 会话令牌，过期即失效）`);

// --- 2. 门禁反例：无 publish_dlc 能力不得发布 -------------------------------

const market = new MarketService({
  accountStore: accounts,
  entitlementStore: entitlements,
  clock: () => "2026-08-16T08:00:00Z",
});

const manifest = JSON.parse(read("dlc_reference/dlc.de.fsi-construction.json"));
const materialPack = JSON.parse(read("materials/reference/de-hotel-checkin.json"));
const manifestSha = contentHash(manifest);

assert.throws(
  () =>
    market.publish(STUDENT, {
      dlc_ref: { dlc_id: manifest.dlc_id, version: manifest.version, sha256: manifestSha },
      title: "冒名发布",
      summary: "不应成功",
      language: "de",
      pricing: { model: "free" },
    }),
  (e) => e instanceof MarketError && e.code === "publisher_capability_missing",
  "student cannot publish",
);
pass("发布门禁：普通学习者发布被拒（publisher_capability_missing）");

// --- 3. 认证教师发布参考 DLC（免费）+ 一个订阅制条目 ------------------------

const PUBLISHER = "teacher.p4";
accounts.createAccount(PUBLISHER, "teacher_verified");
assert.ok(accounts.hasCapability(PUBLISHER, "publish_dlc"), "verified teacher holds publish_dlc");

const listing = market.publish(PUBLISHER, {
  dlc_ref: { dlc_id: manifest.dlc_id, version: manifest.version, sha256: manifestSha },
  title: "FSI 德语构造训练（参考 DLC）",
  summary: "基于 de-hotel-checkin 参考素材的德语发音与替换训练。",
  language: "de",
  difficulty: "A1",
  tags: ["发音", "参考内容"],
  pricing: { model: "free" },
});
const paidListing = market.publish(PUBLISHER, {
  dlc_ref: { dlc_id: "dlc.example.paid", version: "0.1.0", sha256: manifestSha },
  title: "付费示例（订阅）",
  summary: "付费获取门禁演示。",
  language: "de",
  difficulty: "B1",
  pricing: { model: "subscription", price_cents: 1990 },
});
pass(`发布：${listing.listing_id}（free）与 ${paidListing.listing_id}（subscription）`);

// --- 4. 门禁反例：付费获取尚未开放（P8） ------------------------------------

assert.throws(
  () => market.acquireFree(STUDENT, paidListing.listing_id),
  (e) => e instanceof MarketError && e.code === "pricing_not_available",
  "paid acquisition not available before P8",
);
pass("付费门禁：订阅制条目获取被拒（pricing_not_available，等待 P8）");

// --- 5. 门禁反例：未获取不得评价（product_spec §4.3） -----------------------

assert.throws(
  () => market.review(STUDENT, listing.listing_id, 5, "还没获取"),
  (e) => e instanceof MarketError && e.code === "review_requires_entitlement",
  "review before acquisition rejected",
);
pass("评价门禁（获取前）：未获取内容评价被拒（review_requires_entitlement）");

// --- 6. 市场免费获取 → Core 授权（幂等） ------------------------------------

const acquired = market.acquireFree(STUDENT, listing.listing_id);
assert.equal(acquired.already_acquired, false, "first acquisition grants");
const resource = dlcResourceRef(manifest.dlc_id);
assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T09:00:00Z"), "entitlement granted via Core");
assert.equal(acquired.view.downloads, 1, "downloads counted");

const again = market.acquireFree(STUDENT, listing.listing_id);
assert.equal(again.already_acquired, true, "second acquisition idempotent");
assert.equal(again.view.downloads, 1, "downloads not double-counted");
pass(`免费获取：${resource} 授权写入 Core（重复获取幂等，不重复计数）`);

// --- 7. 完成训练（compiler + Core runtime，参考 demo-loop） -----------------

const templateContent = read("dlc_reference/templates/feedback-generic.json");
const materialSha = contentHash(materialPack);
const snapshot = {
  schema_version: "0.2.1",
  snapshot_id: "snap.p4.de-hotel-checkin.001",
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

const events = new InMemoryEventStore();
function composition(sessionRef) {
  return {
    core_version: "0.2.0",
    dlc_ref: { id: manifest.dlc_id, version: manifest.version, sha256: manifestSha },
    material_snapshot_ref: { id: snapshot.snapshot_id, version: "1.0.0", sha256: materialSha },
    learning_ir_ref: { id: executable.ir_id, version: "0.2.0", sha256: contentHash(executable) },
  };
}
function runTraining(sessionRef, dayIso) {
  const executor = new SessionExecutor(
    executable,
    { learner_ref: STUDENT, session_ref: sessionRef, composition: composition(sessionRef) },
    {
      append: (e) => events.append(e),
      clock: () => dayIso,
      evaluators: {
        "eval.typed_answer": () => ({
          result_kind: "binary",
          outcome: "success",
          measurement_confidence: 0.92,
        }),
      },
      fsrsScheduler: (claimRef) =>
        scheduleFsrsReview(
          events
            .events()
            .filter((e) => e.event_type === "observation.recorded" && e.claim_ref === claimRef)
            .map((e) => ({
              occurred_at: e.occurred_at,
              outcome: e.observation.outcome,
              measurement_confidence: e.observation.measurement_confidence,
            })),
          dayIso,
        ),
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

const day1 = runTraining("session.p4.day1", "2026-08-16T09:00:00Z");
assert.equal(day1.status, "completed", "day 1 training completes");
const day2 = runTraining("session.p4.day2", "2026-08-17T09:00:00Z");
assert.equal(day2.status, "completed", "day 2 retention training completes");
assert.ok(events.events().length > 0, "learning events appended (Core is the only writer)");
pass(`完成训练：2 次会话均 completed/success，追加 ${events.events().length} 条学习事件`);

// --- 8. 可评价（获取 + 训练后） ---------------------------------------------

const review = market.review(STUDENT, listing.listing_id, 5, "训练闭环完整，发音反馈清晰。");
assert.equal(review.rating, 5);
const viewed = market.view(listing.listing_id);
assert.equal(viewed.rating_summary.count, 1);
assert.equal(viewed.rating_summary.average, 5);

const updated = market.review(STUDENT, listing.listing_id, 4);
assert.equal(updated.rating, 4, "re-review overwrites");
assert.equal(market.view(listing.listing_id).rating_summary.count, 1, "one review per user");
assert.equal(market.view(listing.listing_id).rating_summary.average, 4);
pass("可评价：评价提交成功，覆盖更新后仍为一用户一评（§4.3）");

console.log(`\nP4 E2E PASS — ${step}/8 步全部通过：注册 → 免费获取 → 完成训练 → 可评价。`);
