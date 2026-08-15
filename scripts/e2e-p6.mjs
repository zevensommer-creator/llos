// P6 acceptance (BUILD_PLAN): E2E — 非技术教师从零发布免费 DLC → 市场可获取 →
// 可训练。全程走真实后端包（core/market/compiler/gateway/studio），无 Mock；
// 发布状态门禁、下架告知义务均有反例断言；沙箱不写真实事件与真实训练写入
// 事件存储形成对照（不变量 6：学习事件只能由 Core 追加）。

import assert from "node:assert/strict";
import {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
  InMemoryEventStore,
  SessionExecutor,
  ByokVault,
} from "@llos/core";
import {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
} from "@llos/gateway";
import { MarketService, MarketError, dlcResourceRef } from "@llos/market";
import { contentHash, runCompiler } from "@llos/compiler";
import {
  StudioDrafts,
  StudioService,
  StudioError,
  deterministicStructureTransport,
  runSandboxTrial,
  compileDraft,
} from "@llos/studio";

let step = 0;
function pass(label) {
  step += 1;
  console.log(`  [${String(step).padStart(2)}] PASS  ${label}`);
}

console.log("P6 E2E: 教师粘贴备课笔记 → BYOK 结构化 → 表单确认 → 沙箱 → 发布 → 学员获取/训练/更新/下架\n");

// --- 基础设施 -------------------------------------------------------------

const accounts = new InMemoryAccountStore();
const entitlements = new InMemoryEntitlementStore();
const events = new InMemoryEventStore();

const TEACHER = "teacher.p6";
accounts.createAccount(TEACHER, "teacher_verified");
const STUDENT = "student.p6";
accounts.createAccount(STUDENT);

let tick = 0;
const clock = () =>
  new Date(Date.parse("2026-08-16T09:00:00Z") + tick++ * 1000).toISOString();

const KEY = "sk-byok-p6-0123456789abcdef";

// 平台 fallback Provider：输出空 frames——若被误路由，结构化会直接失败，
// 隐式断言"BYOK 优先、平台零调用"（§6.5 Studio 不消耗平台算力）。
const registry = new ProviderRegistry();
registry.register({
  schema_version: "0.2.0",
  provider_id: "provider.platform.llm",
  version: "0.1.0",
  display_name: "Platform LLM",
  description: "Platform fallback provider (empty output).",
  execution: {
    mode: "remote",
    adapter_entrypoint: "platform:Adapter",
    network_required: true,
    credential_ref_names: [],
    sandbox_required: false,
  },
  capabilities: [
    {
      capability_id: "material.generation",
      kind: "llm",
      operations: ["structure", "generate"],
      languages: ["de"],
      quality_tiers: ["standard"],
      input_media_types: ["text/plain"],
      supports_streaming: false,
      supports_batch: true,
      supports_cancellation: true,
      supports_seed: true,
      model_refs: ["platform-model"],
    },
  ],
  models: [
    {
      model_id: "platform-model",
      model_version: "1",
      artifact_or_service_ref: "https://platform.invalid/llm",
      languages: ["de"],
      precision: "remote_unspecified",
      status: "production",
    },
  ],
  limits: { max_concurrency: 4, request_timeout_ms: 30000 },
  cost_model: {
    currency: "USD",
    effective_at: "2026-08-16T00:00:00Z",
    components: [{ unit: "request", price: 0, notes: "platform compute" }],
  },
  privacy: {
    data_leaves_host: true,
    retention: "transient",
    training_use: "none",
    supported_data_classes: ["public", "internal"],
  },
  license: {
    code_spdx_id: "LicenseRef-Platform",
    model_license_status: "service_terms",
    commercial_use: "allowed",
  },
  health: {
    check_kind: "synthetic_request",
    timeout_ms: 5000,
    failure_threshold: 3,
    recovery_threshold: 2,
  },
});
registry.attach(
  "provider.platform.llm",
  new FakeProvider("provider.platform.llm", { output: { frames: [] } }),
);

// --- 1. BYOK：教师登记自己的密钥，Gateway 装配 BYOK Provider ---------------

const vault = new ByokVault({ clock });
const entry = vault.register(TEACHER, {
  provider_family: "deepseek",
  label: "备课用 Key",
  api_key: KEY,
});
assert.equal(vault.list(TEACHER).length, 1);
assert.ok(!vault.list(TEACHER)[0].masked_key.includes("0123456789abcdef"), "masked view leaks no plaintext");
const { provider_id: byokProviderId } = registerByokProvider(
  registry,
  { entry_id: entry.entry_id, provider_family: entry.provider_family, label: entry.label },
  { api_key: vault.resolveFor(TEACHER, entry.entry_id).api_key, transport: deterministicStructureTransport },
);
assert.match(byokProviderId, /^provider\.byok\./);
pass(`BYOK 登记：掩码视图 ${vault.list(TEACHER)[0].masked_key}（明文零泄露），Provider ${byokProviderId} 已装配`);

