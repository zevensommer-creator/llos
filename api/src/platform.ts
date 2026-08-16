// 平台确定性 Provider（T-037 纵向切片）。
//
// 第一代零真实网络（ADR：确定性端口替换真实 HTTP adapter 属于后续任务）：
// 平台侧注册一个 `material.generation` Provider，structure/generate 走
// studio 的 deterministicStructureTransport 行协议（Szenario:/Valenz:/
// Konstruktion:），ocr 走 base64→UTF-8 确定性解码。业务代码照常只请求
// capability + operation（不变量 4），BYOK 注册后经 prefer_provider_ids
// 优先路由，平台 Provider 保留为 fallback。
//
// descriptor 结构刻意镜像 gateway/src/byok.ts 的 byokDescriptorFor
// （已通过 provider-descriptor schema 校验），仅调整 provider 身份、
// network_required 与成本/隐私声明，保证 schema 校验通过。

import type {
  ProviderAdapter,
  ProviderRegistry,
  ProviderRequest,
  ProviderResult,
} from "@llos/gateway";
import {
  deterministicStructureTransport,
  OCR_OPERATION,
  STRUCTURE_CAPABILITY_ID,
} from "@llos/studio";

export const PLATFORM_PROVIDER_ID = "provider.platform.llm";
export const PLATFORM_MODEL_ID = `${PLATFORM_PROVIDER_ID}.model`;

export function platformDescriptor(): unknown {
  return {
    schema_version: "0.2.0",
    provider_id: PLATFORM_PROVIDER_ID,
    version: "0.1.0",
    display_name: "LLOS 平台确定性服务",
    description:
      "First-generation deterministic platform provider: structure/generate/ocr are served by local deterministic ports (T-037 vertical slice). Real HTTP adapters replace these in a later task.",
    execution: {
      mode: "local",
      adapter_entrypoint: "llos:deterministic",
      network_required: false,
      credential_ref_names: [],
      sandbox_required: false,
    },
    capabilities: [
      {
        capability_id: STRUCTURE_CAPABILITY_ID,
        kind: "llm",
        operations: ["structure", "generate", "ocr"],
        languages: "*",
        quality_tiers: ["standard"],
        input_media_types: ["text/plain", "image/png"],
        supports_streaming: false,
        supports_batch: true,
        supports_cancellation: true,
        supports_seed: true,
        model_refs: [PLATFORM_MODEL_ID],
      },
    ],
    models: [
      {
        model_id: PLATFORM_MODEL_ID,
        model_version: "0.1.0",
        artifact_or_service_ref: "fixture://llos/deterministic",
        languages: ["de", "en", "fr", "ru"],
        precision: "remote_unspecified",
        status: "candidate",
      },
    ],
    limits: {
      max_concurrency: 8,
      request_timeout_ms: 30000,
    },
    cost_model: {
      currency: "USD",
      effective_at: "2026-08-16T00:00:00Z",
      components: [
        {
          unit: "request",
          price: 0,
          notes: "Platform deterministic service; metered at zero cost.",
        },
      ],
    },
    privacy: {
      data_leaves_host: false,
      processing_regions: ["provider_defined"],
      retention: "provider_policy",
      training_use: "provider_policy",
      supported_data_classes: ["public", "internal", "personal_text"],
    },
    license: {
      code_spdx_id: "LicenseRef-LLOS-Deterministic-Adapter",
      model_license_status: "service_terms",
      model_license_refs: [],
      commercial_use: "allowed",
    },
    health: {
      check_kind: "synthetic_request",
      check_target: "fixture://llos/sanity",
      timeout_ms: 3000,
      failure_threshold: 3,
      recovery_threshold: 2,
    },
  };
}

/** 确定性路由：ocr → base64 解码为 {text}；其余 → 行协议结构化。 */
export function routeDeterministic(request: ProviderRequest): unknown {
  if (request.operation === OCR_OPERATION) {
    const input = request.input as { image_base64?: string } | undefined;
    const raw = input?.image_base64 ?? "";
    return { text: Buffer.from(raw, "base64").toString("utf-8") };
  }
  return deterministicStructureTransport({ input: request.input }, {});
}

export class DeterministicPlatformAdapter implements ProviderAdapter {
  readonly provider_id = PLATFORM_PROVIDER_ID;

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    return {
      output: routeDeterministic(request),
      provider_id: this.provider_id,
      model_id: PLATFORM_MODEL_ID,
    };
  }
}

/** 注册平台 Provider：descriptor 过 schema 校验 + 挂 adapter。 */
export function registerPlatformProvider(registry: ProviderRegistry): void {
  registry.register(platformDescriptor());
  registry.attach(PLATFORM_PROVIDER_ID, new DeterministicPlatformAdapter());
}
