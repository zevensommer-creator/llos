const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
} = require("@llos/gateway");
const { InMemoryAccountStore, InMemoryEventStore } = require("@llos/core");
const { validate } = require("@llos/contracts");
const {
  StudioDrafts,
  StudioService,
  runSandboxTrial,
  compileDraft,
  SANDBOX_LEARNER_REF,
  StudioError,
  deterministicStructureTransport,
  bumpVersion,
  decideVersionBump,
} = require("../dist/index.js");

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

async function setup() {
  const accounts = new InMemoryAccountStore();
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
  const drafts = new StudioDrafts({
    accountStore: accounts,
    gateway,
    clock: () => "2026-08-16T10:00:00Z",
    preferProviderIds: [adapter.provider_id],
  });
  accounts.createAccount("teacher.studio", "teacher_verified");
  accounts.createAccount("colleague.other", "teacher_verified");
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
    cefrLevel: "A2",
  });
  return { accounts, drafts, draft };
}

test("draft lifecycle: edit → confirm rebuilds and revalidates the draft", async () => {
  const { drafts, draft } = await setup();
  const edited = drafts.edit("teacher.studio", draft.draft_id, {
    title: "Café Deutsch A2+",
    units: [
      ...draft.units.slice(0, 2),
      { unit_no: 3, frame_type: "concept", title: "Höfliche Bitte", pattern: "Könnten Sie bitte … ?" },
    ],
  });
  assert.equal(edited.manifest.display_name, "Café Deutsch A2+");
  assert.equal(validate("material-pack", edited.material_pack).valid, true);
  assert.equal(validate("dlc-manifest", edited.manifest).valid, true);

  const confirmed = drafts.confirm("teacher.studio", draft.draft_id);
  assert.equal(confirmed.status, "confirmed");

  const discarded = await setup();
  const thrown = drafts.discard("teacher.studio", discarded.draft.draft_id);
  assert.equal(thrown.status, "discarded");
});

test("draft isolation: another creator cannot read or edit someone else's draft", async () => {
  const { drafts, draft } = await setup();
  assert.throws(
    () => drafts.get("colleague.other", draft.draft_id),
    (e) => e.code === "not_draft_owner",
  );
  assert.throws(
    () => drafts.confirm("colleague.other", draft.draft_id),
    (e) => e.code === "not_draft_owner",
  );
});

test("sandbox trial compiles and runs to completion without real learning events (§6.4)", async () => {
  const { draft } = await setup();
  const report = runSandboxTrial(draft.material_pack, draft.manifest, {
    clock: () => "2026-08-16T10:05:00Z",
  });
  assert.equal(report.sandbox, true);
  assert.equal(report.compiled, true);
  assert.equal(report.status, "completed");
  assert.equal(report.outcome, "success");
  assert.ok(report.events_appended > 0, "sandbox walk produces events in the throwaway sink");
  assert.equal(report.real_event_store_used, false);
  const realStore = new InMemoryEventStore();
  assert.equal(realStore.events().length, 0, "no real store was ever wired into the sandbox");
  assert.ok(report.ir_id.startsWith("ir.executable."));
});

test("sandbox works with a failing simulated learner too (evaluation is still evidence-based)", async () => {
  const { draft } = await setup();
  const report = runSandboxTrial(draft.material_pack, draft.manifest, {
    clock: () => "2026-08-16T10:05:00Z",
    evaluatorOutcome: "failure",
  });
  assert.equal(report.status, "completed", "failure outcome does not corrupt the walk");
});

test("compile gate rejects drafts whose material cannot compile", async () => {
  const { draft } = await setup();
  // 断引用：fact 指向不存在的词条 → material_reference_broken
  const broken = structuredClone(draft.material_pack);
  broken.pack_id = "material.broken";
  broken.semantic_frames[0].facts.push({
    subject: "focus_lexeme",
    predicate: "lemma",
    object: { kind: "ref", ref: "lex.missing" },
  });
  assert.throws(
    () => compileDraft(broken, draft.manifest, { clock: () => "2026-08-16T10:00:00Z" }),
    (e) => e.code === "sandbox_compile_failed",
  );
});

test("invisible versioning: patch / minor / major decisions (§6.7)", async () => {
  assert.equal(bumpVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(bumpVersion("0.1.9", "minor"), "0.2.0");
  assert.equal(bumpVersion("1.2.3", "major"), "2.0.0");

  const { draft } = await setup();

  // patch：只改文案
  const copyEdit = structuredClone(draft.material_pack);
  copyEdit.display_name = "Café Deutsch (überarbeitet)";
  assert.equal(decideVersionBump(
    { pack: draft.material_pack, manifest: draft.manifest },
    { pack: copyEdit, manifest: draft.manifest },
  ).kind, "patch");

  // minor：新增单元
  const added = structuredClone(draft.material_pack);
  added.semantic_frames.push({
    id: "frame.4",
    frame_type: "concept",
    titles: [{ language: "de-DE", text: "Zahlen" }],
    communicative_intents: ["make_statement"],
    participants: [{ id: "speaker", role: "requester" }],
    facts: [
      { subject: "construction", predicate: "surface_pattern", object: { kind: "string", string: "Das macht drei Euro." } },
    ],
    lexical_candidates: [],
    asset_refs: [],
  });
  assert.equal(decideVersionBump(
    { pack: draft.material_pack, manifest: draft.manifest },
    { pack: added, manifest: draft.manifest },
  ).kind, "minor");

  // major：教学结构变化（claims 增删）
  const retaught = structuredClone(draft.manifest);
  retaught.claims = retaught.claims.slice(0, 2);
  assert.equal(decideVersionBump(
    { pack: draft.material_pack, manifest: draft.manifest },
    { pack: draft.material_pack, manifest: retaught },
  ).kind, "major");
});
