/* eslint-disable */
// AUTO-GENERATED from docs/contracts/material-pack.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Versioned, licensable material layer consumed by DLC compilers. v0.2.0: CEFR levels and registers become optional DLC/extension-declared references instead of universal Core truth; all annotation values use TypedValue; extensions use ExtensionEnvelope; generation lifecycle recorded (spec §2.7, §4.1). v0.2.1: adds required distribution_scope (ADR-012); license is optional for internal scope, mandatory (pack-level and asset-level) for public scope (ADR-013).
 */
export type MaterialPack = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.1';
  pack_id: Identifier;
  version: SemVer;
  display_name: string;
  description?: string;
  pack_kind:
    | 'semantic_scenario'
    | 'authentic_corpus'
    | 'graded_reader'
    | 'domain_lexicon'
    | 'media_collection'
    | 'annotation_overlay'
    | 'mixed';
  /**
   * Distribution scope (ADR-012/ADR-013). internal: first-generation internal use—license optional, copyright process deferred. public: future public distribution—pack-level and asset-level license required, ADR-009 takedown process applies.
   */
  distribution_scope: 'internal' | 'public';
  /**
   * @minItems 1
   */
  languages: [LanguageTag, ...LanguageTag[]];
  /**
   * Optional versioned level references (e.g. a CEFR scale declared by a DLC or profile). Not a universal Core truth; Core assumes no scale exists (spec §4.2).
   */
  level_refs?: {
    scale_ref: Identifier;
    level_ref: Identifier;
    version: SemVer;
  }[];
  /**
   * Free-form register tags. v0.1 fixed register enum (intimate/informal/neutral/formal/...) is abolished as Core truth; DLC profiles may declare their own vocabulary.
   */
  register_tags?: string[];
  compatibility: {
    material_schema: VersionRange;
    learning_ir: VersionRange;
    required_dlc_capabilities?: Identifier[];
  };
  /**
   * Generation lifecycle (spec §2.7). Saving a private asset or publishing requires verified creator capability; ephemeral generation is available to ordinary learners at runtime.
   */
  lifecycle?: 'ephemeral' | 'private_saved' | 'published' | 'withdrawn';
  semantic_frames: SemanticFrame[];
  assets: Asset[];
  annotations?: Annotation[];
  generation_policy: GenerationPolicy;
  safety?: Safety;
  license?: License;
  provenance: Provenance;
  integrity?: Integrity;
  extensions?: Extensions;
};
export type Identifier = string;
export type SemVer = string;
export type LanguageTag = string;
export type VersionRange = string;
/**
 * Discriminated union for annotation and fact values. Arbitrary JSON is forbidden (spec §4.4).
 */
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
    }
  | {
      kind: 'ref';
      ref: Identifier;
    }
  | {
      kind: 'typed_list';
      typed_list: TypedValue[];
    }
  | {
      kind: 'artifact_ref';
      artifact_ref: ArtifactRef;
    };
export type Sha256 = string;

export interface SemanticFrame {
  id: Identifier;
  frame_type: 'scenario' | 'event' | 'concept' | 'argument_structure' | 'discourse';
  titles?: LocalizedText[];
  /**
   * @minItems 1
   */
  communicative_intents: [Identifier, ...Identifier[]];
  participants: {
    id: Identifier;
    role: Identifier;
    attributes?: {
      [k: string]: TypedValue;
    };
  }[];
  /**
   * @minItems 1
   */
  facts: [
    {
      subject: Identifier;
      predicate: Identifier;
      object: TypedValue;
      immutable?: boolean;
    },
    ...{
      subject: Identifier;
      predicate: Identifier;
      object: TypedValue;
      immutable?: boolean;
    }[]
  ];
  lexical_candidates?: {
    id: Identifier;
    language: LanguageTag;
    lemma: string;
    sense_ref?: Identifier;
    register_tag?: string;
    frequency_band?: number;
  }[];
  asset_refs?: Identifier[];
}
export interface LocalizedText {
  language: LanguageTag;
  text: string;
}
export interface ArtifactRef {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
export interface Asset {
  id: Identifier;
  uri: string;
  media_type: string;
  sha256: Sha256;
  size_bytes: number;
  language?: LanguageTag;
  duration_ms?: number;
  transcript_asset_ref?: Identifier;
  source_uri?: string;
  license?: License;
  generated?: boolean;
}
export interface License {
  spdx_id: string;
  license_uri?: string;
  commercial_use: 'allowed' | 'restricted' | 'unknown';
  derivatives: 'allowed' | 'share_alike' | 'prohibited' | 'unknown';
  attribution?: string;
}
export interface Annotation {
  id: Identifier;
  target_ref: Identifier;
  /**
   * Material-layer annotation categories. 'custom' requires type_schema_ref so DLC profiles can declare their own vocabulary without corrupting the ABI.
   */
  annotation_type:
    | 'construction'
    | 'valency'
    | 'morphology'
    | 'phonology'
    | 'pragmatics'
    | 'difficulty'
    | 'safety'
    | 'license'
    | 'custom';
  /**
   * Required for annotation_type=custom: the DLC/profile-declared schema identifying the annotation vocabulary.
   */
  type_schema_ref?: string;
  value: TypedValue;
  confidence?: number;
  provenance: AnnotationProvenance;
}
export interface AnnotationProvenance {
  method: 'human' | 'rule' | 'model' | 'imported';
  created_at: string;
  actor_id?: Identifier;
  provider_id?: Identifier;
  model_version?: string;
  prompt_template_version?: SemVer;
  random_seed?: number;
  review_status?: 'unreviewed' | 'accepted' | 'rejected' | 'needs_revision';
}
export interface GenerationPolicy {
  allow_generation: boolean;
  allowed_transformations: (
    | 'surface_realization'
    | 'paraphrase'
    | 'level_adjustment'
    | 'translation'
    | 'dialogue_expansion'
    | 'lexical_substitution'
    | 'question_generation'
  )[];
  immutable_paths: string[];
  human_review_required: boolean;
  maximum_generated_variants?: number;
}
export interface Safety {
  content_labels?: string[];
  minimum_age?: number;
  notes?: string;
}
export interface Provenance {
  created_at: string;
  /**
   * @minItems 1
   */
  creators: [string, ...string[]];
  source_records: {
    source_uri: string;
    retrieved_at: string;
    sha256?: Sha256;
  }[];
  generation_runs?: {
    provider_id: Identifier;
    model_version: string;
    template_version: SemVer;
    random_seed?: number;
    created_at: string;
  }[];
}
export interface Integrity {
  manifest_sha256: Sha256;
  signature?: string;
  key_id?: Identifier;
}
/**
 * Extension fields require explicit schema ID and version; unregistered extensions or hash mismatches are rejected (spec §4.4).
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
