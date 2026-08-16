// P7 acceptance (BUILD_PLAN T-033/T-034/T-035): 服务级 integration gate ——
// 模板加速器预填 / PNG 图片 OCR 摄入 → AI 结构化 → 专家模式自定义训练模式
// （绕过向导直接编辑训练模式定义）→ 沙箱（含自定义模式）→ 发布 → 市场获取
// → 学员真实训练（编译产物含自定义训练模式步骤序列）。
//
// 本脚本是「服务级」gate：直接在 Node 进程内装配真实域服务
// （core/market/compiler/gateway/studio），不经 HTTP、不经浏览器。
// Provider 使用确定性的 Fake transport（studio/test/fixtures）；真实
// HTTP API + Gateway adapter + 浏览器链路由 e2e:p7:web（Playwright）覆盖，
// 其中 OCR 为确定性 base64 解码（无真实网络 OCR 引擎；真实 OCR smoke 未执行，
// 见 docs/reviews/P7_IMPLEMENTATION_PACKET.md）。

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
import { contentHash } from "@llos/compiler";
import {
  StudioDrafts,
  StudioService,
  StudioError,
  runSandboxTrial,
  compileDraft,
  STUDIO_TEMPLATES,
  templateById,
} from "@llos/studio";
import { deterministicStudioTransport } from "../studio/test/fixtures/deterministic-transport.js";

let step = 0;
function pass(label) {
  step += 1;
  console.log(`  [${String(step).padStart(2)}] PASS  ${label}`);
}

console.log("P7 E2E: 模板加速器 / PNG·OCR 摄入 → 专家模式自定义训练模式 → 沙箱 → 发布 → 学员训练\n");

// --- 基础设施 -------------------------------------------------------------

const accounts = new InMemoryAccountStore();
const entitlements = new InMemoryEntitlementStore();
const events = new InMemoryEventStore();

const TEACHER = "teacher.p7";
accounts.createAccount(TEACHER, "teacher_verified");
const STUDENT = "student.p7";
accounts.createAccount(STUDENT);

let tick = 0;
const clock = () =>
  new Date(Date.parse("2026-08-16T09:00:00Z") + tick++ * 1000).toISOString();

const KEY = "sk-byok-p7-0123456789abcdef";

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
      operations: ["structure", "generate", "ocr"],
      languages: ["de"],
      quality_tiers: ["standard"],
      input_media_types: ["text/plain", "image/png"],
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
const platform = new FakeProvider("provider.platform.llm", { output: { frames: [] } });
registry.attach("provider.platform.llm", platform);

// --- 1. BYOK：登记密钥并装配 Provider（structure + ocr 都由 BYOK 承担） -------

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
  { api_key: vault.resolveFor(TEACHER, entry.entry_id).api_key, transport: deterministicStudioTransport },
);
assert.match(byokProviderId, /^provider\.byok\./);
pass(`BYOK 登记：掩码 ${vault.list(TEACHER)[0].masked_key}（明文零泄露），Provider ${byokProviderId} 装配（structure+ocr）`);

const gateway = new ProviderGateway(registry);
const drafts = new StudioDrafts({
  accountStore: accounts,
  gateway,
  clock,
  preferProviderIds: [byokProviderId],
});
const market = new MarketService({ accountStore: accounts, entitlementStore: entitlements, clock });
const studio = new StudioService({ drafts, market, clock });

// --- 2. 模板加速器：预设模板一键预填 → 草稿可编译可试运行（§6.2 可选起点） ----

assert.ok(STUDIO_TEMPLATES.length >= 3, "at least 3 presets");
const dialogueTpl = templateById("tpl.scenario-dialogue");
assert.ok(dialogueTpl, "scenario-dialogue preset exists");
const tplDraft = await drafts.createDraft(TEACHER, {
  source: { kind: "text", text: dialogueTpl.prefilled_text, language: "de-DE", title: dialogueTpl.title_suggestion },
  cefrLevel: dialogueTpl.cefr_suggestion,
});
assert.equal(tplDraft.status, "structured");
assert.ok(tplDraft.units.length >= 3, "template prefill yields units");
const tplTrial = runSandboxTrial(tplDraft.material_pack, tplDraft.manifest, { clock });
assert.equal(tplTrial.status, "completed");
pass(`模板加速器：「${dialogueTpl.title}」一键预填 → ${tplDraft.units.length} 课，草稿可编译（沙箱 ${tplTrial.steps_completed} 步 completed）`);

// --- 3. PNG/OCR 摄入：图片 → OCR 提取 → 结构化（全部走 BYOK，平台零调用） -----

function pngStub(text) {
  return new TextEncoder().encode(`%PNG-STUB\n${text}`);
}
const CAFE_TEXT = [
  "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
  "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
  "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
].join("\n");

