import { validate, type ProviderDescriptor } from "@llos/contracts";

export interface ProviderRequest {
  capability_id: string;
  operation: string;
  language?: string;
  input: unknown;
  seed?: number;
}

export interface ProviderResult {
  output: unknown;
  provider_id: string;
  model_id?: string;
}

export interface ProviderAdapter {
  readonly provider_id: string;
  execute(request: ProviderRequest): Promise<ProviderResult>;
}

export type QualityTier = "economy" | "standard" | "premium";

export interface ResolveOptions {
  operation?: string;
  language?: string;
  quality_tier?: QualityTier;
}

export interface ResolvedProvider {
  descriptor: ProviderDescriptor;
  adapter: ProviderAdapter | undefined;
}

export type RegistryErrorCode = "schema_invalid" | "duplicate_provider" | "unknown_provider";

export class ProviderRegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly errors?: readonly string[];

  constructor(code: RegistryErrorCode, message: string, errors?: readonly string[]) {
    super(message);
    this.name = "ProviderRegistryError";
    this.code = code;
    this.errors = errors;
  }
}

export class ProviderRegistry {
  #descriptors: ProviderDescriptor[] = [];
  #adapters = new Map<string, ProviderAdapter>();
  #keys = new Set<string>();

  register(descriptor: unknown): ProviderDescriptor {
    const result = validate("provider-descriptor", descriptor);
    if (!result.valid) {
      throw new ProviderRegistryError(
        "schema_invalid",
        "provider descriptor rejected by contract schema",
        result.errors,
      );
    }
    const typed = descriptor as ProviderDescriptor;
    const key = `${typed.provider_id}@${typed.version}`;
    if (this.#keys.has(key)) {
      throw new ProviderRegistryError(
        "duplicate_provider",
        `provider "${key}" is already registered`,
      );
    }
    this.#keys.add(key);
    this.#descriptors.push(typed);
    return typed;
  }

  attach(providerId: string, adapter: ProviderAdapter): void {
    if (!this.#descriptors.some((d) => d.provider_id === providerId)) {
      throw new ProviderRegistryError("unknown_provider", `unknown provider: ${providerId}`);
    }
    this.#adapters.set(providerId, adapter);
  }

  adapterFor(providerId: string): ProviderAdapter | undefined {
    return this.#adapters.get(providerId);
  }

  resolve(capabilityId: string, options: ResolveOptions = {}): ResolvedProvider[] {
    const resolved: ResolvedProvider[] = [];
    for (const descriptor of this.#descriptors) {
      for (const capability of descriptor.capabilities) {
        if (capability.capability_id !== capabilityId) continue;
        if (options.operation && !capability.operations.includes(options.operation)) continue;
        if (options.language && !languageSupported(capability.languages, options.language)) continue;
        if (options.quality_tier && !capability.quality_tiers.includes(options.quality_tier)) continue;
        resolved.push({ descriptor, adapter: this.#adapters.get(descriptor.provider_id) });
        break;
      }
    }
    return resolved;
  }

  descriptors(): readonly ProviderDescriptor[] {
    return this.#descriptors;
  }
}

export function languageSupported(
  declared: "*" | string[],
  requested: string,
): boolean {
  if (declared === "*") return true;
  const requestedPrimary = requested.split("-")[0].toLowerCase();
  return declared.some((tag) => {
    if (tag.toLowerCase() === requested.toLowerCase()) return true;
    return tag.split("-")[0].toLowerCase() === requestedPrimary;
  });
}
