const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
  byokDescriptorFor,
} = require("@llos/gateway");
const {
  StudioDrafts,
  StudioError,
  ingestSource,
  parseOcrOutput,
} = require("../dist/index.js");
const { deterministicStudioTransport } = require("./fixtures/deterministic-transport.js");
const { InMemoryAccountStore } = require("@llos/core");
const { validate } = require("@llos/contracts");

const KEY = "sk-byok-ocr-0123456789abcdef";
const ENTRY = { entry_id: "byok.ocr.1", provider_family: "deepseek", label: "Lehrer-Key" };

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
    description: "Platform fallback provider (no OCR operation declared in first gen).",
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
    transport: deterministicStudioTransport,
  });
  const gateway = new ProviderGateway(registry);
  const drafts = new StudioDrafts({
    accountStore: accounts,
    gateway,
    clock: () => "2026-08-16T10:00:00Z",
    preferProviderIds: [adapter.provider_id],
  });
  accounts.createAccount("teacher.studio", "teacher_verified");
  return { accounts, registry, gateway, platform, adapter, drafts };
}

function pngStub(text) {
  return new TextEncoder().encode(`%PNG-STUB\n${text}`);
}

test("png ingest: OCR + structuring both stay on the BYOK provider, platform untouched (§6.5)", async () => {
  const { drafts, platform, adapter } = setup();
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "image", bytes: pngStub(CAFE_TEXT), language: "de-DE", title: "Café Notizzettel" },
    cefrLevel: "A2",
  });
  assert.equal(draft.status, "structured");
  assert.equal(draft.units.length, 3);
  assert.equal(draft.structured_by.provider_id, adapter.provider_id, "structuring used BYOK");
  assert.equal(draft.ocr_by.provider_id, adapter.provider_id, "OCR used BYOK too");
  assert.equal(platform.requests.length, 0, "platform compute must stay at zero calls");
});

test("png ingest produces schema-valid pack and manifest (same gates as text)", async () => {
  const { drafts } = setup();
  const draft = await drafts.createDraft("teacher.studio", {
    source: { kind: "image", bytes: pngStub(CAFE_TEXT), language: "de-DE", title: "Café" },
    cefrLevel: "A2",
  });
  assert.equal(validate("material-pack", draft.material_pack).valid, true);
  assert.equal(validate("dlc-manifest", draft.manifest).valid, true);
});

test("image without readable text is rejected with a teaching-language message", async () => {
  const { gateway } = setup();
  await assert.rejects(
    ingestSource(
      { kind: "image", bytes: pngStub("   \n  "), language: "de-DE", title: "leer" },
      { gateway, preferProviderIds: [] },
    ),
    (e) => e instanceof StudioError && e.code === "ingest_source_empty",
  );
});

test("ocr output shape is strictly validated at the system boundary", () => {
  assert.throws(() => parseOcrOutput(null, "p"), (e) => e.code === "ocr_output_invalid");
  assert.throws(() => parseOcrOutput({}, "p"), (e) => e.code === "ocr_output_invalid");
  assert.throws(() => parseOcrOutput({ text: 42 }, "p"), (e) => e.code === "ocr_output_invalid");
  assert.equal(parseOcrOutput({ text: "Hallo" }, "p"), "Hallo");
});

test("a provider returning garbage OCR output surfaces a teaching-language error", async () => {
  const { registry } = setup();
  const bad = registerByokProvider(
    registry,
    { entry_id: "byok.ocr.bad", provider_family: "mock", label: "bad" },
    { api_key: KEY, transport: () => ({ pages: [] }) },
  );
  const gateway = new ProviderGateway(registry);
  await assert.rejects(
    ingestSource(
      { kind: "image", bytes: pngStub(CAFE_TEXT), language: "de-DE", title: "x" },
      { gateway, preferProviderIds: [bad.provider_id] },
    ),
    (e) =>
      e instanceof StudioError &&
      e.code === "ocr_output_invalid" &&
      e.message.includes("图片文字识别失败") &&
      !e.message.includes("pages"),
  );
});

test("no OCR provider surfaces typed provider_unavailable (not a fake UTF-8 decode)", async () => {
  const registry = new ProviderRegistry();
  registry.register(platformDescriptor());
  registry.attach("provider.platform.llm", new FakeProvider("provider.platform.llm", { output: { frames: [] } }));
  const bareGateway = new ProviderGateway(registry);
  await assert.rejects(
    ingestSource(
      { kind: "image", bytes: pngStub(CAFE_TEXT), language: "de-DE", title: "x" },
      { gateway: bareGateway },
    ),
    (e) => e instanceof StudioError && e.code === "provider_unavailable",
  );
});

test("BYOK descriptor declares the ocr operation and png input (schema-valid)", () => {
  const descriptor = byokDescriptorFor(ENTRY);
  const result = validate("provider-descriptor", descriptor);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const capability = descriptor.capabilities.find((c) => c.capability_id === "material.generation");
  assert.ok(capability.operations.includes("ocr"), "ocr operation declared");
  assert.ok(capability.input_media_types.includes("image/png"), "png media type declared");
});