const ocrDraft = await drafts.createDraft(TEACHER, {
  source: { kind: "image", bytes: pngStub(CAFE_TEXT), language: "de-DE", title: "Café Notizzettel" },
  cefrLevel: "A2",
});
assert.equal(ocrDraft.status, "structured");
assert.equal(ocrDraft.units.length, 3);
assert.equal(ocrDraft.structured_by.provider_id, byokProviderId, "structuring via BYOK");
assert.equal(ocrDraft.ocr_by.provider_id, byokProviderId, "OCR via BYOK");
assert.equal(platform.requests.length, 0, "platform compute stays at zero calls");
pass(`PNG 摄入：图片 OCR → ${ocrDraft.units.length} 课（OCR/结构化均走 BYOK，平台零调用）`);

// --- 4. 专家模式：自定义训练模式（听写）绕过向导直接编辑 ----------------------

const EXPERT_MODES = JSON.stringify({
  modes: [
    {
      mode_ref: "mode.expert.dictation",
      claim_suffix: "checkin_dialogue",
      steps: [
        { primitive: "present", prompt_prefix: "Diktat: " },
        { primitive: "capture_text", timeout_ms: 45000, max_length: 300 },
        { primitive: "evaluate" },
        { primitive: "feedback" },
        { primitive: "schedule", interval: "PT12H" },
      ],
    },
  ],
  stage_modes: { "frame.1": "mode.expert.dictation" },
});

// 反例 1：非 JSON → 教学化错误（不暴露技术细节）
assert.throws(
  () => drafts.editTrainingModes(TEACHER, ocrDraft.draft_id, "{not json"),
  (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /不是有效的 JSON/.test(e.message),
);
// 反例 2：两个作答步骤 → 守卫拒绝
const twoCaptures = JSON.parse(EXPERT_MODES);
twoCaptures.modes[0].steps.splice(3, 0, { primitive: "capture_text" });
assert.throws(
  () => drafts.editTrainingModes(TEACHER, ocrDraft.draft_id, JSON.stringify(twoCaptures)),
  (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /恰好包含一个学员作答步骤/.test(e.message),
);
// 反例 3：清单未声明的 claim → 编译门禁教学化拒绝
const unknownClaim = JSON.parse(EXPERT_MODES);
unknownClaim.modes[0].claim_suffix = "claim_never_declared";
assert.throws(
  () => drafts.editTrainingModes(TEACHER, ocrDraft.draft_id, JSON.stringify(unknownClaim)),
  (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /编译检查/.test(e.message),
);
pass("专家模式反例：非 JSON / 双作答步骤 / 未声明 claim → 全部教学化拒绝（draft_schema_invalid，不暴露技术细节）");

const expertDraft = drafts.editTrainingModes(TEACHER, ocrDraft.draft_id, EXPERT_MODES);
assert.equal(expertDraft.expert_edited, true);
const envelope = expertDraft.manifest.extensions["llos.training-modes"];
assert.ok(envelope, "training-modes extension envelope present");
assert.match(envelope.payload_ref.uri, /templates\/training-modes$/);
pass(`训练模式定义已写入 manifest extensions（sha256 信封 ${envelope.payload_ref.sha256.slice(0, 12)}…）`);

// 反例 4：专家编辑后向导编辑被锁定（防静默覆盖）
assert.throws(
  () => drafts.edit(TEACHER, ocrDraft.draft_id, { title: "Neu" }),
  (e) => e instanceof StudioError && e.code === "draft_state_invalid" && /专家模式/.test(e.message),
);
pass("专家编辑后向导编辑被锁定（draft_state_invalid，提示继续用专家模式或重新创建）");

// --- 5. 沙箱试用：自定义听写模式在沙箱中完整跑通 ------------------------------

const expertTrial = runSandboxTrial(expertDraft.material_pack, expertDraft.manifest, {
  clock,
  trainingModes: EXPERT_MODES,
});
assert.equal(expertTrial.status, "completed");
assert.equal(expertTrial.outcome, "success");
assert.equal(expertTrial.real_event_store_used, false);
assert.equal(events.events().length, 0, "sandbox appended nothing to the real store");
pass(`沙箱（专家模式）：自定义听写模式 ${expertTrial.steps_completed} 步 completed，${expertTrial.events_appended} 条事件只进丢弃式收集器`);

// --- 6. 发布：专家模式课程上架市场 --------------------------------------------

drafts.confirm(TEACHER, ocrDraft.draft_id);
const published = await studio.publishDraft(TEACHER, ocrDraft.draft_id, {
  listing: {
    summary: "Diktat-Modus für Café-Situationen.",
    difficulty: "A2",
    tags: ["Diktat", "Anfänger"],
    pricing: { model: "free" },
  },
  acknowledged_delist_terms: true,
});
assert.equal(published.first_publish, true);
assert.equal(market.query({ language: "de" }).length, 1);
pass(`发布：专家模式 DLC ${published.listing.dlc_ref.dlc_id} 上架（v${published.version}）`);

// --- 7. 学员获取 + 真实训练：编译产物含自定义听写步骤序列 -----------------------

const acquired = market.acquireFree(STUDENT, published.listing.listing_id);
assert.equal(acquired.already_acquired, false);
const resource = dlcResourceRef(expertDraft.manifest.dlc_id);
assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T10:00:00Z"), "entitlement granted in Core");

const publishedDraft = drafts.get(TEACHER, ocrDraft.draft_id);
const { executable, snapshot } = compileDraft(publishedDraft.material_pack, publishedDraft.manifest, {
  clock,
  trainingModes: EXPERT_MODES,
});
// 编译产物必须包含自定义听写模式的完整原语序列（present → capture_text → evaluate → feedback → schedule）
// Studio 草稿的 stage id 为 frame.N；"frame.1" 由 stage_modes 映射到自定义模式。
const scenarioSteps = executable.program.steps.filter((s) => s.step_id.startsWith("frame.1."));
assert.ok(scenarioSteps.length > 0, "custom stage lowered to steps");
assert.deepStrictEqual(
  scenarioSteps.map((s) => s.primitive),
  ["present", "capture_text", "evaluate", "feedback", "schedule"],
  "custom dictation mode lowered to the closed primitive sequence",
);
assert.ok(
  scenarioSteps.some((s) => s.primitive === "present" && s.present.prompt.startsWith("Diktat: ")),
  "custom present prompt survives lowering",
);
pass("学员训练：编译产物含自定义听写模式步骤序列（present/capture_text/evaluate/feedback/schedule，prompt 透传）");

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
  { learner_ref: STUDENT, session_ref: "session.p7.dictation", composition },
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
        measurement_confidence: 0.91,
      }),
    },
    fsrsScheduler: () => undefined,
  },
);
let state = executor.start();
while (state.status === "awaiting_input") {
  state = executor.advance({
    payload_ref: `artifact://responses/session.p7.dictation/${state.step_id}`,
    payload_sha256: snapshot.content_sha256,
  });
}
assert.equal(state.status, "completed");
assert.ok(events.events().length > 0, "real learning events appended through Core only");
pass(`学员真实训练：自定义听写模式会话 completed（${events.events().length} 条真实学习事件入 Core 存储）`);

