/* eslint-disable */
// AUTO-GENERATED from docs/contracts/mastery-decision.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

export type Identifier = string;
export type ClaimRef = string;
export type PolicyRef = string;
export type SemVer = string;
export type Sha256 = string;

/**
 * A revocable, recomputable decision for one claim under one evidence policy version, computed deterministically by the Core policy interpreter from a LearnerStateProjection. Not a permanent label on the learner. Policy upgrades produce new decisions alongside old ones and never rewrite history. The system must not store {learned: true, mastery_score: 0.86}-style permanent booleans or aggregate scores as source of truth (spec §5.1, §5.4).
 */
export interface MasteryDecision {
  schema_version: '0.2.0';
  decision_id: Identifier;
  learner_ref: Identifier;
  claim_ref: ClaimRef;
  evidence_policy_ref: PolicyRef;
  evidence_policy_version: SemVer;
  /**
   * Core-fixed decision states (spec §5.4). 'learned' means all necessary conditions of this evidence policy version are currently satisfied; it is a revocable decision bound to claim + policy version, not a permanent learner attribute. 'provisional' means immediate criteria are met but policy-declared retention/retest conditions are still pending.
   */
  status: 'not_yet' | 'provisional' | 'learned' | 'uncertain' | 'lapsed';
  /**
   * Machine-readable explanation of which policy gates passed or failed. DLC may map codes to UI labels but cannot change their event semantics.
   *
   * @minItems 1
   */
  reason_codes: [string, ...string[]];
  /**
   * Identifiers of the evidence events or evidence groups backing this decision. May be empty for not_yet with no valid evidence yet.
   */
  evidence_refs: Identifier[];
  /**
   * The LearnerStateProjection this decision was computed from; audit linkage only.
   */
  projection_ref?: string;
  evaluated_at: string;
  /**
   * Optional expiry declared by the policy; after it the decision must be re-evaluated (stale handling).
   */
  valid_until?: string;
  reducer_version: SemVer;
  /**
   * Optional versioned estimator/projector plugin (e.g. fsrs_memory). Estimates may inform review scheduling but never alone declare learned; raw LearningEvents remain the source of truth (spec §5.7).
   */
  estimator_ref?: {
    id: Identifier;
    version: SemVer;
    sha256?: Sha256;
  };
  /**
   * Set when a policy-version upgrade produces a new decision for the same claim; the superseded decision is retained, never rewritten.
   */
  supersedes_decision_id?: string;
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
