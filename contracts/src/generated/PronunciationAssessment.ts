/* eslint-disable */
// AUTO-GENERATED from docs/contracts/pronunciation-assessment.schema.json. DO NOT EDIT; rerun 'pnpm --filter @llos/contracts generate'.

/**
 * Evidence-bearing pronunciation report with explicit audio quality, alignment, language calibration, uncertainty and abstention. v0.2.0: evidence values use TypedValue instead of arbitrary JSON; extensions use ExtensionEnvelope (spec §4.4).
 */
export type PronunciationAssessment = {
  [k: string]: unknown;
} & {
  schema_version: '0.2.0';
  assessment_id: Identifier;
  session_id: Identifier;
  activity_id: Identifier;
  created_at: string;
  language: LanguageTag;
  mode: 'read_aloud' | 'shadowing' | 'constrained_response' | 'open_speech';
  status: 'completed' | 'partial' | 'abstained' | 'failed';
  audio_ref: ArtifactRef;
  audio_quality: AudioQuality;
  reference: Reference;
  recognition: Recognition;
  alignment: Alignment;
  /**
   * @minItems 1
   */
  dimensions: [Dimension, ...Dimension[]];
  words: WordAssessment[];
  evidence: Evidence[];
  issues: Issue[];
  abstentions: Abstention[];
  calibration: Calibration;
  /**
   * @minItems 1
   */
  component_versions: [ComponentVersion, ...ComponentVersion[]];
  provenance: Provenance;
  diagnostics?: Diagnostic[];
  extensions?: Extensions;
};
export type Identifier = string;
export type LanguageTag = string;
export type SemVer = string;
export type Dimension = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  id:
    | 'phoneme_accuracy'
    | 'vowel_quantity'
    | 'vowel_quality'
    | 'word_stress'
    | 'prosody'
    | 'fluency'
    | 'completeness'
    | 'intelligibility';
  status: 'scored' | 'abstained' | 'not_applicable';
  score?: number;
  confidence: number;
  evidence_refs: Identifier[];
  abstention_ref?: Identifier;
} & {
  id:
    | 'phoneme_accuracy'
    | 'vowel_quantity'
    | 'vowel_quality'
    | 'word_stress'
    | 'prosody'
    | 'fluency'
    | 'completeness'
    | 'intelligibility';
  status: 'scored' | 'abstained' | 'not_applicable';
  score?: number;
  confidence: number;
  evidence_refs: Identifier[];
  abstention_ref?: Identifier;
};
/**
 * Discriminated union for evidence values. Arbitrary JSON is forbidden (spec §4.4).
 */
export type TypedValue =
  | {
      kind: 'string';
      string: string;
    }
  | {
      kind: 'number';
      number: number;
    }
  | {
      kind: 'boolean';
      boolean: boolean;
    }
  | {
      kind: 'artifact_ref';
      artifact_ref: ArtifactRef;
    };