// --- 8. 修订：专家模式 DLC 修订草稿继承训练模式定义并自动版本更新 --------------

const revision = drafts.startRevision(TEACHER, ocrDraft.draft_id);
assert.equal(revision.training_modes_json, EXPERT_MODES, "revision inherits the expert definition");
assert.equal(revision.expert_edited, true);
drafts.confirm(TEACHER, revision.draft_id);
const update = await studio.publishDraft(TEACHER, revision.draft_id, {
  listing: { summary: "Diktat-Modus v2.", pricing: { model: "free" } },
  acknowledged_delist_terms: true,
});
assert.equal(update.first_publish, false);
assert.equal(update.version, "0.1.1", "text-only expert revision bumps patch, not major");
assert.ok(entitlements.has(STUDENT, resource, "2026-08-17T00:00:00Z"), "existing owner follows the update (§6.8)");
pass(`修订发布：专家模式草稿修订继承训练模式定义 → 自动 patch v0.1.1（创作者不接触版本号），存量学员授权跟随`);

// --- 9. 下架：停止新获取，存量学员保留（§6.9） --------------------------------

const delisted = studio.delist(TEACHER, ocrDraft.draft_id);
assert.ok(delisted.delisted_at.length > 0);
assert.throws(
  () => market.acquireFree("student.late.p7", published.listing.listing_id),
  (e) => e instanceof MarketError && e.code === "listing_delisted",
);
const kept = market.acquireFree(STUDENT, published.listing.listing_id);
assert.equal(kept.already_acquired, true);
assert.ok(entitlements.has(STUDENT, resource, "2026-08-18T00:00:00Z"), "owner's entitlement never revoked");
assert.equal(market.query().length, 0, "catalog hides the delisted listing");
pass("下架：新学员获取被拒（listing_delisted）；存量学员幂等保留、授权未回收；目录隐藏");

console.log(`\nP7 E2E PASS — ${step} 步全部通过：模板加速器 → PNG/OCR 摄入（BYOK 零平台）→ 专家模式自定义训练模式（守卫+教学化错误）→ 沙箱 → 发布 → 学员真实训练（自定义步骤序列）→ 修订继承 → 下架。`);
