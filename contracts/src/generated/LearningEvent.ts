/* eslint-disable */
// AUTO-GENERATED from docs/contracts/learning-event.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Append-only learning event. event_type must come from the Core event registry; mode is always learning (chat never enters the learning reducer); idempotency_key dedupes retries (spec §2.5, §5.3).
 */
export type LearningEvent = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.0';
  event_id: Identifier;
  /**
   * Closed registry; see docs/contracts/learning-event-registry.json. Unregistered types are rejected.
   */
  event_type:
    | 'learning.session_started'
    | 'learning.session_completed'
    | 'learning.session_aborted'
    | 'activity.presented'
    | 'learner.response_submitted'
    | 'observation.recorded'
    | 'learning.evidence_recorded'
    | 'mastery.decision_made'
    | 'review.scheduled'
    | 'feedback.presented'
    | 'learner.correction_accepted'
    | 'composition.upgraded'
    | 'correction.manual_applied'
    | 'projection.replay_completed';
  sequence_no: number;
  occurred_at: string;
  learner_ref: Identifier;
  session_ref: Identifier;
  mode: 'learning';
  composition: Composition;
  claim_ref?: ClaimRef;
  evidence_policy_ref?: PolicyRef;
  task?: TaskContext;
  observation?: ObservationPayload;
  decision?: DecisionPayload;
  review?: ReviewPayload;
  abort_reason?:
    | 'material_unavailable'
    | 'provider_unavailable'
    | 'budget_exhausted'
    | 'timeout'
    | 'dlc_compile_failed'
    | 'hard_stop'
    | 'learner_exit'
    | 'entitlement_lost';
  payload_ref?: ArtifactRef1;
  idempotency_key: string;
  extensions?: Extensions;
};
export type Identifier = string;
export type SemVer = string;
export type Sha256 = string;
export type ClaimRef = string;
export type PolicyRef = string;
export type ObservationPayload = {
  observation_id: Identifier;
  evidence_group_id: Identifier;
  evaluator: {
    id: Identifier;
    version: SemVer;
    kind: 'rule' | 'model' | 'human';
  };
  result_kind: 'binary' | 'scalar' | 'rubric_vector' | 'timed' | 'artifact_evidence' | 'abstention';
  outcome?: 'success' | 'failure';
  metric_ref?: MetricRef;
  value?: number;
  /**
   * @minItems 1
   */
  dimensions?: [
    {
      dimension_ref: Identifier;
      value: number;
      confidence?: number;
    },
    ...{
      dimension_ref: Identifier;
      value: number;
      confidence?: number;
    }[]
  ];
  latency_ms?: number;
  evidence_artifact_ref?: ArtifactRef;
  abstention_reason?:
    | 'audio_quality_low'
    | 'alignment_failed'
    | 'reference_mismatch_too_large'
    | 'scorer_conflict'
    | 'oov_or_g2p_uncertain'
    | 'uncalibrated_domain'
    | 'evaluator_uncertain'
    | 'insufficient_evidence';
  measurement_confidence?: number;
} & ObservationPayload1;
export type MetricRef = string;
export type ObservationPayload1 =
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
    };
export type Duration = string;

export interface Composition {
  core_version: SemVer;
  dlc_ref: VersionedRef;
  material_snapshot_ref: VersionedRef;
  learning_ir_ref: VersionedRef;
}
export interface VersionedRef {
  id: Identifier;
  version: SemVer;
  sha256: Sha256;
  origin?: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
}
export interface TaskContext {
  task_ref: Identifier;
  context_refs?: Identifier[];
  response_mode: 'text' | 'audio' | 'choice' | 'mixed';
  assistance: {
    hint_count: number;
    retry_count: number;
    answer_revealed: boolean;
  };
}
export interface ArtifactRef {
  uri: string;
  sha256: Sha256;
  media_type?: string;
  schema_id?: Identifier;
  schema_version?: SemVer;
}
export interface DecisionPayload {
  status: 'not_yet' | 'provisional' | 'learned' | 'uncertain' | 'lapsed';
  /**
   * @minItems 1
   */
  reason_codes: [string, ...string[]];
  policy_version: SemVer;
  valid_until?: string;
}
export interface ReviewPayload {
  due_at: string;
  interval: Duration;
  scheduler?: 'rule_based' | 'fsrs_memory';
}
/**
 * Event-specific large payloads as schema-validated artifacts, never inline arbitrary JSON.
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
