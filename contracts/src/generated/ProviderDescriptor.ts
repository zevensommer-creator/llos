/* eslint-disable */
// AUTO-GENERATED from docs/contracts/provider-descriptor.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type Identifier = string;
export type SemVer = string;
export type LanguageTag = string;

/**
 * Capability, execution, cost, privacy and operational descriptor for a replaceable model or language service provider. Secrets are never stored in this object. v0.2.0: extensions use ExtensionEnvelope (spec §4.4).
 */
export interface ProviderDescriptor {
  schema_version: '0.2.0';
  provider_id: Identifier;
  version: SemVer;
  display_name: string;
  description?: string;
  execution: Execution;
  /**
   * @minItems 1
   */
  capabilities: [Capability, ...Capability[]];
  /**
   * @minItems 1
   */
  models: [Model, ...Model[]];
  hardware_requirements?: HardwareRequirements;
  limits: Limits;
  cost_model: CostModel;
  privacy: Privacy;
  license: License;
  health: Health;
  benchmark_refs?: ArtifactRef[];
  extensions?: Extensions;
}
export interface Execution {
  mode: 'local' | 'remote' | 'hybrid';
  adapter_entrypoint: string;
  endpoint?: string;
  network_required: boolean;
  /**
   * Names of secret-manager references; never secret values.
   */
  credential_ref_names: string[];
  sandbox_required?: boolean;
}
export interface Capability {
  capability_id: string;
  kind: 'llm' | 'asr' | 'tts' | 'alignment' | 'pronunciation_scoring' | 'prosody_analysis' | 'linguistic_tool';
  /**
   * @minItems 1
   */
  operations: [string, ...string[]];
  languages: '*' | [LanguageTag, ...LanguageTag[]];
  /**
   * @minItems 1
   */
  quality_tiers: ['economy' | 'standard' | 'premium', ...('economy' | 'standard' | 'premium')[]];
  input_media_types?: string[];
  output_schema_refs?: string[];
  supports_streaming?: boolean;
  supports_batch?: boolean;
  supports_cancellation?: boolean;
  supports_seed?: boolean;
  /**
   * @minItems 1
   */
  model_refs: [Identifier, ...Identifier[]];
}
export interface Model {
  model_id: Identifier;
  model_version: string;
  artifact_or_service_ref: string;
  languages: '*' | [LanguageTag, ...LanguageTag[]];
  precision: 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int4' | 'mixed' | 'remote_unspecified';
  status: 'experimental' | 'candidate' | 'production' | 'deprecated';
  license_ref?: string;
  configuration?: {
    [k: string]: string | number | boolean;
  };
}
export interface HardwareRequirements {
  architectures?: ('x86_64' | 'aarch64')[];
  cpu_features?: string[];
  minimum_cpu_cores?: number;
  minimum_ram_mb?: number;
  gpu?: 'none' | 'optional' | 'required';
  minimum_vram_mb?: number;
  disk_mb?: number;
}
export interface Limits {
  max_concurrency: number;
  request_timeout_ms: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_audio_ms?: number;
  rate_limit_per_minute?: number;
}
export interface CostModel {
  currency: string;
  effective_at: string;
  source_uri?: string;
  components: {
    unit:
      | 'request'
      | 'input_million_tokens'
      | 'cached_input_million_tokens'
      | 'output_million_tokens'
      | 'audio_input_minute'
      | 'audio_output_minute'
      | 'compute_second'
      | 'active_hour'
      | 'monthly_fixed';
    price: number;
    model_ref?: Identifier;
    notes?: string;
  }[];
}
export interface Privacy {
  data_leaves_host: boolean;
  processing_regions?: string[];
  retention: 'none' | 'transient' | 'provider_policy' | 'configurable' | 'unknown';
  maximum_retention_days?: number;
  training_use: 'none' | 'opt_in' | 'opt_out' | 'provider_policy' | 'unknown';
  /**
   * @minItems 1
   */
  supported_data_classes: [
    'public' | 'internal' | 'personal_text' | 'personal_audio' | 'sensitive',
    ...('public' | 'internal' | 'personal_text' | 'personal_audio' | 'sensitive')[]
  ];
}
export interface License {
  code_spdx_id: string;
  model_license_status: 'same_as_code' | 'separate_reviewed' | 'separate_unreviewed' | 'service_terms';
  model_license_refs?: string[];
  commercial_use: 'allowed' | 'restricted' | 'unknown';
}
export interface Health {
  check_kind: 'process' | 'http' | 'grpc' | 'synthetic_request';
  check_target?: string;
  timeout_ms: number;
  failure_threshold: number;
  recovery_threshold: number;
}
export interface ArtifactRef {
  uri: string;
  sha256: string;
  media_type?: string;
}
/**
 * Extension fields require explicit schema ID and version (spec §4.4).
 */
export interface Extensions {
  [k: string]: ExtensionEnvelope;
}
export interface ExtensionEnvelope {
  schema_id: Identifier;
  schema_version: SemVer;
  payload_ref: {
    uri: string;
    sha256: string;
  };
}