export interface ArtifactRef {
  uri: string;
  sha256: string;
  media_type?: string;
  duration_ms?: number;
}
export interface AudioQuality {
  status: 'passed' | 'degraded' | 'rejected';
  speech_duration_ms: number;
  snr_db: number | null;
  clipping_ratio: number;
  silence_ratio: number;
  channel_count: number;
  sample_rate_hz: number;
  quality_flags?: (
    | 'too_short'
    | 'too_long'
    | 'low_snr'
    | 'clipping'
    | 'multiple_speakers'
    | 'music'
    | 'unsupported_format'
    | 'vad_uncertain'
  )[];
}
export interface Reference {
  reference_type: 'exact_text' | 'answer_graph' | 'resolved_transcript';
  text: string;
  normalized_text?: string;
  pronunciation_graph_ref: ArtifactRef;
  language_profile_ref: string;
  acceptable_variant_policy_version: SemVer;
}
export interface Recognition {
  status: 'completed' | 'partial' | 'failed' | 'not_run';
  hypotheses: {
    text: string;
    rank: number;
    confidence: number;
  }[];
  content_match?: {
    completeness?: number;
    insertions?: number;
    deletions?: number;
    substitutions?: number;
  };
}
export interface Alignment {
  status: 'completed' | 'partial' | 'failed' | 'not_applicable';
  coverage: number;
  mean_confidence: number | null;
  artifact_ref?: ArtifactRef;
  failure_code?: string;
}
export interface WordAssessment {
  word_id: Identifier;
  text: string;
  interval: Interval;
  alignment_confidence: number;
  phones: PhoneAssessment[];
  stress?: {
    expected_syllable?: number;
    observed_syllable?: number | null;
    confidence?: number;
  };
  issue_refs: Identifier[];
}
export interface Interval {
  start_ms: number;
  end_ms: number;
}
export interface PhoneAssessment {
  phone_id: Identifier;
  expected: string;
  observed_candidates?: {
    phone: string;
    confidence: number;
  }[];
  interval: Interval;
  status: 'acceptable' | 'issue' | 'uncertain' | 'not_aligned';
  confidence: number;
  evidence_refs: Identifier[];
  issue_refs?: Identifier[];
}
export interface Evidence {
  evidence_id: Identifier;
  kind:
    | 'audio_quality'
    | 'asr_hypothesis'
    | 'alignment'
    | 'gop'
    | 'ctc_posterior'
    | 'duration'
    | 'formant'
    | 'f0'
    | 'intensity'
    | 'pause'
    | 'language_rule'
    | 'human_annotation';
  value: TypedValue;
  unit?: string;
  confidence: number;
  interval?: Interval;
  target_ref?: Identifier;
  source_component_ref: Identifier;
  artifact_ref?: ArtifactRef;
}
export interface Issue {
  issue_id: Identifier;
  category:
    | 'phoneme_substitution'
    | 'phoneme_deletion'
    | 'phoneme_insertion'
    | 'vowel_quantity'
    | 'vowel_quality'
    | 'front_rounded_vowel'
    | 'ich_ach_laut'
    | 'final_devoicing'
    | 'stop_aspiration'
    | 'word_stress'
    | 'completeness'
    | 'fluency'
    | 'prosody'
    | 'other';
  status: 'confirmed' | 'suspected';
  severity: 'low' | 'medium' | 'high';
  target: string;
  observed?: string | null;
  location: Interval;
  word_ref?: Identifier;
  phone_ref?: Identifier;
  confidence: number;
  /**
   * @minItems 1
   */
  evidence_refs: [Identifier, ...Identifier[]];
  feedback_key: string;
  pedagogical_priority?: number;
}
export interface Abstention {
  abstention_id: Identifier;
  scope: 'assessment' | 'dimension' | 'word' | 'phone' | 'issue';
  target_ref?: Identifier;
  reason_code:
    | 'audio_quality'
    | 'insufficient_speech'
    | 'asr_disagreement'
    | 'alignment_failed'
    | 'alignment_low_confidence'
    | 'acceptable_variant_ambiguous'
    | 'out_of_calibration_domain'
    | 'evidence_conflict'
    | 'unsupported_language_feature'
    | 'provider_failure';
  message: string;
  evidence_refs?: Identifier[];
}
export interface Calibration {
  language_profile_id: Identifier;
  language_profile_version: SemVer;
  calibrator_id: Identifier;
  calibrator_version: SemVer;
  threshold_set_version: SemVer;
  domain_status: 'in_domain' | 'partially_in_domain' | 'out_of_domain' | 'unknown';
  learner_l1_group?: LanguageTag;
  device_class?: string;
  validation_report_ref?: ArtifactRef;
}
export interface ComponentVersion {
  component_ref: Identifier;
  role: 'vad' | 'asr' | 'g2p' | 'alignment' | 'gop' | 'ctc' | 'prosody' | 'calibration' | 'feedback';
  provider_id: Identifier;
  model_id: Identifier;
  model_version: string;
  configuration_sha256?: string;
}
export interface Provenance {
  pipeline_version: SemVer;
  input_sha256: string;
  random_seed: number;
  started_at: string;
  finished_at: string;
  usage: {
    latency_ms: number;
    cpu_seconds: number;
    gpu_seconds: number;
    cost_usd: number;
  };
}
export interface Diagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  retryable: boolean;
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
