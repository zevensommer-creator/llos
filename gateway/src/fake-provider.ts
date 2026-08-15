import type { ProviderAdapter, ProviderRequest, ProviderResult } from "./registry.js";

export interface FakeProviderOptions {
  output?: unknown;
  failCalls?: number;
}

/**
 * Deterministic, network-free adapter for tests. Records every request it
 * receives so tests can assert that business code never sends brand names.
 */
export class FakeProvider implements ProviderAdapter {
  readonly provider_id: string;
  readonly #output: unknown;
  #failCalls: number;
  #requests: ProviderRequest[] = [];

  constructor(providerId: string, options: FakeProviderOptions = {}) {
    this.provider_id = providerId;
    this.#output = options.output;
    this.#failCalls = options.failCalls ?? 0;
  }

  get requests(): readonly ProviderRequest[] {
    return this.#requests;
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    this.#requests.push(request);
    if (this.#failCalls > 0) {
      this.#failCalls -= 1;
      throw new Error(`fake provider failure (${this.provider_id})`);
    }
    return {
      output: this.#output !== undefined ? this.#output : { echo: request.input },
      provider_id: this.provider_id,
      model_id: "fake-model",
    };
  }
}
