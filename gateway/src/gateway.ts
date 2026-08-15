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
    const candidates = this.#registry.resolve(request.capability_id, {
      operation: request.operation,
      language: request.language,
    });
    if (candidates.length === 0) {
      throw new GatewayError(
        "capability_unavailable",
        `no provider offers capability "${request.capability_id}" for the requested constraints`,
      );
    }

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
