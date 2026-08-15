"use strict";

// P7c 模板加速器（product_spec §6.2）：预设模板是可选起点。Risks: (1) 模板
// 预填文本必须能通过真实摄入管线产出可编译的草稿（否则一键预填变成一键
// 报错）；(2) 模板不得携带教学策略（只预填摄入文本，训练/评分属于 manifest）。

const { test } = require("node:test");
const assert = require("node:assert");
const {
  ProviderRegistry,
  ProviderGateway,
  FakeProvider,
  registerByokProvider,
} = require("@llos/gateway");
const { InMemoryAccountStore } = require("@llos/core");
const { validate } = require("@llos/contracts");
const {
  StudioDrafts,
  STUDIO_TEMPLATES,
  templateById,
  deterministicStructureTransport,
  runSandboxTrial,
} = require("../dist/index.js");

const KEY = "sk-byok-tpl-0123456789abcdef";
const ENTRY = { entry_id: "byok.tpl.1", provider_family: "deepseek", label: "Lehrer-Key" };

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
  return { drafts };
}

test("templates: every preset prefills into a valid, compilable draft through the real ingest pipeline", async () => {
  const { drafts } = setup();
  assert.ok(STUDIO_TEMPLATES.length >= 3, "at least scenario/valence/construction presets exist");
  const seen = new Set();
  for (const tpl of STUDIO_TEMPLATES) {
    assert.ok(!seen.has(tpl.template_id), "template ids unique");
    seen.add(tpl.template_id);
    assert.match(tpl.template_id, /^tpl\./);
    assert.ok(tpl.title.length > 0 && tpl.description.length > 0);
    assert.ok(["A1", "A2", "B1", "B2", "C1", "C2"].includes(tpl.cefr_suggestion));

    const draft = await drafts.createDraft("teacher.studio", {
      source: { kind: "text", text: tpl.prefilled_text, language: "de-DE", title: tpl.title_suggestion },
      cefrLevel: tpl.cefr_suggestion,
    });
    assert.ok(draft.units.length >= 3, `${tpl.template_id} yields at least 3 units`);
    assert.equal(validate("material-pack", draft.material_pack).valid, true);
    assert.equal(validate("dlc-manifest", draft.manifest).valid, true);

    const report = runSandboxTrial(draft.material_pack, draft.manifest, {
      clock: () => "2026-08-16T10:05:00Z",
    });
    assert.equal(report.status, "completed", `${tpl.template_id} draft compiles and runs`);
  }
});

test("templates: lookup by id resolves; unknown ids return undefined", () => {
  const first = STUDIO_TEMPLATES[0];
  assert.equal(templateById(first.template_id).template_id, first.template_id);
  assert.equal(templateById("tpl.does-not-exist"), undefined);
});

test("templates: presets carry no teaching policy (text-only prefill, §6.2)", () => {
  for (const tpl of STUDIO_TEMPLATES) {
    const keys = Object.keys(tpl);
    for (const key of keys) {
      assert.ok(
        !/policy|mode|claim|evidence|pass/i.test(key),
        `${tpl.template_id} must not declare teaching policy fields (found ${key})`,
      );
    }
  }
});
