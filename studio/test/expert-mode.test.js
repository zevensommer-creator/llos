"use strict";

// P7b 专家模式（product_spec §6.6）：训练模式 + manifest 直接编辑。
// Risks: (1) 专家编辑必须过与发布相同的编译门禁（含 sha256 信封解析）；
// (2) 专家编辑后向导编辑必须锁定（覆盖会静默丢失专家内容）；
// (3) 面向创作者的错误必须教学化（§6.2 不暴露技术细节）；
// (4) 专家模式草稿必须能走完 confirm → publish 全链路；
// (5) 修订草稿必须保留训练模式定义，否则发布编译必失败。

const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
} = require("@llos/gateway");
const {
  InMemoryAccountStore,
  InMemoryEntitlementStore,
} = require("@llos/core");
const { MarketService } = require("@llos/market");
const { validate } = require("@llos/contracts");
const {
  StudioDrafts,
  StudioService,
  runSandboxTrial,
  StudioError,
  deterministicStructureTransport,
} = require("../dist/index.js");

const KEY = "sk-byok-studio-0123456789abcdef";
const ENTRY = { entry_id: "byok.1", provider_family: "deepseek", label: "Lehrer-Key" };
const TEACHER = "teacher.studio";

const CAFE_TEXT = [
  "Szenario: Im Café bestellen | Ich hätte gern einen Kaffee, bitte.",
  "Valenz: empfehlen | Der Kellner empfiehlt uns den Kuchen. | empfehlen",
  "Konstruktion: Höfliche Bitte | Könnten Sie bitte das Wasser bringen?",
].join("\n");

function platformDescriptor() {
  return {
    schema_version: "0.2.0",
    provider_id: "provider.platform.llm",
    version: "0.1.0",
    display_name: "Platform LLM",
    description: "Platform fallback provider.",
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
  };
}

async function setup() {
  const accounts = new InMemoryAccountStore();
  const entitlements = new InMemoryEntitlementStore();
  const registry = new ProviderRegistry();
  registry.register(platformDescriptor());
  registry.attach(
    "provider.platform.llm",
    new FakeProvider("provider.platform.llm", { output: { frames: [] } }),
  );
  const { adapter } = registerByokProvider(registry, ENTRY, {
    api_key: KEY,
    transport: deterministicStructureTransport,
  });
  const gateway = new ProviderGateway(registry);
  let tick = 0;
  const clock = () =>
    new Date(Date.parse("2026-08-16T10:00:00Z") + tick++ * 1000).toISOString();
  const drafts = new StudioDrafts({
    accountStore: accounts,
    gateway,
    clock,
    preferProviderIds: [adapter.provider_id],
  });
  const market = new MarketService({ accountStore: accounts, entitlementStore: entitlements, clock });
  const studio = new StudioService({ drafts, market, clock });
  accounts.createAccount(TEACHER, "teacher_verified");
  const draft = await drafts.createDraft(TEACHER, {
    source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
    cefrLevel: "A2",
  });
  return { accounts, entitlements, drafts, market, studio, draft };
}

