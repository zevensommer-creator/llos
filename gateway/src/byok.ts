import { createHash } from "node:crypto";
import type { ProviderAdapter, ProviderRequest, ProviderRegistry, ProviderResult } from "./registry.js";

// BYOK Provider 装配（product_spec §6.5）：创作者自带 API key，经 Provider
// Gateway 统一调用。descriptor 只携带 credential 引用（contract 明文规定
// "Secrets are never stored in this object"）；密钥本体只注入 adapter 的
// 私有字段，不出现在 descriptor、请求日志或任何 ProviderResult 中。
//
// 第一代零真实网络：transport 用确定性 Fake（结构化逻辑在 studio 摄入层
// 消费 material.generation 输出），真实 HTTP adapter 留待后续任务。

export const BYOK_CAPABILITY_ID = "material.generation";
export const BYOK_OPERATIONS = ["structure", "generate", "ocr"] as const;

const FAMILY_DISPLAY: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  mock: "Mock",
};

export interface ByokEntryRef {
  entry_id: string;
  provider_family: string;
  label: string;
}

export function byokProviderId(entry: ByokEntryRef): string {
  const hash = createHash("sha256").update(entry.entry_id).digest("hex").slice(0, 8);
  return `provider.byok.${entry.provider_family}.${hash}`;
}

/** 生成 schema 合法的 BYOK descriptor；不含任何密钥材料。 */
export function byokDescriptorFor(entry: ByokEntryRef): unknown {
  const providerId = byokProviderId(entry);
  const family = FAMILY_DISPLAY[entry.provider_family] ?? entry.provider_family;
  return {
    schema_version: "0.2.0",
    provider_id: providerId,
    version: "0.1.0",
    display_name: `${family} (BYOK) — ${entry.label}`,
    description:
      "Creator-supplied API key provider (BYOK). All model calls go through the Provider Gateway; the key never appears in descriptors, logs or results. Billed to the creator's own key.",
    execution: {
      mode: "remote",
      adapter_entrypoint: "byok:ByokAdapter",
      network_required: true,
      credential_ref_names: ["BYOK_API_KEY"],
      sandbox_required: false,
    },
    capabilities: [
      {
        capability_id: BYOK_CAPABILITY_ID,
        kind: "llm",
        operations: [...BYOK_OPERATIONS],
        languages: "*",
        quality_tiers: ["standard", "premium"],
        input_media_types: ["text/plain", "image/png"],
        supports_streaming: false,
        supports_batch: true,
        supports_cancellation: true,
        supports_seed: true,
        model_refs: [`${providerId}.model`],
      },
    ],
    models: [
      {
        model_id: `${providerId}.model`,
        model_version: "byok-unpinned",
        artifact_or_service_ref: `https://byok.invalid/${entry.provider_family}`,
        languages: ["de", "en", "fr", "ru"],
        precision: "remote_unspecified",
        status: "candidate",
      },
    ],
    limits: {
      max_concurrency: 2,
      request_timeout_ms: 60000,
    },
    cost_model: {
      currency: "USD",
      effective_at: "2026-08-16T00:00:00Z",
      components: [
        {
          unit: "request",
          price: 0,
          notes: "Billed to the creator's own API key (BYOK); the platform meters nothing.",
        },
      ],
    },
    privacy: {
      // BYOK 数据必然离开平台主机，去向由 key 所属 Provider 的政策决定；
      // Studio 必须在注册 key 时向创作者呈现这份声明（§6.5 隐私级别声明）。
      data_leaves_host: true,
      processing_regions: ["provider_defined"],
      retention: "provider_policy",
      training_use: "provider_policy",
      supported_data_classes: ["public", "internal", "personal_text"],
    },
    license: {
      code_spdx_id: "LicenseRef-LLOS-BYOK-Adapter",
      model_license_status: "service_terms",
      model_license_refs: ["https://byok.invalid/terms"],
      commercial_use: "unknown",
    },
    health: {
      check_kind: "synthetic_request",
      check_target: "fixture://byok/sanity-prompt.txt",
      timeout_ms: 5000,
      failure_threshold: 3,
      recovery_threshold: 2,
    },
  };
}

export interface FakeByokTransport {
  /** 确定性伪传输：第一代零真实网络；真实 HTTP adapter 后续任务替换。 */
  (request: ProviderRequest, context: { provider_family: string; key_fingerprint: string }): unknown;
}

export interface ByokAdapterOptions {
  api_key: string;
  transport?: FakeByokTransport;
}

/**
 * BYOK adapter。密钥只存私有字段；key_fingerprint（sha256 前 8 位）用于
 * 测试断言"确实用了这把钥匙"，同时保证不泄露密钥本体。
 */
export class ByokAdapter implements ProviderAdapter {
  readonly provider_id: string;
  readonly #apiKey: string;
  readonly #providerFamily: string;
  readonly #transport: FakeByokTransport;

  constructor(providerId: string, entry: ByokEntryRef, options: ByokAdapterOptions) {
    this.provider_id = providerId;
    this.#apiKey = options.api_key;
    this.#providerFamily = entry.provider_family;
    this.#transport =
      options.transport ??
      ((request) => ({
        structured: true,
        family: entry.provider_family,
        operation: request.operation,
        input_chars: typeof request.input === "string" ? request.input.length : 0,
      }));
  }

  get key_fingerprint(): string {
    return createHash("sha256").update(this.#apiKey).digest("hex").slice(0, 8);
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    return {
      output: this.#transport(request, {
        provider_family: this.#providerFamily,
        key_fingerprint: this.key_fingerprint,
      }),
      provider_id: this.provider_id,
      model_id: `${this.provider_id}.model`,
    };
  }
}

/**
 * 把 vault 条目装配成一个已注册的 BYOK provider：descriptor 过 schema 校验，
 * adapter 持有密钥。注册后业务代码照常按 capability 请求，无品牌依赖。
 */
export function registerByokProvider(
  registry: ProviderRegistry,
  entry: ByokEntryRef,
  options: ByokAdapterOptions,
): { provider_id: string; adapter: ByokAdapter } {
  const providerId = byokProviderId(entry);
  const descriptor = registry.register(byokDescriptorFor(entry));
  const adapter = new ByokAdapter(descriptor.provider_id, entry, options);
  registry.attach(providerId, adapter);
  return { provider_id: providerId, adapter };
}
