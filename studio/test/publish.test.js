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
const { MarketService, dlcResourceRef } = require("@llos/market");
const { validate } = require("@llos/contracts");
const {
  StudioDrafts,
  StudioService,
  StudioError,
  deterministicStructureTransport,
} = require("../dist/index.js");

const KEY = "sk-byok-studio-0123456789abcdef";
const ENTRY = { entry_id: "byok.1", provider_family: "deepseek", label: "Lehrer-Key" };
const TEACHER = "teacher.studio";
const STUDENT = "student.market";

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
  accounts.createAccount(STUDENT);
  const draft = await drafts.createDraft(TEACHER, {
    source: { kind: "text", text: CAFE_TEXT, language: "de-DE", title: "Café Deutsch" },
    cefrLevel: "A2",
  });
  return { accounts, entitlements, drafts, market, studio, draft };
}

test("publish requires confirmed status AND explicit delist-terms acknowledgement (§6.9)", async () => {
  const { drafts, studio, draft } = await setup();
  await assert.rejects(
    studio.publishDraft(TEACHER, draft.draft_id, {
      listing: { summary: "s", pricing: { model: "free" } },
      acknowledged_delist_terms: true,
    }),
    (e) => e.code === "draft_state_invalid",
  );
  drafts.confirm(TEACHER, draft.draft_id);
  await assert.rejects(
    studio.publishDraft(TEACHER, draft.draft_id, {
      listing: { summary: "s", pricing: { model: "free" } },
      acknowledged_delist_terms: false,
    }),
    (e) =>
      e instanceof StudioError &&
      e.code === "delist_acknowledgement_required" &&
      /长期授权/.test(e.message),
  );
});

test("confirmed teacher publishes a free DLC; student acquires it on the market", async () => {
  const { drafts, market, studio, entitlements, draft } = await setup();
  drafts.confirm(TEACHER, draft.draft_id);
  const result = await studio.publishDraft(TEACHER, draft.draft_id, {
    listing: {
      summary: "Café-Situationen, Aussprache und höfliche Bitten.",
      difficulty: "A2",
      tags: ["Café", "Anfänger"],
      pricing: { model: "free" },
    },
    acknowledged_delist_terms: true,
  });
  assert.equal(result.first_publish, true);
  assert.equal(result.version, "0.1.0");
  assert.ok(result.listing.listing_id.startsWith("listing.dlc.studio."));
  assert.equal(market.query({ language: "de" }).length, 1);

  const acquired = market.acquireFree(STUDENT, result.listing.listing_id);
  assert.equal(acquired.already_acquired, false);
  const resource = dlcResourceRef(draft.manifest.dlc_id);
  assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T12:00:00Z"), "entitlement in Core");
});

test("student without publish_dlc cannot publish through the studio path", async () => {
  const { drafts, studio, draft } = await setup();
  drafts.confirm(TEACHER, draft.draft_id);
  await assert.rejects(
    studio.publishDraft(STUDENT, draft.draft_id, {
      listing: { summary: "s", pricing: { model: "free" } },
      acknowledged_delist_terms: true,
    }),
    (e) => e.code === "not_draft_owner",
  );
});

test("revision publish auto-bumps version invisibly; owners follow automatically (§6.7/§6.8)", async () => {
  const { drafts, market, studio, entitlements, draft } = await setup();
  drafts.confirm(TEACHER, draft.draft_id);
  const first = await studio.publishDraft(TEACHER, draft.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });
  market.acquireFree(STUDENT, first.listing.listing_id);

  // 文案修订 → patch；版本由系统判定，创作者从不接触版本号
  const revision = drafts.startRevision(TEACHER, draft.draft_id);
  drafts.confirm(TEACHER, revision.draft_id, { title: "Café Deutsch (2027)" });
  const update = await studio.publishDraft(TEACHER, revision.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });
  assert.equal(update.first_publish, false);
  assert.equal(update.bump.kind, "patch");
  assert.equal(update.version, "0.1.1");
  assert.equal(update.listing.dlc_ref.version, "0.1.1");

  // 授权无版本号：老用户无需重新获取即指向新版本（自动更新 A 方案）
  const resource = dlcResourceRef(draft.manifest.dlc_id);
  assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T12:00:00Z"));
  const listing = market.view(first.listing.listing_id);
  assert.equal(listing.listing.dlc_ref.version, "0.1.1");
});

test("delist stops new acquisitions, existing owners keep access (§6.9)", async () => {
  const { drafts, market, studio, entitlements, draft } = await setup();
  drafts.confirm(TEACHER, draft.draft_id);
  const first = await studio.publishDraft(TEACHER, draft.draft_id, {
    listing: { summary: "s", pricing: { model: "free" } },
    acknowledged_delist_terms: true,
  });
  market.acquireFree(STUDENT, first.listing.listing_id);

  const delisted = studio.delist(TEACHER, draft.draft_id);
  assert.ok(delisted.delisted_at.length > 0);

  const { MarketError } = require("@llos/market");
  assert.throws(
    () => market.acquireFree("student.late", first.listing.listing_id),
    (e) => e instanceof MarketError && e.code === "listing_delisted",
  );
  // 已获取用户保留访问权：幂等获取仍成功，授权未被回收
  const again = market.acquireFree(STUDENT, first.listing.listing_id);
  assert.equal(again.already_acquired, true);
  const resource = dlcResourceRef(draft.manifest.dlc_id);
  assert.ok(entitlements.has(STUDENT, resource, "2026-08-16T23:00:00Z"));
  // 目录不再展示
  assert.equal(market.query().length, 0);
  assert.ok(market.view(first.listing.listing_id), "listing page still resolvable for owners");
});
