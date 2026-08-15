/* eslint-disable */
// AUTO-GENERATED from docs/contracts/dlc-manifest.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type Identifier = string;
export type SemVer = string;
export type VersionRange = string;
export type LanguageTag = string;
export type ClaimRef = string;
export type PolicyRef = string;
export type Sha256 = string;

/**
 * Manifest for a pedagogical compiler plugin. A DLC declares theory, claims, evidence policies, compiler passes, capability requirements, missing-input handling and degradation policy. It owns neither learner state nor material content, and it may only emit event types from the Core registry. v0.2.0: fixed CEFR enums become optional versioned level_refs; arbitrary-JSON extensions become ExtensionEnvelope (spec §2.6-2.8, §4).
 */
export interface DLCManifest {
  schema_version: '0.2.0';
  dlc_id: Identifier;
  version: SemVer;
  display_name: string;
  description?: string;
  compatibility: Compatibility;
  /**
   * @minItems 1
   */
  supported_languages: [LanguageSupport, ...LanguageSupport[]];
  /**
   * @minItems 1
   */
  theory_profile: [TheoryDeclaration, ...TheoryDeclaration[]];
  /**
   * Theory-neutral claims this DLC teaches, each bound to a versioned evidence policy (spec §4.2, §5.1).
   */
  claims?: ClaimDeclaration[];
  /**
   * @minItems 1
   */
  accepted_material_schemas: [string, ...string[]];
  material_request_templates: {
    id: Identifier;
    /**
     * MaterialRequest template artifact; resolved at runtime when stored material is insufficient.
     */
    template_ref: string;
    trigger?: 'always' | 'on_material_shortage' | 'learner_initiated';
  }[];
  /**
   * What happens when required material or capabilities are unavailable. Never silent degradation to chat (spec §2.6).
   */
  missing_input_handling: 'pause_session' | 'reject_session' | 'request_material';
  degradation_policy: {
    allowed: boolean;
    on_provider_failure: 'pause_session' | 'skip_activity' | 'offline_fallback' | 'stop_session';
    on_capability_missing: 'pause_session' | 'reject_session' | 'offline_fallback';
    offline_allowed?: boolean;
  };
  /**
   * @minItems 1
   */
  evidence_policies: [
    {
      policy_ref: PolicyRef;
      version: SemVer;
      /**
       * EvidencePolicy artifact validated against evidence-policy.schema.json.
       */
      policy_artifact?: string;
    },
    ...{
      policy_ref: PolicyRef;
      version: SemVer;
      /**
       * EvidencePolicy artifact validated against evidence-policy.schema.json.
       */
      policy_artifact?: string;
    }[]
  ];
  output_ir: {
    schema_id: string;
    version_range: VersionRange;
    /**
     * @minItems 1
     */
    kinds: ['pedagogical' | 'executable_session', ...('pedagogical' | 'executable_session')[]];
  };
  /**
   * @minItems 1
   */
  passes: [CompilerPass, ...CompilerPass[]];
  capability_requirements: CapabilityRequirement[];
  permissions: (
    | 'material.read'
    | 'learner_state.read_projection'
    | 'gateway.request'
    | 'artifact.read'
    | 'artifact.write_scoped'
    | 'telemetry.write_scoped'
  )[];
  /**
   * Event types this DLC may request; every entry MUST exist in docs/contracts/learning-event-registry.json. Unregistered names are rejected (spec §4.4).
   */
  emitted_event_types?: string[];
  budgets: Budgets;
  /**
   * @minItems 1
   */
  quality_gates: [QualityGate, ...QualityGate[]];
  dependencies?: Dependency[];
  conflicts?: Dependency[];
  package: Package;
  license: License;
  integrity?: Integrity;
  extensions?: Extensions;
}
export interface Compatibility {
  core_api: VersionRange;
  compiler_runtime: VersionRange;
  minimum_contracts?: {
    [k: string]: SemVer;
  };
}
export interface LanguageSupport {
  language: LanguageTag;
  release_tier: 'primary' | 'secondary' | 'experimental';
  language_profile_ref: string;
  minimum_calibration_version?: SemVer;
  /**
   * Optional versioned level references (e.g. a CEFR scale declared by the DLC). Core assumes no scale exists (spec §4.2).
   */
  level_refs?: {
    scale_ref: Identifier;
    level_ref: Identifier;
    version: SemVer;
  }[];
}
export interface TheoryDeclaration {
  id: Identifier;
  name?: string;
  role: 'primary' | 'supporting' | 'constraint';
  source_refs?: string[];
  /**
   * @minItems 1
   */
  operational_claims: [
    {
      claim_id: Identifier;
      compiler_effect: string;
      test_ref: string;
    },
    ...{
      claim_id: Identifier;
      compiler_effect: string;
      test_ref: string;
    }[]
  ];
}
export interface ClaimDeclaration {
  claim_ref: ClaimRef;
  evidence_policy_ref: PolicyRef;
  evidence_policy_version: SemVer;
  display_name?: string;
}
export interface CompilerPass {
  id: Identifier;
  version: SemVer;
  stage: 'material_parse' | 'semantic_lowering' | 'theory' | 'learner_optimization' | 'activity_codegen' | 'validation';
  entrypoint: string;
  /**
   * @minItems 1
   */
  input_kinds: [Identifier, ...Identifier[]];
  output_kind: Identifier;
  determinism: 'deterministic' | 'seeded' | 'probabilistic';
  capability_refs?: Identifier[];
  failure_policy: 'fail_compilation' | 'skip_with_diagnostic' | 'fallback_pass';
  fallback_pass_id?: Identifier;
  config_schema_ref?: string;
}
export interface CapabilityRequirement {
  id: Identifier;
  capability: string;
  required: boolean;
  languages?: LanguageTag[];
  privacy_class: 'local_only' | 'local_preferred' | 'remote_allowed';
  quality_floor: 'economy' | 'standard' | 'premium';
  output_schema_ref?: string;
}
export interface Budgets {
  compile_timeout_ms: number;
  max_provider_calls: number;
  max_cost_usd: number;
  max_memory_mb: number;
  max_output_bytes: number;
}
export interface QualityGate {
  id: Identifier;
  stage: 'install' | 'compile' | 'publish';
  severity: 'error' | 'warning';
  validator_ref: string;
  description?: string;
}
export interface Dependency {
  id: Identifier;
  version_range: VersionRange;
  optional?: boolean;
}
export interface Package {
  artifact_uri: string;
  media_type: 'application/zip' | 'application/vnd.oci.image.manifest.v1+json' | 'application/wasm';
  sha256: Sha256;
  size_bytes: number;
}
export interface License {
  spdx_id: string;
  license_uri?: string;
  commercial_use: 'allowed' | 'restricted' | 'unknown';
  notices?: string[];
}
export interface Integrity {
  manifest_sha256: Sha256;
  signature?: string;
  key_id?: Identifier;
  algorithm?: 'ed25519' | 'ecdsa-p256-sha256' | 'rsa-pss-sha256';
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
    sha256: Sha256;
  };
}
