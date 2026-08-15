const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
} = require("@llos/gateway");
const {
  StudioDrafts,
  ingestSource,
  parseStructuredOutput,
  fakePdfTextExtractor,
  deterministicStructureTransport,
  translateSchemaErrors,
  StudioError,
} = require("../dist/index.js");
const { InMemoryAccountStore } = require("@llos/core");

const KEY = "sk-byok-studio-0123456789abcdef";
const ENTRY = { entry_id: "byok.1", provider_family: "deepseek", label: "Lehrer-Key" };

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

function setup() {
  const accounts = new InMemoryAccountStore();
  const registry = new ProviderRegistry();
  registry.register(platformDescriptor());
  const platform = new FakeProvider("provider.platform.llm", { output: { frames: [] } });
  registry.attach("provider.platform.llm", platform);
  const { adapter } = registerByokProvider(registry, ENTRY, {
    api_key: KEY,
    transport: deterministicStructureTransport,
  });
  const gateway = new ProviderGateway(registry);
  const drafts = new StudioDrafts({
    accountStore: accounts,
    gateway,
    clock: () => "2026-08-16T10:00:00Z",
    preferProviderIds: [adapter.provider_id],
  });
  accounts.createAccount("teacher.studio", "teacher_verified");
  return { accounts, gateway, platform, adapter, drafts };
}

test("text ingest structures via the creator BYOK provider, platform compute untouched (§6.5)", async () => {
  const { drafts, platform, adapter } = setup();
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
    cefrLevel: "A2",
  });
  assert.equal(draft.status, "structured");
  assert.equal(draft.structured_by.provider_id, adapter.provider_id, "BYOK provider did the structuring");
  assert.equal(platform.requests.length, 0, "platform compute must stay at zero calls");
  assert.equal(draft.units.length, 3);
  assert.deepEqual(
    draft.units.map((u) => u.frame_type),
    ["scenario", "argument_structure", "concept"],
  );
  assert.equal(draft.units[1].lemma, "empfehlen");
});

test("ingested draft produces schema-valid Material Pack and DLC manifest", async () => {
  const { drafts } = setup();
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
    cefrLevel: "A2",
    description: "Café-Situationen für Anfänger.",
  });
  const { validate } = require("@llos/contracts");
  assert.equal(validate("material-pack", draft.material_pack).valid, true);
  assert.equal(validate("dlc-manifest", draft.manifest).valid, true);
  assert.equal(draft.material_pack.lifecycle, "private_saved");
  assert.equal(draft.material_pack.provenance.generation_runs[0].provider_id, draft.structured_by.provider_id);
  // 素材包不含教学顺序，教学声明在 manifest（不变量：DLC 是编译器）
  assert.ok(!JSON.stringify(draft.material_pack).includes("teaching"));
});

test("pdf source goes through the fake PDF port (first-gen deterministic)", async () => {
  const { drafts } = setup();
  const bytes = new TextEncoder().encode(`%PDF-STUB\n${CAFE_TEXT}`);
  const text = await fakePdfTextExtractor(bytes);
  assert.ok(!text.includes("%PDF-STUB"), "stub marker stripped");
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "pdf", bytes, language: "de-DE", title: "Café Deutsch (PDF)" },
    cefrLevel: "A2",
  });
  assert.equal(draft.units.length, 3);
});

test("empty ingest source is rejected with a teaching-language message", async () => {
  const { gateway } = setup();
  await assert.rejects(
    ingestSource({ kind: "text", text: "   ", language: "de-DE", title: "x" }, { gateway }),
    (e) => e instanceof StudioError && e.code === "ingest_source_empty",
  );
});

test("provider output shape is strictly validated at the system boundary", () => {
  assert.throws(
    () => parseStructuredOutput({ frames: [] }),
    (e) => e.code === "structure_output_invalid",
  );
  assert.throws(
    () => parseStructuredOutput({ frames: [{ frame_type: "scenario" }] }),
    (e) => e.code === "structure_output_invalid",
  );
  assert.throws(
    () => parseStructuredOutput({ frames: [{ frame_type: "haiku", title: "t", pattern: "p" }] }),
    (e) => e.code === "structure_output_invalid",
  );
  const ok = parseStructuredOutput({
    frames: [{ frame_type: "scenario", title: "T", pattern: "P" }],
  });
  assert.equal(ok.units[0].unit_no, 1);
});

test("schema errors translate into teaching language, never raw tech errors (§6.2)", () => {
  const translated = translateSchemaErrors("material-pack", [
    "/semantic_frames/0/titles must have required property 'text'",
  ]);
  assert.ok(translated[0].includes("第 1 课"), "mentions the lesson number");
  assert.ok(translated[0].includes("缺少"), "explains what is missing");
  assert.ok(!translated[0].includes("semantic_frames"), "no raw schema path leaks");
});

test("create_dlc_draft capability gate", async () => {
  const { accounts, drafts } = setup();
  accounts.createAccount("student.nodraft");
  accounts.revoke("student.nodraft", "create_dlc_draft");
  await assert.rejects(
    drafts.createDraft("student.nodraft", {
      source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "x" },
      cefrLevel: "A2",
    }),
    (e) => e.code === "capability_missing",
  );
});
