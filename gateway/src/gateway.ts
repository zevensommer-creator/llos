import {
  ProviderRegistry,
  type ProviderRequest,
  type ProviderResult,
} from "./registry.js";

export type GatewayErrorCode = "capability_unavailable" | "all_providers_failed";

export interface FailedAttempt {
  provider_id: string;
  reason: string;
}

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly attempts: readonly FailedAttempt[];

  constructor(code: GatewayErrorCode, message: string, attempts: readonly FailedAttempt[] = []) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.attempts = attempts;
  }
}

export class ProviderGateway {
  readonly #registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.#registry = registry;
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const resolved = this.#registry.resolve(request.capability_id, {
      operation: request.operation,
      language: request.language,
    });
    if (resolved.length === 0) {
      throw new GatewayError(
        "capability_unavailable",
        `no provider offers capability "${request.capability_id}" for the requested constraints`,
      );
    }
    // BYOK 优先（product_spec §6.5：Studio AI 辅助默认不消耗平台算力）：
    // prefer 集合内的 provider 排前，其余保留为 fallback（不变量 4 语义不变）。
    const candidates = orderPreferFirst(resolved, request.prefer_provider_ids);

    const attempts: FailedAttempt[] = [];
    for (const candidate of candidates) {
      if (!candidate.adapter) {
        attempts.push({ provider_id: candidate.descriptor.provider_id, reason: "no_adapter" });
        continue;
      }
      try {
        return await candidate.adapter.execute(request);
      } catch (err) {
        attempts.push({
          provider_id: candidate.descriptor.provider_id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    throw new GatewayError(
      "all_providers_failed",
      `every provider for "${request.capability_id}" failed or has no adapter`,
      attempts,
    );
  }
}

function orderPreferFirst<T extends { descriptor: { provider_id: string } }>(
  resolved: readonly T[],
  preferProviderIds: readonly string[] | undefined,
): T[] {
  if (!preferProviderIds || preferProviderIds.length === 0) return [...resolved];
  const prefer = new Set(preferProviderIds);
  const head = resolved.filter((c) => prefer.has(c.descriptor.provider_id));
  const tail = resolved.filter((c) => !prefer.has(c.descriptor.provider_id));
  return [...head, ...tail];
}
