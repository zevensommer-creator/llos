const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderRegistryError,
  ProviderGateway,
  GatewayError,
  FakeProvider,
} = require("../dist/index.js");

function capability(overrides = {}) {
  return {
    capability_id: "grammar.feedback",
    kind: "llm",
    operations: ["explain", "generate"],
    languages: ["de-DE"],
    quality_tiers: ["standard"],
    model_refs: ["model-x"],
    ...overrides,
  };
}

function descriptor(overrides = {}) {
  return {
    schema_version: "0.2.0",
    provider_id: "provider.test.alpha",
    version: "0.1.0",
    display_name: "Test Provider Alpha",
    execution: {
      mode: "remote",
      adapter_entrypoint: "providers.test_alpha:Provider",
      network_required: true,
      credential_ref_names: ["TEST_ALPHA_API_KEY"],
    },
    capabilities: [capability()],
    models: [
      {
        model_id: "model-x",
        model_version: "1",
        artifact_or_service_ref: "https://example.invalid/model-x",
        languages: "*",
        precision: "remote_unspecified",
        status: "production",
      },
    ],
    limits: { max_concurrency: 4, request_timeout_ms: 30000 },
    cost_model: {
      currency: "USD",
      effective_at: "2026-08-15T00:00:00Z",
      components: [{ unit: "request", price: 0.001 }],
    },
    privacy: {
      data_leaves_host: true,
      retention: "none",
      training_use: "none",
      supported_data_classes: ["public"],
    },
    license: {
      code_spdx_id: "MIT",
      model_license_status: "service_terms",
      commercial_use: "allowed",
    },
    health: {
      check_kind: "http",
      timeout_ms: 5000,
      failure_threshold: 3,
      recovery_threshold: 2,
    },
    ...overrides,
  };
}

test("registry rejects schema-invalid descriptors with a typed error", () => {
  const registry = new ProviderRegistry();
  const bad = descriptor();
  delete bad.limits;
  assert.throws(
    () => registry.register(bad),
    (e) => e instanceof ProviderRegistryError && e.code === "schema_invalid" && e.errors.length > 0,
  );
});

test("duplicate provider_id and version is rejected", () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  assert.throws(
    () => registry.register(descriptor()),
    (e) => e instanceof ProviderRegistryError && e.code === "duplicate_provider",
  );
});

test("resolve matches capability, operation, language and tier constraints", () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  registry.register(
    descriptor({
      provider_id: "provider.test.wild",
      capabilities: [
        capability({ languages: "*", quality_tiers: ["economy"], operations: ["explain"] }),
      ],
    }),
  );
  registry.register(
    descriptor({
      provider_id: "provider.test.asr",
      capabilities: [capability({ capability_id: "asr.transcribe", kind: "asr", operations: ["transcribe"] })],
    }),
  );

  const german = registry.resolve("grammar.feedback", { language: "de-DE" });
  assert.deepEqual(
    german.map((r) => r.descriptor.provider_id),
    ["provider.test.alpha", "provider.test.wild"],
  );

  const french = registry.resolve("grammar.feedback", { language: "fr-FR" });
  assert.deepEqual(french.map((r) => r.descriptor.provider_id), ["provider.test.wild"]);

  const unsupportedOperation = registry.resolve("grammar.feedback", { operation: "translate" });
  assert.equal(unsupportedOperation.length, 0);

  const premium = registry.resolve("grammar.feedback", { quality_tier: "premium" });
  assert.equal(premium.length, 0);
});

test("language matching accepts primary-subtag declarations", () => {
  const registry = new ProviderRegistry();
  registry.register(
    descriptor({
      provider_id: "provider.test.bare-de",
      capabilities: [capability({ languages: ["de"] })],
    }),
  );
  const matches = registry.resolve("grammar.feedback", { language: "de-AT" });
  assert.equal(matches.length, 1);
});

test("gateway routes a capability request to the provider adapter without brand names", async () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  const fake = new FakeProvider("provider.test.alpha", { output: { ok: true } });
  registry.attach("provider.test.alpha", fake);

  const gateway = new ProviderGateway(registry);
  const result = await gateway.execute({
    capability_id: "grammar.feedback",
    operation: "explain",
    language: "de-DE",
    input: { utterance: "Ich habe Hunger" },
  });

  assert.deepEqual(result.output, { ok: true });
  assert.equal(fake.requests.length, 1);
  const seen = fake.requests[0];
  assert.equal(seen.capability_id, "grammar.feedback");
  assert.equal(seen.operation, "explain");
  assert.ok(!("model" in seen));
  assert.ok(!("brand" in seen));
});

test("unknown capability fails with capability_unavailable", async () => {
  const registry = new ProviderRegistry();
  const gateway = new ProviderGateway(registry);
  await assert.rejects(
    gateway.execute({ capability_id: "translation.free", operation: "translate", input: {} }),
    (e) => e instanceof GatewayError && e.code === "capability_unavailable",
  );
});

test("primary provider failure falls back to the next provider", async () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  registry.register(
    descriptor({
      provider_id: "provider.test.backup",
      capabilities: [capability({ languages: "*" })],
    }),
  );
  const failing = new FakeProvider("provider.test.alpha", { failCalls: 1 });
  const backup = new FakeProvider("provider.test.backup", { output: { from: "backup" } });
  registry.attach("provider.test.alpha", failing);
  registry.attach("provider.test.backup", backup);

  const gateway = new ProviderGateway(registry);
  const result = await gateway.execute({
    capability_id: "grammar.feedback",
    operation: "explain",
    language: "de-DE",
    input: {},
  });
  assert.equal(result.provider_id, "provider.test.backup");
  assert.deepEqual(result.output, { from: "backup" });
});

test("all providers failing raises all_providers_failed with attempts", async () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  registry.register(
    descriptor({
      provider_id: "provider.test.backup",
      capabilities: [capability({ languages: "*" })],
    }),
  );
  registry.attach("provider.test.alpha", new FakeProvider("provider.test.alpha", { failCalls: 1 }));
  registry.attach("provider.test.backup", new FakeProvider("provider.test.backup", { failCalls: 5 }));

  const gateway = new ProviderGateway(registry);
  await assert.rejects(
    gateway.execute({ capability_id: "grammar.feedback", operation: "explain", input: {} }),
    (e) =>
      e instanceof GatewayError && e.code === "all_providers_failed" && e.attempts.length === 2,
  );
});

test("providers without adapters are reported as failed attempts", async () => {
  const registry = new ProviderRegistry();
  registry.register(descriptor());
  const gateway = new ProviderGateway(registry);
  await assert.rejects(
    gateway.execute({ capability_id: "grammar.feedback", operation: "explain", input: {} }),
    (e) =>
      e instanceof GatewayError &&
      e.code === "all_providers_failed" &&
      e.attempts[0].reason === "no_adapter",
  );
});
