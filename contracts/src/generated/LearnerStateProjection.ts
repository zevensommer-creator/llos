/* eslint-disable */
// AUTO-GENERATED from docs/contracts/learner-state-projection.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type Identifier = string;
export type ClaimRef = string;
export type PolicyRef = string;
export type SemVer = string;
export type Duration = string;
export type MetricRef = string;
export type Sha256 = string;

/**
 * Derived, rebuildable multi-dimensional evidence summary for one learner + claim + evidence policy version. It is a cache computed by the deterministic reducer/projector from the append-only learning event log; it can be deleted and rebuilt, and the same event stream replayed with the same reducer/projector version must reproduce it field-for-field. It is never the source of truth and never a 'mastery score' (spec §5.2, §5.4).
 */
export interface LearnerStateProjection {
  schema_version: '0.2.0';
  projection_id: Identifier;
  learner_ref: Identifier;
  claim_ref: ClaimRef;
  evidence_policy_ref: PolicyRef;
  evidence_policy_version: SemVer;
  /**
   * Core-fixed, theory-neutral evidence state. User-facing wording such as 'mastered' must come from a MasteryDecision, never from this field; DLC may supply UI labels but cannot change the event semantics (spec §5.4).
   */
  evidence_state: 'no_evidence' | 'insufficient' | 'supported' | 'conflicted' | 'stale';
  evidence_counts: {
    valid: number;
    supporting: number;
    contradicting: number;
    /**
     * Abstentions only increase the 'insufficient evidence' accounting; they never count as support or contradiction.
     */
    abstained: number;
    /**
     * Results below the policy measurement-confidence gate: retained as audit events, excluded from decisions.
     */
    below_confidence_gate?: number;
  };
  session_coverage: {
    distinct_sessions: number;
    first_observed_at?: string;
    last_valid_observation_at?: string;
    span?: Duration;
  };
  /**
   * Immediate performance summary over valid evidence.
   */
  performance_summary?: {
    independent_successes: number;
    independent_failures: number;
    metric_ref?: MetricRef;
    /**
     * Mean on the DLC-declared normalizable metric; performance, not measurement confidence.
     */
    metric_mean?: number;
  };
  delayed_retention?: {
    /**
     * Successes occurring after the policy-declared minimum delay since first success.
     */
    delayed_successes: number;
    delays_used?: Duration[];
    last_delayed_success_at?: string;
  };
  /**
   * Breakdown of supporting evidence by assistance level. Evidence independence is deduplicated by evidence_group_id; retries after answer revelation are not independent (spec §5.6).
   */
  independence: {
    unassisted: number;
    hinted: number;
    retried: number;
    answer_revealed: number;
  };
  diversity: {
    distinct_material_snapshots: number;
    distinct_tasks: number;
    distinct_contexts?: number;
  };
  /**
   * Maintained only when the claim asserts transferability and the policy requires context-diversity evidence.
   */
  transfer?: {
    supporting_evidence: number;
    distinct_contexts?: number;
  };
  /**
   * Maintained only when the policy requires automaticity evidence.
   */
  automaticity?: {
    accuracy: number;
    mean_latency_ms?: number;
    /**
     * Within-learner variability on the DLC-declared metric.
     */
    intra_individual_variability?: number;
  };
  /**
   * Evaluator versions and abstention accounting; measurement confidence gates are applied per policy, never mixed with performance.
   */
  evaluator_summary: {
    abstention_count: number;
    evaluators?: {
      id: Identifier;
      version: SemVer;
      kind: 'rule' | 'model' | 'human';
    }[];
  };
  conflicts_and_lapses?: {
    high_confidence_contradictions: number;
    lapses: number;
    last_lapse_at?: string;
  };
  /**
   * Optional memory-model state (e.g. FSRS). A memory model may only schedule reviews; it never alone declares learned and never replaces the event fact layer (spec §5.7).
   */
  memory_model?: {
    model_ref: Identifier;
    model_version: SemVer;
    stability?: number;
    retrievability?: number;
  };
  /**
   * Reducer/projector identity, version, event sequence boundaries and input hash for deterministic replay auditing.
   */
  reducer: {
    id: Identifier;
    version: SemVer;
    event_sequence_start: number;
    event_sequence_end: number;
    input_hash: Sha256;
  };
  projected_at: string;
  extensions?: Extensions;
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
