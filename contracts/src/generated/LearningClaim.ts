/* eslint-disable */
// AUTO-GENERATED from docs/contracts/learning-claim.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type ClaimRef = string;
export type Identifier = string;
export type SemVer = string;
export type Sha256 = string;

/**
 * A DLC-declared, theory-neutral learning claim. claim_ref is opaque to Core; descriptors are display artifacts, not Core enums (spec §4.2).
 */
export interface LearningClaim {
  schema_version: '0.2.0';
  claim_ref: ClaimRef;
  dlc_ref: VersionedRef;
  version: SemVer;
  descriptor: ClaimDescriptor;
  claim_schema_ref?: ArtifactRef1;
  /**
   * Whether the claim asserts transferability; if true the evidence policy must require context-diversity evidence.
   */
  claims_transfer?: boolean;
  extensions?: Extensions;
}
export interface VersionedRef {
  id: Identifier;
  version: SemVer;
  sha256: Sha256;
  origin?: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
}
export interface ClaimDescriptor {
  display_name: string;
  description?: string;
  examples?: string[];
  level_refs?: LevelRef[];
  descriptor_artifact_ref?: ArtifactRef;
}
export interface LevelRef {
  /**
   * Opaque level-scale identifier, e.g. a CEFR scale artifact; Core does not interpret it.
   */
  scale_ref: string;
  level_ref: Identifier;
  scale_version: SemVer;
}
/**
 * Rich theory-specific descriptor content as a schema-validated artifact, never inline arbitrary JSON.
 */
export interface ArtifactRef {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
/**
 * Optional registered schema typing claim-specific descriptor payloads.
 */
export interface ArtifactRef1 {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
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
