/* eslint-disable */
// AUTO-GENERATED from docs/contracts/agent-work.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Typed WorkItem and WorkResult records for bounded multi-agent orchestration. v0.2.0: extensions use ExtensionEnvelope; diagnostic details use scalar maps instead of arbitrary JSON (spec §4.4).
 */
export type AgentWorkProtocol = WorkItem | WorkResult;
export type Identifier = string;
export type SemVer = string;
export type WorkResult = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.0';
  record_type: 'work_result';
  work_id: Identifier;
  status: 'completed' | 'rejected' | 'failed' | 'uncertain' | 'cancelled';
  finished_at: string;
  artifacts: ArtifactRef[];
  evidence: Evidence[];
  confidence: number;
  usage: Usage;
  diagnostics: Diagnostic[];
  provider_trace: ProviderTrace[];
  extensions?: Extensions;
};

export interface WorkItem {
  schema_version: '0.2.0';
  record_type: 'work_item';
  work_id: Identifier;
  workflow_id?: Identifier;
  parent_work_id?: Identifier;
  work_type: string;
  contract_version: SemVer;
  created_at: string;
  deadline_at?: string;
  input_artifact_refs: ArtifactRef[];
  required_capabilities: CapabilityRequest[];
  budget: Budget;
  authority: Authority;
  output_schema_ref: string;
  idempotency_key: string;
  random_seed?: number;
  /**
   * Bounded task instructions. They cannot override authority, budget or output schema.
   */
  instructions?: string;
  extensions?: Extensions;
}
export interface ArtifactRef {
  uri: string;
  sha256: string;
  media_type?: string;
  schema_id?: string;
  version?: SemVer;
  immutable?: boolean;
}
export interface CapabilityRequest {
  capability: string;
  required: boolean;
  quality_floor: 'economy' | 'standard' | 'premium';
  privacy_class: 'local_only' | 'local_preferred' | 'remote_allowed';
  output_schema_ref?: string;
}
export interface Budget {
  max_calls: number;
  max_input_tokens: number;
  max_output_tokens: number;
  max_audio_ms?: number;
  max_latency_ms: number;
  max_cost_usd: number;
}
export interface Authority {
  allowed_tools: Identifier[];
  allowed_capabilities: string[];
  data_scopes: (
    | 'public_material'
    | 'licensed_material'
    | 'learner_projection_minimal'
    | 'learner_text_current_session'
    | 'learner_audio_current_session'
    | 'deidentified_research'
  )[];
  /**
   * @minItems 4
   */
  denied_actions: {
    [k: string]: unknown;
  } & [
    (
      | 'write_user_database'
      | 'write_learning_event'
      | 'change_contract'
      | 'change_rubric'
      | 'increase_budget'
      | 'select_provider_directly'
      | 'spawn_unbounded_work'
      | 'exfiltrate_data'
    ),
    (
      | 'write_user_database'
      | 'write_learning_event'
      | 'change_contract'
      | 'change_rubric'
      | 'increase_budget'
      | 'select_provider_directly'
      | 'spawn_unbounded_work'
      | 'exfiltrate_data'
    ),
    (
      | 'write_user_database'
      | 'write_learning_event'
      | 'change_contract'
      | 'change_rubric'
      | 'increase_budget'
      | 'select_provider_directly'
      | 'spawn_unbounded_work'
      | 'exfiltrate_data'
    ),
    (
      | 'write_user_database'
      | 'write_learning_event'
      | 'change_contract'
      | 'change_rubric'
      | 'increase_budget'
      | 'select_provider_directly'
      | 'spawn_unbounded_work'
      | 'exfiltrate_data'
    ),
    ...(
      | 'write_user_database'
      | 'write_learning_event'
      | 'change_contract'
      | 'change_rubric'
      | 'increase_budget'
      | 'select_provider_directly'
      | 'spawn_unbounded_work'
      | 'exfiltrate_data'
    )[]
  ];
}
/**
 * Extension fields require explicit schema ID and version (spec §4.4).
 */
export interface Extensions {
  [k: string]: ExtensionEnvelope;
}
export interface ExtensionEnvelope {
  schema_id: Identifier;
  schema_version: SemVer;
  payload_ref: {
    uri: string;
    sha256: string;
  };
}
export interface Evidence {
  evidence_id: Identifier;
  kind: 'source_excerpt' | 'rule_result' | 'model_result' | 'test_result' | 'human_annotation' | 'artifact_diff';
  source_ref: ArtifactRef;
  location?: {
    json_pointer?: string;
    start_ms?: number;
    end_ms?: number;
  };
  claim: string;
  confidence: number;
}
export interface Usage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  audio_ms: number;
  latency_ms: number;
  cost_usd: number;
  cache_hits?: number;
}
export interface Diagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  retryable: boolean;
  /**
   * Scalar diagnostic details only; complex payloads must use an artifact reference.
   */
  details?: {
    [k: string]: string | number | boolean;
  };
}
export interface ProviderTrace {
  trace_id: Identifier;
  capability: string;
  provider_id: Identifier;
  model_id: Identifier;
  model_version: string;
  request_sha256: string;
  response_sha256: string;
  started_at: string;
  latency_ms: number;
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
  fallback_from_trace_id?: Identifier;
}
