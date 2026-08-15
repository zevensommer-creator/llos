/* eslint-disable */
// AUTO-GENERATED from docs/contracts/evidence-policy.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type PolicyRef = string;
export type SemVer = string;
export type Identifier = string;
export type Sha256 = string;
export type ClaimRef = string;
export type MetricRef = string;

/**
 * DLC-declared, versioned policy defining when evidence is sufficient for a mastery decision. DLC declares; Core validates and executes deterministically. No scripts, no direct state writes (spec §5.5).
 */
export interface EvidencePolicy {
  schema_version: '0.2.0';
  policy_ref: PolicyRef;
  version: SemVer;
  dlc_ref: VersionedRef;
  compatible_claims:
    | {
        all: true;
      }
    | {
        /**
         * @minItems 1
         */
        refs: [ClaimRef, ...ClaimRef[]];
      };
  /**
   * @minItems 1
   */
  accepted_observations: [
    'binary' | 'scalar' | 'rubric_vector' | 'timed' | 'artifact_evidence' | 'abstention',
    ...('binary' | 'scalar' | 'rubric_vector' | 'timed' | 'artifact_evidence' | 'abstention')[]
  ];
  accepted_metrics?: MetricRef[];
  gates: {
    /**
     * Performance threshold on a DLC-declared normalizable metric. Distinct from measurement confidence.
     */
    minimum_performance?: number;
    /**
     * Evaluator reliability gate. Results below it are retained as audit events but excluded from decisions.
     */
    minimum_measurement_confidence: number;
  };
  independence: {
    hinted_counts_as_assisted: boolean;
    retry_after_answer_reveal_independent: boolean;
    paraphrase_of_same_material_independent: boolean;
  };
  session_requirements: {
    minimum_distinct_sessions: number;
    minimum_independent_successes: number;
    minimum_delayed_successes: number;
    /**
     * Required delay before a success counts as delayed retention, e.g. PT24H.
     */
    minimum_delay?: string;
    /**
     * Required only when the claim asserts transfer.
     */
    minimum_context_diversity?: number;
  };
  requires_transfer?: boolean;
  requires_automatization?: boolean;
  automatization?: {
    max_latency_ms?: number;
    max_within_subject_variability?: number;
  };
  /**
   * Abstained observations never count as support or refutation.
   */
  abstention_handling: 'count_as_insufficient' | 'ignore';
  conflict_rules: {
    high_confidence_failure_threshold: number;
    high_confidence_failures_before_lapse: number;
    lapse_requires_distinct_sessions: boolean;
    /**
     * After this window without valid evidence the projection is marked stale.
     */
    staleness_window?: string;
  };
  projector: {
    /**
     * fsrs_memory may only schedule reviews; it never alone declares learned.
     */
    kind: 'rule_based' | 'fsrs_memory';
    version: SemVer;
    params_ref?: ArtifactRef;
  };
  /**
   * Policy upgrades replay into a new coexisting projection version; historical events and decisions are never rewritten.
   */
  replay_rule_on_upgrade: 'parallel_new_projection';
  extensions?: Extensions;
}
export interface VersionedRef {
  id: Identifier;
  version: SemVer;
  sha256: Sha256;
  origin?: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
}
/**
 * Versioned projector parameters as a schema-validated artifact.
 */
export interface ArtifactRef {
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
