const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  byokDescriptorFor,
  byokProviderId,
  registerByokProvider,
  BYOK_CAPABILITY_ID,
} = require("../dist/index.js");

const KEY = "sk-byok-0123456789abcdef";
const ENTRY = { entry_id: "byok.1", provider_family: "deepseek", label: "我的 key" };

function platformDescriptor() {
  return {
    schema_version: "0.2.0",
    provider_id: "provider.platform.llm",
    version: "0.1.0",
    display_name: "Platform LLM",
    description: "Platform-managed fallback provider.",
    execution: {
      mode: "remote",
      adapter_entrypoint: "platform:Adapter",
      network_required: true,
      credential_ref_names: [],
      sandbox_required: false,
    },
    capabilities: [
      {
        capability_id: BYOK_CAPABILITY_ID,
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
  const registry = new ProviderRegistry();
  registry.register(platformDescriptor());
  const platform = new FakeProvider("provider.platform.llm", { output: { structured: false } });
  registry.attach("provider.platform.llm", platform);
  const gateway = new ProviderGateway(registry);
  return { registry, gateway, platform };
}

test("byok descriptor passes contract validation and never contains key material", () => {
  const { registry } = setup();
  const descriptor = registry.register(byokDescriptorFor(ENTRY));
  assert.equal(descriptor.provider_id, byokProviderId(ENTRY));
  assert.ok(descriptor.provider_id.startsWith("provider.byok.deepseek."));
  const serialized = JSON.stringify(descriptor);
  assert.ok(!serialized.includes(KEY), "descriptor must not embed the api key");
  assert.deepEqual(descriptor.execution.credential_ref_names, ["BYOK_API_KEY"]);
});

test("byok descriptor declares privacy level for the creator (product_spec §6.5)", () => {
  const { registry } = setup();
  const descriptor = registry.register(byokDescriptorFor(ENTRY));
  assert.equal(descriptor.privacy.data_leaves_host, true);
  assert.equal(descriptor.privacy.retention, "provider_policy");
  assert.deepEqual(descriptor.privacy.supported_data_classes, [
    "public",
    "internal",
    "personal_text",
  ]);
});

test("prefer_provider_ids routes material.generation to the BYOK provider first", async () => {
  const { registry, gateway, platform } = setup();
  const { adapter } = registerByokProvider(registry, ENTRY, { api_key: KEY });
  const result = await gateway.execute({
    capability_id: BYOK_CAPABILITY_ID,
    operation: "structure",
    language: "de",
    input: "Guten Morgen. Wie geht es dir?",
    prefer_provider_ids: [adapter.provider_id],
  });
  assert.equal(result.provider_id, adapter.provider_id);
  assert.equal(result.output.family, "deepseek");
  assert.equal(result.output.operation, "structure");
  assert.equal(platform.requests.length, 0, "platform compute must stay untouched (§6.5)");
  // adapter proves it holds the key without ever exposing it
  assert.match(adapter.key_fingerprint, /^[0-9a-f]{8}$/);
});

test("byok provider failure falls back to the platform provider", async () => {
  const { registry, gateway } = setup();
  const { adapter } = registerByokProvider(registry, ENTRY, {
    api_key: KEY,
    transport: () => {
      throw new Error("byok key quota exceeded");
    },
  });
  const result = await gateway.execute({
    capability_id: BYOK_CAPABILITY_ID,
    operation: "structure",
    language: "de",
    input: "text",
    prefer_provider_ids: [adapter.provider_id],
  });
  assert.equal(result.provider_id, "provider.platform.llm");
});

test("without prefer_provider_ids the default resolution order stays intact", async () => {
  const { registry, gateway } = setup();
  registerByokProvider(registry, ENTRY, { api_key: KEY });
  const result = await gateway.execute({
    capability_id: BYOK_CAPABILITY_ID,
    operation: "structure",
    language: "de",
    input: "text",
  });
  assert.equal(result.provider_id, "provider.platform.llm");
});
