/* eslint-disable */
// AUTO-GENERATED from docs/contracts/material-snapshot.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Immutable frozen snapshot of resolved material. Whatever the source (stored pack, upload, LLM generation), material must be frozen into a snapshot BEFORE entering DLC compilation. Records full provenance: source, instruction, random seed, provider/model version, content hash, schema validation result, safety/quality checks. Same snapshot + same DLC/state/seed = reproducible compilation input (spec §2.7). v0.2.1: provenance is contract-enforced—generation is required when source is generated_random/generated_instructed, and random_seed is required within generation when source is generated_random (ADR-013).
 */
export type MaterialSnapshot = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.1';
  snapshot_id: Identifier;
  source: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
  material_ref: ArtifactRef;
  /**
   * For derived/generated material: the upstream packs or frames it was derived from.
   */
  source_refs?: ArtifactRef1[];
  /**
   * The MaterialRequest this snapshot resolves, when generated at runtime.
   */
  request_ref?: string;
  /**
   * Mandatory provenance for generated material: prompt/seed/model version and parameters. LLM output never becomes course fact without this trace.
   */
  generation?: {
    provider_id: Identifier;
    model_version: string;
    template_version: SemVer;
    random_seed?: number;
    generation_params?: {
      name: string;
      value: TypedValue;
    }[];
    user_instruction?: string;
  };
  content_sha256: Sha256;
  /**
   * Schema-invalid generated material cannot enter Learning IR (spec §2.7).
   */
  schema_validation: {
    status: 'valid' | 'invalid' | 'not_performed';
    schema_id?: Identifier;
    schema_version?: SemVer;
    validated_at?: string;
    errors_ref?: Identifier;
  };
  quality_checks: {
    check_id: Identifier;
    status: 'passed' | 'failed' | 'warning' | 'skipped';
    detail_ref?: Identifier;
  }[];
  created_at: string;
  /**
   * ephemeral: runtime-only, usable by the requesting learner. private_saved/published require verified creator capability. withdrawn: removed from distribution; existing learning references remain valid.
   */
  lifecycle: 'ephemeral' | 'private_saved' | 'published' | 'withdrawn';
  extensions?: Extensions;
};
export type Identifier = string;
export type Sha256 = string;
export type SemVer = string;
export type TypedValue =
  | {
      kind: 'string';
      string: string;
    }
  | {
      kind: 'int';
      int: number;
    }
  | {
      kind: 'float';
      float: number;
    }
  | {
      kind: 'bool';
      bool: boolean;
    };

/**
 * The schema-validated Material Pack artifact this snapshot freezes.
 */
export interface ArtifactRef {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
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