// Studio 草稿的 stage 是 frame.N；claims 后缀由 buildManifestDraft 生成。
function expertModesPayload({ claimSuffix = "checkin_dialogue" } = {}) {
  return {
    modes: [
      {
        mode_ref: "mode.expert.dictation",
        claim_suffix: claimSuffix,
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
  };
}

test("expert training modes: valid definition binds into manifest extensions via sha256", async () => {
  const { drafts, draft } = await setup();
  const modesJson = JSON.stringify(expertModesPayload());
  const edited = drafts.editTrainingModes(TEACHER, draft.draft_id, modesJson);

  assert.equal(edited.expert_edited, true);
  assert.equal(edited.status, "structured", "expert edits reset back to structured");
  assert.equal(edited.training_modes_json, modesJson);
  const envelope = edited.manifest.extensions["llos.training-modes"];
  assert.ok(envelope, "extension envelope present");
  assert.match(envelope.payload_ref.uri, /templates\/training-modes$/);
  const { createHash } = require("node:crypto");
  const expected = createHash("sha256").update(modesJson, "utf8").digest("hex");
  assert.equal(envelope.payload_ref.sha256, expected, "envelope hash binds the edited content");
  assert.equal(validate("dlc-manifest", edited.manifest).valid, true);
});

test("expert training modes: sandbox trial runs the custom mode without real events", async () => {
  const { drafts, draft } = await setup();
  const modesJson = JSON.stringify(expertModesPayload());
  drafts.editTrainingModes(TEACHER, draft.draft_id, modesJson);
  const report = runSandboxTrial(draft.material_pack, draft.manifest, {
    clock: () => "2026-08-16T10:05:00Z",
    trainingModes: modesJson,
  });
  assert.equal(report.status, "completed");
  assert.equal(report.outcome, "success");
  assert.ok(report.events_appended > 0);
  assert.equal(report.real_event_store_used, false);
});

test("expert edits lock the wizard path; wizard edits must not silently overwrite", async () => {
  const { drafts, draft } = await setup();
  drafts.editTrainingModes(TEACHER, draft.draft_id, JSON.stringify(expertModesPayload()));

  assert.throws(
    () => drafts.edit(TEACHER, draft.draft_id, { title: "Neu" }),
    (e) => e instanceof StudioError && e.code === "draft_state_invalid" && /专家模式/.test(e.message),
  );
  assert.throws(
    () => drafts.confirm(TEACHER, draft.draft_id, { title: "Neu" }),
    (e) => e.code === "draft_state_invalid",
  );
  // 不带向导编辑的 confirm 是专家模式的正确确认路径。
  const confirmed = drafts.confirm(TEACHER, draft.draft_id);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.expert_edited, true);
});

test("expert training modes: creator-facing errors are pedagogical, not technical (§6.2)", async () => {
  const { drafts, draft } = await setup();

  assert.throws(
    () => drafts.editTrainingModes(TEACHER, draft.draft_id, "{not json"),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /不是有效的 JSON/.test(e.message),
  );

  const twoCaptures = expertModesPayload();
  twoCaptures.modes[0].steps.splice(3, 0, { primitive: "capture_text" });
  assert.throws(
    () => drafts.editTrainingModes(TEACHER, draft.draft_id, JSON.stringify(twoCaptures)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /恰好包含一个学员作答步骤/.test(e.message),
  );

  // claim 后缀语法合法但清单未声明 → 编译门禁给出教学化错误。
  const unknownClaim = expertModesPayload({ claimSuffix: "claim_never_declared" });
  assert.throws(
    () => drafts.editTrainingModes(TEACHER, draft.draft_id, JSON.stringify(unknownClaim)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /编译检查/.test(e.message),
  );
});

test("expert manifest editing: display copy edits pass, identity and schema are guarded", async () => {
  const { drafts, draft } = await setup();
  const manifest = structuredClone(draft.manifest);
  manifest.display_name = "Café Deutsch — Expert";

  const edited = drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(manifest));
  assert.equal(edited.expert_edited, true);
  assert.equal(edited.manifest.display_name, "Café Deutsch — Expert");
  assert.equal(edited.status, "structured");

  const stolen = structuredClone(draft.manifest);
  stolen.dlc_id = "dlc.studio.other";
  assert.throws(
    () => drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(stolen)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /dlc_id/.test(e.message),
  );

  const broken = structuredClone(draft.manifest);
  delete broken.supported_languages;
  assert.throws(
    () => drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(broken)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /暂不满足格式要求/.test(e.message),
  );

  // schema 合法但破坏编译链（删掉编译 pass）→ 编译门禁拒绝。
  const uncompilable = structuredClone(draft.manifest);
  uncompilable.passes = uncompilable.passes.slice(0, 1);
  assert.throws(
    () => drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(uncompilable)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /编译检查/.test(e.message),
  );
});

test("expert manifest editing cannot drop the training-modes extension while a payload exists (T-036 atomic consistency)", async () => {
  const { drafts, draft } = await setup();
  drafts.editTrainingModes(TEACHER, draft.draft_id, JSON.stringify(expertModesPayload()));

  // schema 合法但删除了训练模式扩展 → payload 仍在，必须被原子一致性守卫拒绝。
  const stripped = structuredClone(draft.manifest);
  delete stripped.extensions;
  assert.throws(
    () => drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(stripped)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /训练模式扩展缺失/.test(e.message),
  );
});

test("expert manifest editing cannot add a training-modes extension without a payload (T-036 atomic consistency)", async () => {
  const { drafts, draft } = await setup();
  const injected = structuredClone(draft.manifest);
  injected.extensions = {
    "llos.training-modes": {
      schema_id: "llos.training-modes",
      schema_version: "0.1.0",
      payload_ref: {
        uri: `artifact://dlc/${draft.manifest.dlc_id}/templates/training-modes`,
        sha256: "0".repeat(64),
      },
    },
  };
  assert.throws(
    () => drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(injected)),
    (e) => e instanceof StudioError && e.code === "draft_schema_invalid" && /没有对应的训练模式定义/.test(e.message),
  );
});

test("saving the manifest after training modes preserves the extension and still compiles (T-036)", async () => {
  const { drafts, draft } = await setup();
  const modesJson = JSON.stringify(expertModesPayload());
  drafts.editTrainingModes(TEACHER, draft.draft_id, modesJson);

  const manifest = structuredClone(drafts.get(TEACHER, draft.draft_id).manifest);
  manifest.display_name = "Café Deutsch (edited)";
  const edited = drafts.editManifest(TEACHER, draft.draft_id, JSON.stringify(manifest));
  assert.equal(edited.training_modes_json, modesJson, "payload preserved across manifest edit");
  const envelope = edited.manifest.extensions["llos.training-modes"];
  assert.ok(envelope, "extension preserved across manifest edit");
  const report = runSandboxTrial(edited.material_pack, edited.manifest, {
    clock: () => "2026-08-16T10:05:00Z",
    trainingModes: modesJson,
  });
  assert.equal(report.status, "completed", "custom mode still runs after manifest edit");
});

test("expert mode full path: custom-mode DLC publishes to the market (T-034 acceptance)", async () => {
  const { drafts, market, studio, draft } = await setup();
  drafts.editTrainingModes(TEACHER, draft.draft_id, JSON.stringify(expertModesPayload()));
  drafts.confirm(TEACHER, draft.draft_id);

  const result = await studio.publishDraft(TEACHER, draft.draft_id, {
    listing: { summary: "Diktat-Modus für Fortgeschrittene.", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });
  assert.equal(result.first_publish, true);
  assert.equal(result.version, "0.1.0");
  assert.equal(market.query({ language: "de" }).length, 1);
});

test("revisions of an expert-mode DLC keep the training-mode definition", async () => {
  const { drafts, market, studio, draft } = await setup();
  const modesJson = JSON.stringify(expertModesPayload());
  drafts.editTrainingModes(TEACHER, draft.draft_id, modesJson);
  drafts.confirm(TEACHER, draft.draft_id);
  const first = await studio.publishDraft(TEACHER, draft.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });

  const revision = drafts.startRevision(TEACHER, draft.draft_id);
  assert.equal(revision.training_modes_json, modesJson, "revision inherits the expert definition");
  assert.equal(revision.expert_edited, true);

  // 专家修订：仅改文案 → patch；训练模式定义原样保留，发布编译必须通过。
  const manifest = structuredClone(revision.manifest);
  manifest.display_name = "Café Deutsch (2027)";
  drafts.editManifest(TEACHER, revision.draft_id, JSON.stringify(manifest));
  drafts.confirm(TEACHER, revision.draft_id);
  const update = await studio.publishDraft(TEACHER, revision.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });
  assert.equal(update.bump.kind, "patch");
  assert.equal(update.version, "0.1.1");
  assert.equal(market.view(first.listing.listing_id).listing.dlc_ref.version, "0.1.1");
});
