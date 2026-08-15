/* eslint-disable */
// AUTO-GENERATED from docs/contracts/session-composition.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Discriminated union of chat and learning session compositions. mode=chat requires dlc_ref=null and never produces learning state; mode=learning requires the full three-layer readiness composition (spec §2.6). v0.2.1: the readiness gate is schema-enforced—all six flags must be true for a valid LearningSession; a not-ready composition must be rejected at creation as a typed error, never serialized as a validated instance (ADR-013).
 */
export type SessionComposition = ChatSession | LearningSession;
export type Identifier = string;
export type SemVer = string;
export type Sha256 = string;
export type PolicyRef = string;

export interface ChatSession {
  schema_version: '0.2.1';
  session_id: Identifier;
  mode: 'chat';
  dlc_ref: null;
  learner_ref: Identifier;
  created_at: string;
  context_material_refs?: VersionedRef[];
  extensions?: Extensions;
}
export interface VersionedRef {
  id: Identifier;
  version: SemVer;
  sha256: Sha256;
  origin?: 'stored' | 'uploaded' | 'generated_random' | 'generated_instructed' | 'derived';
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
export interface LearningSession {
  schema_version: '0.2.1';
  session_id: Identifier;
  mode: 'learning';
  learner_ref: Identifier;
  created_at: string;
  dlc_ref: VersionedRef;
  material_snapshot_ref: VersionedRef;
  learning_ir_ref: VersionedRef;
  evidence_policy_ref: PolicyRef;
  evidence_policy_version: SemVer;
  entitlement_ref: Identifier;
  core_version: SemVer;
  readiness: Readiness;
  extensions?: Extensions;
}
/**
 * Three-layer readiness gate, schema-enforced since v0.2.1 (ADR-013): every flag is const true, so an instance that passes validation necessarily passed all six gates. Not-ready states are represented by typed session-creation rejections, never by a validated LearningSession carrying false flags.
 */
export interface Readiness {
  core_ready: true;
  active_dlc_valid: true;
  material_snapshot_valid: true;
  compiled_ir_valid: true;
  entitlement_valid: true;
  provider_capabilities_ok_or_explicit_fallback: true;
}
