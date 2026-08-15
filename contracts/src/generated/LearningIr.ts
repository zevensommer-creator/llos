/* eslint-disable */
// AUTO-GENERATED from docs/contracts/learning-ir.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Versioned pedagogical or executable intermediate representation exchanged between DLC compilers and Core. v0.2.0 removes all fixed linguistic theory categories and arbitrary-JSON escape hatches: objectives become theory-neutral claim references, executable programs lower to closed runtime primitives, all condition values use TypedValue, extensions use ExtensionEnvelope, and event outputs must reference the Core event registry (spec §4).
 */
export type LearningIR = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.0';
  ir_id: Identifier;
  ir_version: SemVer;
  ir_kind: 'pedagogical' | 'executable_session';
  language: LanguageTag;
  learner_locale?: LanguageTag;
  created_at: string;
  compiler: CompilerRef;
  /**
   * Includes the MaterialSnapshot artifact reference; DLC never embeds material content.
   *
   * @minItems 1
   */
  source_refs: [ArtifactRef, ...ArtifactRef[]];
  learner_projection_ref?: ArtifactRef1;
  random_seed?: number;
  /**
   * Theory-neutral claim bindings. claim_ref is opaque to Core; descriptors are display artifacts, not Core enums (spec §4.2).
   *
   * @minItems 1
   */
  claims: [ClaimBinding, ...ClaimBinding[]];
  program: unknown;
  provenance: Provenance;
  extensions?: Extensions;
};
export type Identifier = string;
export type SemVer = string;
export type LanguageTag = string;
export type Sha256 = string;
export type ClaimRef = string;
export type PolicyRef = string;

export interface CompilerRef {
  dlc_id: Identifier;
  dlc_version: SemVer;
  runtime_version: SemVer;
  build_sha256?: Sha256;
}
export interface ArtifactRef {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
/**
 * Authorized LearnerStateProjection input provided by Core; compilers never access learner data directly.
 */
export interface ArtifactRef1 {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
export interface ClaimBinding {
  claim_ref: ClaimRef;
  /**
   * Optional versioned schema identifying the claim descriptor vocabulary; registered and validated by Core, never interpreted.
   */
  claim_schema_ref?: string;
  evidence_policy_ref: PolicyRef;
  evidence_policy_version: SemVer;
  /**
   * Display artifact for UI only; not a Core enum and never an execution basis.
   */
  descriptor?: {
    display_name: string;
    description?: string;
    examples?: string[];
    /**
     * Optional versioned level references (e.g. a CEFR scale). Core does not assume any particular scale exists (spec §4.2).
     */
    level_refs?: {
      scale_ref: Identifier;
      level_ref: Identifier;
      version: SemVer;
    }[];
  };
}
export interface Provenance {
  /**
   * @minItems 1
   */
  input_hashes: [Sha256, ...Sha256[]];
  passes: {
    id: Identifier;
    version: SemVer;
    status: 'completed' | 'skipped' | 'degraded';
    provider_trace_ids?: Identifier[];
  }[];
  compiled_at?: string;
}
/**
 * Extensions only via registered ExtensionEnvelope; unregistered extensions or hash mismatches are rejected (spec §4.4).
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
