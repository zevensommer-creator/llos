/* eslint-disable */
// AUTO-GENERATED from docs/contracts/learning-observation.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Typed performance observation produced by an evaluator. performance and measurement_confidence are strictly separated; abstention is explicit (spec §4.4, §5.2).
 */
export type LearningObservation = {
  schema_version: '0.2.0';
  observation_id: Identifier;
  learner_ref: Identifier;
  session_ref: Identifier;
  activity_ref: Identifier;
  claim_ref: ClaimRef;
  material_snapshot_ref: VersionedRef;
  /**
   * Observations produced from the same response share one group; Core dedupes independent-evidence counts by group.
   */
  evidence_group_id: string;
  task_variant_ref?: Identifier;
  response_ref?: ArtifactRef;
  context_features?: {
    [k: string]: TypedValue;
  };
  assistance: Assistance;
  evaluator: Evaluator;
  provenance?: Provenance;
  observed_at: string;
  result_kind: 'binary' | 'scalar' | 'rubric_vector' | 'timed' | 'artifact_evidence' | 'abstention';
  outcome?: 'success' | 'failure';
  metric_ref?: MetricRef;
  /**
   * Performance value; meaning declared by the DLC, not Core.
   */
  value?: number;
  /**
   * @minItems 1
   */
  dimensions?: [RubricDimension, ...RubricDimension[]];
  latency_ms?: number;
  evidence_artifact_ref?: ArtifactRef1;
  abstention_reason?:
    | 'audio_quality_low'
    | 'alignment_failed'
    | 'reference_mismatch_too_large'
    | 'scorer_conflict'
    | 'oov_or_g2p_uncertain'
    | 'uncalibrated_domain'
    | 'evaluator_uncertain'
    | 'insufficient_evidence';
  /**
   * Evaluator certainty about the measurement. Never interchangeable with performance.
   */
  measurement_confidence?: number;
  extensions?: Extensions;
} & (
  | {
      result_kind: 'binary';
      [k: string]: unknown;
    }
  | {
      result_kind: 'scalar';
      [k: string]: unknown;
    }
  | {
      result_kind: 'rubric_vector';
      [k: string]: unknown;
    }
  | {
      result_kind: 'timed';
      [k: string]: unknown;
    }
  | {
      result_kind: 'artifact_evidence';
      [k: string]: unknown;
    }
  | {
      result_kind: 'abstention';
      [k: string]: unknown;
    }
);
export type Identifier = string;
export type ClaimRef = string;
export type SemVer = string;
export type Sha256 = string;
export type TypedValue =
  | {
      kind: 'string';
      value: string;
    }
  | {
      kind: 'int';
      value: number;
    }
  | {
      kind: 'float';
      value: number;
    }
  | {
      kind: 'bool';
      value: boolean;
    }
  | {
      kind: 'ref';
      value: string;
    }
  | {
      kind: 'artifact';
      artifact_ref: ArtifactRef1;
    };
export type MetricRef = string;

export interface VersionedRef {
  id: Identifier;
  version: SemVer;
  sha256: Sha256;
  origin?: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
}
/**
 * Raw response (text/audio) as artifact reference, never inline.
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
export interface Assistance {
  hint_count: number;
  retry_count: number;
  answer_revealed: boolean;
  assistance_level: 'none' | 'hint' | 'strong_hint' | 'answer_revealed';
}
export interface Evaluator {
  id: Identifier;
  version: SemVer;
  kind: 'rule' | 'model' | 'human';
}
export interface Provenance {
  evaluator_run_id?: Identifier;
  provider_id?: Identifier;
  model_version?: string;
  seed?: string;
}
export interface RubricDimension {
  dimension_ref: Identifier;
  value: number;
  confidence?: number;
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