const gateway = new ProviderGateway(registry);
const drafts = new StudioDrafts({
  accountStore: accounts,
  gateway,
  clock,
  preferProviderIds: [byokProviderId],
});
const market = new MarketService({ accountStore: accounts, entitlementStore: entitlements, clock });
const studio = new StudioService({ drafts, market, clock });

// --- 2. 摄入：粘贴备课笔记 → AI 结构化（BYOK 优先，平台零调用） ------------

const CAFE_TEXT = [
  "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
  "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
  "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
].join("\n");

const draft = await drafts.createDraft(TEACHER, {
  source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
  cefrLevel: "A2",
});
assert.equal(draft.status, "structured");
assert.equal(draft.units.length, 3);
assert.equal(draft.structured_by.provider_id, byokProviderId, "structured via BYOK provider, not platform");
pass(`摄入：粘贴 3 行笔记 → ${draft.units.length} 个学习单元（结构化经 BYOK ${draft.structured_by.provider_id}，平台零调用）`);

// --- 3. 表单确认：编辑 + 教学化校验错误反例 + 确认 --------------------------

assert.throws(
  () => drafts.confirm(TEACHER, draft.draft_id, {
    units: [
      { unit_no: 1, frame_type: "scenario", title: "", pattern: "x" },
    ],
  }),
  (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /第 1 课/.test(e.message),
  "teaching-language validation error",
);

const edited = drafts.edit(TEACHER, draft.draft_id, {
  units: draft.units.slice(0, 2).map((u) => ({ ...u })),
});
assert.equal(edited.units.length, 2);
drafts.confirm(TEACHER, draft.draft_id);
assert.equal(drafts.get(TEACHER, draft.draft_id).status, "confirmed");
pass("表单确认：删至 2 课 → 确认；空标题反例被教学语言错误拒绝（“第 1 课…”而非 schema 路径）");

// --- 4. 发布门禁反例：未确认 / 未勾选下架告知义务 ---------------------------

// 未确认（用一份新草稿验证状态门禁）
const draft2 = await drafts.createDraft(TEACHER, {
  source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Entwurf 2" },
  cefrLevel: "A2",
});
await assert.rejects(
  studio.publishDraft(TEACHER, draft2.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  }),
  (e) => e.code === "draft_state_invalid",
);
await assert.rejects(
  studio.publishDraft(TEACHER, draft.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: false,
  }),
  (e) => e instanceof StudioError && e.code === "delist_acknowledgement_required" && /长期授权/.test(e.message),
);
pass("发布门禁反例：structured 状态被拒（draft_state_invalid）；未确认下架告知义务被拒（delist_acknowledgement_required）");

// --- 5. 沙箱试用：完整走一遍训练，事件只进丢弃式收集器 ---------------------

const currentDraft = drafts.get(TEACHER, draft.draft_id);
const trial = runSandboxTrial(currentDraft.material_pack, currentDraft.manifest, { clock });
assert.equal(trial.status, "completed");
assert.ok(trial.steps_completed > 0);
assert.ok(trial.events_appended > 0);
assert.equal(trial.real_event_store_used, false);
assert.equal(events.events().length, 0, "sandbox appended nothing to the real event store");
pass(`沙箱试用：${trial.steps_completed} 步 completed，${trial.events_appended} 条事件只进丢弃式收集器（真实存储 ${events.events().length} 条）`);

// --- 6. 发布：免费 DLC 上架市场 ----------------------------------------------

const published = await studio.publishDraft(TEACHER, draft.draft_id, {
  listing: {
    summary: "Café-Situationen, Aussprache und höfliche Bitten.",
    difficulty: "A2",
    tags: ["Café", "Anfänger"],
    pricing: { model: "free" },
  },
  acknowledged_delist_terms: true,
});
assert.equal(published.first_publish, true);
assert.equal(market.query({ language: "de" }).length, 1);
assert.ok(market.query({ language: "de" })[0].listing.dlc_ref.dlc_id.startsWith("dlc.studio."));
pass(`发布：免费 DLC ${published.listing.dlc_ref.dlc_id} 上架（v${published.version}），市场立即可见`);

// --- 7. 学员获取：市场 → Core 授权（幂等） -----------------------------------

const acquired = market.acquireFree(STUDENT, published.listing.listing_id);
assert.equal(acquired.already_acquired, false);
const resource = dlcResourceRef(draft.manifest.dlc_id);
assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T10:00:00Z"), "entitlement granted in Core");
const again = market.acquireFree(STUDENT, published.listing.listing_id);
assert.equal(again.already_acquired, true);
pass("学员获取：acquireFree → Core 永久授权（resource 无版本号）；重复获取幂等");

// --- 8. 学员训练：编译 + Core runtime，真实学习事件 -------------------------

const publishedDraft = drafts.get(TEACHER, draft.draft_id);
const { executable, snapshot } = compileDraft(publishedDraft.material_pack, publishedDraft.manifest, { clock });
const manifestSha = contentHash(publishedDraft.manifest);
const composition = {
  core_version: "0.2.0",
  dlc_ref: {
    id: publishedDraft.manifest.dlc_id,
    version: publishedDraft.manifest.version,
    sha256: manifestSha,
  },
  material_snapshot_ref: { id: snapshot.snapshot_id, version: "1.0.0", sha256: snapshot.content_sha256 },
  learning_ir_ref: { id: executable.ir_id, version: "0.2.0", sha256: contentHash(executable) },
};
let appended = 0;
const executor = new SessionExecutor(
  executable,
  { learner_ref: STUDENT, session_ref: "session.p6.day1", composition },
  {
    append: (e) => {
      appended += 1;
      events.append(e);
    },
    clock: () => new Date(Date.parse("2026-08-16T10:30:00Z") + appended * 10_000).toISOString(),
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
    payload_ref: `artifact://responses/session.p6.day1/${state.step_id}`,
    payload_sha256: snapshot.content_sha256,
  });
}
assert.equal(state.status, "completed");
assert.ok(events.events().length > 0, "real learning events appended through Core only");
pass(`学员训练：Studio 产出的 Material Pack + DLC 编译可运行，会话 completed（${events.events().length} 条真实学习事件入 Core 存储）`);

// --- 9. 修订发布：版本隐形自动 minor bump，存量学员自动跟随 ------------------

const revision = drafts.startRevision(TEACHER, draft.draft_id);
const withExtraUnit = drafts.edit(TEACHER, revision.draft_id, {
  units: [
    ...revision.units.map((u) => ({ ...u })),
    { unit_no: revision.units.length + 1, frame_type: "concept", title: "Zahlen üben", pattern: "Zwei Kaffee, bitte." },
  ],
});
drafts.confirm(TEACHER, revision.draft_id, { units: withExtraUnit.units });
const update = await studio.publishDraft(TEACHER, revision.draft_id, {
  listing: { summary: "Café-Situationen mit Zahlen.", pricing: { model: "free" } },
  acknowledged_delist_terms: true,
});
assert.equal(update.first_publish, false);
assert.equal(update.bump.kind, "minor", "units added → minor bump decided by the system");
assert.equal(update.version, "0.2.0");
assert.equal(market.view(published.listing.listing_id).listing.dlc_ref.version, "0.2.0");
assert.ok(entitlements.has(STUDENT, resource, "2026-08-17T00:00:00Z"), "existing owner follows the update without re-acquiring (§6.8)");
pass(`修订发布：加一课 → 系统自动 minor bump v0.2.0（创作者不接触版本号），存量学员授权自动跟随新版本`);

// --- 10. 下架：停止新获取，存量学员保留（§6.9） ------------------------------

const delisted = studio.delist(TEACHER, draft.draft_id);
assert.ok(delisted.delisted_at.length > 0);
assert.throws(
  () => market.acquireFree("student.late.p6", published.listing.listing_id),
  (e) => e instanceof MarketError && e.code === "listing_delisted",
);
const kept = market.acquireFree(STUDENT, published.listing.listing_id);
assert.equal(kept.already_acquired, true);
assert.ok(entitlements.has(STUDENT, resource, "2026-08-18T00:00:00Z"), "owner's entitlement never revoked");
assert.equal(market.query().length, 0, "catalog hides the delisted listing");
pass("下架：新学员获取被拒（listing_delisted）；存量学员幂等保留、授权未回收；目录隐藏");

console.log(`\nP6 E2E PASS — ${step}/10 步全部通过：BYOK → 摄入结构化 → 表单确认（教学化校验）→ 沙箱（不写真实事件）→ 发布门禁 → 市场获取 → 真实训练 → 版本隐形更新 → 下架。`);
